import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlaybackNotice } from '../../src/read-aloud/playback-notice';

// Native transport boundary: fetching, segment events, source start, and
// manager state changes have the ordering of Zotero's reader.js.
function fixture() {
  class Controller extends EventTarget {
    _destroyed = false;
    _paused = false;
    _position = 0;
    _segments = [{ text: 'First sentence.' }, { text: 'Next sentence.' }];
    _delayTimeout: ReturnType<typeof setTimeout> | null = null;
    _isPlaying = false;
    _sourceNode: object | null = null;
    _audioContext = Object.assign(new EventTarget(), { state: 'running' });
    buffering = false;
    override dispatchEvent(event: Event) { return this._destroyed ? false : super.dispatchEvent(event); }
    get paused() { return this._paused; }
    set paused(value: boolean) { this._paused = value; this._speak(); }
    _speak() {
      if (this._paused) { this._isPlaying = false; return; }
      this.buffering = true;
      this.dispatchEvent(new Event('BufferingChange'));
    }
    downloaded() {
      this.buffering = false;
      this.dispatchEvent(new Event('BufferingChange'));
      this.dispatchEvent(new Event('ActiveSegmentChange'));
    }
    _playAudioBuffer() { this._sourceNode = {}; this._isPlaying = true; }
    _scheduleSpeak(ms: number) {
      this._isPlaying = false;
      this._delayTimeout = setTimeout(() => { this._delayTimeout = null; this._position++; this._speak(); }, ms);
    }
    fail() { this.buffering = false; this.dispatchEvent(new Event('Error')); }
    destroy() { this._destroyed = true; if (this._delayTimeout !== null) clearTimeout(this._delayTimeout); }
  }
  class Manager {
    active = false;
    paused = true;
    _controller: Controller | null = null;
    _stateChanged() {}
    activate() { this.active = true; this.paused = false; this._stateChanged(); }
    _createController() {
      this._controller?.destroy();
      const c = this._controller = new Controller();
      c.addEventListener('BufferingChange', () => this._stateChanged());
      c.addEventListener('Error', () => { this.paused = true; this._stateChanged(); });
      c.paused = this.paused;
    }
    play() { if (!this.active) this.activate(); else { this.paused = false; if (this._controller) this._controller.paused = false; this._stateChanged(); } }
    pause() { this.paused = true; if (this._controller) this._controller.paused = true; this._stateChanged(); }
    deactivate() { this.active = false; this.paused = true; this._controller?.destroy(); this._controller = null; this._stateChanged(); }
  }
  const manager = new Manager(), reader = { _internalReader: { _readAloudManager: manager } };
  const notice = vi.fn(), error = vi.fn();
  const observer = createPlaybackNotice({ notice, error });
  observer.attach(reader);
  return { Controller, manager, reader, observer, notice, error,
    start() { manager.play(); manager._createController(); return manager._controller!; } };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('playback preparation notice', () => {
  it('waits 300 ms, survives download completion, and clears at actual source start', () => {
    const f = fixture(), c = f.start();
    vi.advanceTimersByTime(299);
    expect(f.notice).not.toHaveBeenCalledWith(f.reader, 'preparing');
    vi.advanceTimersByTime(1);
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'preparing');
    c.downloaded();
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'preparing');
    c._playAudioBuffer();
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'idle');
    expect(f.error).not.toHaveBeenCalled();
    f.observer.dispose();
  });
  it('does not flash for a cached start within 300 ms', () => {
    const f = fixture(), c = f.start();
    vi.advanceTimersByTime(80); c.downloaded(); c._playAudioBuffer();
    vi.advanceTimersByTime(5000);
    expect(f.notice).not.toHaveBeenCalled();
    f.observer.dispose();
  });
  it('includes document preparation before the controller exists', () => {
    const f = fixture(); f.manager.play();
    vi.advanceTimersByTime(350);
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'preparing');
    f.manager._createController(); f.manager._controller!.downloaded();
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'preparing');
    f.manager._controller!._playAudioBuffer();
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'idle');
    f.observer.dispose();
  });
  it('excludes intentional gaps and starts a fresh 300 ms wait after the gap', () => {
    const f = fixture(), c = f.start(); c.downloaded(); c._playAudioBuffer();
    c._scheduleSpeak(2000);
    vi.advanceTimersByTime(2299);
    expect(f.notice).not.toHaveBeenCalledWith(f.reader, 'preparing');
    vi.advanceTimersByTime(1);
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'preparing');
    c.downloaded(); c._playAudioBuffer();
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'idle');
    f.observer.dispose();
  });
  it('keeps the notice until a started source has running output', () => {
    const f = fixture(), c = f.start(); c._audioContext.state = 'suspended';
    vi.advanceTimersByTime(350); c.downloaded(); c._playAudioBuffer();
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'preparing');
    c._audioContext.state = 'running'; c._audioContext.dispatchEvent(new Event('statechange'));
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'idle');
    f.observer.dispose();
  });
  it.each(['pause', 'deactivate'] as const)('clears on %s and ignores delayed failures', action => {
    const f = fixture(), c = f.start(); vi.advanceTimersByTime(350);
    f.manager[action]();
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'idle');
    f.notice.mockClear(); c.fail(); vi.advanceTimersByTime(6000);
    expect(f.notice).not.toHaveBeenCalled();
    f.observer.dispose();
  });
  it('starts a fresh wait on resume and reports preparation errors even without a native error string', () => {
    const f = fixture(), c = f.start(); f.manager.pause();
    vi.advanceTimersByTime(5000); expect(f.notice).not.toHaveBeenCalled();
    f.manager.play(); vi.advanceTimersByTime(300);
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'preparing');
    c.fail(); expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'failed');
    f.manager.play(); vi.advanceTimersByTime(300);
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'preparing');
    f.observer.dispose();
  });
  it('does not let an obsolete or background controller affect current preparation', () => {
    const f = fixture(), old = f.start(); vi.advanceTimersByTime(350);
    f.manager._createController(); const c = f.manager._controller!;
    const background = new f.Controller();
    old.downloaded(); old._playAudioBuffer(); old.fail();
    background._speak(); background.downloaded(); background._playAudioBuffer(); background.fail();
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'preparing');
    c.downloaded(); c._playAudioBuffer();
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'idle');
    f.observer.dispose();
  });
  it('restores hooks and removes all pending work when the reader detaches', () => {
    const f = fixture(), c = f.start(); vi.advanceTimersByTime(350);
    f.observer.detach(f.reader);
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'idle');
    f.notice.mockClear(); c.downloaded(); c._playAudioBuffer(); c.fail();
    vi.advanceTimersByTime(6000);
    expect(f.notice).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    expect(f.error).not.toHaveBeenCalled();
  });

  it('does not dismiss when source startup throws', () => {
    const f = fixture(), c = f.start();
    // Native sets _isPlaying before source.start; a thrown start must still fail.
    const node = { start() { throw new Error('audio output failed'); } };
    Object.defineProperty(c, '_isPlaying', { configurable: true, set() { node.start(); }, get() { return true; } });
    vi.advanceTimersByTime(300); c.downloaded();
    expect(() => c._playAudioBuffer()).toThrow('audio output failed');
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'failed');
    c.fail(); expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'failed');
    f.observer.dispose();
  });
  it('keeps observing underneath a temporary voice-handoff source wrapper', () => {
    const f = fixture(), c = f.start();
    const protoPlay = c._playAudioBuffer;
    c._playAudioBuffer = function () { protoPlay.call(this); delete (this as any)._playAudioBuffer; };
    vi.advanceTimersByTime(300); c.downloaded(); c._playAudioBuffer();
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'idle');
    f.manager.pause(); f.manager.play(); vi.advanceTimersByTime(300);
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'preparing');
    c.downloaded(); c._playAudioBuffer();
    expect(f.notice).toHaveBeenLastCalledWith(f.reader, 'idle');
    f.observer.dispose();
  });

});
