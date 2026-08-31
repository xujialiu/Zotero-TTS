import { describe, expect, it, vi } from 'vitest';
import { installHijack, nativeInterfaceOf } from '../../src/read-aloud';

function fakeReaders() {
  // The real object is Zotero.Reader._readers, a plain array
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

    expect(makeInterface).toHaveBeenCalledWith(reader, targetWindow, expect.any(Function));
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
    // Once the own property is deleted, the prototype's method takes effect again
    expect(Object.hasOwn(reader, '_getReadAloudRemoteInterface')).toBe(false);
  });

  it('holds no reader of its own: uninstall works from the array Zotero maintains', () => {
    const readers = fakeReaders();
    const uninstall = installHijack(readers, () => ({}));

    const closed: any = {};
    const open: any = {};
    readers.push(closed);
    readers.push(open);
    // The tab closed, so Zotero took its reader out of _readers. Keeping a
    // reference here to clean it up later would pin every reader ever
    // opened for the rest of the session (issue #5).
    readers.splice(0, 1);

    uninstall();

    expect(Object.hasOwn(open, '_getReadAloudRemoteInterface')).toBe(false);
    expect(Object.hasOwn(closed, '_getReadAloudRemoteInterface')).toBe(true);
  });

  it('is safe to uninstall twice', () => {
    const readers = fakeReaders();
    const uninstall = installHijack(readers, () => ({}));
    uninstall();
    expect(() => uninstall()).not.toThrow();
  });
});

// Zotero's own interface is still wanted (its Standard and Premium voices are
// merged with ours), so the factory gets a way to build it: the prototype's
// original method, which the instance override shadows.
describe("access to Zotero's original interface", () => {
  class ReaderBase {
    _getReadAloudRemoteInterface(win: unknown) {
      return { native: true, self: this as unknown, win };
    }
  }

  it('hands the factory a thunk that calls the original with the reader and the target window', () => {
    const readers = fakeReaders();
    const makeInterface = vi.fn((_reader: unknown, _win: unknown, native: () => unknown) => native());
    installHijack(readers, makeInterface);

    const reader: any = new ReaderBase();
    readers.push(reader);
    const win = { marker: 'iframe window' };

    expect(reader._getReadAloudRemoteInterface(win)).toEqual({ native: true, self: reader, win });
  });

  it('does not call the original until the thunk is used', () => {
    const spy = vi.spyOn(ReaderBase.prototype, '_getReadAloudRemoteInterface');
    try {
      const readers = fakeReaders();
      installHijack(readers, () => ({}));
      const reader: any = new ReaderBase();
      readers.push(reader);
      reader._getReadAloudRemoteInterface({});
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('yields null when the reader has no original method', () => {
    const readers = fakeReaders();
    let native: (() => unknown) | null = null;
    installHijack(readers, (_reader, _win, n) => {
      native = n;
      return {};
    });
    const reader: any = {};
    readers.push(reader);
    reader._getReadAloudRemoteInterface({});
    expect(native!()).toBeNull();
  });
});

// The redelivery walk (issue #38) needs to know which readers carry this
// instance's override and to give pre-existing readers one of their own, so
// the set of patched readers is shared with the caller.
describe('the shared patched set', () => {
  it('records every pushed reader in the set the caller provides', () => {
    const readers = fakeReaders();
    const patched = new WeakSet<object>();
    installHijack(readers, () => ({}), patched);

    const reader: any = {};
    readers.push(reader);

    expect(patched.has(reader)).toBe(true);
  });

  it('cleans the override from a reader the caller marked patched itself', () => {
    const readers = fakeReaders();
    const existing: any = {};
    readers.push(existing); // open before the hook was installed
    const patched = new WeakSet<object>();
    const uninstall = installHijack(readers, () => ({}), patched);

    // What the redelivery walk does: its own override, the shared set
    existing._getReadAloudRemoteInterface = () => ({});
    patched.add(existing);

    uninstall();
    expect(Object.hasOwn(existing, '_getReadAloudRemoteInterface')).toBe(false);
  });
});

describe('nativeInterfaceOf', () => {
  class ReaderBase {
    _getReadAloudRemoteInterface(win: unknown) {
      return { native: true, self: this as unknown, win };
    }
  }

  it('calls the prototype method with the reader as this and the window', () => {
    const reader: any = new ReaderBase();
    const win = { marker: 'iframe window' };
    expect(nativeInterfaceOf(reader, win)).toEqual({ native: true, self: reader, win });
  });

  it('ignores an instance override: the prototype is what Zotero owns', () => {
    const reader: any = new ReaderBase();
    reader._getReadAloudRemoteInterface = () => ({ ours: true });
    const win = {};
    expect(nativeInterfaceOf(reader, win)).toEqual({ native: true, self: reader, win });
  });

  it('yields null when the prototype has no method', () => {
    expect(nativeInterfaceOf({}, {})).toBeNull();
  });
});
