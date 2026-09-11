import { sentences, t } from '../core/l10n';
import type { TTSProvider, VoiceListNotice } from '../core/providers/types';
import { PREF_PREFIX, type PrefsBackend } from '../core/settings';
import { withTimeout } from '../core/timeout';
import { refuseWhileReading, type ReadingGuardDeps } from './reading-guard';

const FISH_SOURCE_TIMEOUT_MS = 15_000;

/** The three source switches and the nearby manual-ID / refresh controls. */
export const FISH_SOURCE_IDS = {
  root: 'ztts-fish-sources',
  official: 'ztts-fish-include-official',
  own: 'ztts-fish-include-own',
  manual: 'ztts-fish-include-manual',
  modelIds: 'ztts-fish-model-ids',
  manualHint: 'ztts-fish-manual-hint',
  refresh: 'ztts-fish-refresh',
  status: 'ztts-fish-refresh-status',
} as const;

/** Preference names, relative to PREF_PREFIX, for the source switches. */
export const FISH_SOURCE_PREFS = {
  official: 'fish.includeOfficial',
  own: 'fish.includeOwn',
  manual: 'fish.includeManual',
} as const;

type SourceName = keyof typeof FISH_SOURCE_PREFS;

const SOURCE_ROWS: readonly { name: SourceName; id: string; pref: string; observer: string }[] = [
  { name: 'official', id: FISH_SOURCE_IDS.official, pref: FISH_SOURCE_PREFS.official, observer: 'zotero-tts.fish.includeOfficial' },
  { name: 'own', id: FISH_SOURCE_IDS.own, pref: FISH_SOURCE_PREFS.own, observer: 'zotero-tts.fish.includeOwn' },
  { name: 'manual', id: FISH_SOURCE_IDS.manual, pref: FISH_SOURCE_PREFS.manual, observer: 'zotero-tts.fish.includeManual' },
];

/** The provider surface needed by the source panel; community discovery stays outside this UI. */
export type FishVoiceSourceProvider = Pick<TTSProvider, 'listVoices'> & {
  voiceListNotices?(): VoiceListNotice[];
};

type AbortControllerLike = { signal: AbortSignal; abort(): void };

export interface FishVoiceSourcesDeps extends Partial<ReadingGuardDeps> {
  prefs: PrefsBackend;
  /** Whether changing a source changes the voices of an enabled Read Aloud player. */
  fishEnabled(): boolean;
  /** The current provider, or null while Fish is disabled or unavailable. */
  provider(): FishVoiceSourceProvider | null;
  /** Reloads the existing Read Aloud voice catalog. */
  reloadCatalog(): Promise<void> | void;
  /** Repaints after settings restore or a preference observer event. */
  watch?(observer: string, onChange: () => void): () => void;
  /** A stable current Fish configuration fingerprint for the refresh guard. */
  configKey?(): string;
  /** AbortController from the pane's chrome window. */
  createAbortController?(): AbortControllerLike | null;
  timeoutMs?: number;
}

export interface FishVoiceSourcesController {
  /** Repaint switch state and the Model IDs field. */
  refresh(): void;
  /** Explicitly refresh Fish's cached list and then the existing catalog. */
  refreshList(): Promise<void>;
  /** Unregister observers and invalidate an in-flight refresh. */
  dispose(): void;
}

