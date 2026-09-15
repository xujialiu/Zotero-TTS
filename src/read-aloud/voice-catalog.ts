import { t } from '../core/l10n';
import type { ProviderId, VoiceInfo } from '../core/providers/types';
import { ZOTERO_TIERS } from './zotero-voices';

const SEPARATOR = '::';
const PROVIDERS: readonly ProviderId[] = ['openai', 'azure', 'cloudflare', 'speechify', 'fish', 'fishspeech', 'local', 'system'];

/**
 * The key the plugin's voices travel under in the voices response. Zotero's
 * parser keeps only its three keys (parseVoicesResponse, reader.js:40531),
 * so everything is published as `local`; the tier Zotero then works with is
 * rewritten per provider on the manager's parsed voice objects, whose
 * `tier` reads `impl.tier` (read-aloud/provider-tiers.ts, issue #110). The
 * 2026-08-22 note that a tier of the plugin's own was impossible rested on
 * the parser and the dropdown alone; both are hard-coded still, and both
 * have a way past them (notes/NOTES_2026-09-15.md, issue #110).
 */
export const PUBLISHED_TIER = 'local';

/** The tier key of the local provider while its engine is unknown; never `local`, which is Zotero's own tier. */
export const UNKNOWN_ENGINE_TIER = 'local-engine';

/**
 * The tier Zotero files a provider's voices under, per provider (issue
 * #110): the provider id, except for the local provider, whose id is
 * Zotero's own tier name — its engine's name instead, lower-cased
 * (`kokoro`). Zotero's per-tier memory (`tierVoices`) and its Voice Mode
 * dropdown are keyed by this, so each provider remembers its own last voice
 * per language. Only the local engine's name counts: the OpenAI section's
 * server preset changes the entry's label, never its key, so the memory
 * kept under `openai` survives a switch of server.
 */
export function tierForProvider(provider: ProviderId, localEngine?: string): string {
  if (provider !== 'local') return provider;
  const engine = localEngine?.trim();
  return engine ? engine.toLowerCase() : UNKNOWN_ENGINE_TIER;
}

/** The tier of a plugin voice id (tierForProvider); null for a Zotero voice id, whose tier only the list knows. */
export function pluginVoiceTier(id: string, localEngine?: string): string | null {
  const decoded = decodeVoiceId(id);
  return decoded ? tierForProvider(decoded.provider, localEngine) : null;
}

/** What the entry names depend on beyond the provider id: the local engine's name and the OpenAI section's server. */
export interface TierNaming {
  /** The local engine's display name ("Kokoro"); "Local" without one. */
  localEngine?: string;
  /** The OpenAI section's server, when its preset has a name of its own ("Xiaomi MiMo"); "OpenAI" without one. */
  openaiServer?: string;
}

const PROVIDER_NAMES: Record<Exclude<ProviderId, 'system'>, string> = {
  openai: 'OpenAI',
  azure: 'Azure',
  cloudflare: 'Cloudflare',
  speechify: 'Speechify',
  fish: 'Fish Audio',
  fishspeech: 'Fish Speech',
  local: 'Local',
};

/**
 * The name of a provider's entry in the player's first dropdown and the
 * voice browser's first column (issue #110) — the names the voice labels
 * carried as prefixes until then: "Azure", "Kokoro" (the engine), "Xiaomi
 * MiMo" (the server preset), and "System" in the app's language, like the
 * pane's heading. Fish Audio's cloud and a Fish Speech server are named as
 * their settings sections are (issue #112; "Fish-cloud" / "Fish-local"
 * while the two shared one section).
 */
export function providerTierLabel(provider: ProviderId, naming: TierNaming = {}): string {
  switch (provider) {
    case 'local':
      return naming.localEngine?.trim() || PROVIDER_NAMES.local;
    case 'openai':
      return naming.openaiServer?.trim() || PROVIDER_NAMES.openai;
    case 'system':
      return t('ztts-provider-system');
    default:
      return PROVIDER_NAMES[provider];
  }
}

/** Zotero's own words for its two cloud tiers, in the app's language (reader.ftl `reader-read-aloud-voice-tier-*`; the zh-CN file copies Zotero's); any other key as it is. */
export function zoteroTierLabel(tier: string): string {
  if (tier === 'standard') return t('ztts-tier-standard');
  if (tier === 'premium') return t('ztts-tier-premium');
  return tier;
}

/** Whether a tier key is one of Zotero's own cloud tiers. */
export const isZoteroTier = (tier: string): boolean => (ZOTERO_TIERS as readonly string[]).includes(tier);

