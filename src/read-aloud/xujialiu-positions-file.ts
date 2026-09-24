/**
 * The Positions File, `xujialiu-positions.json` (docs/spec/SYNC-FORMAT.md,
 * section 6): every device's reading positions keyed by Document Id, written
 * by this plugin and by OpenReader alike. This module is the file's shape and
 * nothing else — parse, canonical serialise, merge — so the transport
 * (xujialiu-positions-transport.ts) and the tests share one reading of the
 * spec.
 *
 * Two rules here differ from the plugin's own positions file
 * (position-file.ts) and are the spec's, not this file's:
 *
 * - **Unusable items are carried through, never dropped** (spec 2.5). A file
 *   two products write holds formats this build does not implement — `pdf`,
 *   `snapshot`, whatever comes later — and a reader that dropped them would
 *   destroy another product's positions on its next upload. Only an item
 *   whose `id` is not a string is dropped, because nothing can key it, and
 *   that is counted; an empty id is a string, and its item is carried.
 * - **Nothing removes an item** (spec 6.7): there is no tombstone here.
 *
 * The serialised form is canonical (spec 2.3) and the same for every item,
 * usable or carried, in both products (issue #139): compact JSON, the spec's
 * keys in the spec's order at every level and no other key, a field an item
 * lacks left out rather than written as `null`, every value as parsed, items
 * sorted by `id`. Byte equality is content equality, and the transport skips
 * an upload when nothing changed. A version above 1 is refused with `'newer'`
 * and the caller leaves the file alone; anything unreadable is `'malformed'`
 * and treated as absent (spec 2.1, 2.2).
 */

export const SHARED_POSITIONS_FILENAME = 'xujialiu-positions.json';
export const SHARED_POSITIONS_FORMAT = 'xujialiu-positions';
export const SHARED_POSITIONS_VERSION = 1;

/** The formats this build can adopt an item for. `pdf` and `snapshot` are reserved by the spec and carried through. */
export const IMPLEMENTED_FORMATS: readonly string[] = ['epub'];

/** A Document Id: `sha256:` and 64 lowercase hex digits (spec 6.3). */
export const DOCUMENT_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * An EPUB locator as a writer spells it (spec 6.4): `epubcfi(`, the spine
 * step, `!`, even element steps, `)`. No assertion, no text step, no offset,
 * no range. A reader does not hold another writer's locator to it: the anchor
 * verifies every locator (spec 6.5, issue #139).
 */
export const EPUB_LOCATOR_PATTERN = /^epubcfi\(\/\d*[02468]\/\d*[02468]!(?:\/\d*[02468])+\)$/;

/** Up to this many UTF-16 code units of the same block either side of the quotation (spec 6.5). */
export const ANCHOR_CONTEXT = 32;

export interface SharedAnchor {
  exact: string;
  prefix: string;
  suffix: string;
}

export interface SharedStamp {
  /** Milliseconds since the epoch, an integer. */
  at: number;
  /** The Device Name; attribution only, never compared. */
  device: string;
}

/** One usable item of the file, every field validated (spec 6.2). */
export interface SharedItem {
  id: string;
  format: string;
  publicationId: string | null;
  locator: string;
  anchor: SharedAnchor;
  stamp: SharedStamp;
}

/**
 * One item as the file holds it: keyed, stamped, and either usable by this
 * build or carried through as parsed.
 */
export interface SharedEntry {
  /** The merge key. */
  id: string;
  /** `stamp.at` when the stamp validates (an integer `at`, a non-empty `device`), else `-Infinity`: such an item loses every merge and is never adopted (spec 6.7). */
  at: number;
  /** The five fields after `id`, exactly as parsed (`undefined` for one the item lacks), re-emitted in canonical order. */
  fields: SharedFields;
  /** The validated item when every field is right and the format is one this build implements; null means carried through. */
  usable: SharedItem | null;
}

export interface SharedFields {
  format: unknown;
  publicationId: unknown;
  locator: unknown;
  anchor: unknown;
  stamp: unknown;
}

export type SharedPositionsFileErrorKind = 'malformed' | 'newer';

export class SharedPositionsFileError extends Error {
  constructor(
    public readonly kind: SharedPositionsFileErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SharedPositionsFileError';
  }
}

export interface ParsedSharedPositions {
  entries: SharedEntry[];
  /** Items whose `id` is not a string, dropped because nothing can key them (spec 2.5). Reported, never silent. */
  dropped: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The `at` a stamp takes part in the merge with: its own when it validates (spec 6.2), else `-Infinity`, which loses to every stamp that does (spec 6.7). */
const stampAt = (stamp: unknown): number =>
  isRecord(stamp) && Number.isInteger(stamp.at) && typeof stamp.device === 'string' && stamp.device !== '' ? (stamp.at as number) : Number.NEGATIVE_INFINITY;

/** The entry an item of this build's own makes: usable by construction. */
export function entryOf(item: SharedItem): SharedEntry {
  return {
    id: item.id,
    at: item.stamp.at,
    fields: { format: item.format, publicationId: item.publicationId, locator: item.locator, anchor: item.anchor, stamp: item.stamp },
    usable: item,
  };
}

/**
 * The item's six fields validated (spec 6.2), or null when any of them is not
 * what the spec says or the format is not one this build implements. The
 * locator is not held to the grammar of 6.4, which binds a writer: a reader
 * resolves what it can and lets the anchor decide (issue #139).
 */
export function usableItem(id: string, fields: SharedFields): SharedItem | null {
  if (!DOCUMENT_ID_PATTERN.test(id)) return null;
  if (typeof fields.format !== 'string' || !IMPLEMENTED_FORMATS.includes(fields.format)) return null;
  if (fields.publicationId !== null && typeof fields.publicationId !== 'string') return null;
  if (typeof fields.locator !== 'string' || !fields.locator) return null;
  if (!isRecord(fields.anchor) || typeof fields.anchor.exact !== 'string' || !fields.anchor.exact) return null;
  if (typeof fields.anchor.prefix !== 'string' || typeof fields.anchor.suffix !== 'string') return null;
  if (!isRecord(fields.stamp) || !Number.isInteger(fields.stamp.at) || typeof fields.stamp.device !== 'string' || !fields.stamp.device) return null;
  return {
    id,
    format: fields.format,
    publicationId: fields.publicationId,
    locator: fields.locator,
    anchor: { exact: fields.anchor.exact, prefix: fields.anchor.prefix, suffix: fields.anchor.suffix },
    stamp: { at: fields.stamp.at as number, device: fields.stamp.device },
  };
}

/**
 * The file's entries. Throws `SharedPositionsFileError`: `malformed` for
 * anything unreadable — not JSON, not this format, no items array — which the
 * caller treats as absent and the next upload replaces; `newer` for a valid
 * file of a later version, which the caller must leave alone.
 */
export function parseSharedPositions(text: string): ParsedSharedPositions {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SharedPositionsFileError('malformed', 'The positions file on the server is not valid JSON.');
  }
  if (!isRecord(parsed) || parsed.format !== SHARED_POSITIONS_FORMAT) {
    throw new SharedPositionsFileError('malformed', `The file on the server is not a ${SHARED_POSITIONS_FORMAT} file.`);
  }
  if (!Number.isInteger(parsed.version) || (parsed.version as number) < 1 || !Array.isArray(parsed.items)) {
    throw new SharedPositionsFileError('malformed', 'The positions file on the server has no readable entries.');
  }
  if ((parsed.version as number) > SHARED_POSITIONS_VERSION) {
    throw new SharedPositionsFileError(
      'newer',
      `The positions file on the server is version ${parsed.version}; this build reads up to ${SHARED_POSITIONS_VERSION}. Update Zotero-TTS on this computer.`,
    );
  }
  const byId = new Map<string, SharedEntry>();
  let dropped = 0;
  for (const raw of parsed.items as unknown[]) {
    if (!isRecord(raw) || typeof raw.id !== 'string') {
      dropped++;
      continue;
    }
    const fields: SharedFields = {
      format: raw.format,
      publicationId: raw.publicationId,
      locator: raw.locator,
      anchor: raw.anchor,
      stamp: raw.stamp,
    };
    const entry: SharedEntry = { id: raw.id, at: stampAt(raw.stamp), fields, usable: usableItem(raw.id, fields) };
    // One item per id (spec 6.1): a file that breaks that keeps the newer
    const held = byId.get(entry.id);
    if (!held || entry.at > held.at) byId.set(entry.id, entry);
  }
  return { entries: canonical([...byId.values()]), dropped };
}

const byId = (a: SharedEntry, b: SharedEntry): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const canonical = (entries: readonly SharedEntry[]): SharedEntry[] => [...entries].sort(byId);

/**
 * An anchor or a stamp re-emitted with the spec's keys in the spec's order and
 * no other key, one it lacks left out; anything that is not an object goes
 * out as it came (spec 2.3, 2.5).
 */
function canonicalObject(value: unknown, keys: readonly string[]): unknown {
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key of keys) if (value[key] !== undefined) out[key] = value[key];
  return out;
}

