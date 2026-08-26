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
 * Zotero.
 *
 * Reading state, not a setting: like `readAloud.memory` this pref stays out
 * of DEFAULTS, so settings-backup.ts (which backs up exactly DEFAULTS) does
 * not carry bookmarks between machines.
 */

export const READ_ALOUD_POSITIONS_PREF = PREF_PREFIX + 'readAloud.positions';

/** Newest first; anything past this is dropped on write. */
export const MAX_POSITIONS = 50;

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

function isEntry(value: unknown): value is PositionEntry {
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

export function readPositions(prefs: PrefsBackend): PositionEntry[] {
  try {
    const raw = prefs.get(READ_ALOUD_POSITIONS_PREF);
    if (typeof raw !== 'string' || !raw) return [];
    const parsed = JSON.parse(raw) as { v?: unknown; items?: unknown };
    if (parsed?.v !== FORMAT_VERSION || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter(isEntry);
  } catch {
    return [];
  }
}

export function writePositions(prefs: PrefsBackend, entries: readonly PositionEntry[]): void {
  prefs.set(READ_ALOUD_POSITIONS_PREF, JSON.stringify({ v: FORMAT_VERSION, items: entries.slice(0, MAX_POSITIONS) }));
}

export function lookupPosition(entries: readonly PositionEntry[], lib: number, key: string): unknown | null {
  return entries.find((e) => e.lib === lib && e.key === key)?.pos ?? null;
}

/** Upsert, newest first, capped at MAX_POSITIONS. Returns a new array. */
export function putPosition(
  entries: readonly PositionEntry[],
  lib: number,
  key: string,
  pos: unknown,
  now: number,
): PositionEntry[] {
  const rest = entries.filter((e) => !(e.lib === lib && e.key === key));
  return [{ lib, key, pos, ts: now }, ...rest].slice(0, MAX_POSITIONS);
}

/**
 * What resume hands to `startReadAloudAtPosition`. A whole-sentence PDF
 * rect position lands one segment early: Zotero's rect→segment mapping
 * resolves the leading boundary into the *previous* segment (verified
 * deterministically 2026-08-27, notes/NOTES.md — the same stored sentence
 * passed twice started at its predecessor twice). The context menu's
 * "Read Aloud from Here" passes a zero-area point rect
 * (`{pageIndex, rects: [[x, y, x, y]]}`, reader bundle ~79159) and lands
 * exactly, so resume passes the center of the sentence's first line
 * instead. EPUB and snapshot selectors are strings to Zotero and to us —
 * they pass through unchanged.
 */
export function resumeTarget(pos: unknown): unknown {
  const p = pos as { pageIndex?: unknown; rects?: unknown } | null;
  if (!p || typeof p !== 'object' || typeof p.pageIndex !== 'number' || !Array.isArray(p.rects)) return pos;
  const first = p.rects[0] as unknown;
  if (!Array.isArray(first) || first.length !== 4 || !first.every((n) => typeof n === 'number' && Number.isFinite(n))) return pos;
  const [x1, y1, x2, y2] = first as number[];
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return { pageIndex: p.pageIndex, rects: [[cx, cy, cx, cy]] };
}

/** Whether two positions are the same — the test Zotero itself makes (xpcom/reader.js:1040). */
export function samePosition(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    return false;
  }
}
