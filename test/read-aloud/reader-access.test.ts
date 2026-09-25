import { describe, expect, it } from 'vitest';
import { forEachReader, liveReaderValue, readerGone } from '../../src/read-aloud/reader-access';

describe('reader dependencies during teardown', () => {
  it('does not dereference a dead inner reader or iframe window', () => {
    const dead = new Proxy({}, { get() { throw new Error("can't access dead object"); } });
    const isDead = (value: unknown) => value === dead;
    expect(liveReaderValue({ _internalReader: dead }, isDead, '_internalReader', '_readAloudManager')).toBeNull();
    expect(liveReaderValue({ _iframeWindow: dead }, isDead, '_iframeWindow', 'document')).toBeNull();
  });
  it('preserves live objects and treats missing or already dead results as absent', () => {
    const manager = {};
    expect(liveReaderValue({ _internalReader: { _readAloudManager: manager } }, () => false, '_internalReader', '_readAloudManager')).toBe(manager);
    expect(liveReaderValue({}, () => false, '_internalReader', '_readAloudManager')).toBeNull();
    expect(liveReaderValue({ manager }, value => value === manager, 'manager')).toBeNull();
  });
  it('does not swallow unexpected failures from live getters', () => {
    const reader = { get _iframeWindow() { throw new Error('unexpected'); } };
    expect(() => liveReaderValue(reader, () => false, '_iframeWindow', 'document')).toThrow('unexpected');
  });
});

describe('a reader whose window is gone (issue #143)', () => {
  const dead = new Proxy({}, { get() { throw new TypeError("can't access dead object"); } });
  // As strict as Components.utils.isDeadWrapper, which refuses anything but an object
  const isDead = (value: unknown) => {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) throw new Error('NS_ERROR_INVALID_ARG');
    return value === dead;
  };

  it('is gone when its internal reader or its iframe window is a dead wrapper', () => {
    expect(readerGone({ _internalReader: dead, _iframeWindow: dead }, isDead)).toBe(true);
    expect(readerGone({ _internalReader: dead, _iframeWindow: null }, isDead)).toBe(true);
    expect(readerGone({ _iframeWindow: dead }, isDead)).toBe(true);
    expect(readerGone(dead, isDead)).toBe(true);
  });
  it('is not gone while it is still opening, or when everything it holds is alive', () => {
    expect(readerGone({ _internalReader: undefined, _iframeWindow: null }, isDead)).toBe(false);
    expect(readerGone({ _internalReader: {}, _iframeWindow: {} }, isDead)).toBe(false);
    expect(readerGone(null, isDead)).toBe(false);
  });
  it('visits every other reader, each on its own: the gone one in silence, a throw reported', () => {
    const visited: string[] = [];
    const errors: unknown[] = [];
    const readers = [{ name: 'first' }, { name: 'gone', _internalReader: dead }, { name: 'throws' }, { name: 'last', _internalReader: {} }];
    forEachReader(readers, (reader) => {
      if (reader.name === 'throws') throw new Error('boom');
      visited.push(reader.name);
    }, { isDead, error: (e) => errors.push(e) });
    expect(visited).toEqual(['first', 'last']);
    expect(errors.map(String)).toEqual(['Error: boom']);
  });
});
