import type { TimedWord } from '../align';

/** Azure's time unit is a 100-nanosecond tick. */
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

export function buildSSML(text: string, voice: string): string {
  // No <prosody rate>: the audio is made at the voice's natural pace and
  // Read Aloud's own slider time-stretches it on playback.
  return (
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">' +
    `<voice name="${escapeXML(voice)}">` +
    escapeXML(text) +
    '</voice></speak>'
  );
}

type MetadataEntry = {
  Type?: string;
  Data?: { Offset?: number; Duration?: number; text?: { Text?: string } };
};

/**
 * Parse the word boundaries out of an audio.metadata frame.
 *
 * This structure hasn't been verified against a real device, so it's
 * fully fault-tolerant: any input we can't make sense of returns an
 * empty array, degrading this synthesis to sentence-level highlighting
 * instead of failing outright.
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
