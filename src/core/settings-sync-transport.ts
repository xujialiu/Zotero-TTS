import type { ProviderId } from './providers/types';
import type { FlatSettings, SettingValue } from './settings-backup';
import {
  editsPlayerList,
  mergeSharedSettings,
  parseSharedSettings,
  sectionOf,
  seedStamps,
  serializeSharedSettings,
  SHARED_SETTINGS_FILENAME,
  SharedSettingsError,
  type SharedItem,
  type SyncState,
} from './settings-sync';
import { createSingleFlight } from './single-flight';
import { WebDAVError } from './webdav';

/**
 * Carries the settings both ways over the user's WebDAV folder (#68): the
 * transport over core/settings-sync.ts, the shape of the positions
 * transport (read-aloud/position-transport.ts, #40).
 *
 * Every sync is read-merge-write against the one shared file: download,
 * merge with this machine's values and stamps (mergeSharedSettings), apply
 * what is newer there, upload what is newer here — only when the file's
 * text actually changed. The stamps are kept in the sync state
 * (`webdav.syncState`) through `readState`/`writeState`, re-read before
 * every write so a change the user makes while a sync waits on the network
 * is never overwritten by the sync's own bookkeeping.
 *
 * Applying is silent but never invisible: `onSynced` tells the pane after
 * every completed sync, and the stats say what the last one did. While a tab reads, the settings
 * that edit the player's list (a provider section, the favorites pair —
 * ui/reading-guard.ts) wait for the next poke after the reading stops; the
 * rest applies at once. A provider section with an adopted setting is
 * checked afterwards, as Enable and a restore check it (#21): one that
 * fails is switched off **on this machine only** — its switch's stamp set to
 * the file's, or dropped when the file has none, so the flip is never
 * pushed and never switches the working copy off elsewhere — and remembered
 * as held with its reason; the next adoption in that section turns it on
 * and checks again.
 *
 * Triggers come from outside as pokes (startup, a reader opening, a tab
 * closing, the pane opening, the switch going on) and from inside: a
 * change of any synced setting on this machine stamps it at once and syncs
 * after a quiet moment, so a burst of edits is one round trip. The
 * transport's own writes are marked, so its observer neither stamps nor
 * schedules them. Failures follow the auto-upload's pattern (#41): one
 * report and one retry per window, none for an unusable configuration.
 * The shutdown flush pushes only — no adoption, no checks — inside the
 * caller's bound.
 */

/** A change syncs after this much quiet — several fields edited in a row become one sync. */
export const SETTINGS_SYNC_DEBOUNCE_MS = 10_000;

/** A failed sync retries at most once per window, and says so once per window. */
export const SETTINGS_SYNC_RETRY_MS = 60_000;

export interface SettingsSyncClient {
  download(name: string): Promise<string>;
  upload(name: string, text: string): Promise<void>;
}

