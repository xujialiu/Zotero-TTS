import { isPositionEntry, normalizePosition, type PositionEntry } from './read-aloud-position';

/**
 * The shared positions file on the user's WebDAV server (#40): the union of
 * every machine's Read Aloud bookmarks, one JSON document beside the
 * settings backup. Unlike settings — one file per machine, because they
 * cannot merge (#41) — positions merge per attachment by recency, so one
 * shared file is safe: every transfer is download → merge → conditional
 * upload (position-transport.ts), and a lost concurrent write is healed by
 * the next sync because the local store still holds the data.
 *
 * The serialized form is canonical — entries sorted by library then key,
 * fields in one order — so byte equality means content equality, and the
 * transport can skip the upload when nothing changed. `mergePositions` is
 * also what the manual positions import uses (#41): an import is a merge,
 * never a replace.
 *
 * **Retired in 2.0.0, on one condition** (docs/spec/SYNC-FORMAT.md, section
 * 5; issue #126, the shape of #22): since 1.13.2 the Positions File
 * `xujialiu-positions.json` (xujialiu-positions-file.ts) carries the same
 * positions keyed by Document Id for EPUB, and this file stays the
 * desktop-only carrier for PDF and snapshot positions. It goes only once the
 * spec defines and the plugin ships a Document Id rule and a locator dialect
 * for `pdf` and `snapshot`, so a desktop-only owner loses nothing; until
 * then every 1.x build writes both files. A 2.0 build neither reads nor
 * deletes this file — machines still on 1.x keep using it. To delete then:
 * this module, position-transport.ts and its wiring in index.ts, the
 * `positions` pair of the Backup group's import/export, and their tests.
 */

export const POSITIONS_FILENAME = 'zotero-tts-positions.json';
export const POSITIONS_FORMAT = 'zotero-tts-positions';
export const POSITIONS_VERSION = 1;

export type PositionsFileErrorKind =
  /** Not this format at all, or unreadable — overwriting it heals it. */
  | 'malformed'
  /** Written by a newer plugin — this build must not touch it. */
  | 'newer';

export class PositionsFileError extends Error {
  constructor(
    public readonly kind: PositionsFileErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'PositionsFileError';
  }
}

const canonical = (entries: PositionEntry[]): PositionEntry[] =>
  [...entries]
    .sort((a, b) => a.lib - b.lib || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((e) => ({ lib: e.lib, key: e.key, pos: e.pos, ts: e.ts }));

/** The canonical file text for these entries; equal content is equal text. */
export function serializePositions(entries: PositionEntry[]): string {
  return JSON.stringify({ format: POSITIONS_FORMAT, version: POSITIONS_VERSION, items: canonical(entries) });
}

/**
 * The entries of a positions file. Malformed entries are dropped, positions
 * normalized on the way in (a pre-#14 rect list becomes its resume point).
 * Throws a PositionsFileError: `malformed` for anything unreadable — the
 * caller may treat the file as absent and heal it — and `newer` for a valid
 * file of a later version, which the caller must leave alone.
 */
export function parsePositions(text: string): PositionEntry[] {
  let parsed: { format?: unknown; version?: unknown; items?: unknown };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new PositionsFileError('malformed', 'The positions file on the server is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || parsed.format !== POSITIONS_FORMAT) {
    throw new PositionsFileError('malformed', 'The file on the server is not a Zotero-TTS positions file.');
  }
  if (typeof parsed.version !== 'number' || !Array.isArray(parsed.items)) {
    throw new PositionsFileError('malformed', 'The positions file on the server has no readable entries.');
  }
  if (parsed.version > POSITIONS_VERSION) {
    throw new PositionsFileError(
      'newer',
      `The positions file on the server is version ${parsed.version}; this build reads up to ${POSITIONS_VERSION}. Update Zotero-TTS on this computer.`,
    );
  }
  return parsed.items.filter(isPositionEntry).map((e) => ({ lib: e.lib, key: e.key, pos: normalizePosition(e.pos), ts: e.ts }));
}

/**
 * The union per attachment, the newest `ts` winning; an equal `ts` keeps
 * `a`'s entry, so merging a file into itself changes nothing. Canonical
 * order on the way out.
 */
export function mergePositions(a: PositionEntry[], b: PositionEntry[]): PositionEntry[] {
  const byId = new Map<string, PositionEntry>();
  for (const e of a) byId.set(e.lib + '/' + e.key, e);
  for (const e of b) {
    const id = e.lib + '/' + e.key;
    const mine = byId.get(id);
    if (!mine || e.ts > mine.ts) byId.set(id, e);
  }
  return canonical([...byId.values()]);
}