/**
 * The canonical file text (spec 2.3): compact, keys in order, items by `id`,
 * one form for every item. A field an item lacks is `undefined` here and
 * `JSON.stringify` leaves it out: an absent `publicationId` is not a `null`
 * one, and only the second is usable (issue #139). Equal content is equal text.
 */
export function serializeSharedPositions(entries: readonly SharedEntry[]): string {
  return JSON.stringify({
    format: SHARED_POSITIONS_FORMAT,
    version: SHARED_POSITIONS_VERSION,
    items: canonical(entries).map((entry) => ({
      id: entry.id,
      format: entry.fields.format,
      publicationId: entry.fields.publicationId,
      locator: entry.fields.locator,
      anchor: canonicalObject(entry.fields.anchor, ['exact', 'prefix', 'suffix']),
      stamp: canonicalObject(entry.fields.stamp, ['at', 'device']),
    })),
  });
}

/**
 * The union by `id` (spec 6.7): between two items with one id the greater
 * `stamp.at` wins, and an equal stamp keeps `local`'s, so merging a file into
 * itself changes nothing. Nothing is removed. Canonical order on the way out.
 */
export function mergeSharedPositions(local: readonly SharedEntry[], remote: readonly SharedEntry[]): SharedEntry[] {
  const merged = new Map<string, SharedEntry>();
  for (const entry of local) merged.set(entry.id, entry);
  for (const entry of remote) {
    const mine = merged.get(entry.id);
    if (!mine || entry.at > mine.at) merged.set(entry.id, entry);
  }
  return canonical([...merged.values()]);
}

/** Every `[…]` assertion removed from a CFI or a path: the spelling both products write (spec 6.4). */
export function stripAssertions(cfi: string): string {
  return cfi.replace(/\[[^\]]*\]/g, '');
}

/** The path inside an EPUB locator (`/6/34!/4/2`), or null when the locator is not one. */
export function locatorPath(locator: string): string | null {
  const m = /^epubcfi\((.*)\)$/.exec(locator);
  return m ? stripAssertions(m[1]) : null;
}

/** The locator for a block path, as the spec spells it. */
export function locatorOfPath(path: string): string {
  return `epubcfi(${stripAssertions(path)})`;
}