export interface SettingsSyncDeps {
  /** The webdav.syncSettings switch, read per sync so the checkbox applies at once. */
  enabled(): boolean;
  /** A client for the settings as they are now; throws WebDAVError('config') for an unusable URL. */
  client(): SettingsSyncClient;
  /** This machine's settings, every key, as they are now (flattenSettings(loadSettings(prefs))). */
  values(): FlatSettings;
  /** This machine's id (core/machine-id.ts), written as an item's `by`. */
  machine(): string;
  readState(): SyncState;
  writeState(state: SyncState): void;
  /** Writes one setting to the prefs; the pref observers fire inside it, this transport's own told to ignore the write. */
  write(key: string, value: SettingValue): void;
  /** The titles of the tabs a player is open in; non-empty defers the settings that edit the player's list. */
  readingTabs(): string[];
  /** The connection check of one provider, headless and bounded (ui/prefs-pane.ts); rejects are read as failures. */
  checkProvider(id: ProviderId): Promise<{ ok: boolean; message: string }>;
  /** After every completed sync (skipped ones excepted): what changed on this machine, or null when nothing did — the pane's status line and redraw. */
  onSynced?(report: SettingsSyncApplied | null): void;
  /** The synced keys with their observer names (relative to `extensions.zotero.`). */
  keys: { key: string; observer: string }[];
  registerObserver(name: string, handler: () => void): unknown;
  unregisterObserver(token: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
  error(e: unknown): void;
  debug(message: string): void;
}

export interface SettingsSyncApplied {
  at: number;
  /** The keys written on this machine, the provider switches a check moved included. */
  applied: string[];
  /** The machines the adopted values came from. */
  from: string[];
  /** Providers held off on this machine, with the check's message. */
  held: Record<string, string>;
  /** Adoptions left for after the reading stops. */
  deferred: number;
}

export interface SettingsSyncStats {
  /** Observers actually registered; below keys.length means some registrations threw. */
  watching: number;
  /** A change of this machine's is waiting for its quiet moment. */
  pendingChange: boolean;
  /** Sync attempts, skipped ones included. */
  syncs: number;
  lastTrigger: string | null;
  lastOutcome: 'ok' | 'skipped' | 'deferred' | 'error' | null;
  lastAt: number | null;
  lastError: string | null;
  /** The last completed sync's numbers; null before one completes. */
  remoteItems: number | null;
  adopted: number | null;
  deferred: number | null;
  pushed: number | null;
  uploaded: boolean | null;
  /** The last batch that changed something here. */
  lastApplied: SettingsSyncApplied | null;
  /** Providers held off on this machine, with the check's message. */
  held: Record<string, string>;
  running: boolean;
}

export interface SettingsSyncTransport {
  /** Register the observers. */
  start(): void;
  /** Schedule a sync; never blocks, a burst coalesces into one trailing run. */
  poke(trigger: string): void;
  /** One awaited, forced sync; `pushOnly` — the shutdown's — adopts nothing and checks nothing. The caller bounds the wait. */
  flush(trigger: string, options?: { pushOnly?: boolean }): Promise<void>;
  /** Unregister and cancel; whatever is pending is dropped — flush first at shutdown. */
  stop(): void;
  stats(): SettingsSyncStats;
}

const isProviderId = (section: string, ids: readonly string[]): section is ProviderId => ids.includes(section);

export function createSettingsSyncTransport(deps: SettingsSyncDeps): SettingsSyncTransport {
  const tokens: unknown[] = [];
  const providerIds = [...new Set(deps.keys.map(({ key }) => sectionOf(key)).filter((s) => deps.keys.some(({ key }) => key === `${s}.enabled`)))];
  let timer: unknown = null;
  let pendingChange = false;
  /** The transport's own pref writes: the observer neither stamps nor schedules them. */
  let applying = false;
  let pushOnlyRequested = false;
  let syncs = 0;
  let lastTrigger: string | null = null;
  let lastOutcome: SettingsSyncStats['lastOutcome'] = null;
  let lastAt: number | null = null;
  let lastError: string | null = null;
  let remoteItems: number | null = null;
  let adoptedCount: number | null = null;
  let deferredCount: number | null = null;
  let pushedCount: number | null = null;
  let uploadedFlag: boolean | null = null;
  let lastApplied: SettingsSyncApplied | null = null;
  let lastFailureAt = Number.NEGATIVE_INFINITY;
  let lastReportAt = Number.NEGATIVE_INFINITY;

  function report(e: unknown): void {
    try {
      deps.error(e);
    } catch {
      // Reporting must never be the thing that throws
    }
  }

  /** One report per window: a down server says so once a minute, not once per edit. */
  function reportGated(e: unknown): void {
    const at = deps.now();
    if (at - lastReportAt < SETTINGS_SYNC_RETRY_MS) return;
    lastReportAt = at;
    report(e);
  }

  /** Re-read, change, write: the state on disk is the truth between awaits. */
  function updateState(mutate: (state: SyncState) => void): SyncState {
    const state = deps.readState();
    mutate(state);
    deps.writeState(state);
    return state;
  }

  function silently(fn: () => void): void {
    const was = applying;
    applying = true;
    try {
      fn();
    } finally {
      applying = was;
    }
  }

  function disarm(): void {
    if (timer === null) return;
    try {
      deps.clearTimeout(timer);
    } catch {
      // A dead timer host at shutdown; nothing left to cancel
    }
    timer = null;
  }

  function arm(ms: number, trigger: string): void {
    disarm();
    try {
      timer = deps.setTimeout(() => {
        timer = null;
        pendingChange = false;
        flight.poke(trigger);
      }, ms);
    } catch (e) {
      report(e);
    }
  }

  /** A setting changed on this machine: stamp it now, switch on or off, and sync after the quiet period when on. */
  function changed(key: string): void {
    if (applying) return;
    const now = deps.now();
    try {
      updateState((state) => {
        state.stamps[key] = now;
      });
    } catch (e) {
      reportGated(e);
    }
    if (!deps.enabled()) return;
    pendingChange = true;
    arm(SETTINGS_SYNC_DEBOUNCE_MS, 'change');
  }

  async function safeCheck(id: ProviderId): Promise<{ ok: boolean; message: string }> {
    try {
      return await deps.checkProvider(id);
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Never throws: outcome and error land in the stats and the gated report. */
  async function sync(trigger: string, force: boolean): Promise<void> {
    const pushOnly = pushOnlyRequested;
    pushOnlyRequested = false;
    syncs++;
    lastTrigger = trigger;
    lastAt = deps.now();
    if (!deps.enabled()) {
      lastOutcome = 'skipped';
      return;
    }
    if (!force && deps.now() - lastFailureAt < SETTINGS_SYNC_RETRY_MS) {
      lastOutcome = 'skipped';
      return;
    }
    try {
      const client = deps.client();
      let remoteText: string | null = null;
      try {
        remoteText = await client.download(SHARED_SETTINGS_FILENAME);
      } catch (e) {
        // No file yet is the ordinary first run, not a failure
        if (!(e instanceof WebDAVError) || e.kind !== 'not-found') throw e;
      }
      let remote: SharedItem[] = [];
      if (remoteText !== null) {
        try {
          remote = parseSharedSettings(remoteText);
        } catch (e) {
          // A newer build's file is left strictly alone; a broken one is
          // treated as absent, and the upload below heals it
          if (e instanceof SharedSettingsError && e.kind === 'newer') throw e;
          reportGated(e);
          remoteText = null;
        }
      }
      const remoteByKey = new Map(remote.map((item) => [item.key, item]));

      // The first sync with the switch on: what differs from its default
      // counts as set now, what is still at its default takes the file's
      const values = deps.values();
      let state = deps.readState();
      if (!state.seeded) {
        const now = deps.now();
        state = updateState((s) => {
          s.stamps = seedStamps(values, s.stamps, now);
          s.seeded = true;
        });
      }

      const plan = mergeSharedSettings({ values, stamps: state.stamps, machine: deps.machine() }, remote);

      // Apply: the list-editing settings wait while a tab reads, the rest go at once
      const applied: string[] = [];
      const from = new Set<string>();
      let deferred = 0;
      const stamps: Record<string, number> = { ...plan.restamp };
      if (!pushOnly) {
        const reading = plan.adopt.length > 0 && deps.readingTabs().length > 0;
        for (const item of plan.adopt) {
          if (reading && editsPlayerList(item.key)) {
            deferred++;
            continue;
          }
          try {
            silently(() => deps.write(item.key, item.value));
          } catch (e) {
            // A value the pref refuses: left out, unstamped, said once
            reportGated(e);
            continue;
          }
          applied.push(item.key);
          if (item.by) from.add(item.by);
          stamps[item.key] = item.ts;
        }
      }
      if (Object.keys(stamps).length) {
        state = updateState((s) => {
          Object.assign(s.stamps, stamps);
        });
      }

      // The providers a batch touched are checked as Enable checks them (#21):
      // one that fails here goes off here, and only here
      const held: Record<string, string> = {};
      const flipped: string[] = [];
      if (!pushOnly && applied.length) {
        const after = deps.values();
        const toCheck: ProviderId[] = [];
        for (const section of new Set(applied.map(sectionOf))) {
          if (!isProviderId(section, providerIds)) continue;
          const enabledKey = `${section}.enabled`;
          let on = after[enabledKey] === true;
          if (!on && state.held[section] && remoteByKey.get(enabledKey)?.value === true) {
            // Held here since a failed check, and its section just changed: try it again
            try {
              silently(() => deps.write(enabledKey, true));
              on = true;
              flipped.push(enabledKey);
            } catch (e) {
              reportGated(e);
            }
          }
          if (on) toCheck.push(section);
        }
        const outcomes = await Promise.all(toCheck.map(async (id) => ({ id, outcome: await safeCheck(id) })));
        for (const { id, outcome } of outcomes) {
          const enabledKey = `${id}.enabled`;
          if (outcome.ok) {
            state = updateState((s) => {
              delete s.held[id];
            });
            continue;
          }
          try {
            silently(() => deps.write(enabledKey, false));
            flipped.push(enabledKey);
          } catch (e) {
            reportGated(e);
          }
          const fileTs = remoteByKey.get(enabledKey)?.ts;
          const now = deps.now();
          state = updateState((s) => {
            // The flip is this machine's alone: at the file's stamp it is
            // never pushed; with no item in the file it has no opinion at all
            if (fileTs !== undefined) s.stamps[enabledKey] = fileTs;
            else delete s.stamps[enabledKey];
            s.held[id] = { ts: now, reason: outcome.message };
          });
          held[id] = outcome.message;
        }
      }

      const text = serializeSharedSettings(plan.items);
      let uploaded = false;
      if (remoteText === null ? plan.items.length > 0 : plan.changed) {
        await client.upload(SHARED_SETTINGS_FILENAME, text);
        uploaded = true;
      }

      remoteItems = remote.length;
      adoptedCount = applied.length;
      deferredCount = deferred;
      pushedCount = plan.pushed.length;
      uploadedFlag = uploaded;
      lastOutcome = deferred > 0 ? 'deferred' : 'ok';
      lastError = null;
      lastFailureAt = Number.NEGATIVE_INFINITY;
      const report = applied.length || flipped.length ? { at: deps.now(), applied: [...applied, ...flipped], from: [...from], held, deferred } : null;
      if (report) lastApplied = report;
      try {
        deps.onSynced?.(report);
      } catch (e) {
        reportGated(e);
      }
      deps.debug(
        `settings sync (${trigger}): ${remote.length} remote, ${applied.length} applied, ${deferred} deferred, ${plan.pushed.length} pushed, ${plan.skipped.length} skipped${uploaded ? ', uploaded' : ''}${Object.keys(held).length ? `, held ${Object.keys(held).join(' ')}` : ''}`,
      );
    } catch (e) {
      lastOutcome = 'error';
      lastError = String(e);
      lastFailureAt = deps.now();
      reportGated(e);
      try {
        deps.onSynced?.(null);
      } catch (e2) {
        reportGated(e2);
      }
      // An unusable configuration retries on the next change, not on a
      // timer — otherwise a blank URL logs an error a minute forever
      if (!(e instanceof WebDAVError && e.kind === 'config')) arm(SETTINGS_SYNC_RETRY_MS, 'retry');
    }
  }

  const flight = createSingleFlight(sync);

  return {
    start: () => {
      for (const { key, observer } of deps.keys) {
        try {
          tokens.push(deps.registerObserver(observer, () => changed(key)));
        } catch (e) {
          report(e);
        }
      }
    },
    poke: flight.poke,
    flush: (trigger, options) => {
      disarm();
      pendingChange = false;
      if (options?.pushOnly) pushOnlyRequested = true;
      return flight.flush(trigger);
    },
    stop: () => {
      disarm();
      pendingChange = false;
      for (const token of tokens) {
        try {
          deps.unregisterObserver(token);
        } catch {
          // Already gone at shutdown
        }
      }
      tokens.length = 0;
    },
    stats: () => {
      let held: Record<string, string> = {};
      try {
        held = Object.fromEntries(Object.entries(deps.readState().held).map(([id, entry]) => [id, entry?.reason ?? '']));
      } catch {
        // A state that cannot be read shows as nothing held
      }
      return {
        watching: tokens.length,
        pendingChange,
        syncs,
        lastTrigger,
        lastOutcome,
        lastAt,
        lastError,
        remoteItems,
        adopted: adoptedCount,
        deferred: deferredCount,
        pushed: pushedCount,
        uploaded: uploadedFlag,
        lastApplied,
        held,
        running: flight.running(),
      };
    },
  };
}
