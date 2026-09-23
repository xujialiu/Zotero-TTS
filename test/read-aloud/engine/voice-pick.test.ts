import { describe, expect, it, vi } from 'vitest';
import type { WordTiming } from '../../../src/core/engine/types';
import { EngineSession } from '../../../src/core/engine/session';
import type { Engine } from '../../../src/read-aloud/engine';
import { createVoicePick } from '../../../src/read-aloud/engine/voice-pick';
import { EventLog, FakeAudio, FakeFetch, VirtualClock, type FakeAudioData, type FakeClip } from '../../core/engine/harness';

const TEXT = 'One two three.';
const WORDS: WordTiming[] = [
  { start: 0, end: 0.2, charStart: 0, charEnd: 3 },
  { start: 0.25, end: 0.45, charStart: 4, charEnd: 7 },
  { start: 0.5, end: 0.7, charStart: 8, charEnd: 13 },
];

/**
 * A manager as far as the voice pick and the Engine need one: the choice
 * fields, the voice resolution a pick runs, and a rebuild of the controller
 * that binds the session the way the Engine's `getController` does.
 */
function setup(options: { paused?: boolean } = {}) {
  const clock = new VirtualClock();
  const audio = new FakeAudio(clock);
  const fetch = new FakeFetch();
  const log = new EventLog();
  const session = new EngineSession<FakeClip>({
    clock,
    audio,
    fetch: fetch.fetch,
    pauses: () => ({ sentence: { enabled: true, ms: 0 }, paragraph: { enabled: true, ms: 0 } }),
    emit: log.emit,
  });
  fetch.answer = (segment, v) => ({
    audio: { name: `${v.id}:${segment.text}`, duration: segment.text.length * 0.05 } satisfies FakeAudioData,
    timestamps: segment.text === TEXT ? WORDS : null,
  });
  const segments = [{ text: TEXT }, { text: 'Four five.' }, { text: 'Six seven.' }];
  const voices: any[] = ['a', 'b', 'c'].map((id) => ({ id, label: id.toUpperCase(), language: 'en-US', segmentGranularity: 'sentence' }));
  const voiceOf = (v: any) => ({ id: v.id, lang: v.language, sentenceDelay: 0, reader: v });
  const rebuilds: string[] = [];
  const manager: any = {
    active: true,
    paused: !!options.paused,
    speed: 1,
    _voiceID: 'a',
    _lang: 'en',
    _selectedTier: 'local',
    allVoices: voices,
    segments,
    segmentGranularity: 'sentence',
    get selectedVoiceID() {
      return this._voiceID;
    },
    get voicesForLanguage() {
      return voices;
    },
    selectVoice(id: string) {
      this._voiceID = id;
      this._applyVoice();
      this._persistCurrentVoice();
      this._stateChanged();
    },
    setLanguage(lang: string, { persist = false } = {}) {
      this._lang = lang;
      this._voiceID = lang === 'fr' ? 'b' : 'a';
      this._applyVoice();
      if (persist) this._persistCurrentVoice();
      this._stateChanged();
    },
    selectTier(tier: string) {
      this._selectedTier = tier;
      this._voiceID = tier === 'premium' ? 'c' : 'a';
      this._applyVoice();
      this._persistCurrentVoice();
      this._stateChanged();
    },
    _applyVoice() {
      const voice = voices.find((v) => v.id === this._voiceID);
      rebuilds.push(`${voice.id}:${session.bind({ voice: voiceOf(voice), segments, backwardStopIndex: session.position, forwardStopIndex: null })}`);
      session.setPaused(this.paused);
    },
    _persistCurrentVoice: vi.fn(),
    _stateChanged: vi.fn(),
    pause() {
      this.paused = true;
      session.setPaused(true);
    },
    play() {
      this.paused = false;
      session.setPaused(false);
    },
    skipAhead() {
      session.skipAhead('sentence');
    },
    setSpeed(rate: number) {
      this.speed = rate;
      session.setSpeed(rate);
    },
    deactivate() {
      this.active = false;
      session.end();
    },
  };
  const engine = { session: () => session, voiceOf, bound: () => !session.ended } as unknown as Engine;
  const reader = { _internalReader: { _readAloudManager: manager } };
  const notices: string[] = [];
  const pick = createVoicePick({
    engine,
    notice: (_reader, kind, label) => notices.push(`${kind}:${label}`),
    error: (e) => {
      throw e;
    },
    newAbortController: () => new AbortController(),
  });
  session.bind({ voice: voiceOf(voices[0]), segments, backwardStopIndex: 0, forwardStopIndex: null });
  session.setPaused(manager.paused);
  pick.attach(reader);
  const playing = () => audio.started.map((s) => `${s.clip.name.split(':')[0]}@${Math.round(s.offset * 1000) / 1000}`);
  return { clock, audio, fetch, session, manager, voices, reader, pick, notices, rebuilds, playing };
}

