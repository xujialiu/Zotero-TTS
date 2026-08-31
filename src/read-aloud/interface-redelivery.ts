/**
 * Zotero reads a reader's Read Aloud interface once, at _open(), so a tab
 * open across an in-place upgrade keeps calling the instance that has just
 * shut down (issue #38). The slot it was stored in is re-read, though: every
 * loadVoices builds its provider from the manager's options afresh, and each
 * voice object carries the provider that listed it. So the new instance can
 * rescue such a tab by writing its interface into the slots and rebuilding
 * the voice list — and the mirror walk at disable hands the tabs back to
 * Zotero's own interface instead of leaving them a dead composite.
 *
 * Everything Zotero-flavored is injected; this module is the walk alone.
 */

/** What both walks need to reach a tab. */
type WalkIO = {
  /** The readers open right now — Zotero.Reader._readers, read fresh. */
  readers(): unknown[];
  /** A reader whose compartment is gone; skipped, never touched. */
  isDead(reader: unknown): boolean;
  /** Readers carrying this instance's override (the hijack's shared set). */
  isPatched(reader: unknown): boolean;
  /**
   * Write iface into every slot the tab reads (the manager's options and
   * the internal reader's field). False when the tab has no slots yet —
   * it never finished opening, and Zotero will read the method itself.
   */
  deliver(reader: unknown, iface: unknown): boolean;
  /** Whether the tab already built a voice list — its voice objects hold the provider that listed them until the list is rebuilt. */
  hasVoices(reader: unknown): boolean;
  /** Rebuild the tab's voice list over whatever the slots hold now. */
  refreshVoices(reader: unknown): void;
  debug(message: string): void;
  error(e: unknown): void;
};

export type RedeliverDeps = WalkIO & {
  /** Install this instance's own _getReadAloudRemoteInterface and record the reader in the shared set. */
  patch(reader: unknown): void;
  /** The wrapped composite interface for this open reader; null when it offers no window to wrap for. */
  build(reader: unknown): unknown | null;
};

export type RestoreDeps = WalkIO & {
  /** Zotero's own interface for this reader; null when the prototype has none — the slot is then cleared. */
  buildNative(reader: unknown): unknown | null;
};

type WalkCounts = { touched: number; refreshed: number };

/**
 * One tab, both walks: write the interface, rebuild the list the tab
 * already had. A tab without slots takes no delivery and keeps no list.
 */
function swap(reader: unknown, iface: unknown | null, io: WalkIO): Partial<WalkCounts> {
  if (iface === undefined) return {};
  if (!io.deliver(reader, iface)) return {};
  if (!io.hasVoices(reader)) return { touched: 1 };
  io.refreshVoices(reader);
  return { touched: 1, refreshed: 1 };
}

function walk(io: WalkIO, each: (reader: unknown) => Partial<WalkCounts>): WalkCounts {
  const counts: WalkCounts = { touched: 0, refreshed: 0 };
  for (const reader of io.readers()) {
    try {
      if (io.isDead(reader)) continue;
      const done = each(reader);
      counts.touched += done.touched ?? 0;
      counts.refreshed += done.refreshed ?? 0;
    } catch (e) {
      // One dead or half-open tab must not strand the rest of the walk
      io.error(e);
    }
  }
  return counts;
}

/** At startup: give every tab opened under a previous instance this one's interface. */
export function redeliverInterfaces(deps: RedeliverDeps): { delivered: number; refreshed: number } {
  const counts = walk(deps, (reader) => {
    // The push hook got it first: Zotero reads the method itself at _open()
    if (deps.isPatched(reader)) return {};
    deps.patch(reader);
    return swap(reader, deps.build(reader) ?? undefined, deps);
  });
  if (counts.touched || counts.refreshed) {
    deps.debug(`redelivered the Read Aloud interface to ${counts.touched} open reader(s); rebuilt ${counts.refreshed} voice list(s)`);
  }
  return { delivered: counts.touched, refreshed: counts.refreshed };
}

/** At disable or uninstall: hand every tab this instance patched back to Zotero's own interface. */
export function restoreInterfaces(deps: RestoreDeps): { restored: number; refreshed: number } {
  const counts = walk(deps, (reader) => {
    // An override this instance did not install may be another plugin's
    if (!deps.isPatched(reader)) return {};
    return swap(reader, deps.buildNative(reader), deps);
  });
  if (counts.touched || counts.refreshed) {
    deps.debug(`handed ${counts.touched} open reader(s) back to Zotero's Read Aloud interface; rebuilt ${counts.refreshed} voice list(s)`);
  }
  return { restored: counts.touched, refreshed: counts.refreshed };
}
