import type { ProviderId, VoiceInfo } from '../../core/providers/types';

const SEPARATOR = '::';
const PROVIDERS: readonly ProviderId[] = ['openai', 'azure', 'local'];

/**
 * The tier every plugin voice is filed under. Zotero's tier dropdown is
 * hard-coded to standard / premium / local (TierSelect, reader.js:38826-
 * 38853) and parseVoicesResponse drops any other key (reader.js:40522), so a
 * tier of the plugin's own is impossible. standard and premium are Zotero's
 * cloud voices, which the composite interface keeps intact; that leaves
 * local, shared with the operating system's voices.
 */
export const PLUGIN_TIER = 'local';

/** Distinguishes plugin voices from the system voices in the same tier. */
export const PLUGIN_LABEL_PREFIX = 'Zotero TTS · ';

export function encodeVoiceId(provider: ProviderId, voiceId: string): string {
  return provider + SEPARATOR + voiceId;
}

/**
 * Decode one of our ids; null for anything else — including Zotero's own
 * voice ids, which getAudio routes back to Zotero on that basis.
 */
export function decodeVoiceId(encoded: string): { provider: ProviderId; voiceId: string } | null {
  const at = encoded.indexOf(SEPARATOR);
  if (at === -1) return null;
  const provider = encoded.slice(0, at);
  if (!(PROVIDERS as readonly string[]).includes(provider)) return null;
  // Split only on the first separator so a voice id that itself contains the separator isn't truncated
  return { provider: provider as ProviderId, voiceId: encoded.slice(at + SEPARATOR.length) };
}

export function tierForProvider(_provider: ProviderId): typeof PLUGIN_TIER {
  return PLUGIN_TIER;
}

/**
 * Build the format=2 structure that Zotero's parseVoicesResponse
 * (reader.js:40499) recognizes.
 *
 * The voice list under each locale uses the **plain array** form. The
 * object form { default, other } gets spread without any guard
 * (`...localeConfig.default`), and missing a field throws an exception;
 * the array form is explicitly tolerated and is more robust.
 */
export function buildVoicesResponse(
  entries: { provider: ProviderId; voices: VoiceInfo[] }[],
  cacheVersion: string,
): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};

  for (const entry of entries) {
    if (!entry.voices.length) continue;

    const voices: Record<string, { label: string }> = {};
    const locales: Record<string, string[]> = {};

    for (const voice of entry.voices) {
      const id = encodeVoiceId(entry.provider, voice.id);
      voices[id] = { label: PLUGIN_LABEL_PREFIX + voice.label };
      (locales[voice.locale] ??= []).push(id);
    }

    const config = {
      voices,
      locales,
      // Prerequisite for word-level highlighting (reader.js:53332)
      segmentGranularity: 'sentence',
      sentenceDelay: 0,
      cacheVersion,
      // Deliberately omit creditsPerMinute: once it's present, native
      // code computes remaining minutes and shows a credits display
      // with a purchase entry point (reader.js:39242).
    };

    const tier = tierForProvider(entry.provider);
    (out[tier] ??= []).push(config);
  }

  return out;
}
