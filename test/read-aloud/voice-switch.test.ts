import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVoiceSwitcher } from '../../src/read-aloud/voice-switch';
import { createPlayerVoiceList } from '../../src/read-aloud/player-voice-list';

const listCleanup: (() => void)[] = [];

const words = [{ start: 0, end: 0.4, charStart: 0, charEnd: 3 }, { start: 0.5, end: 0.9, charStart: 4, charEnd: 7 },
  { start: 1, end: 1.4, charStart: 8, charEnd: 13 }];
function deferred<T>() { let resolve!: (v: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setup(timings = true) {
  const fetched = deferred<any>();
  const segments = Array.from({ length: 8 }, () => ({ text: 'One two three.' }));
  const requests: number[] = [];
  const plays: { id: string; index: number; offset: number }[] = [];
  class Controller {
    _segments = segments; _position = 0; _currentIndex: number | null = 0; _destroyed = false; _paused = true;
    _audioBuffers = new Map(); _segmentTimestamps = new Map(); _currentBuffer = { duration: 2 };
    _currentTimestamps = timings ? words : []; _speed = 1; _isPlaying = true;
    _audioContext = { currentTime: 10, state: 'running' }; _currentPlaybackTime = 0.15;
    _playbackStartContextTime = 9.85; _playbackOffset = 0; _playbackRate = 1;
    _sourceNode = { stop: vi.fn(), onended: null as null | (() => void) };
    constructor(public voice: any, index = 0) { this._position = index; }
    get position() { return this._position; }
    set paused(value: boolean) { this._paused = value; this._speakInternal(); }
    get paused() { return this._paused; }
    set speed(value: number) { this._speed = value; }
    get speed() { return this._speed; }
    async _getAudioData(index: number) {
      if (this._audioBuffers.has(index)) return this._audioBuffers.get(index);
      requests.push(index); const buffer = await fetched.promise;
      this._audioBuffers.set(index, buffer);
      this._segmentTimestamps.set(index, timings ? words.map(t => ({ ...t, start: t.start * 2, end: t.end * 2 })) : []);
      return buffer;
    }
    _playAudioBuffer(_buffer: unknown, offset: number) { plays.push({ id: this.voice.id, index: this._position, offset }); }
    _speakInternal() {
      if (this._paused) return;
      const index = this._position;
      void this._getAudioData(index).then(buffer => {
        if (this._destroyed || this._paused || this._position !== index) return;
        this._currentIndex = index;
        this._playAudioBuffer(buffer, 0);
      });
    }
    destroy() { this._destroyed = true; this._sourceNode.onended = null; }
  }
  const voices: any[] = ['a', 'b', 'c'].map(id => ({ id, label: id.toUpperCase(), segmentGranularity: 'sentence',
    getController: vi.fn(function (this: any, _segments: unknown, index: number) { return new Controller(this, index); }) }));
  const old = new Controller(voices[0]); old._paused = false;
  old._audioBuffers.set(0, { duration: 2 }); old._segmentTimestamps.set(0, timings ? words : []);
  const manager: any = { active: true, paused: false, speed: 1, _voiceID: 'a', _lang: 'en', _selectedTier: 'local', nativeVoices: voices, allVoices: voices,
    get selectedVoiceID() { return this._voiceID; },
    get voicesForLanguage() { return this.nativeVoices; },
    _controller: old, _segments: segments, _activeSegment: segments[0], _segmentGranularity: 'sentence',
    selectVoice: vi.fn(function (this: any, id: string) {
      this._voiceID = id; this._applyVoice(); this._persistCurrentVoice(); this._stateChanged();
    }),
    _persistCurrentVoice: vi.fn(), _stateChanged: vi.fn(),
    setLanguage(lang: string, { persist = false } = {}) {
      this._lang = lang; this._voiceID = lang === 'fr' ? 'b' : 'a';
      this._applyVoice(); if (persist) this._persistCurrentVoice(); this._stateChanged();
    },
    selectTier(tier: string) {
      this._selectedTier = tier; this._voiceID = tier === 'premium' ? 'c' : 'a';
      this._applyVoice(); this._persistCurrentVoice(); this._stateChanged();
    },
    _applyVoice() {
      this._controller.destroy();
      const voice = voices.find(v => v.id === this._voiceID);
      const index = segments.indexOf(this._activeSegment);
      this._controller = voice.getController(segments, index, undefined);
      this._controller.speed = this.speed; this._controller.paused = this.paused;
    },
    pause() { this.paused = true; old.paused = true; },
    play() { this.paused = false; this._controller.paused = false; },
    deactivate() { this.active = false; old.destroy(); },
    skipAhead() { old._position++; old._speakInternal(); },
    setSpeed(rate: number) { this.speed = rate; },
  };
  const reader = { _internalReader: { _readAloudManager: manager } };
  const notice = vi.fn(), error = vi.fn();
  const list = createPlayerVoiceList({ error });
  list.attach(reader); listCleanup.push(list.dispose);
  const switcher = createVoiceSwitcher({ notice, error, newAbortController: () => new AbortController() });
  return { switcher, reader, manager, select: manager.selectVoice, old, voices, fetched, plays, notice, error, segments, requests };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const dispose of listCleanup.splice(0)) dispose(); vi.useRealTimers(); });
