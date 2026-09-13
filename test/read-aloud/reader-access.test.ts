import { describe, expect, it } from 'vitest';
import { liveReaderValue } from '../../src/read-aloud/reader-access';

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
