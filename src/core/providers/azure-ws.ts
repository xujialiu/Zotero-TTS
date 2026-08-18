import type { TimedWord } from '../align';

/** Azure 的时间单位是 100 纳秒 tick。 */
const TICKS_PER_SECOND = 10_000_000;

export function buildTextFrame(headers: Record<string, string>, body: string): string {
  const head = Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n');
  return `${head}\r\n\r\n${body}`;
}

export function parseTextFrame(raw: string): { headers: Record<string, string>; body: string } {
  const split = raw.indexOf('\r\n\r\n');
  const headText = split === -1 ? raw : raw.slice(0, split);
  const body = split === -1 ? '' : raw.slice(split + 4);

  const headers: Record<string, string> = {};
  for (const line of headText.split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return { headers, body };
}

export function parseBinaryFrame(buf: ArrayBuffer): {
  headers: Record<string, string>;
  payload: Uint8Array;
} {
  const view = new DataView(buf);
  const headerLength = view.getUint16(0, false);
  const headerText = new TextDecoder().decode(new Uint8Array(buf, 2, headerLength));
  const { headers } = parseTextFrame(headerText + '\r\n\r\n');
  return { headers, payload: new Uint8Array(buf, 2 + headerLength) };
}

function escapeXML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildSSML(text: string, voice: string, speed: number): string {
  // Azure 的 rate 是相对百分比：1.0 → "0%"，1.5 → "50%"，0.5 → "-50%"
  const rate = `${Math.round((speed - 1) * 100)}%`;
  return (
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">' +
    `<voice name="${escapeXML(voice)}">` +
    `<prosody rate="${rate}">${escapeXML(text)}</prosody>` +
    '</voice></speak>'
  );
}

type MetadataEntry = {
  Type?: string;
  Data?: { Offset?: number; Duration?: number; text?: { Text?: string } };
};

/**
 * 解析 audio.metadata 帧里的词边界。
 *
 * 这个结构未经实机核对，因此完全容错：任何看不懂的输入都返回空数组，
 * 让本次合成退化成句级高亮，而不是整体失败。
 */
export function parseWordBoundaries(body: string): TimedWord[] {
  let parsed: { Metadata?: MetadataEntry[] };
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed?.Metadata)) return [];

  const words: TimedWord[] = [];
  for (const entry of parsed.Metadata) {
    if (entry?.Type !== 'WordBoundary') continue;
    const text = entry.Data?.text?.Text;
    const offset = entry.Data?.Offset;
    const duration = entry.Data?.Duration;
    if (typeof text !== 'string' || typeof offset !== 'number' || typeof duration !== 'number') {
      continue;
    }
    words.push({
      text,
      start: offset / TICKS_PER_SECOND,
      end: (offset + duration) / TICKS_PER_SECOND,
    });
  }
  return words;
}
