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

const PROVIDER_NAMES: Record<ProviderId, string> = { openai: 'OpenAI', azure: 'Azure', local: 'Local' };

/**
 * "TTS-Azure-Ava Multilingual": tells plugin voices from the system voices
 * in the same tier, and the providers from each other, since every enabled
 * provider's voices are listed together.
 */
export function pluginVoiceLabel(provider: ProviderId, label: string): string {
  return `TTS-${PROVIDER_NAMES[provider]}-${label}`;
}

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

// Chinese collation orders Han characters by pinyin instead of code point
// and places them before Latin letters, which keep their usual order: a
// mixed list reads as 晓…, 云…, then A…Z, instead of Han in code-point order
// somewhere after Z.
const collator = typeof Intl !== 'undefined' ? new Intl.Collator(['zh', 'en'], { numeric: true, sensitivity: 'base' }) : null;

export function compareVoiceLabels(a: string, b: string): number {
  if (collator) return collator.compare(a, b);
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Build the format=2 structure that Zotero's parseVoicesResponse
 * (reader.js:40499) recognizes.
 *
 * One config per voice, in label order. Zotero shows voices in the order
 * it is given (buildVoiceOptions sorts only by creditsPerMinute, which we
 * never set) and flattens configs in order, locale by locale, so that is
 * the only shape that yields an alphabetical dropdown across a language's
 * several locales and the multilingual group alike.
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
  const all: { id: string; label: string; locale: string }[] = [];
  for (const entry of entries) {
    for (const voice of entry.voices) {
      all.push({
        id: encodeVoiceId(entry.provider, voice.id),
        label: pluginVoiceLabel(entry.provider, voice.label),
        locale: voice.locale,
      });
    }
  }
  if (!all.length) return {};

  all.sort(
    (a, b) => compareVoiceLabels(a.label, b.label) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || a.locale.localeCompare(b.locale),
  );

  return {
    [PLUGIN_TIER]: all.map((voice) => ({
      voices: { [voice.id]: { label: voice.label } },
      locales: { [voice.locale]: [voice.id] },
      // Prerequisite for word-level highlighting (reader.js:53332)
      segmentGranularity: 'sentence',
      sentenceDelay: 0,
      cacheVersion,
      // Deliberately omit creditsPerMinute: once it's present, native
      // code computes remaining minutes and shows a credits display
      // with a purchase entry point (reader.js:39242).
    })),
  };
}
