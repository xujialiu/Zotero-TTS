import { sentences, t } from '../core/l10n';
import type { SettingsSyncApplied, SettingsSyncStats } from '../core/settings-sync-transport';

/**
 * The line under *Sync settings between computers* (#68): what the last
 * sync did on this computer, in the user's terms — when, how many settings
 * came in and from which computer, what waits for the reading to stop, and
 * any provider held off here with the check's message. Written from the
 * transport's stats when the pane loads, after every completed sync while
 * the pane is open, and when the switch moves; hidden while the switch is
 * off. A sync that changed settings here also redraws the rows that do not
 * bind their pref — the restore's own redraw (ui/prefs-pane.ts onRestored).
 *
 * Opening the pane is itself a trigger, and that sync usually finds nothing
 * new — so the line keeps naming the last batch that did change something
 * here, with its own time, instead of letting "nothing new" bury it
 * (measured 2026-09-10: the applied form lived ~100 ms before the pane's
 * own sync overwrote it).
 */

export const SYNC_STATUS_ID = 'ztts-sync-status';

export interface SyncStatusDeps {
  /** The webdav.syncSettings switch; off, the line is empty and hidden. */
  enabled(): boolean;
  /** The transport's stats (src/index.ts); null while it is not running. */
  stats(): SettingsSyncStats | null;
  /** A listener for every completed sync — null when nothing changed here; returns the unsubscribe. */
  watch(onSynced: (report: SettingsSyncApplied | null) => void): () => void;
  /** The switch's pref observer; returns the unsubscribe. */
  watchSwitch(onChange: () => void): () => void;
  /** A sync changed settings on this computer: the pane's unbound rows redraw. */
  onApplied(): void;
  /** A clock time for the line, in the user's locale. */
  formatTime(ts: number): string;
}

const fromOf = (report: SettingsSyncApplied) => (report.from.length ? report.from.join(', ') : t('ztts-sync-other-computer'));

/** The line's text for these stats; empty while the switch is off. */
export function syncStatusText(stats: SettingsSyncStats | null, enabled: boolean, formatTime: (ts: number) => string): string {
  if (!enabled) return '';
  if (!stats || stats.lastAt === null || stats.lastOutcome === null) return t('ztts-sync-status-waiting');
  const time = formatTime(stats.lastAt);
  if (stats.lastOutcome === 'error' || (stats.lastOutcome === 'skipped' && stats.lastError)) {
    return t('ztts-sync-status-failed', { time, detail: stats.lastError ?? '' });
  }
  if (stats.lastOutcome === 'skipped') return t('ztts-sync-status-waiting');
  const adopted = stats.adopted ?? 0;
  const last = stats.lastApplied;
  const lead =
    adopted > 0 && last
      ? t('ztts-sync-status-applied', { time, count: adopted, from: fromOf(last) })
      : last && last.applied.length
        ? t('ztts-sync-status-last', { time, count: last.applied.length, from: fromOf(last), when: formatTime(last.at) })
        : t('ztts-sync-status-none', { time });
  const deferred = stats.deferred ? t('ztts-sync-status-deferred', { count: stats.deferred }) : '';
  const held = Object.entries(stats.held).map(([provider, reason]) => t('ztts-sync-status-held', { provider, reason }));
  return sentences(lead, deferred, ...held);
}

export function initSyncStatusRows(
  doc: { getElementById(id: string): { textContent: string; hidden?: boolean | string } | null },
  deps: SyncStatusDeps,
): { refresh(): void; dispose(): void } {
  const line = doc.getElementById(SYNC_STATUS_ID);
  const refresh = () => {
    if (!line) return;
    const text = syncStatusText(deps.stats(), deps.enabled(), deps.formatTime);
    line.textContent = text;
    // An empty description still takes a line's height under the switch
    line.hidden = text === '';
  };
  refresh();
  const unwatch = deps.watch((report) => {
    if (report && report.applied.length) deps.onApplied();
    refresh();
  });
  const unwatchSwitch = deps.watchSwitch(refresh);
  return {
    refresh,
    dispose: () => {
      unwatch();
      unwatchSwitch();
    },
  };
}
