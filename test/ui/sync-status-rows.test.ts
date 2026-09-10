import { describe, expect, it } from 'vitest';
import { sentences, t } from '../../src/core/l10n';
import type { SettingsSyncApplied, SettingsSyncStats } from '../../src/core/settings-sync-transport';
import { initSyncStatusRows, SYNC_STATUS_ID, syncStatusText, type SyncStatusDeps } from '../../src/ui/sync-status-rows';

const stats = (over: Partial<SettingsSyncStats> = {}): SettingsSyncStats => ({
  watching: 54,
  pendingChange: false,
  syncs: 3,
  lastTrigger: 'reader-open',
  lastOutcome: 'ok',
  lastAt: 1_000,
  lastError: null,
  remoteItems: 5,
  adopted: 0,
  deferred: 0,
  pushed: 0,
  uploaded: false,
  lastApplied: null,
  held: {},
  running: false,
  ...over,
});

const at = (ts: number) => `T${ts}`;

describe('syncStatusText', () => {
  it('is empty while the switch is off, whatever the stats', () => {
    expect(syncStatusText(stats({ adopted: 3 }), false, at)).toBe('');
  });

  it('waits before the first sync, and after one the switch skipped', () => {
    expect(syncStatusText(null, true, at)).toBe(t('ztts-sync-status-waiting'));
    expect(syncStatusText(stats({ lastOutcome: null, lastAt: null }), true, at)).toBe(t('ztts-sync-status-waiting'));
    expect(syncStatusText(stats({ lastOutcome: 'skipped' }), true, at)).toBe(t('ztts-sync-status-waiting'));
  });

  it('says nothing new, or what came in and from where', () => {
    expect(syncStatusText(stats(), true, at)).toBe(t('ztts-sync-status-none', { time: 'T1000' }));
    const applied: SettingsSyncApplied = { at: 1_000, applied: ['azure.apiKey', 'readAloud.volume'], from: ['laptop', 'office'], held: {}, deferred: 0 };
    expect(syncStatusText(stats({ adopted: 2, lastApplied: applied }), true, at)).toBe(
      t('ztts-sync-status-applied', { time: 'T1000', count: 2, from: 'laptop, office' }),
    );
    expect(syncStatusText(stats({ adopted: 1, lastApplied: { ...applied, from: [] } }), true, at)).toBe(
      t('ztts-sync-status-applied', { time: 'T1000', count: 1, from: t('ztts-sync-other-computer') }),
    );
  });

  it('keeps naming the last batch that changed something here when the latest sync found nothing new', () => {
    const applied: SettingsSyncApplied = { at: 700, applied: ['azure.apiKey', 'azure.enabled'], from: ['laptop'], held: {}, deferred: 0 };
    expect(syncStatusText(stats({ lastAt: 1_000, adopted: 0, lastApplied: applied }), true, at)).toBe(
      t('ztts-sync-status-last', { time: 'T1000', count: 2, from: 'laptop', when: 'T700' }),
    );
  });

  it('adds what waits for the reading to stop and which providers are held off here', () => {
    const text = syncStatusText(stats({ lastOutcome: 'deferred', deferred: 2, held: { azure: 'Connection failed: 401' } }), true, at);
    expect(text).toBe(
      sentences(t('ztts-sync-status-none', { time: 'T1000' }), t('ztts-sync-status-deferred', { count: 2 }), t('ztts-sync-status-held', { provider: 'azure', reason: 'Connection failed: 401' })),
    );
  });

  it('reports a failure, also when the last attempt was skipped inside the failure window', () => {
    expect(syncStatusText(stats({ lastOutcome: 'error', lastError: 'Error: 503' }), true, at)).toBe(t('ztts-sync-status-failed', { time: 'T1000', detail: 'Error: 503' }));
    expect(syncStatusText(stats({ lastOutcome: 'skipped', lastError: 'Error: 503' }), true, at)).toBe(t('ztts-sync-status-failed', { time: 'T1000', detail: 'Error: 503' }));
  });
});

describe('initSyncStatusRows', () => {
  function setup(over: Partial<SyncStatusDeps> = {}) {
    const line = { textContent: 'stale', hidden: true as boolean | undefined };
    const doc = { getElementById: (id: string) => (id === SYNC_STATUS_ID ? line : null) };
    let current: SettingsSyncStats | null = null;
    let enabled = true;
    let onSynced: ((report: SettingsSyncApplied | null) => void) | null = null;
    let onSwitch: (() => void) | null = null;
    const unsubscribed: string[] = [];
    let applied = 0;
    const deps: SyncStatusDeps = {
      enabled: () => enabled,
      stats: () => current,
      watch: (fn) => {
        onSynced = fn;
        return () => void unsubscribed.push('sync');
      },
      watchSwitch: (fn) => {
        onSwitch = fn;
        return () => void unsubscribed.push('switch');
      },
      onApplied: () => void applied++,
      formatTime: at,
      ...over,
    };
    const rows = initSyncStatusRows(doc, deps);
    return {
      rows,
      line,
      unsubscribed,
      applied: () => applied,
      setStats: (s: SettingsSyncStats | null) => {
        current = s;
      },
      setEnabled: (on: boolean) => {
        enabled = on;
      },
      synced: (report: SettingsSyncApplied | null) => onSynced?.(report),
      switched: () => onSwitch?.(),
    };
  }

  it('writes the line on load and again after every sync and every move of the switch', () => {
    const s = setup();
    expect(s.line.textContent).toBe(t('ztts-sync-status-waiting'));
    expect(s.line.hidden).toBe(false);
    s.setStats(stats());
    s.synced(null);
    expect(s.line.textContent).toBe(t('ztts-sync-status-none', { time: 'T1000' }));
    expect(s.applied()).toBe(0);
    s.setEnabled(false);
    s.switched();
    expect(s.line.textContent).toBe('');
    expect(s.line.hidden).toBe(true);
  });

  it('redraws the pane only when a sync changed something here', () => {
    const s = setup();
    s.setStats(stats({ adopted: 1, lastApplied: { at: 1_000, applied: ['readAloud.volume'], from: ['laptop'], held: {}, deferred: 0 } }));
    s.synced({ at: 1_000, applied: ['readAloud.volume'], from: ['laptop'], held: {}, deferred: 0 });
    expect(s.applied()).toBe(1);
    s.synced({ at: 1_001, applied: [], from: [], held: {}, deferred: 1 });
    expect(s.applied()).toBe(1);
  });

  it('comes off with the pane', () => {
    const s = setup();
    s.rows.dispose();
    expect(s.unsubscribed.sort()).toEqual(['switch', 'sync']);
  });

  it('does without the line', () => {
    const deps: SyncStatusDeps = { enabled: () => true, stats: () => null, watch: () => () => {}, watchSwitch: () => () => {}, onApplied: () => {}, formatTime: at };
    expect(() => initSyncStatusRows({ getElementById: () => null }, deps).refresh()).not.toThrow();
  });
});
