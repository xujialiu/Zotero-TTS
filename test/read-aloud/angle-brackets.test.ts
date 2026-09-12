import { describe, expect, it, vi } from 'vitest';
import { createRemoteInterface, SAMPLE_TEXT } from '../../src/read-aloud/remote-interface';
import { createTextSettings } from '../../src/read-aloud/text-settings';
import type { SynthesisResult, TTSProvider } from '../../src/core/providers/types';
import { prepareSpeechText, restoreSpeechOffsets } from '../../src/core/speech-text';

const voice = { id: 'openai::alloy' };
function setup() {
  let enabled = true;
  const raw: SynthesisResult = { audio: new Blob(['audio']), timestamps: [{ start: 0.2, end: 0.8, charStart: 0, charEnd: 5 }] };
  const synthesize = vi.fn(async () => raw);
  const provider = { id: 'openai', listVoices: async () => [], synthesize } as unknown as TTSProvider;
  const cache = new Map<string, SynthesisResult>();
  const nativeAudio = vi.fn(async (_segment: any, _voice: any) => raw);
  const deps = {
    listCatalog: async () => [], getProvider: () => provider, cacheVersion: () => 'v1',
    getStripAngleBrackets: () => enabled,
    cache: () => ({ match: async (key: string) => cache.get(key) ?? null, put: async (key: string, result: SynthesisResult) => { cache.set(key, result); } }),
    native: () => ({ getAudio: nativeAudio, getVoices: async () => ({}), getCreditsRemaining: async () => ({}), resetCredits: async () => ({}) }),
  };
  return { deps, raw, synthesize, nativeAudio, cache, setEnabled: (v: boolean) => { enabled = v; } };
}

