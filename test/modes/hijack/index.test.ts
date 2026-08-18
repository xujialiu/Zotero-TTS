import { describe, expect, it, vi } from 'vitest';
import { installHijack } from '../../../src/modes/hijack';

function fakeReaders() {
  // 真实对象是 Zotero.Reader._readers，一个普通数组
  return [] as any[];
}

describe('installHijack', () => {
  it('replaces the interface method on readers pushed after install', () => {
    const readers = fakeReaders();
    const iface = { marker: true };
    installHijack(readers, () => iface);

    const reader: any = {};
    readers.push(reader);

    expect(reader._getReadAloudRemoteInterface()).toBe(iface);
  });

  it('does not build the interface at push time', () => {
    // _iframeWindow does not exist until _open() runs, well after the push
    const readers = fakeReaders();
    const makeInterface = vi.fn(() => ({}));
    installHijack(readers, makeInterface);

    readers.push({} as any);

    expect(makeInterface).not.toHaveBeenCalled();
  });

  it("passes Zotero's target window through to the factory", () => {
    const readers = fakeReaders();
    const makeInterface = vi.fn(() => ({}));
    installHijack(readers, makeInterface);

    const reader: any = {};
    readers.push(reader);
    const targetWindow = { marker: 'iframe window' };
    reader._getReadAloudRemoteInterface(targetWindow);

    expect(makeInterface).toHaveBeenCalledWith(reader, targetWindow);
  });

  it('still pushes the reader onto the array', () => {
    const readers = fakeReaders();
    installHijack(readers, () => ({}));

    const reader: any = {};
    readers.push(reader);

    expect(readers).toHaveLength(1);
    expect(readers[0]).toBe(reader);
  });

  it('preserves the return value of push', () => {
    const readers = fakeReaders();
    installHijack(readers, () => ({}));
    expect(readers.push({} as any)).toBe(1);
  });

  it('builds a fresh interface per reader, so settings changes take effect on reopen', () => {
    const readers = fakeReaders();
    const makeInterface = vi.fn(() => ({}));
    installHijack(readers, makeInterface);

    const a: any = {};
    const b: any = {};
    readers.push(a);
    readers.push(b);
    a._getReadAloudRemoteInterface({});
    b._getReadAloudRemoteInterface({});

    expect(makeInterface).toHaveBeenCalledTimes(2);
  });

  it('restores the original push on uninstall', () => {
    const readers = fakeReaders();
    const originalPush = readers.push;
    const uninstall = installHijack(readers, () => ({}));

    expect(readers.push).not.toBe(originalPush);
    uninstall();
    expect(readers.push).toBe(originalPush);
  });

  it('leaves readers pushed after uninstall untouched', () => {
    const readers = fakeReaders();
    const uninstall = installHijack(readers, () => ({}));
    uninstall();

    const reader: any = {};
    readers.push(reader);

    expect(reader._getReadAloudRemoteInterface).toBeUndefined();
  });

  it('clears the override from readers that are still open', () => {
    const readers = fakeReaders();
    const uninstall = installHijack(readers, () => ({}));

    const reader: any = {};
    readers.push(reader);
    expect(reader._getReadAloudRemoteInterface).toBeDefined();

    uninstall();
    // 删掉自有属性后，原型上的方法重新生效
    expect(Object.hasOwn(reader, '_getReadAloudRemoteInterface')).toBe(false);
  });

  it('is safe to uninstall twice', () => {
    const readers = fakeReaders();
    const uninstall = installHijack(readers, () => ({}));
    uninstall();
    expect(() => uninstall()).not.toThrow();
  });
});