describe('voice pick', () => {
  it('prepares a picked voice while the old one reads on, and selects it for real only at the handoff', async () => {
    const t = setup();
    await t.clock.advance(10);
    t.manager.selectVoice('c');
    expect(t.manager.selectedVoiceID).toBe('a');
    expect(t.manager._persistCurrentVoice).not.toHaveBeenCalled();
    expect(t.pick.inspect(t.reader)?.pending).toBe('c');
    expect(t.pick.protectedVoices(t.reader)).toEqual(['a', 'c']);
    await t.clock.advance(200);
    expect(t.manager.selectedVoiceID).toBe('c');
    expect(t.manager._persistCurrentVoice).toHaveBeenCalledOnce();
    expect(t.rebuilds).toEqual(['c:carried-on']);
    expect(t.playing()).toEqual(['a@0', 'c@0.25']);
    expect(t.notices).toEqual(['preparing:C', 'selected:C']);
    expect(t.pick.protectedVoices(t.reader)).toEqual([]);
  });

  it.each(['locale', 'tier'])('applies a paused %s pick natively at once, so the lists follow it, and prepares nothing', async (kind) => {
    const t = setup({ paused: true });
    if (kind === 'locale') t.manager.setLanguage('fr', { persist: true });
    else t.manager.selectTier('premium');
    expect(t.manager.selectedVoiceID).toBe(kind === 'locale' ? 'b' : 'c');
    expect(t.manager._persistCurrentVoice).toHaveBeenCalledOnce();
    expect(t.rebuilds).toEqual([kind === 'locale' ? 'b:started' : 'c:started']);
    await t.clock.advance(300);
    expect(t.fetch.requests).toHaveLength(0);
    expect(t.notices).toEqual([]);
  });

  it.each(['locale', 'tier'])('previews a playing %s pick and commits its fields only at the handoff', async (kind) => {
    const t = setup();
    await t.clock.advance(10);
    if (kind === 'locale') t.manager.setLanguage('fr', { persist: true });
    else t.manager.selectTier('premium');
    expect(t.manager._lang).toBe('en');
    expect(t.manager._selectedTier).toBe('local');
    expect(t.manager._persistCurrentVoice).not.toHaveBeenCalled();
    expect(t.rebuilds).toEqual([]);
    await t.clock.advance(200);
    expect(t.manager.selectedVoiceID).toBe(kind === 'locale' ? 'b' : 'c');
    expect(t.manager._lang).toBe(kind === 'locale' ? 'fr' : 'en');
    expect(t.manager._selectedTier).toBe(kind === 'tier' ? 'premium' : 'local');
    expect(t.manager._persistCurrentVoice).toHaveBeenCalledOnce();
  });

  it('calls a pending switch off when the voice reading is picked again, without restarting it', async () => {
    const t = setup();
    await t.clock.advance(10);
    t.manager.selectVoice('b');
    await t.clock.advance(50);
    t.manager.selectVoice('a');
    expect(t.notices).toEqual(['preparing:B', 'cancelled:B', 'selected:A']);
    expect(t.rebuilds).toEqual(['a:carried-on']);
    await t.clock.advance(300);
    expect(t.playing()).toEqual(['a@0']);
    expect(t.fetch.requests.filter((r) => r.voice === 'b')).toHaveLength(0);
  });

  it('calls a pending switch off on a skip or a speed change, before they run', async () => {
    for (const action of ['skip', 'speed'] as const) {
      const t = setup();
      await t.clock.advance(10);
      t.manager.selectVoice('c');
      if (action === 'skip') t.manager.skipAhead();
      else t.manager.setSpeed(1.5);
      expect(t.notices, action).toEqual(['preparing:C', 'cancelled:C']);
      expect(t.session.handoff, action).toBe(null);
      // The switch's shadows went with it: the manager's own methods are back
      expect(t.manager.skipAhead.name, action).toBe('skipAhead');
      expect(t.manager.pause.name, action).toBe('pause');
    }
  });

  it('plays the new voice from the paused word on Play', async () => {
    const t = setup();
    await t.clock.advance(100);
    t.manager.pause();
    t.manager.selectVoice('c');
    await t.clock.advance(150);
    expect(t.notices).toEqual(['preparing:C', 'ready:C']);
    t.manager.play();
    await t.clock.advance(0);
    expect(t.playing()).toEqual(['a@0', 'c@0.25']);
    expect(t.manager.selectedVoiceID).toBe('c');
  });

  it('steps through the list from the pending target, and cancels on coming back to the voice reading', async () => {
    const t = setup();
    await t.clock.advance(10);
    t.pick.step(t.reader, 1);
    expect(t.pick.inspect(t.reader)?.pending).toBe('b');
    t.pick.step(t.reader, 1);
    expect(t.pick.inspect(t.reader)?.pending).toBe('c');
    t.pick.step(t.reader, 1);
    expect(t.session.handoff).toBe(null);
    expect(t.notices.at(-1)).toBe('selected:A');
    expect(t.manager.selectedVoiceID).toBe('a');
  });

  it('switches at once when nothing is read', () => {
    const t = setup();
    t.manager.active = false;
    t.manager._applyVoice = vi.fn();
    t.pick.step(t.reader, 1);
    expect(t.notices).toEqual([]);
    t.manager.active = true;
    t.session.end();
    t.pick.step(t.reader, 1);
    expect(t.notices).toEqual(['unavailable:B']);
  });

  it('defers the memory’s own restore only inside a selection it is propagating', async () => {
    const t = setup();
    expect(t.pick.defer(t.reader, 'b', () => t.manager.selectVoice('b'))).toBe(false);
    await t.clock.advance(10);
    t.pick.detach(t.reader);
    const native = t.manager.selectVoice;
    let deferred = null as boolean | null;
    t.manager.selectVoice = function (this: any, id: string) {
      Reflect.apply(native, this, [id]);
      deferred = t.pick.defer(t.reader, 'c', () => {});
    };
    t.pick.attach(t.reader);
    t.pick.step(t.reader, 1);
    await t.clock.advance(200);
    expect(deferred).toBe(true);
  });

  it('detach calls the switch off and takes every shadow off the manager', async () => {
    const t = setup();
    await t.clock.advance(10);
    t.manager.selectVoice('c');
    t.pick.detach(t.reader);
    expect(t.session.handoff).toBe(null);
    // The manager's own methods are back: a shadow is an anonymous function
    for (const name of ['selectVoice', 'selectTier', 'setLanguage', 'pause', 'play', 'skipAhead', 'setSpeed', 'deactivate']) {
      expect(t.manager[name].name, name).toBe(name);
    }
  });
});
