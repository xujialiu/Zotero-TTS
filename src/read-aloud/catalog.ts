import type { ProviderId, TTSProvider, VoiceInfo } from '../core/providers/types';

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
