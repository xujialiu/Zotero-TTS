import type { EngineSegment } from '../core/engine/types';

export interface ReadingSection { title: string; start: number; end: number }
type PositionedSegment = EngineSegment & { position?: { start?: ArrayLike<number>; end?: ArrayLike<number> } };
interface OutlineEntry { title?: unknown; ref?: ArrayLike<number> }
const validRef = (ref: ArrayLike<number> | undefined): ref is ArrayLike<number> => {
  if (!ref?.length) return false;
  for (let i = 0; i < ref.length; i++) if (!Number.isInteger(ref[i]) || ref[i] < 0) return false;
  return true;
};
function compare(a: ArrayLike<number>, b: ArrayLike<number>): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}
function contains(ref: ArrayLike<number>, point: ArrayLike<number>): boolean {
  if (point.length < ref.length) return false;
  for (let i = 0; i < ref.length; i++) if (ref[i] !== point[i]) return false;
  return true;
}

/** Zotero 10 SDT refs, not page destinations or EPUB spine files. Reader arrays are read by index. */
export function readingSections(outline: ArrayLike<OutlineEntry> | undefined, segments: ArrayLike<PositionedSegment>): ReadingSection[] {
  if (!outline?.length || !segments.length) return [];
  let previous: ArrayLike<number> | undefined;
  for (let i = 0; i < segments.length; i++) {
    const start = segments[i].position?.start;
    if (!validRef(start) || (previous && compare(previous, start) >= 0)) return [];
    previous = start;
  }
  const result: ReadingSection[] = [];
  for (let i = 0; i < outline.length; i++) {
    const entry = outline[i];
    if (!entry || typeof entry.title !== 'string' || !entry.title.trim() || !validRef(entry.ref)) return [];
    const ref = entry.ref;
    let low = 0, high = segments.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (compare(segments[mid].position!.start!, ref) < 0) low = mid + 1; else high = mid;
    }
    if (low === segments.length || !contains(ref, segments[low].position!.start!)) return [];
    if (result.length && low <= result[result.length - 1].start) return [];
    const priorEnd = low > 0 ? segments[low - 1].position?.end : undefined;
    if (priorEnd && compare(priorEnd, ref) >= 0) return [];
    if (result.length) result[result.length - 1].end = low;
    result.push({ title: entry.title.trim(), start: low, end: segments.length });
  }
  return result;
}

export function sectionAt(sections: readonly ReadingSection[], position: number): ReadingSection | undefined {
  let low = 0, high = sections.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sections[mid].start <= position) low = mid + 1; else high = mid;
  }
  const section = sections[low - 1];
  return section && position < section.end ? section : undefined;
}

/** Cache only by immutable SDT/segment identities; a new segmentation cannot inherit old boundaries. */
export function createReadingSections() {
  const cache = new WeakMap<object, { outline: unknown; sections: ReadingSection[] }>();
  return (reader: any, segments: ArrayLike<EngineSegment>, position: number): ReadingSection | undefined => {
    const outline = reader?._internalReader?._sdt?.structure?.catalog?.outline;
    let entry = cache.get(segments);
    if (!entry || entry.outline !== outline) {
      entry = { outline, sections: readingSections(outline, segments) };
      cache.set(segments, entry);
    }
    return sectionAt(entry.sections, position);
  };
}
