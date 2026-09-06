/**
 * The one thing the plugin reads out of a WAV: how many bytes of samples it
 * holds. `say` writes a header with a `data` chunk of zero bytes for text
 * it cannot voice (an empty or whitespace-only string, measured
 * 2026-09-06), and Zotero's decoder fails on that — a decode failure is a
 * silent stop (issue #42) — so the system provider hands such a file on as
 * empty audio, which the remote interface plays as a short pause.
 *
 * Chunks are walked, not assumed at offset 44: `say` puts a 4044-byte
 * `FLLR` filler between `fmt ` and `data` to align the samples.
 */
export function wavDataLength(bytes: Uint8Array): number | null {
  if (bytes.length < 12) return null;
  const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 12;
  while (at + 8 <= bytes.length) {
    const name = tag(at);
    const size = view.getUint32(at + 4, true);
    const start = at + 8;
    // A declared size past the end of the file counts only what is there
    if (name === 'data') return Math.min(size, bytes.length - start);
    // Chunks are word-aligned: an odd size carries one pad byte
    at = start + size + (size & 1);
  }
  return null;
}
