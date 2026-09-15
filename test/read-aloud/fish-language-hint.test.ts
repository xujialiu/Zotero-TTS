import { describe, expect, it, vi } from 'vitest';
import { createRemoteInterface } from '../../src/read-aloud/remote-interface';
import { createFishProvider } from '../../src/core/providers/fish';
import { createMemoryCache } from '../../src/core/memory-cache';
import type { SynthesisResult, TTSProvider } from '../../src/core/providers/types';

const voice = { id: 'fish::en/' + 'a'.repeat(32), locale: 'en-US' };
const audio = new Uint8Array([255, 251, 144, 1]);
function setup() {
  const bodies: any[] = [];
  const fetch = vi.fn(async (_url: any, init: any) => {
    bodies.push(JSON.parse(init.body));
    return new Response('data: ' + JSON.stringify({ audio_base64: btoa(String.fromCharCode(...audio)),
      chunk_seq: 0, alignment: { segments: [{ text: '100', start: 0, end: 0.7 }, { text: 'exp', start: 0.7, end: 1.1 }] } }) + '\n\n');
  });
  const provider = createFishProvider({ apiKey: 'test-only', freeOnly: true, voices: '' }, { fetch: fetch as typeof globalThis.fetch });
  const cache = createMemoryCache({ maxBytes: 1024 * 1024 });
  const debug = vi.fn();
  const deps = { listCatalog: async () => [], getProvider: () => provider, cacheVersion: () => 'test',
    cache: () => cache, debug };
  return { bodies, fetch, cache, debug, deps };
}

