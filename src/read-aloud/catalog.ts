import type { ProviderId, TTSProvider, VoiceInfo } from '../core/providers/types';
import { getLocalEngine } from '../core/providers/local/registry';
import { presetSpec } from '../core/server-presets';
import { enabledProviders, type Settings } from '../core/settings';

/** `name` overrides the provider's display name in voice labels; the local provider sets it to its engine's name. */
export type CatalogEntry = { provider: ProviderId; name?: string; voices: VoiceInfo[] };

/**
 * List the voices of every enabled provider, in the given order. Providers
 * are independent: one that cannot list (no key, server down, unknown
 * engine) must not hide the others, so each is awaited on its own and a
 * failure is logged with the provider's name and skipped.
 */
export async function collectCatalog(
  ids: readonly ProviderId[],
  getProvider: (id: ProviderId) => TTSProvider,
  log?: (e: unknown) => void,
): Promise<CatalogEntry[]> {
  const results = await Promise.allSettled(
    ids.map(async (id): Promise<CatalogEntry> => ({ provider: id, voices: await getProvider(id).listVoices() })),
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
): Promise<CatalogEntry[]> {
  const entries = await collectCatalog(enabledProviders(settings), getProvider, log);
  const engineName = getLocalEngine(settings.local.engine)?.voiceName;
  const serverName = presetSpec(settings.openai).voiceName;
  return entries.map((e) => {
    if (e.provider === 'local' && engineName) return { ...e, name: engineName };
    if (e.provider === 'openai' && serverName) return { ...e, name: serverName };
    return e;
  });
}
