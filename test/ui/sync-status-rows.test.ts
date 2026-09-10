import { describe, expect, it } from 'vitest';
import { sentences, t } from '../../src/core/l10n';
import type { SettingsSyncApplied, SettingsSyncStats } from '../../src/core/settings-sync-transport';
import type { PositionTransportStats } from '../../src/read-aloud/position-transport';
import { initSyncStatusRows, positionsStatusText, settingsStatusText, SYNC_STATUS_IDS, type SyncStatusDeps } from '../../src/ui/sync-status-rows';

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

const positions = (over: Partial<PositionTransportStats> = {}): PositionTransportStats => ({
  syncs: 4,
  lastOutcome: 'ok',
  lastTrigger: 'reader-close',
  lastAt: 2_000,
  lastError: null,
  remoteEntries: 12,
  adopted: 0,
  dropped: 0,
  uploaded: false,
  lastAdoption: null,
  running: false,
  ...over,
});

const at = (ts: number) => `T${ts}`;

describe('settingsStatusText', () => {
  it('is empty while the switch is off, whatever the stats', () => {
    expect(settingsStatusText(stats({ adopted: 3 }), false, at)).toBe('');
  });

  it('waits before the first sync, and after one the switch skipped', () => {
    expect(settingsStatusText(null, true, at)).toBe(t('ztts-sync-status-waiting'));
    expect(settingsStatusText(stats({ lastOutcome: null, lastAt: null }), true, at)).toBe(t('ztts-sync-status-waiting'));
    expect(settingsStatusText(stats({ lastOutcome: 'skipped' }), true, at)).toBe(t('ztts-sync-status-waiting'));
  });

  it('says nothing new, or what came in and from where', () => {
    expect(settingsStatusText(stats(), true, at)).toBe(t('ztts-sync-status-none', { time: 'T1000' }));
    const applied: SettingsSyncApplied = { at: 1_000, applied: ['azure.apiKey', 'readAloud.volume'], from: ['laptop', 'office'], held: {}, deferred: 0 };
    expect(settingsStatusText(stats({ adopted: 2, lastApplied: applied }), true, at)).toBe(
      t('ztts-sync-status-applied', { time: 'T1000', count: 2, from: 'laptop, office' }),
    );
    expect(settingsStatusText(stats({ adopted: 1, lastApplied: { ...applied, from: [] } }), true, at)).toBe(
      t('ztts-sync-status-applied', { time: 'T1000', count: 1, from: t('ztts-sync-other-computer') }),
    );
  });

  it('keeps naming the last batch that changed something here when the latest sync found nothing new', () => {
    const applied: SettingsSyncApplied = { at: 700, applied: ['azure.apiKey', 'azure.enabled'], from: ['laptop'], held: {}, deferred: 0 };
    expect(settingsStatusText(stats({ lastAt: 1_000, adopted: 0, lastApplied: applied }), true, at)).toBe(
      t('ztts-sync-status-last', { time: 'T1000', count: 2, from: 'laptop', when: 'T700' }),
    );
  });

  it('adds what waits for the reading to stop and which providers are held off here', () => {
    const text = settingsStatusText(stats({ lastOutcome: 'deferred', deferred: 2, held: { azure: 'Connection failed: 401' } }), true, at);
    expect(text).toBe(
      sentences(t('ztts-sync-status-none', { time: 'T1000' }), t('ztts-sync-status-deferred', { count: 2 }), t('ztts-sync-status-held', { provider: 'azure', reason: 'Connection failed: 401' })),
    );
  });

  it('reports a failure, also when the last attempt was skipped inside the failure window', () => {
    expect(settingsStatusText(stats({ lastOutcome: 'error', lastError: 'Error: 503' }), true, at)).toBe(t('ztts-sync-status-failed', { time: 'T1000', detail: 'Error: 503' }));
    expect(settingsStatusText(stats({ lastOutcome: 'skipped', lastError: 'Error: 503' }), true, at)).toBe(t('ztts-sync-status-failed', { time: 'T1000', detail: 'Error: 503' }));
  });
});

describe('positionsStatusText', () => {
  it('is empty while the switch is off, and waits before the first sync', () => {
    expect(positionsStatusText(positions({ adopted: 3 }), false, at)).toBe('');
    expect(positionsStatusText(null, true, at)).toBe(t('ztts-positions-status-waiting'));
    expect(positionsStatusText(positions({ lastOutcome: 'skipped' }), true, at)).toBe(t('ztts-positions-status-waiting'));
  });

  it('says nothing new, how many came in, or when the last one did', () => {
    expect(positionsStatusText(positions(), true, at)).toBe(t('ztts-positions-status-none', { time: 'T2000' }));
    expect(positionsStatusText(positions({ adopted: 3, lastAdoption: { at: 2_000, count: 3 } }), true, at)).toBe(t('ztts-positions-status-taken', { time: 'T2000', count: 3 }));
    expect(positionsStatusText(positions({ adopted: 0, lastAdoption: { at: 1_500, count: 1 } }), true, at)).toBe(t('ztts-positions-status-last', { time: 'T2000', when: 'T1500' }));
  });

  it('reports a failure, also inside the failure window', () => {
    expect(positionsStatusText(positions({ lastOutcome: 'error', lastError: 'Error: 503' }), true, at)).toBe(t('ztts-positions-status-failed', { time: 'T2000', detail: 'Error: 503' }));
    expect(positionsStatusText(positions({ lastOutcome: 'skipped', lastError: 'Error: 503' }), true, at)).toBe(t('ztts-positions-status-failed', { time: 'T2000', detail: 'Error: 503' }));
  });
});

