import type { DocumentRow } from './position-store';
import type { SharedCapture } from './sdt-anchor';
import type { SharedItem } from './xujialiu-positions-file';

/**
 * This machine's side of the Positions File (docs/spec/SYNC-FORMAT.md,
 * section 6): which Document Id each EPUB attachment has, and the one shared
 * item held per document — written here when the sampler records a sentence,
 * or adopted from the file when a phone read further.
 *
 * The sampler (position-sync.ts) stays synchronous and knows nothing about
 * ids: it hands over `(lib, key, locator + anchor, ts)` and moves on. Naming
 * a document reads its file (`identify`, async, index.ts), so the first
 * sentence of an attachment this session may arrive before its id does; the
 * latest capture per attachment waits for the id and is written then, and
 * every later capture of an attachment whose id is known is written at once.
 * An attachment `identify` could not name — not an EPUB, a file that is not
 * a ZIP, a missing file — is not asked about again this session.
 *
 * The store (position-store.ts) persists both maps; nothing here is awaited
 * by anything that speaks. The transport (xujialiu-positions-transport.ts)
 * reads `list()` and offers `adopt()`; the resume path (index.ts) asks
 * `itemFor()` whether a phone's place is newer than this machine's own row.
 *
 * The stamp rule is the spec's 6.6: `at = max(now, previous.at + 1)`, so a
 * machine with a slow clock still outranks the item it adopted the moment it
 * reads on.
 */

export interface DocumentPositionsDeps {
  /** The Document Id of an attachment, from its file; null when it is not an EPUB or cannot be named. Reads the file, so it is async. */
  identify(lib: number, key: string): Promise<string | null>;
  saveDocument(row: DocumentRow): void;
  saveSharedPosition(item: SharedItem): void;
  /** This machine's Device Name for the stamp: the machine id. */
  device(): string;
  now(): number;
  error(e: unknown): void;
}

export interface DocumentPositionsStats {
  documents: number;
  items: number;
  /** Attachments whose id is being computed, or waiting for it with a capture in hand. */
  identifying: number;
  /** Attachments `identify` could not name this session. */
  unnamed: number;
  /** Items this session took from the file. */
  adopted: number;
  lastError: string | null;
}

export interface DocumentPositions {
  /** Seed from the store, once, after it opened. */
  load(loaded: { documents: DocumentRow[]; positions: SharedItem[] }): void;
  /** The sampler recorded a new sentence: the shared half, stamped and written, once the attachment's id is known. */
  recorded(lib: number, key: string, capture: SharedCapture, at: number): void;
  /** Every item this machine holds — the transport's `local()`. */
  list(): SharedItem[];
  /** One item from the file: taken when this machine holds its document and it is strictly newer than what is held. */
  adopt(item: SharedItem): boolean;
  /** The item held for an attachment's document, or null. */
  itemFor(lib: number, key: string): SharedItem | null;
  /** The Document Id known for an attachment, or null. */
  documentIdOf(lib: number, key: string): string | null;
  /** The upgrade's one-time pass: name every listed attachment that has no id yet (index.ts lists the EPUBs with a native row). */
  backfill(attachments: readonly { lib: number; key: string }[]): Promise<{ identified: number; unnamed: number }>;
  stats(): DocumentPositionsStats;
}