describe('prepared native voice handoff', () => {
  it.each([-1, 1] as const)('keeps regional selection and wrap inside US voices (%s)', direction => {
    const f = setup(); f.manager.paused = true;
    f.voices[0].language = 'en-US'; f.voices[1].language = 'en'; f.voices[2].language = 'en-US';
    f.manager.region = 'GB'; // The displayed region comes from the selected voice.
    f.manager.nativeVoices = Object.assign([...f.voices, { id: 'wild', language: '*' }],
      { filter: () => [], find: () => undefined });
    f.switcher.step(f.reader, direction);
    expect(f.switcher.inspect(f.reader)?.pending).toBe('c');
    f.switcher.step(f.reader, direction);
    expect(f.manager.selectedVoiceID).toBe('a');
    expect(f.requests).toEqual([]); expect(f.plays).toEqual([]);
    f.switcher.dispose();
  });
  it('leaves a singleton region unchanged despite generic and wildcard neighbors', () => {
    const f = setup(); f.manager.paused = true;
    f.voices[0].language = 'en-US'; f.voices[1].language = 'en'; f.voices[2].language = '*';
    f.switcher.step(f.reader, 1); f.switcher.step(f.reader, -1);
    expect(f.select).not.toHaveBeenCalled(); f.switcher.dispose();
  });
  it('keeps generic selection behavior even with a stale requested region', () => {
    const f = setup(); f.manager.paused = true; f.manager.region = 'US';
    f.voices[0].language = 'en'; f.voices[1].language = 'en-US'; f.voices[2].language = '*';
    f.switcher.step(f.reader, 1);
    expect(f.switcher.inspect(f.reader)?.pending).toBe('b'); f.switcher.dispose();
  });
  it('steps pending playing targets within the region and cancels on wrap to the current voice', () => {
    const f = setup();
    f.voices[0].language = 'en-US'; f.voices[1].language = 'en'; f.voices[2].language = 'en-US';
    f.switcher.step(f.reader, 1);
    expect(f.switcher.inspect(f.reader)?.pending).toBe('c');
    f.switcher.step(f.reader, 1);
    expect(f.switcher.inspect(f.reader)?.pending).toBeNull();
    expect(f.select).not.toHaveBeenCalled(); f.switcher.dispose();
  });
  it('arms as soon as decoded audio is ready, before the next polling tick', async () => {
    const f = setup(); f.switcher.step(f.reader, 1);
    await vi.advanceTimersByTimeAsync(120);
    expect(f.old._sourceNode.stop).not.toHaveBeenCalled();
    f.fetched.resolve({ duration: 4 });
    await vi.advanceTimersByTimeAsync(0);
    expect(f.old._sourceNode.stop).toHaveBeenCalledWith(10.25);
    expect(f.switcher.inspect(f.reader)).toMatchObject({ wordDecision: 'shared-word-boundary',
      audioReady: [{ index: 0, elapsedMs: 120, playingIndex: 0, progress: 0.15, oldTimings: 3, newTimings: 3 }] });
    f.switcher.dispose();
  });
  it('keeps the old voice until audio is decoded and the scheduled word has ended', async () => {
    const f = setup(); f.switcher.step(f.reader, 1);
    await vi.advanceTimersByTimeAsync(150);
    expect(f.manager.selectedVoiceID).toBe('a'); expect(f.old._destroyed).toBe(false);
    f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(30);
    expect(f.old._sourceNode.stop).toHaveBeenCalledWith(10.25);
    expect(f.plays).toEqual([]); expect(f.select).not.toHaveBeenCalled();
    f.old._sourceNode.onended!(); await vi.advanceTimersByTimeAsync(0);
    expect(f.manager.selectedVoiceID).toBe('b');
    expect(f.plays).toEqual([{ id: 'b', index: 0, offset: 1 }]);
    expect(f.switcher.inspect(f.reader)?.last?.kind).toBe('word');
    f.switcher.dispose();
  });
  it('prepares the next sentence when either voice has no word timing and uses its native transition', async () => {
    const f = setup(false); f.switcher.step(f.reader, 1);
    f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(200);
    expect(f.requests).toContain(1); expect(f.select).not.toHaveBeenCalled();
    expect(f.switcher.inspect(f.reader)?.wordDecision).toBe('no-old-timings');
    expect(f.old._sourceNode.stop).not.toHaveBeenCalled();
    f.old._position = 1; f.manager._activeSegment = f.segments[1];
    f.old._speakInternal(); await vi.advanceTimersByTimeAsync(0);
    expect(f.plays).toEqual([{ id: 'b', index: 1, offset: 0 }]);
    expect(f.switcher.inspect(f.reader)?.last?.kind).toBe('sentence'); f.switcher.dispose();
  });
  it('steps from the pending target and never plays a cancelled result', async () => {
    const f = setup(); f.switcher.step(f.reader, 1); await vi.advanceTimersByTimeAsync(150);
    f.switcher.step(f.reader, 1); await vi.advanceTimersByTimeAsync(150);
    f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(30);
    f.old._sourceNode.onended!(); await vi.advanceTimersByTimeAsync(0);
    expect(f.manager.selectedVoiceID).toBe('c'); expect(f.plays.map(p => p.id)).toEqual(['c']); f.switcher.dispose();
  });
  it.each(['deactivate', 'skipAhead', 'setSpeed'] as const)('cancels preparation on %s', async action => {
    const f = setup(); f.switcher.step(f.reader, 1); await vi.advanceTimersByTimeAsync(150);
    f.manager[action](2); f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(100);
    expect(f.select).not.toHaveBeenCalled(); expect(f.plays.some(p => p.id === 'b')).toBe(false);
    expect(f.switcher.inspect(f.reader)?.pending).toBeNull(); f.switcher.dispose();
  });
  it('removes an armed stop when cancelled, preserving the old natural playback end', async () => {
    const f = setup(); f.switcher.step(f.reader, 1); f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(200);
    expect(f.old._sourceNode.stop).toHaveBeenCalledWith(10.25);
    f.switcher.dispose();
    expect(f.old._sourceNode.stop.mock.calls.at(-1)![0]).toBeGreaterThan(11);
    expect(f.old._sourceNode.onended).toBeNull(); expect(f.old._destroyed).toBe(false);
  });
  it('reports a fetch failure without replacing the old controller', async () => {
    const f = setup(); f.switcher.step(f.reader, 1); await vi.advanceTimersByTimeAsync(150);
    f.fetched.reject(new Error('offline')); await vi.advanceTimersByTimeAsync(30);
    expect(f.manager.selectedVoiceID).toBe('a'); expect(f.old._destroyed).toBe(false);
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'failed', 'B'); f.switcher.dispose();
  });
  it('prepares a paused selection silently while retaining the original voice for resume', async () => {
    const f = setup(); f.manager.paused = true; f.old._paused = true; f.switcher.step(f.reader, 1);
    await vi.advanceTimersByTimeAsync(150);
    expect(f.requests).toEqual([0]);
    expect(f.manager.selectedVoiceID).toBe('a'); expect(f.manager.paused).toBe(true);
    expect(f.old._destroyed).toBe(false); expect(f.plays).toEqual([]); f.switcher.dispose();
  });
  it('keeps preparing when paused during a pending switch, without committing or playing', async () => {
    const f = setup(); f.switcher.step(f.reader, 1); await vi.advanceTimersByTimeAsync(150);
    f.manager.pause(); f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(200);
    expect(f.switcher.inspect(f.reader)?.pending).toBe('b');
    expect(f.manager.selectedVoiceID).toBe('a'); expect(f.plays).toEqual([]);
    f.manager.play(); await vi.advanceTimersByTimeAsync(0);
    expect(f.plays).toEqual([{ id: 'b', index: 0, offset: 1 }]); f.switcher.dispose();
  });
  it('resumes prepared audio at the word after the paused word without playing the old voice', async () => {
    const f = setup(); f.manager.pause(); f.switcher.step(f.reader, 1);
    f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(200);
    expect(f.plays).toEqual([]);
    f.manager.play(); await vi.advanceTimersByTimeAsync(0);
    expect(f.manager.selectedVoiceID).toBe('b');
    expect(f.plays).toEqual([{ id: 'b', index: 0, offset: 1 }]);
    f.switcher.dispose();
  });
  it('prepares a player voice pick without replacing the playing controller or persisting early', async () => {
    const f = setup(); f.switcher.attach(f.reader); f.manager.selectVoice('c');
    await vi.advanceTimersByTimeAsync(150);
    expect(f.manager.selectedVoiceID).toBe('a'); expect(f.old._destroyed).toBe(false);
    expect(f.manager._persistCurrentVoice).not.toHaveBeenCalled();
    f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(30);
    f.old._sourceNode.onended!(); await vi.advanceTimersByTimeAsync(0);
    expect(f.manager.selectedVoiceID).toBe('c');
    expect(f.plays).toEqual([{ id: 'c', index: 0, offset: 1 }]);
    expect(f.manager._persistCurrentVoice).toHaveBeenCalledOnce(); f.switcher.dispose();
  });
  it.each(['locale', 'tier'])('prepares the native %s choice and commits its selection fields only at handoff', async kind => {
    const f = setup(); f.switcher.attach(f.reader);
    if (kind === 'locale') f.manager.setLanguage('fr', { persist: true });
    else f.manager.selectTier('premium');
    expect(f.manager._lang).toBe('en'); expect(f.manager._selectedTier).toBe('local');
    expect(f.manager._persistCurrentVoice).not.toHaveBeenCalled();
    expect(f.old._destroyed).toBe(false);
    f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(200);
    f.old._sourceNode.onended!(); await vi.advanceTimersByTimeAsync(0);
    expect(f.manager.selectedVoiceID).toBe(kind === 'locale' ? 'b' : 'c');
    expect(f.manager._lang).toBe(kind === 'locale' ? 'fr' : 'en');
    expect(f.manager._selectedTier).toBe(kind === 'tier' ? 'premium' : 'local');
    expect(f.manager._persistCurrentVoice).toHaveBeenCalledOnce(); f.switcher.dispose();
  });
  it('aborts an obsolete locale request when a player pick replaces it', async () => {
    const f = setup(); f.switcher.attach(f.reader); f.manager.setLanguage('fr', { persist: true });
    await vi.advanceTimersByTimeAsync(150);
    const signal = f.switcher.preparationSignal(f.reader, 'b');
    f.manager.selectVoice('c');
    expect(signal?.aborted).toBe(true);
    f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(200);
    f.old._sourceNode.onended!(); await vi.advanceTimersByTimeAsync(0);
    expect(f.manager.selectedVoiceID).toBe('c'); expect(f.manager._lang).toBe('en');
    expect(f.plays.map(p => p.id)).toEqual(['c']); f.switcher.dispose();
  });
  it('cancels a pending manual switch when the original voice is picked again without restarting it', async () => {
    const f = setup(); f.switcher.attach(f.reader); f.manager.selectVoice('b');
    await vi.advanceTimersByTimeAsync(150); const signal = f.switcher.preparationSignal(f.reader, 'b');
    f.manager.selectVoice('a'); f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(100);
    expect(signal?.aborted).toBe(true); expect(f.manager._controller).toBe(f.old);
    expect(f.old._destroyed).toBe(false); expect(f.plays).toEqual([]);
    expect(f.manager._persistCurrentVoice).toHaveBeenCalledOnce(); f.switcher.dispose();
  });
  it('retains prepared paused audio beyond the playing handoff timeout', async () => {
    const f = setup(); f.manager.pause(); f.switcher.step(f.reader, 1);
    f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(125_000);
    expect(f.manager.paused).toBe(true); expect(f.plays).toEqual([]);
    f.manager.play(); await vi.advanceTimersByTimeAsync(0);
    expect(f.plays).toEqual([{ id: 'b', index: 0, offset: 1 }]); f.switcher.dispose();
  });
  it('resumes the old voice while target audio is pending, then hands off normally', async () => {
    const f = setup(); f.manager.pause(); f.switcher.step(f.reader, 1);
    await vi.advanceTimersByTimeAsync(150); f.manager.play(); await vi.advanceTimersByTimeAsync(0);
    expect(f.plays.map(p => p.id)).toEqual(['a']);
    f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(30);
    f.old._sourceNode.onended!(); await vi.advanceTimersByTimeAsync(0);
    expect(f.plays.at(-1)).toEqual({ id: 'b', index: 0, offset: 1 }); f.switcher.dispose();
  });
  it('finishes the paused sentence in the old voice when reliable word alignment is unavailable', async () => {
    const f = setup(false); f.manager.pause(); f.switcher.step(f.reader, 1);
    f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(200);
    f.manager.play(); await vi.advanceTimersByTimeAsync(0);
    expect(f.manager.selectedVoiceID).toBe('a'); expect(f.plays.map(p => p.id)).toEqual(['a']);
    f.old._position = 1; f.old._speakInternal(); await vi.advanceTimersByTimeAsync(0);
    expect(f.plays.at(-1)).toEqual({ id: 'b', index: 1, offset: 0 }); f.switcher.dispose();
  });
  it('does not skip the remainder of a grouped timestamp when resuming a prepared voice', async () => {
    const f = setup();
    f.old._currentTimestamps = [{ start: 0, end: 0.9, charStart: 0, charEnd: 7 }, words[2]];
    f.manager.pause(); f.switcher.step(f.reader, 1); f.fetched.resolve({ duration: 4 });
    await vi.advanceTimersByTimeAsync(200); f.manager.play(); await vi.advanceTimersByTimeAsync(0);
    expect(f.manager.selectedVoiceID).toBe('a'); expect(f.plays.map(p => p.id)).toEqual(['a']); f.switcher.dispose();
  });
  it('leaves the original paused voice and locale intact on preparation failure', async () => {
    const f = setup(); f.switcher.attach(f.reader); f.manager.pause(); f.manager.setLanguage('fr', { persist: true });
    await vi.advanceTimersByTimeAsync(150); f.fetched.reject(new Error('offline'));
    await vi.advanceTimersByTimeAsync(30);
    expect(f.manager.paused).toBe(true); expect(f.manager._lang).toBe('en');
    expect(f.manager.selectedVoiceID).toBe('a'); expect(f.old._destroyed).toBe(false);
    expect(f.plays).toEqual([]); expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'failed', 'B'); f.switcher.dispose();
  });
  it('times out a hanging preparation without stopping old audio', async () => {
    const f = setup(); f.switcher.step(f.reader, 1);
    await vi.advanceTimersByTimeAsync(60_200);
    expect(f.switcher.inspect(f.reader)?.stage).toBe('failed');
    expect(f.old._destroyed).toBe(false); expect(f.manager.selectedVoiceID).toBe('a');
    f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(100);
    expect(f.plays).toEqual([]); f.switcher.dispose();
  });
  it('continues the old buffer when a catalog refresh races an armed word stop', async () => {
    const f = setup(); f.switcher.step(f.reader, 1); f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(200);
    f.manager.allVoices = [...f.voices];
    f.old._sourceNode.onended!(); await vi.advanceTimersByTimeAsync(0);
    expect(f.manager.selectedVoiceID).toBe('a');
    expect(f.plays).toEqual([{ id: 'a', index: 0, offset: 0.4 }]); f.switcher.dispose();
  });
  it('keeps the old voice when the prepared audio context cannot run', async () => {
    const f = setup();
    const factory = f.voices[1].getController.getMockImplementation();
    f.voices[1].getController.mockImplementation(function (this: any, ...args: any[]) {
      const c = factory.apply(this, args); c._audioContext.state = 'suspended';
      c._audioContext.resume = () => Promise.resolve(); return c;
    });
    f.switcher.step(f.reader, 1); f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(200);
    expect(f.switcher.inspect(f.reader)?.stage).toBe('failed');
    expect(f.old._destroyed).toBe(false); expect(f.manager.selectedVoiceID).toBe('a'); f.switcher.dispose();
  });
  it('prepares with a suspended output while paused and opens it only on Play', async () => {
    const f = setup(); const resume = vi.fn();
    const factory = f.voices[1].getController.getMockImplementation();
    f.voices[1].getController.mockImplementation(function (this: any, ...args: any[]) {
      const c = factory.apply(this, args); c._audioContext.state = 'suspended';
      resume.mockImplementation(async () => { c._audioContext.state = 'running'; });
      c._audioContext.resume = resume; return c;
    });
    f.manager.pause(); f.switcher.step(f.reader, 1); f.fetched.resolve({ duration: 4 });
    await vi.advanceTimersByTimeAsync(200);
    expect(resume).not.toHaveBeenCalled(); expect(f.switcher.inspect(f.reader)?.prepared).toContain(0);
    f.manager.play(); await vi.advanceTimersByTimeAsync(0);
    expect(resume).toHaveBeenCalledOnce(); expect(f.plays).toEqual([{ id: 'b', index: 0, offset: 1 }]);
    f.switcher.dispose();
  });
  it('prepares farther ahead if old playback overtakes the first request', async () => {
    const f = setup(false); f.switcher.step(f.reader, 1); await vi.advanceTimersByTimeAsync(150);
    f.old._position = 2; f.old._currentIndex = 2; f.manager._activeSegment = f.segments[2];
    f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(100);
    expect(f.requests).toEqual([0, 5]); expect(f.plays).toEqual([]);
    expect(f.switcher.inspect(f.reader)?.audioReady[0]).toMatchObject({ index: 0, playingIndex: 2 });
    f.old._position = 5; f.old._speakInternal(); await vi.advanceTimersByTimeAsync(0);
    expect(f.plays).toEqual([{ id: 'b', index: 5, offset: 0 }]); f.switcher.dispose();
  });
  it('waits out a sentence delay without fetching another sentence or starting early', async () => {
    const f = setup(false); f.switcher.step(f.reader, 1); f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(200);
    expect(f.requests).toEqual([0, 1]);
    f.old._position = 1;
    await vi.advanceTimersByTimeAsync(500);
    expect(f.requests).toEqual([0, 1]); expect(f.plays).toEqual([]);
    f.old._speakInternal(); await vi.advanceTimersByTimeAsync(0);
    expect(f.plays).toEqual([{ id: 'b', index: 1, offset: 0 }]); f.switcher.dispose();
  });
  it('starts shared-voice preparation only inside a shortcut selection', async () => {
    const f = setup(), other = setup();
    // Reuse the same switcher, as the production memory layer does.
    expect(f.switcher.defer(other.reader, 'b', () => other.manager.selectVoice('b'))).toBe(false);
    const native = f.manager.selectVoice;
    f.manager.selectVoice = function (id: string) {
      native.call(this, id);
      f.switcher.defer(other.reader, id, () => other.manager.selectVoice(id));
    };
    f.manager.paused = true; f.old._paused = true;
    f.switcher.step(f.reader, 1); await vi.advanceTimersByTimeAsync(150);
    f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(30);
    f.manager.play(); await vi.advanceTimersByTimeAsync(150);
    expect(other.manager.selectedVoiceID).toBe('a'); expect(f.switcher.inspect(other.reader)?.pending).toBe('b');
    other.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(30);
    other.old._sourceNode.onended!(); await vi.advanceTimersByTimeAsync(0);
    expect(other.manager.selectedVoiceID).toBe('b'); f.switcher.dispose(); other.switcher.dispose();
  });
});
