import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVoiceSwitcher } from '../../src/read-aloud/voice-switch';

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
  const manager: any = { active: true, paused: false, speed: 1, selectedVoiceID: 'a', voicesForLanguage: voices, allVoices: voices,
    _controller: old, _segments: segments, _activeSegment: segments[0], _segmentGranularity: 'sentence',
    selectVoice: vi.fn(function (this: any, id: string) {
      this.selectedVoiceID = id; this._controller.destroy();
      const voice = voices.find(v => v.id === id);
      const index = segments.indexOf(this._activeSegment);
      this._controller = voice.getController(segments, index, undefined);
      this._controller.speed = this.speed; this._controller.paused = this.paused;
    }),
    pause() { this.paused = true; old.paused = true; },
    deactivate() { this.active = false; old.destroy(); },
    skipAhead() { old._position++; old._speakInternal(); },
    setSpeed(rate: number) { this.speed = rate; },
  };
  const reader = { _internalReader: { _readAloudManager: manager } };
  const notice = vi.fn(), error = vi.fn();
  const switcher = createVoiceSwitcher({ notice, error });
  return { switcher, reader, manager, select: manager.selectVoice, old, voices, fetched, plays, notice, error, segments, requests };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe('prepared native voice handoff', () => {
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
  it.each(['pause', 'deactivate', 'skipAhead', 'setSpeed'] as const)('cancels preparation on %s', async action => {
    const f = setup(); f.switcher.step(f.reader, 1); await vi.advanceTimersByTimeAsync(150);
    f.manager[action](2); f.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(100);
    expect(f.manager.selectVoice).not.toHaveBeenCalled(); expect(f.plays.some(p => p.id === 'b')).toBe(false);
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
  it('makes a paused selection without preparation or a sample', () => {
    const f = setup(); f.manager.paused = true; f.old._paused = true; f.switcher.step(f.reader, 1);
    expect(f.manager.selectedVoiceID).toBe('b'); expect(f.manager.paused).toBe(true);
    expect(f.requests).toEqual([]); expect(f.plays).toEqual([]); f.switcher.dispose();
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
    expect(other.manager.selectedVoiceID).toBe('a'); expect(f.switcher.inspect(other.reader)?.pending).toBe('b');
    other.fetched.resolve({ duration: 4 }); await vi.advanceTimersByTimeAsync(30);
    other.old._sourceNode.onended!(); await vi.advanceTimersByTimeAsync(0);
    expect(other.manager.selectedVoiceID).toBe('b'); f.switcher.dispose(); other.switcher.dispose();
  });
});
