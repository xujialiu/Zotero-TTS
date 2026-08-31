export type ReaderLike = { _getReadAloudRemoteInterface?: unknown };

/**
 * Builds the interface Zotero will use for a reader. `native` builds
 * Zotero's own interface for the same reader and window (the prototype
 * method the override shadows), or returns null when there is none; the
 * factory merges the two.
 */
export type InterfaceFactory = (reader: ReaderLike, targetWindow: unknown, native: () => unknown) => unknown;

/**
 * Zotero's own interface for a reader: the prototype method, called with the
 * reader as `this` — deliberately not the instance property, which is this
 * plugin's override. Null when the prototype has none. The factory's
 * `native` thunk is built on this, and the restore walk at disable uses it
 * to hand an open tab back to Zotero (issue #38).
 */
export function nativeInterfaceOf(reader: ReaderLike, targetWindow: unknown): unknown {
  const original = (Object.getPrototypeOf(reader) as ReaderLike | null)?._getReadAloudRemoteInterface;
  return typeof original === 'function' ? original.call(reader, targetWindow) : null;
}

/**
 * Intercept Zotero.Reader._readers.push.
 *
 * In open(), the push happens synchronously right after
 * `new ReaderTab(...)` (reader.js:2963, 2991), while
 * _getReadAloudRemoteInterface() isn't called until the async _open()
 * has passed through several awaits (reader.js:267). So replacing the
 * instance method at push time is guaranteed to happen before it is
 * ever read.
 *
 * What gets replaced is an **instance** property, not the prototype, so
 * on uninstall a simple delete revives the prototype method — and this
 * never stomps on other plugins either. The prototype method stays
 * reachable through the instance's prototype chain, which is how the
 * factory's `native` thunk reaches Zotero's own interface.
 *
 * makeInterface only runs when Zotero **calls** the method, not at push
 * time. push happens after `new ReaderTab()` and before `_open()`, at
 * which point _iframeWindow doesn't exist yet; Zotero passes it in as
 * an argument when it calls the method, and we pass it straight through
 * to the factory.
 */
export function installHijack(readers: ReaderLike[], makeInterface: InterfaceFactory, patched: WeakSet<ReaderLike> = new WeakSet()): () => void {
  const originalPush = readers.push;
  // `patched`: which readers carry the override, without holding one — a
  // strong list here would pin every reader ever opened for the rest of the
  // session, and the only readers uninstall can still reach are the ones
  // Zotero itself still lists (issue #5). The caller may share the set: the
  // redelivery walk adds the readers open before this install (issue #38),
  // and uninstall then clears those overrides too.
  let installed = true;

  readers.push = function (this: ReaderLike[], ...items: ReaderLike[]): number {
    for (const reader of items) {
      reader._getReadAloudRemoteInterface = (targetWindow: unknown) =>
        makeInterface(reader, targetWindow, () => nativeInterfaceOf(reader, targetWindow));
      patched.add(reader);
    }
    return originalPush.apply(this, items);
  };

  return function uninstall() {
    if (!installed) return;
    installed = false;
    readers.push = originalPush;
    for (const reader of readers) {
      if (patched.has(reader)) delete reader._getReadAloudRemoteInterface;
    }
  };
}