export function createDocumentPositions(deps: DocumentPositionsDeps): DocumentPositions {
  const byAttachment = new Map<string, DocumentRow>();
  const byId = new Map<string, SharedItem>();
  /** Which attachments hold each document: one book can be two attachments (spec's default; two rows adopt one item). */
  const holders = new Map<string, Set<string>>();
  const identifying = new Map<string, Promise<string | null>>();
  const unnamed = new Set<string>();
  /** The latest capture of an attachment whose id is still on its way. */
  const waiting = new Map<string, { capture: SharedCapture; at: number }>();
  let adopted = 0;
  let lastError: string | null = null;

  const keyOf = (lib: number, key: string) => lib + '/' + key;

  function report(e: unknown): void {
    lastError = String(e);
    try {
      deps.error(e);
    } catch {
      // Reporting must never be the thing that throws
    }
  }

  function remember(row: DocumentRow): void {
    const k = keyOf(row.lib, row.key);
    const before = byAttachment.get(k);
    if (before && before.documentId !== row.documentId) holders.get(before.documentId)?.delete(k);
    byAttachment.set(k, row);
    let set = holders.get(row.documentId);
    if (!set) {
      set = new Set();
      holders.set(row.documentId, set);
    }
    set.add(k);
  }

  /** The attachment's id, computing and storing it once; null, remembered, when it cannot be named. */
  function ensureId(lib: number, key: string): Promise<string | null> {
    const k = keyOf(lib, key);
    const known = byAttachment.get(k);
    if (known) return Promise.resolve(known.documentId);
    if (unnamed.has(k)) return Promise.resolve(null);
    const running = identifying.get(k);
    if (running) return running;
    const promise = (async () => {
      let id: string | null = null;
      try {
        id = await deps.identify(lib, key);
      } catch (e) {
        report(e);
      }
      if (id) {
        const row: DocumentRow = { lib, key, documentId: id, publicationId: null, identifiedAt: deps.now() };
        remember(row);
        try {
          deps.saveDocument(row);
        } catch (e) {
          report(e);
        }
      } else {
        unnamed.add(k);
      }
      return id;
    })().finally(() => identifying.delete(k));
    identifying.set(k, promise);
    return promise;
  }

  function write(id: string, capture: SharedCapture, at: number): void {
    const held = byId.get(id);
    const item: SharedItem = {
      id,
      format: 'epub',
      publicationId: null,
      locator: capture.locator,
      anchor: capture.anchor,
      // The caller's `at` is when speech stopped there — now for the
      // sampler, the native row's own time for a row derived after the
      // upgrade — and never below the item it replaces (spec 6.6)
      stamp: { at: Math.max(at, (held?.stamp.at ?? Number.NEGATIVE_INFINITY) + 1), device: deps.device() },
    };
    byId.set(id, item);
    try {
      deps.saveSharedPosition(item);
    } catch (e) {
      report(e);
    }
  }

  return {
    load: (loaded) => {
      for (const row of loaded.documents) remember(row);
      for (const item of loaded.positions) byId.set(item.id, item);
    },
    recorded: (lib, key, capture, at) => {
      const k = keyOf(lib, key);
      const known = byAttachment.get(k);
      if (known) {
        write(known.documentId, capture, at);
        return;
      }
      if (unnamed.has(k)) return;
      waiting.set(k, { capture, at });
      void ensureId(lib, key).then((id) => {
        const latest = waiting.get(k);
        waiting.delete(k);
        if (id && latest) write(id, latest.capture, latest.at);
      });
    },
    list: () => [...byId.values()],
    adopt: (item) => {
      const set = holders.get(item.id);
      if (!set || set.size === 0) return false;
      const held = byId.get(item.id);
      if (held && held.stamp.at >= item.stamp.at) return false;
      byId.set(item.id, item);
      adopted++;
      try {
        deps.saveSharedPosition(item);
      } catch (e) {
        report(e);
      }
      return true;
    },
    itemFor: (lib, key) => {
      const row = byAttachment.get(keyOf(lib, key));
      return row ? (byId.get(row.documentId) ?? null) : null;
    },
    documentIdOf: (lib, key) => byAttachment.get(keyOf(lib, key))?.documentId ?? null,
    backfill: async (attachments) => {
      let identified = 0;
      let missed = 0;
      for (const { lib, key } of attachments) {
        if (byAttachment.has(keyOf(lib, key))) continue;
        // One at a time: a library of EPUBs read in parallel would hold
        // every file in memory at once
        const id = await ensureId(lib, key);
        if (id) identified++;
        else missed++;
      }
      return { identified, unnamed: missed };
    },
    stats: () => ({
      documents: byAttachment.size,
      items: byId.size,
      identifying: new Set([...identifying.keys(), ...waiting.keys()]).size,
      unnamed: unnamed.size,
      adopted,
      lastError,
    }),
  };
}
