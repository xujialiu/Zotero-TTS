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
  // 只切第一个分隔符，音色 id 里再出现分隔符也不会被截断
  return { provider: provider as ProviderId, voiceId: encoded.slice(at + SEPARATOR.length) };
}

/**
 * tier 合法取值仅 standard | premium | local（reader.js:39248）。
 * ftl 里 local 的说明是"无需账号、免费"，standard 是"需要 Zotero 账号"，
 * 因此云端 provider 归 standard、本地引擎归 local 最接近实情。
 */
export function tierForProvider(provider: ProviderId): 'standard' | 'local' {
  return provider === 'local' ? 'local' : 'standard';
}

/**
 * 构造 Zotero parseVoicesResponse（reader.js:40499）认识的 format=2 结构。
 *
 * locale 下的音色列表用**纯数组**形式。对象形式 { default, other } 会被
 * 无保护地展开（`...localeConfig.default`），少写一个字段就会抛异常；
 * 数组形式是被显式容忍的，更稳。
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
      // 词级高亮的前置条件（reader.js:53332）
      segmentGranularity: 'sentence',
      sentenceDelay: 0,
      cacheVersion,
      // 刻意不写 creditsPerMinute：它一旦存在，原生就会算出剩余分钟数
      // 并显示积分与购买入口（reader.js:39242）。
    };

    const tier = tierForProvider(entry.provider);
    (out[tier] ??= []).push(config);
  }

  return out;
}
