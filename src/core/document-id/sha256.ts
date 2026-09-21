/**
 * A COPY of OpenReader's `src/core/document/sha256.ts` (the copy rule: the plugin's
 * provider layer went to OpenReader the same way, its ADR 0013). The two
 * files must change in step: a Document Id is the join key of the shared
 * positions file (docs/spec/SYNC-FORMAT.md, section 6.3), and a byte of
 * difference between the two implementations names one book twice.
 */

/**
 * SHA-256 over a `Uint8Array`, in plain JavaScript.
 *
 * ADR 0004 makes a document's identity a digest over the archive's own manifest,
 * so something here has to compute one, and every obvious way of not writing this
 * file is closed:
 *
 * - `expo-crypto` is a platform import, which `src/core/` may not make
 *   (`eslint.config.js`, ADR 0013). Taking a digest as an injected dependency
 *   would work, but then the identity rule is only as good as whatever the
 *   caller passes and the tests would be hashing a fake.
 * - `crypto.subtle` is **not** among the globals measured on this Hermes —
 *   notes/NOTES_2026-09-19.md measured `atob`/`btoa`, `TextDecoder`/
 *   `TextEncoder`, `AbortController` and `WebSocket`, and nothing else. Not
 *   measured means not assumed. It is also asynchronous, which would make
 *   naming a document a promise for no reason.
 * - Node has a digest and Hermes may not. One implementation that runs in both
 *   is what lets a test under Node prove something about the app.
 *
 * FIPS 180-4. The test vectors in `test/core/document/sha256.test.ts` are the
 * published ones, so a transcription slip in the constants fails there rather
 * than by silently renaming every document in the owner's library.
 */

/** The first 32 bits of the fractional parts of the cube roots of the first 64 primes (FIPS 180-4 §4.2.2). */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
  0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
  0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** The first 32 bits of the fractional parts of the square roots of the first eight primes (FIPS 180-4 §5.3.3). */
const H0 = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);

const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;

/**
 * The digest of `bytes`, lowercase hex, 64 characters.
 *
 * Whole 64-byte blocks are read straight out of the caller's array — copying the
 * input to append nine bytes of padding is a copy nobody needs. Only the tail is
 * built. That mattered more when a Document Id was a digest of the whole 34 MB
 * file; it is kept because the argument has not changed, only the input.
 */
export function sha256Hex(bytes: Uint8Array): string {
  const h = H0.slice();
  const w = new Uint32Array(64);

  const whole = bytes.length - (bytes.length % 64);
  for (let at = 0; at < whole; at += 64) compress(h, w, bytes, at);

  // The padded tail: what is left over, a 1 bit, zeros, and the message length
  // in bits as 64 big-endian bits. One block unless the leftover plus those
  // nine bytes will not fit, in which case two.
  const rest = bytes.length - whole;
  const tail = new Uint8Array(rest + 9 > 64 ? 128 : 64);
  tail.set(bytes.subarray(whole));
  tail[rest] = 0x80;
  // In two halves, because a double cannot hold 2^64 and `<<` is 32-bit
  // anyway: the high word is `length * 8 >>> 32`, the low word what is left.
  const view = new DataView(tail.buffer);
  view.setUint32(tail.length - 8, Math.floor(bytes.length / 0x2000_0000), false);
  view.setUint32(tail.length - 4, (bytes.length % 0x2000_0000) * 8, false);
  for (let at = 0; at < tail.length; at += 64) compress(h, w, tail, at);

  let out = '';
  for (const word of h) out += word.toString(16).padStart(8, '0');
  return out;
}

/** One 64-byte block into the running state. `w` is the caller's scratch space, reused rather than reallocated per block. */
function compress(h: Uint32Array, w: Uint32Array, bytes: Uint8Array, at: number): void {
  for (let i = 0; i < 16; i++) {
    const o = at + i * 4;
    w[i] = ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  }
  for (let i = 16; i < 64; i++) {
    const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
    const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }

  let a = h[0];
  let b = h[1];
  let c = h[2];
  let d = h[3];
  let e = h[4];
  let f = h[5];
  let g = h[6];
  let hh = h[7];
  for (let i = 0; i < 64; i++) {
    const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const t1 = (hh + s1 + ch + K[i] + w[i]) >>> 0;
    const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (s0 + maj) >>> 0;
    hh = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }
  h[0] += a;
  h[1] += b;
  h[2] += c;
  h[3] += d;
  h[4] += e;
  h[5] += f;
  h[6] += g;
  h[7] += hh;
}
