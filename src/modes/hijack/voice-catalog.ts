import type { ProviderId, VoiceInfo } from '../../core/providers/types';

const SEPARATOR = '::';
const PROVIDERS: readonly ProviderId[] = ['openai', 'azure', 'local'];

export function encodeVoiceId(provider: ProviderId, voiceId: string): string {
  return provider + SEPARATOR + voiceId;
}

export function decodeVoiceId(encoded: string): { provider: ProviderId; voiceId: string } | null {
  const at = encoded.indexOf(SEPARATOR);
  if (at === -1) return null;
  const provider = encoded.slice(0, at);
  if (!(PROVIDERS as readonly string[]).includes(provider)) return null;
  // Split only on the first separator so a voice id that itself contains the separator isn't truncated
  return { provider: provider as ProviderId, voiceId: encoded.slice(at + SEPARATOR.length) };
}

/**
 * The only valid tier values are standard | premium | local
 * (reader.js:39248). The ftl copy describes local as "no account
 * needed, free" and standard as "requires a Zotero account", so filing
 * cloud providers under standard and the local engine under local is
 * the closest match to reality.
 */
export function tierForProvider(provider: ProviderId): 'standard' | 'local' {
  return provider === 'local' ? 'local' : 'standard';
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
      voices[id] = { label: voice.label };
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
