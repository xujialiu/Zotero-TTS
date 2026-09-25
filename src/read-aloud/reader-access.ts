/** A chrome reader can survive its inner reader/window during tab teardown. */
export function liveReaderValue(reader: any, isDead: (value: unknown) => boolean, ...path: string[]): any {
  const live = (value: any) => value != null &&
    (!(typeof value === 'object' || typeof value === 'function') || !isDead(value));
  let value = reader;
  for (const key of path) {
    if (!live(value)) return null;
    value = value[key];
  }
  return live(value) ? value : null;
}

const deadObject = (value: unknown, isDead: (value: unknown) => boolean) =>
  value !== null && (typeof value === 'object' || typeof value === 'function') && isDead(value);

/**
 * A reader Zotero still lists whose window is gone (issue #143): a script's
 * `reader._window.close()` skips Zotero's `reader.close()`, so nothing takes
 * the reader out of `Zotero.Reader._readers`, and its internal reader and
 * iframe window are dead wrappers that throw on every read. The reader
 * object itself is chrome-side and stays readable; one still opening, with
 * no internal reader yet, is not gone.
 */
export function readerGone(reader: any, isDead: (value: unknown) => boolean): boolean {
  if (reader === null || reader === undefined) return false;
  return deadObject(reader, isDead) || deadObject(reader._internalReader, isDead) || deadObject(reader._iframeWindow, isDead);
}

/**
 * Hands every listed reader to `visit`, each on its own (issue #143): a
 * reader whose window is gone is skipped without a word, and a throw on any
 * other is reported while the rest are still visited — one reader costs what
 * it holds, as one startup step does (core/startup-steps.ts).
 */
export function forEachReader(
  readers: Iterable<unknown>,
  visit: (reader: any) => unknown,
  deps: { isDead(value: unknown): boolean; error(e: unknown): void },
): void {
  for (const reader of readers) {
    try {
      if (!readerGone(reader, deps.isDead)) visit(reader);
    } catch (e) {
      deps.error(e);
    }
  }
}
