export type ReaderLike = { _getReadAloudRemoteInterface?: unknown };

/**
 * 拦截 Zotero.Reader._readers.push。
 *
 * open() 中 `new ReaderTab(...)` 之后同步 push（reader.js:2963、2991），
 * 而 _getReadAloudRemoteInterface() 要等 async 的 _open() 走过若干
 * await 才被调用（reader.js:267）。因此在 push 时替换实例方法必定
 * 早于它被读取。
 *
 * 替换的是**实例**属性而非原型，卸载时 delete 掉即可让原型方法复活，
 * 也不会与其它插件互相踩踏。
 *
 * makeInterface 是在 Zotero **调用**该方法时才执行的，不是在 push 时。
 * push 发生在 `new ReaderTab()` 之后、`_open()` 之前，那时 _iframeWindow
 * 还不存在；Zotero 调用时会把它作为参数传进来，我们透传给工厂。
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