describe('Fish hint transport, offsets and cache', () => {
  it('adds the cue only to the request, maps timings to the original brackets, and reuses cached results', async () => {
    const s = setup(), iface = createRemoteInterface(s.deps);
    const segment = Object.freeze({ text: '< 100 exp>', sourcePosition: Object.freeze({ value: 'original' }) });
    const expected = [{ start: 0, end: 0.7, charStart: 2, charEnd: 5 }, { start: 0.7, end: 1.1, charStart: 6, charEnd: 9 }];
    for (let i = 0; i < 2; i++) {
      const result = await iface.getAudio(segment, voice);
      expect(result.timestamps).toEqual(expected);
      expect(new Uint8Array(await result.audio!.arrayBuffer())).toEqual(audio);
    }
    expect(s.bodies).toHaveLength(1);
    expect(s.bodies[0].text).toBe('[Speak in American English] 100 exp');
    expect(segment.text).toBe('< 100 exp>');
    expect((await iface.getAudio({ text: ' 100 exp' }, voice)).timestamps).toEqual(
      expected.map(t => ({ ...t, charStart: t.charStart - 1, charEnd: t.charEnd - 1 })));
    expect(s.bodies).toHaveLength(1);
    expect(s.debug.mock.calls.some(([line]) => line.includes('language hint'))).toBe(true);
  });

  it('separates languages and earlier uncued audio with the same voice ID', async () => {
    const s = setup(), iface = createRemoteInterface(s.deps), segment = { text: '100 exp' };
    await iface.getAudio(segment, { ...voice, locale: 'mul' });
    await iface.getAudio(segment, voice);
    await iface.getAudio(segment, { ...voice, locale: 'en-GB' });
    await iface.getAudio(segment, voice);
    expect(s.bodies.map(b => b.text)).toEqual(['100 exp', '[Speak in American English] 100 exp', '[Speak in British English] 100 exp']);
  });

  it('does not hint exactly four words or sample playback', async () => {
    const s = setup(), iface = createRemoteInterface(s.deps);
    await iface.getAudio({ text: 'One two three four' }, voice);
    await iface.getAudio('sample', voice);
    expect(s.bodies.every(b => !b.text.includes('[Speak'))).toBe(true);
  });

  it('counts the HP fraction as three words and preserves ordinary request settings', async () => {
    const s = setup();
    await createRemoteInterface(s.deps).getAudio({ text: '< 2/50 HP >' }, voice);
    expect(s.bodies[0]).toEqual({ text: '[Speak in American English] 2/50 HP ',
      reference_id: 'a'.repeat(32), format: 'mp3', mp3_bitrate: 64, latency: 'normal' });
  });

  it.each([undefined, 'mul', 'und', 'zz', 'en_US'])('leaves cloud text unchanged for locale %s', async locale => {
    const s = setup();
    await createRemoteInterface(s.deps).getAudio({ text: '<100 exp>' }, { ...voice, locale });
    expect(s.bodies[0].text).toBe('100 exp');
  });

  it('keeps empty brackets silent and preserves native request metadata and word ranges', async () => {
    const s = setup();
    const getAudio = vi.fn(async () => ({ audio: new Blob(['native']),
      timestamps: [{ start: 0, end: 1, charStart: 0, charEnd: 3 }], noStore: true }));
    const iface = createRemoteInterface({ ...s.deps, native: () => ({ getAudio,
      getVoices: async () => ({}), getCreditsRemaining: async () => ({}), resetCredits: async () => ({}) }) });
    const empty = await iface.getAudio({ text: '<>' }, voice);
    expect(empty.audio!.size).toBeGreaterThan(0);
    expect(s.fetch).not.toHaveBeenCalled();
    const source = { text: '<100 exp>', sourcePosition: { value: 'native' } };
    const result = await iface.getAudio(source, { id: 'native', locale: 'en-US' });
    expect(getAudio).toHaveBeenCalledWith({ ...source, text: '100 exp' }, { id: 'native', locale: 'en-US' });
    expect(result).toMatchObject({ noStore: true, timestamps: [{ start: 0, end: 1, charStart: 1, charEnd: 4 }] });
  });

  it('coalesces matching requests while keeping simultaneous different locales separate', async () => {
    const s = setup(), iface = createRemoteInterface(s.deps), segment = { text: '100 exp' };
    await Promise.all([iface.getAudio(segment, voice), iface.getAudio(segment, voice),
      iface.getAudio(segment, { ...voice, locale: 'en-GB' })]);
    expect(s.bodies.map(b => b.text).sort()).toEqual(['[Speak in American English] 100 exp', '[Speak in British English] 100 exp']);
  });

  it('prefetches with the captured locale and original text anchor, then reuses it without shifting offsets', async () => {
    const s = setup();
    const getUpcomingTexts = vi.fn(() => ['< 100 exp>']);
    const iface = createRemoteInterface({ ...s.deps, getPrefetch: () => ({ enabled: true, count: 1 }), getUpcomingTexts });
    const mutableVoice = { ...voice };
    await iface.getAudio({ text: 'This sentence has four words.' }, mutableVoice);
    mutableVoice.locale = 'en-GB';
    await vi.waitFor(() => expect(s.bodies).toHaveLength(2));
    expect(getUpcomingTexts).toHaveBeenCalledWith('This sentence has four words.', 1);
    expect(s.bodies[1].text).toBe('[Speak in American English] 100 exp');
    await iface.getAudio({ text: '< 100 exp>' }, voice);
    expect(s.bodies).toHaveLength(2);
  });

  it.each(['fishspeech', 'openai-official', 'azure', 'local'] as const)('leaves %s request metadata unchanged', async id => {
    const synthesize = vi.fn(async (): Promise<SynthesisResult> => ({ audio: new Blob(['audio']) }));
    const provider = { id, synthesize } as unknown as TTSProvider;
    const iface = createRemoteInterface({ listCatalog: async () => [], getProvider: () => provider, cacheVersion: () => 'test' });
    await iface.getAudio({ text: '<100 exp>' }, { id: id + '::voice', locale: 'en-US' });
    expect(synthesize).toHaveBeenCalledWith('100 exp', expect.not.objectContaining({ languageHint: expect.anything() }));
  });
});
