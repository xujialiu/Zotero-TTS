import { PREF_PREFIX, type PrefsBackend } from '../core/settings';

/**
 * Where Read Aloud stopped, per attachment, kept by the plugin.
 *
 * Zotero tracks this itself — `_state.readAloudState.savedPosition` (reader
 * bundle ~83604) persisted as the per-attachment synced setting
 * `lastReadAloudPosition` — but erases it as soon as the user scrolls away:
 * ~84365 writes null whenever `isPositionNearView` is false (±5 pages on
 * PDF, roughly −3/+4 viewport heights on EPUB and snapshot). Pausing,
 * scrolling somewhere else and closing the document therefore loses the
 * position. This store keeps its own copy, which nothing erases.
 *
 * It is not an annotation: nothing is drawn in the document, nothing shows
 * up in the annotations sidebar, nothing is synced or exported. `pos` is
 * opaque JSON — Zotero's `sourcePosition`, whose shape differs per view
 * type (PDF `{pageIndex, rects}`, EPUB `{value: <cfi>}`, snapshot
 * `{value: <selector>}`) and which is only ever handed straight back to
 * Zotero — except that a PDF position is stored in the normal form of
 * `normalizePosition` (the resume point, not the rect list; #14).
 *
 * The store lives in the plugin's own database, one row per attachment
 * (position-store.ts, #16) — every document the user has listened to keeps
 * its bookmark, no count cap and no byte cap. The pref here is the legacy
 * home: `readPositions` remains for the one-time import, which clears it
 * (deleted in 2.0, #22). Reading state, not a setting: like
 * `readAloud.memory` this store stays out of DEFAULTS, so
 * settings-backup.ts (which backs up exactly DEFAULTS) does not carry
 * bookmarks between machines.
 */

export const READ_ALOUD_POSITIONS_PREF = PREF_PREFIX + 'readAloud.positions';

const FORMAT_VERSION = 1;

export interface PositionEntry {
  /** The attachment's libraryID. */
  lib: number;
  /** The attachment's item key — stable across machines, unlike itemID. */
  key: string;
  /** Zotero's sourcePosition, stored opaquely. */
  pos: unknown;
  /** When it was last updated, ms since the epoch. */
  ts: number;
}

/** A stored entry's shape — shared with the sync file's validation (position-file.ts). */
export function isPositionEntry(value: unknown): value is PositionEntry {
  const e = value as PositionEntry | null;
  return (
    !!e &&
    typeof e === 'object' &&
    typeof e.lib === 'number' &&
    typeof e.key === 'string' &&
    !!e.key &&
    typeof e.ts === 'number' &&
    e.pos !== undefined &&
    e.pos !== null
  );
}

/** The legacy pref store, read for the import (and as the fallback when the database cannot open). */
export function readPositions(prefs: PrefsBackend): PositionEntry[] {
  try {
    const raw = prefs.get(READ_ALOUD_POSITIONS_PREF);
    if (typeof raw !== 'string' || !raw) return [];
    const parsed = JSON.parse(raw) as { v?: unknown; items?: unknown };
    if (parsed?.v !== FORMAT_VERSION || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter(isPositionEntry);
  } catch {
    return [];
  }
}

/**
 * The stored normal form of a position, and the target resume hands to
 * `startReadAloudAtPosition`: for a PDF, the center of the first rect as a
 * zero-area point rect.
 *
 * Why a point at all: a whole-sentence rect position lands one segment
 * early — Zotero's rect→segment mapping resolves the leading boundary into
 * the *previous* segment (verified deterministically 2026-08-27,
 * notes/NOTES.md). The context menu's "Read Aloud from Here" passes
 * `{pageIndex, rects: [[x, y, x, y]]}` (reader bundle ~79159) and lands
 * exactly, so resume passes the center of the sentence's first line.
 *
 * Why the *store* keeps the point (#14): of the merged-line rect list only
 * `rects[0]` is read by anything, and the list is unbounded when Zotero's
 * per-character rects never merge — one stored position carried 4,912
 * rects, 106,938 chars, 95% of a pref Gecko warns about at 4 KiB.
 *
 * Coordinates are rounded to one decimal: an unrounded center comes out as
 * `204.20000000000005` — measured live 2026-08-30, it made a 58-char
 * position *grow* to 77 — and 0.05 PDF units cannot leave the character's
 * line rect (6–12 units tall), let alone the sentence. The function is
 * idempotent, a stored point being its own normal form, so normalizing
 * again at resume changes nothing.
 *
 * EPUB and snapshot selectors are strings to Zotero and to us — they pass
 * through unchanged, as does any shape not recognized as a PDF position.
 */
export function normalizePosition(pos: unknown): unknown {
  const p = pos as { pageIndex?: unknown; rects?: unknown } | null;
  if (!p || typeof p !== 'object' || typeof p.pageIndex !== 'number' || !Array.isArray(p.rects)) return pos;
  const first = p.rects[0] as unknown;
  if (!Array.isArray(first) || first.length !== 4 || !first.every((n) => typeof n === 'number' && Number.isFinite(n))) return pos;
  const [x1, y1, x2, y2] = first as number[];
  const cx = Math.round(((x1 + x2) / 2) * 10) / 10;
  const cy = Math.round(((y1 + y2) / 2) * 10) / 10;
  return { pageIndex: p.pageIndex, rects: [[cx, cy, cx, cy]] };
}

/** What resume hands to Zotero — the store's normal form, unchanged. */
export const resumeTarget = normalizePosition;

/** Whether two positions are the same — the test Zotero itself makes (xpcom/reader.js:1040). */
export function samePosition(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    return false;
  }
}

/** A position's shape and size, for diagnostics — never its content. */
export interface PositionDescription {
  kind: string;
  /** Serialized length; -1 when the object cannot be serialized. */
  chars: number;
  rects?: number;
  nextPageRects?: number;
}

/**
 * What diagnostics report instead of a position. Dumping was the old
 * behavior, and with one pathological entry the diagnostic itself was
 * 100 KB (#14, item 4). Total: a cross-compartment object mid-teardown
 * throws on any touch, and that must describe, not break, the report.
 */
export function describePosition(pos: unknown): PositionDescription {
  try {
    const chars = JSON.stringify(pos ?? null).length;
    if (pos === null || pos === undefined) return { kind: 'null', chars };
    if (typeof pos !== 'object') return { kind: typeof pos, chars };
    const p = pos as { pageIndex?: unknown; rects?: unknown; nextPageRects?: unknown; type?: unknown };
    if (typeof p.pageIndex === 'number') {
      const d: PositionDescription = { kind: 'pdf', chars };
      if (Array.isArray(p.rects)) d.rects = p.rects.length;
      if (Array.isArray(p.nextPageRects)) d.nextPageRects = p.nextPageRects.length;
      return d;
    }
    return { kind: typeof p.type === 'string' && p.type ? p.type : 'object', chars };
  } catch {
    return { kind: 'unserializable', chars: -1 };
  }
}