/** One entry of the first dropdown or column: a tier key and the name it shows. */
export type TierEntry = { tier: string; label: string };

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

// Chinese collation orders Han characters by pinyin instead of code point
// and places them before Latin letters, which keep their usual order: a
// mixed list reads as 晓…, 云…, then A…Z, instead of Han in code-point order
// somewhere after Z.
const collator = typeof Intl !== 'undefined' ? new Intl.Collator(['zh', 'en'], { numeric: true, sensitivity: 'base' }) : null;

export function compareVoiceLabels(a: string, b: string): number {
  if (collator) return collator.compare(a, b);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** One voice as the list a reader receives has it — either half of it, the plugin's or Zotero's own. */
export interface ListedVoice {
  /** Zotero's voice id: `provider::id` for the plugin's, Zotero's own for Zotero's. */
  id: string;
  /** The locale it is filed under: `mul` for the multilingual group, else a locale (`en-US`) or a bare language. */
  language: string;
  /**
   * The tier as the list says it: `standard` / `premium` for Zotero's own;
   * for the plugin's, the response's `local` or, off a manager's list, the
   * provider's own (the re-tag). Read a plugin voice's tier off its id
   * (pluginVoiceTier), never from here.
   */
  tier: string;
  label: string;
}

/**
 * The voices a format=2 response publishes, one entry per voice and locale,
 * in the order given — the plugin's own response (buildVoicesResponse) and
 * Zotero's own answer alike, which is what memory-sync plans the remembered
 * voice against (issue #35). Both locale forms Zotero's parser takes are
 * read (the plain array, and `{ default, other }`); an id no config
 * publishes is dropped, as Zotero drops it; a voice without a label is
 * named by its id. Never throws: the shape is what a server sent.
 */
export function listVoicesResponse(response: unknown): ListedVoice[] {
  const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
  if (!isRecord(response)) return [];
  const out: ListedVoice[] = [];
  for (const [tier, configs] of Object.entries(response)) {
    if (!Array.isArray(configs)) continue;
    for (const config of configs) {
      if (!isRecord(config) || !isRecord(config.voices) || !isRecord(config.locales)) continue;
      const published = config.voices;
      for (const [language, entry] of Object.entries(config.locales)) {
        const ids = Array.isArray(entry)
          ? entry
          : isRecord(entry)
            ? [...(Array.isArray(entry.default) ? entry.default : []), ...(Array.isArray(entry.other) ? entry.other : [])]
            : [];
        for (const id of ids) {
          if (typeof id !== 'string' || !id) continue;
          const voice = published[id];
          if (!isRecord(voice)) continue;
          const label = typeof voice.label === 'string' && voice.label ? voice.label : id;
          out.push({ id, language, tier, label });
        }
      }
    }
  }
  return out;
}

/**
 * A voices response without the given tiers (issue #111): what Zotero's
 * answer becomes when a tier's switch is off, before anything reads it.
 */
export function withoutTiers<T>(response: Record<string, T>, tiers: readonly string[]): Record<string, T> {
  if (!tiers.length) return response;
  const out: Record<string, T> = {};
  for (const [tier, configs] of Object.entries(response)) if (!tiers.includes(tier)) out[tier] = configs;
  return out;
}

/**
 * Build the format=2 structure that Zotero's parseVoicesResponse
 * (reader.js:40528) recognizes.
 *
 * One config per voice, in label order. Zotero shows voices in the order
 * it is given (buildVoiceOptions sorts only by creditsPerMinute, which we
 * never set) and flattens configs in order, locale by locale, so that is
 * the only shape that yields an alphabetical dropdown across a language's
 * several locales and the multilingual group alike. The label is the
 * voice's own: the provider is the dropdown entry it sits under (issue
 * #110), not a prefix of its name.
 *
 * The voice list under each locale uses the **plain array** form. The
 * object form { default, other } gets spread without any guard
 * (`...localeConfig.default`), and missing a field throws an exception;
 * the array form is explicitly tolerated and is more robust.
 */
export function buildVoicesResponse(
  entries: { provider: ProviderId; name?: string; voices: VoiceInfo[] }[],
  cacheVersion: string,
): Record<string, unknown[]> {
  const all: { id: string; label: string; locale: string }[] = [];
  for (const entry of entries) {
    for (const voice of entry.voices) {
      all.push({ id: encodeVoiceId(entry.provider, voice.id), label: voice.label, locale: voice.locale });
    }
  }
  if (!all.length) return {};

  all.sort(
    (a, b) => compareVoiceLabels(a.label, b.label) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || a.locale.localeCompare(b.locale),
  );

  return {
    [PUBLISHED_TIER]: all.map((voice) => ({
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
