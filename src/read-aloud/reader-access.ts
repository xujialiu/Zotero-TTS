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
