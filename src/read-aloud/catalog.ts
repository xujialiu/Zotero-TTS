import { SynthesisError } from '../core/providers/errors';
import type { ProviderId, TTSProvider, VoiceInfo, VoiceListNotice } from '../core/providers/types';
import { getLocalEngine } from '../core/providers/local/registry';
import { presetSpec } from '../core/server-presets';
import { enabledProviders, type Settings } from '../core/settings';
import { withTimeout } from '../core/timeout';

/** `name` overrides the provider's display name in voice labels; the local provider sets it to its engine's name. */
export type CatalogEntry = { provider: ProviderId; name?: string; voices: VoiceInfo[]; notices?: VoiceListNotice[] };

/**
 * How long one provider may take to list its voices before it is skipped
 * like one that failed (issue #55). The bound Test connection puts on a
 * provider's list (ui/prefs-pane.ts TEST_CONNECTION_TIMEOUT_MS), so the
 * pane and the popup agree on how long is too long.
 */
export const PROVIDER_LISTING_TIMEOUT_MS = 15_000;

/**
 * For the callers that cap the whole listing as a last resort (the voice
 * browser, the diagnostics): every provider settles within the bound
 * above, so this fires only if the catalog itself hangs — and it sits
 * above the bound, or the two would tie.
 */
export const CATALOG_CAP_MS = PROVIDER_LISTING_TIMEOUT_MS + 5_000;

export type CatalogBound = {
  /** How long one provider may take; PROVIDER_LISTING_TIMEOUT_MS by default. */
  timeoutMs?: number;
  /**
   * The AbortController for one provider's request, so a listing that runs
   * past the bound is cancelled rather than left running. From a chrome
   * window — the plugin sandbox has none (CLAUDE.md); absent, or null, the
   * request is left to finish on its own and the rejection is what matters.
   */
  newAbortController?: () => AbortController | null;
};

/**
 * List the voices of every enabled provider, in the given order. Providers
 * are independent: one that cannot list (no key, server down, unknown
 * engine) must not hide the others, so each is awaited on its own and a
 * failure is logged with the provider's name and skipped. Each is bounded
 * on its own too (issue #55): one that neither answers nor fails within
 * the bound is skipped the same way, its request aborted. A provider that
 * hung used to hold the whole listing past the caller's cap, which then
 * dropped every provider's voices, the ones that had answered included.
 */
export async function collectCatalog(
  ids: readonly ProviderId[],
  getProvider: (id: ProviderId) => TTSProvider,
  log?: (e: unknown) => void,
  bound: CatalogBound = {},
): Promise<CatalogEntry[]> {
  const timeoutMs = bound.timeoutMs ?? PROVIDER_LISTING_TIMEOUT_MS;
  const results = await Promise.allSettled(
    ids.map(async (id): Promise<CatalogEntry> => {
      const provider = getProvider(id);
      const controller = bound.newAbortController?.() ?? null;
      const voices = await withTimeout(
        controller ? provider.listVoices({ signal: controller.signal }) : provider.listVoices(),
        timeoutMs,
        () => new SynthesisError('network', `no voice list within ${Math.round(timeoutMs / 1000)} s`),
        () => controller?.abort(),
      );
      const notices = provider.voiceListNotices?.();
      return { provider: id, voices, ...(notices?.length ? { notices } : {}) };
    }),
  );
  const out: CatalogEntry[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      out.push(result.value);
    } else {
      const reason = result.reason as { message?: unknown } | undefined;
      log?.(new Error(`${ids[i]}: listing voices failed: ${String(reason?.message ?? reason)}`, { cause: result.reason }));
    }
  });
  return out;
}

/**
 * The catalog as the plugin publishes it: every enabled provider's voices,
 * local voices named after the engine serving them ("Kokoro-…", since
 * "Local" says nothing once several engines exist), the OpenAI section's
 * after its server when the preset has a name of its own ("MiMo-冰糖",
 * issue #50; "OpenAI-…" otherwise). The Read Aloud interface and the
 * settings' voice browser both list through this, so they agree on voices
 * and names.
 */
export async function listNamedCatalog(
  settings: Settings,
  getProvider: (id: ProviderId) => TTSProvider,
  log?: (e: unknown) => void,
  bound?: CatalogBound,
): Promise<CatalogEntry[]> {
  const entries = await collectCatalog(enabledProviders(settings), getProvider, log, bound);
  const engineName = getLocalEngine(settings.local.engine)?.voiceName;
  const serverName = presetSpec(settings.openai).voiceName;
  return entries.map((e) => {
    if (e.provider === 'local' && engineName) return { ...e, name: engineName };
    if (e.provider === 'openai' && serverName) return { ...e, name: serverName };
    return e;
  });
}