function boolPref(prefs: PrefsBackend, pref: string): boolean {
  // The first build did not have these prefs. Treat an absent value as the
  // agreed on default, so an upgrade keeps offering every source.
  return prefs.get(PREF_PREFIX + pref) !== false;
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function noticeText(notice: VoiceListNotice): string {
  if (notice.kind === 'limited') return t('ztts-fish-list-limited');
  const detail = notice.detail?.trim();
  return detail ? t('ztts-fish-list-stale', { detail }) : t('ztts-fish-list-stale-no-detail');
}

/** Wire the three source switches, the retained Model IDs field, and refresh. */
export function initFishVoiceSources(
  doc: { getElementById(id: string): any },
  deps: FishVoiceSourcesDeps,
): FishVoiceSourcesController {
  const boxes = new Map(SOURCE_ROWS.map((row) => [row.name, doc.getElementById(row.id)]));
  const modelIds = doc.getElementById(FISH_SOURCE_IDS.modelIds);
  const manualHint = doc.getElementById(FISH_SOURCE_IDS.manualHint);
  const refreshButton = doc.getElementById(FISH_SOURCE_IDS.refresh);
  const status = doc.getElementById(FISH_SOURCE_IDS.status);
  const timeoutMs = deps.timeoutMs ?? FISH_SOURCE_TIMEOUT_MS;

  let disposed = false;
  let refreshToken = 0;
  let refreshController: AbortControllerLike | null = null;
  const stops: Array<() => void> = [];

  const fishEnabled = (): boolean => {
    try {
      return deps.fishEnabled();
    } catch {
      return false;
    }
  };

  const setStatus = (text: string) => {
    if (status) status.textContent = text;
  };

  const sourceOn = (name: SourceName): boolean => boolPref(deps.prefs, FISH_SOURCE_PREFS[name]);

  function paint(): void {
    const on = fishEnabled();
    for (const row of SOURCE_ROWS) {
      const box = boxes.get(row.name);
      if (box) box.checked = sourceOn(row.name);
    }
    const manual = sourceOn('manual');
    // Provider rows lock their own inputs while Fish is enabled. The source
    // panel also locks this field when Manual voices are off, including while
    // Fish is disabled, so the saved text remains visible but untouched.
    if (modelIds) modelIds.disabled = on || !manual;
    if (manualHint) {
      manualHint.textContent = manual ? '' : t('ztts-fish-manual-disabled');
      manualHint.hidden = manual;
    }
    if (refreshButton) refreshButton.disabled = !on;
  }

  const guard = (): Partial<ReadingGuardDeps> => ({
    readingTabs: deps.readingTabs ?? (() => []),
    warn: deps.warn ?? (() => {}),
    ...(deps.askToStop ? { askToStop: deps.askToStop } : {}),
    ...(deps.stopReading ? { stopReading: deps.stopReading } : {}),
  });

  async function onCommand(name: SourceName): Promise<void> {
    const box = boxes.get(name);
    const wanted = !!box?.checked;
    if (wanted === sourceOn(name)) {
      paint();
      return;
    }
    if (fishEnabled() && (await refuseWhileReading(guard()))) {
      paint();
      return;
    }
    if (disposed || !!box?.checked !== wanted) {
      paint();
      return;
    }
    deps.prefs.set(PREF_PREFIX + FISH_SOURCE_PREFS[name], wanted);
    paint();
    if (fishEnabled()) {
      try {
        await deps.reloadCatalog();
      } catch (error) {
        setStatus(t('ztts-fish-refresh-error', { detail: describeError(error) }));
      }
    }
  }

  const makeController = (): AbortControllerLike | null => {
    try {
      return deps.createAbortController?.() ?? null;
    } catch {
      return null;
    }
  };

  const configurationKey = (): string | undefined => {
    try {
      return deps.configKey?.();
    } catch {
      return undefined;
    }
  };

  async function refreshList(): Promise<void> {
    if (disposed || !fishEnabled()) {
      paint();
      return;
    }
    if (await refuseWhileReading(guard())) return;
    if (disposed || !fishEnabled()) {
      paint();
      return;
    }
    let provider: FishVoiceSourceProvider | null;
    try {
      provider = deps.provider();
    } catch (error) {
      setStatus(t('ztts-fish-refresh-error', { detail: describeError(error) }));
      return;
    }
    if (!provider) {
      setStatus(t('ztts-fish-refresh-unavailable'));
      return;
    }
    try {
      refreshController?.abort();
    } catch {
      // Best effort; the token below prevents an obsolete result from being used.
    }
    const token = ++refreshToken;
    const key = configurationKey();
    const controller = makeController();
    refreshController = controller;
    setStatus(t('ztts-fish-refreshing'));
    try {
      const signal = controller?.signal;
      await withTimeout(
        provider.listVoices({ refresh: true, ...(signal ? { signal } : {}) }),
        timeoutMs,
        () => new Error(t('ztts-fish-refresh-timeout', { seconds: Math.round(timeoutMs / 1000) })),
        () => controller?.abort(),
      );
      if (disposed || token !== refreshToken) return;
      if (!fishEnabled() || key !== undefined && configurationKey() !== key) {
        setStatus(t('ztts-fish-refresh-stale'));
        return;
      }
      // The refresh changed the source snapshot. If a player opened while
      // Fish was being fetched, ask again immediately before reloading it.
      if (await refuseWhileReading(guard())) {
        setStatus(t('ztts-fish-refresh-cancelled'));
        return;
      }
      if (disposed || token !== refreshToken || !fishEnabled() || key !== undefined && configurationKey() !== key) {
        if (!disposed) setStatus(t('ztts-fish-refresh-stale'));
        return;
      }
      await deps.reloadCatalog();
      if (disposed || token !== refreshToken) return;
      const notices = provider.voiceListNotices?.() ?? [];
      const details = notices.map(noticeText);
      setStatus(details.length ? sentences(t('ztts-fish-refreshed'), ...details) : t('ztts-fish-refreshed'));
    } catch (error) {
      if (disposed || token !== refreshToken) return;
      setStatus(t('ztts-fish-refresh-error', { detail: describeError(error) }));
    } finally {
      if (token === refreshToken) refreshController = null;
    }
  }

  for (const row of SOURCE_ROWS) {
    boxes.get(row.name)?.addEventListener('command', () => onCommand(row.name));
    const stop = deps.watch?.(row.observer, paint);
    if (stop) stops.push(stop);
  }
  refreshButton?.addEventListener('command', () => refreshList());
  paint();

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    refreshToken++;
    try {
      refreshController?.abort();
    } catch {
      // Best effort; disposal's token invalidation is authoritative.
    }
    refreshController = null;
    for (const stop of stops.splice(0)) stop();
  }

  return { refresh: paint, refreshList, dispose };
}
