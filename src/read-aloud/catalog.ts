import { SynthesisError } from '../core/providers/errors';
import type { ProviderId, TTSProvider, VoiceInfo, VoiceListNotice } from '../core/providers/types';
import { getLocalEngine } from '../core/providers/local/registry';
import { presetSpec } from '../core/server-presets';
import { enabledProviders, hiddenZoteroTiers, PROVIDER_IDS, type Settings } from '../core/settings';
import { withTimeout } from '../core/timeout';
import { providerTierLabel, tierForProvider, zoteroTierLabel, type TierEntry, type TierNaming } from './voice-catalog';
import { ZOTERO_TIERS } from './zotero-voices';

/**
 * `name` is the provider's entry name where it is not the provider's own
 * (issue #110): the local provider's engine ("Kokoro"), the OpenAI
 * section's server when its preset has a name ("Xiaomi MiMo"). The entry
 * is what the player's first dropdown and the voice browser's first column
 * show; the voices' labels are their own.
 */
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
 * What the entry names depend on beyond the provider id (voice-catalog.ts
 * providerTierLabel): the local engine's name, and the OpenAI section's
 * server when its preset has a name of its own.
 */
export function providerNaming(settings: Settings): TierNaming {
  return { localEngine: getLocalEngine(settings.local.engine)?.voiceName, openaiServer: presetSpec(settings.openai).providerName };
}

/**
 * The tier key of every provider (voice-catalog.ts tierForProvider): the
 * provider id, the local engine's name for the local provider.
 */
export function providerTierKeys(settings: Settings): Record<ProviderId, string> {
  const { localEngine } = providerNaming(settings);
  return Object.fromEntries(PROVIDER_IDS.map((id) => [id, tierForProvider(id, localEngine)])) as Record<ProviderId, string>;
}

/**
 * The entry names by tier key — every provider's, enabled or not, and
 * Zotero's two in the plugin's copy of Zotero's words — for the player's
 * first dropdown and the stranded rule (read-aloud/provider-tiers.ts).
 */
export function providerTierLabels(settings: Settings): Record<string, string> {
  const naming = providerNaming(settings);
  const out: Record<string, string> = {};
  for (const tier of ZOTERO_TIERS) out[tier] = zoteroTierLabel(tier);
  for (const id of PROVIDER_IDS) out[tierForProvider(id, naming.localEngine)] = providerTierLabel(id, naming);
  return out;
}

/**
 * The voice browser's first column (issue #110): every enabled provider,
 * whether or not it lists anything right now, and Zotero's Standard and
 * Premium while their switches are on (issue #111) — unsorted;
 * ui/voice-browser-rows.ts sorts by label.
 */
export function providerTierColumns(settings: Settings): TierEntry[] {
  const naming = providerNaming(settings);
  const hidden: readonly string[] = hiddenZoteroTiers(settings);
  return [
    ...enabledProviders(settings).map((id) => ({ tier: tierForProvider(id, naming.localEngine), label: providerTierLabel(id, naming) })),
    ...ZOTERO_TIERS.filter((tier) => !hidden.includes(tier)).map((tier) => ({ tier, label: zoteroTierLabel(tier) })),
  ];
}

/**
 * The catalog as the plugin publishes it: every enabled provider's voices,
 * the local provider's entry named after the engine serving them
 * ("Kokoro", since "Local" says nothing once several engines exist), the
 * OpenAI section's after its server when the preset has a name of its own
 * ("Xiaomi MiMo", issue #50; "OpenAI" otherwise). The Read Aloud interface
 * and the settings' voice browser both list through this, so they agree
 * on voices and entries.
 */
export async function listNamedCatalog(
  settings: Settings,
  getProvider: (id: ProviderId) => TTSProvider,
  log?: (e: unknown) => void,
  bound?: CatalogBound,
): Promise<CatalogEntry[]> {
  const entries = await collectCatalog(enabledProviders(settings), getProvider, log, bound);
  const { localEngine, openaiServer } = providerNaming(settings);
  return entries.map((e) => {
    if (e.provider === 'local' && localEngine) return { ...e, name: localEngine };
    if (e.provider === 'openai' && openaiServer) return { ...e, name: openaiServer };
    return e;
  });
}
