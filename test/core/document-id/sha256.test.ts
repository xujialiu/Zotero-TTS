import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../src/core/document-id/sha256';

/**
 * The digest under every Document Id (ADR 0004), against the published vectors.
 *
 * Worth testing at this level rather than only through `documentIdOf`, because a
 * wrong digest does not look wrong. It produces 64 plausible hex characters, the
 * suite above it still passes — one file still hashes to one value — and the
 * damage only appears the day a Document Id has to agree with one computed
 * somewhere else.
 */

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('sha256Hex', () => {
  it('matches the published vectors', () => {
    // FIPS 180-4 / NIST CAVS: the empty message and 'abc'.
    expect(sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(utf8('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(
      sha256Hex(
        utf8('abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu'),
      ),
    ).toBe('cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1');
    expect(sha256Hex(utf8('a'.repeat(1_000_000)))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  /**
   * The padding is where a digest goes wrong, and it goes wrong only at the
   * lengths where the message and its nine bytes of padding stop fitting in one
   * block. 55 and 56 straddle that edge; 63, 64 and 65 straddle the block
   * itself.
   */
  it('pads correctly across the block boundary', () => {
    expect(sha256Hex(utf8('a'.repeat(55)))).toBe('9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318');
    expect(sha256Hex(utf8('a'.repeat(56)))).toBe('b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a');
    expect(sha256Hex(utf8('a'.repeat(63)))).toBe('7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34');
    expect(sha256Hex(utf8('a'.repeat(64)))).toBe('ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
    expect(sha256Hex(utf8('a'.repeat(65)))).toBe('635361c48bb9eab14198e76ea8ab7f1a41685d6ad62aa9146d301d4f17eb0ae0');
  });

  it('digests every byte value, not just text', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    expect(sha256Hex(bytes)).toBe('40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880');
  });

  it('changes when one byte changes', () => {
    const bytes = new Uint8Array(200).fill(7);
    const before = sha256Hex(bytes);
    bytes[150] = 8;
    expect(sha256Hex(bytes)).not.toBe(before);
  });

  /** Whole blocks are read straight out of the caller's array rather than copied, so this is worth pinning: reading is all that happens to them. */
  it("leaves the caller's bytes alone", () => {
    const bytes = utf8('a'.repeat(130));
    const copy = bytes.slice();
    sha256Hex(bytes);
    expect(bytes).toEqual(copy);
  });

  it('reads a view into a larger buffer, not the whole buffer', () => {
    const buffer = new Uint8Array(64).fill(0xff);
    buffer.set(utf8('abc'), 8);
    expect(sha256Hex(buffer.subarray(8, 11))).toBe(sha256Hex(utf8('abc')));
  });
});
