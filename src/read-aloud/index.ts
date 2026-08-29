export type ReaderLike = { _getReadAloudRemoteInterface?: unknown };

/**
 * Builds the interface Zotero will use for a reader. `native` builds
 * Zotero's own interface for the same reader and window (the prototype
 * method the override shadows), or returns null when there is none; the
 * factory merges the two.
 */
export type InterfaceFactory = (reader: ReaderLike, targetWindow: unknown, native: () => unknown) => unknown;

/** Call the original prototype method with the reader as `this`, if there is one. */
function callOriginal(reader: ReaderLike, targetWindow: unknown): unknown {
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
export function installHijack(readers: ReaderLike[], makeInterface: InterfaceFactory): () => void {
  const originalPush = readers.push;
  // Which readers carry the override, without holding one: a strong list
  // here would pin every reader ever opened for the rest of the session,
  // and the only readers uninstall can still reach are the ones Zotero
  // itself still lists (issue #5).
  const patched = new WeakSet<ReaderLike>();
  let installed = true;

  readers.push = function (this: ReaderLike[], ...items: ReaderLike[]): number {
    for (const reader of items) {
      reader._getReadAloudRemoteInterface = (targetWindow: unknown) =>
        makeInterface(reader, targetWindow, () => callOriginal(reader, targetWindow));
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