describe('angle brackets at the speech boundary', () => {
  it('keeps UTF-16 ranges and reads native arrays without calling their map method', () => {
    const source = '😀“<你好>。”';
    const prepared = prepareSpeechText(source, true);
    expect(prepared.text).toBe('😀“你好。”');
    const timestamps = [{ start: 0, end: 1, charStart: 3, charEnd: 5 }];
    timestamps.map = (() => []) as any;
    const mapped = restoreSpeechOffsets(timestamps, prepared.removed);
    expect(mapped).toEqual([{ start: 0, end: 1, charStart: 4, charEnd: 6 }]);
    expect(source.slice(mapped[0].charStart, mapped[0].charEnd)).toBe('你好');
  });
  it('maps prefix, body and suffix punctuation across the two deleted characters', () => {
    const source = '“<Hello>!”';
    const prepared = prepareSpeechText(source, true);
    expect(prepared.text).toBe('“Hello!”');
    const words = [
      { start: 0, end: 0.1, charStart: 0, charEnd: 1 },
      { start: 0.1, end: 0.5, charStart: 1, charEnd: 6 },
      { start: 0.5, end: 0.6, charStart: 6, charEnd: 8 },
    ];
    const mapped = restoreSpeechOffsets(words, prepared.removed);
    expect(mapped.map(t => source.slice(t.charStart, t.charEnd))).toEqual(['“', 'Hello', '!”']);
    expect(mapped.map(t => [t.start, t.end])).toEqual(words.map(t => [t.start, t.end]));
  });
  it.each([
    ['<Hello world.>', 'Hello world.'], ['<<Hello>>', '<Hello>'], ['<a < b>', 'a < b'],
    ['Hello < world', 'Hello < world'], ['<Hello', '<Hello'], ['Hello>', 'Hello>'],
    ['<Hello>.', 'Hello.'], [' <Hello> ', ' Hello '], ['“<Hello>!”', '“Hello!”'], ['Hello <world>.', 'Hello <world>.'], ['＜Hello＞', '＜Hello＞'],
  ])('prepares %s as %s without mutating the segment', async (text, expected) => {
    const s = setup(); const segment = Object.freeze({ text });
    await createRemoteInterface(s.deps).getAudio(segment, voice);
    expect(s.synthesize).toHaveBeenCalledWith(expected, expect.anything());
    expect(segment.text).toBe(text);
  });

  it('maps fresh and cached word offsets back without changing the cache', async () => {
    const s = setup(); const remote = createRemoteInterface(s.deps);
    for (let i = 0; i < 2; i++) {
      const r = await remote.getAudio({ text: '<Hello>' }, voice);
      expect(r.timestamps).toEqual([{ start: 0.2, end: 0.8, charStart: 1, charEnd: 6 }]);
    }
    const plain = await remote.getAudio({ text: 'Hello' }, voice);
    expect(plain.timestamps).toEqual(s.raw.timestamps);
    expect(s.raw.timestamps![0].charStart).toBe(0);
    expect(s.synthesize).toHaveBeenCalledTimes(1);
    s.setEnabled(false);
    await remote.getAudio({ text: '<Hello>' }, voice);
    expect(s.synthesize).toHaveBeenLastCalledWith('<Hello>', expect.anything());
    expect(s.synthesize).toHaveBeenCalledTimes(2);
  });

  it('shares concurrent synthesis while returning each callers original coordinates', async () => {
    const s = setup(); const remote = createRemoteInterface(s.deps);
    const [wrapped, plain] = await Promise.all([
      remote.getAudio({ text: '<Hello>' }, voice), remote.getAudio({ text: 'Hello' }, voice),
    ]);
    expect(s.synthesize).toHaveBeenCalledTimes(1);
    expect(wrapped.timestamps).toEqual([{ start: 0.2, end: 0.8, charStart: 1, charEnd: 6 }]);
    expect(plain.timestamps).toBe(s.raw.timestamps);
  });

  it('copies native segment metadata and maps timestamps for Standard/Premium', async () => {
    const s = setup(); const remote = createRemoteInterface(s.deps);
    const segment = Object.freeze({ text: '<Hello>', lang: 'en', paragraphStart: true });
    const v = { id: 'native', cacheVersion: 'server-v1' };
    const r = await remote.getAudio(segment, v);
    expect(s.nativeAudio).toHaveBeenCalledWith({ ...segment, text: 'Hello' }, v);
    expect(s.nativeAudio.mock.calls[0][0]).not.toBe(segment);
    expect(r.timestamps).toEqual([{ start: 0.2, end: 0.8, charStart: 1, charEnd: 6 }]);
    expect(segment.text).toBe('<Hello>');
    expect(s.raw.timestamps![0].charStart).toBe(0);
    s.setEnabled(false);
    await remote.getAudio(segment, v);
    expect(s.nativeAudio).toHaveBeenLastCalledWith(segment, v);
  });

  it('preserves native sample and errors, and does not strip plugin sample text', async () => {
    const s = setup(); const remote = createRemoteInterface(s.deps);
    await remote.getAudio('sample', { id: 'native' });
    expect(s.nativeAudio).toHaveBeenLastCalledWith('sample', { id: 'native' });
    const error = { audio: null, error: 'network', noStore: true };
    s.nativeAudio.mockResolvedValueOnce(error as any);
    expect(await remote.getAudio({ text: '<Hello>' }, { id: 'native' })).toEqual(error);
    await remote.getAudio('sample', voice);
    expect(s.synthesize).toHaveBeenLastCalledWith(SAMPLE_TEXT, expect.anything());
  });

  it.each([voice, { id: 'native' }])('skips an empty interior without contacting %s', async (v) => {
    const s = setup(); const remote = createRemoteInterface(s.deps);
    for (const text of ['<>', '<   >']) {
      const r = await remote.getAudio({ text }, v);
      expect(r.audio!.size).toBeGreaterThan(0);
      expect(r.error).toBeUndefined();
    }
    expect(s.synthesize).not.toHaveBeenCalled(); expect(s.nativeAudio).not.toHaveBeenCalled();
  });

  it('keeps the full original sentence fallback when no word times exist', async () => {
    const s = setup(); delete s.raw.timestamps;
    const r = await createRemoteInterface(s.deps).getAudio({ text: '<Hello>' }, voice);
    expect(r.timestamps).toEqual([expect.objectContaining({ charStart: 0, charEnd: 7 })]);
  });

  it('prefetches prepared text but finds following sentences by the original text', async () => {
    const s = setup(); const upcoming = vi.fn(() => ['<Following sentence.>']);
    const remote = createRemoteInterface({ ...s.deps, getPrefetch: () => ({ enabled: true, count: 1 }), getUpcomingTexts: upcoming });
    await remote.getAudio({ text: '<Hello>' }, voice);
    await vi.waitFor(() => expect(s.synthesize).toHaveBeenCalledTimes(2));
    expect(upcoming).toHaveBeenCalledWith('<Hello>', 1);
    expect(s.synthesize).toHaveBeenLastCalledWith('Following sentence.', expect.anything());
    await remote.getAudio({ text: '<Following sentence.>' }, voice);
    expect(s.synthesize).toHaveBeenCalledTimes(2);
  });
});

describe('speech settings per reading session', () => {
  it('captures before activation, keeps pause/voice changes stable, refreshes after stop, and restores hooks', () => {
    let enabled = true;
    class Manager {
      _active = false;
      activate() { this._active = true; expect(settings.enabled(reader)).toBe(enabled); }
    }
    const manager = new Manager(); const reader = { _internalReader: { _readAloudManager: manager } };
    const original = Manager.prototype.activate;
    const settings = createTextSettings({ getEnabled: () => enabled, error: (e) => { throw e; } });
    expect(settings.attach(reader)).toBe(true);
    manager.activate(); enabled = false;
    expect(settings.enabled(reader)).toBe(true);
    settings.attach(reader);
    expect(settings.enabled(reader)).toBe(true);
    manager._active = false; manager.activate();
    expect(settings.enabled(reader)).toBe(false);
    settings.dispose(); expect(Manager.prototype.activate).toBe(original);
  });
});
