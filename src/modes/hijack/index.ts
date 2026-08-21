export type ReaderLike = { _getReadAloudRemoteInterface?: unknown };

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
 * never stomps on other plugins either.
 *
 * makeInterface only runs when Zotero **calls** the method, not at push
 * time. push happens after `new ReaderTab()` and before `_open()`, at
 * which point _iframeWindow doesn't exist yet; Zotero passes it in as
 * an argument when it calls the method, and we pass it straight through
 * to the factory.
 */
export function installHijack(
  readers: ReaderLike[],
  makeInterface: (reader: ReaderLike, targetWindow: unknown) => unknown,
): () => void {
  const originalPush = readers.push;
  const patched: ReaderLike[] = [];
  let installed = true;

  readers.push = function (this: ReaderLike[], ...items: ReaderLike[]): number {
    for (const reader of items) {
      reader._getReadAloudRemoteInterface = (targetWindow: unknown) =>
        makeInterface(reader, targetWindow);
      patched.push(reader);
    }
    return originalPush.apply(this, items);
  };

  return function uninstall() {
    if (!installed) return;
    installed = false;
    readers.push = originalPush;
    for (const reader of patched) {
      delete reader._getReadAloudRemoteInterface;
    }
    patched.length = 0;
  };
}