describe('initSyncStatusRows', () => {
  function setup() {
    const lines = {
      positions: { textContent: 'stale', hidden: true as boolean | string | undefined },
      settings: { textContent: 'stale', hidden: true as boolean | string | undefined },
    };
    const doc = {
      getElementById: (id: string) => (id === SYNC_STATUS_IDS.positions ? lines.positions : id === SYNC_STATUS_IDS.settings ? lines.settings : null),
    };
    let settingsStats: SettingsSyncStats | null = null;
    let positionsStats: PositionTransportStats | null = null;
    const enabled = { settings: true, positions: true };
    let onSettingsSynced: ((report: SettingsSyncApplied | null) => void) | null = null;
    let onPositionsSynced: (() => void) | null = null;
    const switches: Record<string, () => void> = {};
    const unsubscribed: string[] = [];
    let applied = 0;
    const deps: SyncStatusDeps = {
      formatTime: at,
      settings: {
        enabled: () => enabled.settings,
        stats: () => settingsStats,
        watch: (fn) => {
          onSettingsSynced = fn;
          return () => void unsubscribed.push('settings');
        },
        watchSwitch: (fn) => {
          switches.settings = fn;
          return () => void unsubscribed.push('settings-switch');
        },
        onApplied: () => void applied++,
      },
      positions: {
        enabled: () => enabled.positions,
        stats: () => positionsStats,
        watch: (fn) => {
          onPositionsSynced = fn;
          return () => void unsubscribed.push('positions');
        },
        watchSwitch: (fn) => {
          switches.positions = fn;
          return () => void unsubscribed.push('positions-switch');
        },
      },
    };
    const rows = initSyncStatusRows(doc, deps);
    return {
      rows,
      lines,
      unsubscribed,
      enabled,
      applied: () => applied,
      setSettings: (s: SettingsSyncStats | null) => {
        settingsStats = s;
      },
      setPositions: (s: PositionTransportStats | null) => {
        positionsStats = s;
      },
      settingsSynced: (report: SettingsSyncApplied | null) => onSettingsSynced?.(report),
      positionsSynced: () => onPositionsSynced?.(),
      switched: (which: 'settings' | 'positions') => switches[which]?.(),
    };
  }

  it('writes both lines on load, each after its own syncs and its own switch', () => {
    const s = setup();
    expect(s.lines.positions.textContent).toBe(t('ztts-positions-status-waiting'));
    expect(s.lines.settings.textContent).toBe(t('ztts-sync-status-waiting'));
    expect(s.lines.positions.hidden).toBe(false);
    expect(s.lines.settings.hidden).toBe(false);
    s.setPositions(positions({ adopted: 2, lastAdoption: { at: 2_000, count: 2 } }));
    s.positionsSynced();
    expect(s.lines.positions.textContent).toBe(t('ztts-positions-status-taken', { time: 'T2000', count: 2 }));
    expect(s.lines.settings.textContent).toBe(t('ztts-sync-status-waiting'));
    s.setSettings(stats());
    s.settingsSynced(null);
    expect(s.lines.settings.textContent).toBe(t('ztts-sync-status-none', { time: 'T1000' }));
    expect(s.applied()).toBe(0);
    s.enabled.positions = false;
    s.switched('positions');
    expect(s.lines.positions.textContent).toBe('');
    expect(s.lines.positions.hidden).toBe(true);
    expect(s.lines.settings.hidden).toBe(false);
    s.enabled.settings = false;
    s.switched('settings');
    expect(s.lines.settings.hidden).toBe(true);
  });

  it('redraws the pane only when a settings sync changed something here', () => {
    const s = setup();
    s.setSettings(stats({ adopted: 1, lastApplied: { at: 1_000, applied: ['readAloud.volume'], from: ['laptop'], held: {}, deferred: 0 } }));
    s.settingsSynced({ at: 1_000, applied: ['readAloud.volume'], from: ['laptop'], held: {}, deferred: 0 });
    expect(s.applied()).toBe(1);
    s.settingsSynced({ at: 1_001, applied: [], from: [], held: {}, deferred: 1 });
    s.positionsSynced();
    expect(s.applied()).toBe(1);
  });

  it('comes off with the pane', () => {
    const s = setup();
    s.rows.dispose();
    expect(s.unsubscribed.sort()).toEqual(['positions', 'positions-switch', 'settings', 'settings-switch']);
  });

  it('does without the lines', () => {
    const noop = () => () => {};
    const deps: SyncStatusDeps = {
      formatTime: at,
      settings: { enabled: () => true, stats: () => null, watch: noop, watchSwitch: noop, onApplied: () => {} },
      positions: { enabled: () => true, stats: () => null, watch: noop, watchSwitch: noop },
    };
    expect(() => initSyncStatusRows({ getElementById: () => null }, deps).refresh()).not.toThrow();
  });
});
