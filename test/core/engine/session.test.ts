import { describe, expect, it } from 'vitest';
import type { PauseSettings } from '../../../src/core/engine/gap';
import { EngineSession, type PlaybackNotice } from '../../../src/core/engine/session';
import type { EngineSegment, WordTiming } from '../../../src/core/engine/types';
import { EventLog, FakeAudio, FakeFetch, flush, segments, VirtualClock, voice, type FakeClip } from './harness';

const pauses = (sentence: number | null, paragraph: number | null): PauseSettings => ({
  sentence: { enabled: sentence !== null, ms: sentence ?? 0 },
  paragraph: { enabled: paragraph !== null, ms: paragraph ?? 0 },
});

function setup(options: { settings?: PauseSettings; texts?: string[]; lang?: string; sentenceDelay?: number } = {}) {
  const clock = new VirtualClock();
  const audio = new FakeAudio(clock);
  const fetch = new FakeFetch();
  const log = new EventLog();
  const notices: PlaybackNotice[] = [];
  const errors: unknown[] = [];
  let settings = options.settings ?? pauses(0, 200);
  const session = new EngineSession<FakeClip>({
    clock,
    audio,
    fetch: fetch.fetch,
    pauses: () => settings,
    emit: log.emit,
    notice: (kind) => notices.push(kind),
    log: (e) => errors.push(e),
  });
  const list = segments(...(options.texts ?? ['¶One two three.', 'Four five.', 'Six seven eight.', '¶Nine ten.', 'Eleven.']));
  const v = voice('openai-official::alloy', options.lang ?? 'en-US', options.sentenceDelay ?? 0);
  return {
    clock,
    audio,
    fetch,
    log,
    notices,
    errors,
    session,
    list,
    v,
    setSettings: (s: PauseSettings) => (settings = s),
    /** Bind as `_createController` does, then `paused = …`. */
    open(backwardStopIndex: number | null = 0, paused = false) {
      const result = session.bind({ voice: v, segments: list, backwardStopIndex, forwardStopIndex: null });
      session.setPaused(paused);
      return result;
    },
  };
}

/** Seconds a segment of the harness plays at 1×. */
const seconds = (text: string) => text.length * 0.05;

describe('EngineSession: sentence to sentence', () => {
  it('fetches the first segment, then plays it from the start at the speed, with its events in Read Aloud’s order', async () => {
    const t = setup();
    t.open(0);
    expect(t.session.buffering).toBe(true);
    expect(t.log.list()).toEqual(['BufferingChange:One two three.']);
    await t.clock.advance(0);
    expect(t.log.list()).toEqual(['BufferingChange:One two three.', 'BufferingChange:One two three.', 'ActiveSegmentChange:One two three.']);
    expect(t.audio.started.map((s) => [s.clip.name, s.offset, s.rate])).toEqual([['openai-official::alloy:One two three.', 0, 1]]);
    expect(t.session.buffering).toBe(false);
    expect(t.session.position).toBe(0);
  });

  it('reads three ahead two at a time, the second of a pair asked for first, as Read Aloud does', async () => {
    const t = setup();
    t.fetch.hold = true;
    t.open(0);
    t.fetch.respond('One two three.');
    await t.clock.advance(0);
    // Next first by score (+10000), then by risk; the recursion issues the second before the first
    expect(t.fetch.texts()).toEqual(['One two three.', 'Six seven eight.', 'Four five.']);
    t.fetch.respond('Four five.');
    await flush();
    expect(t.fetch.texts()).toEqual(['One two three.', 'Six seven eight.', 'Four five.', 'Nine ten.']);
  });

  it('ends a segment with Changing/Change to none, waits the gap, and fires the next Change just before its audio', async () => {
    const t = setup({ settings: pauses(300, 200) });
    t.open(0);
    await t.clock.advance(0);
    t.log.clear();
    await t.clock.advance(seconds('One two three.') * 1000);
    expect(t.log.list()).toEqual(['ActiveSegmentChanging:null', 'ActiveSegmentChange:null']);
    expect(t.session.position).toBe(1);
    expect(t.session.inGap).toBe(true);
    await t.clock.advance(299);
    expect(t.audio.started).toHaveLength(1);
    await t.clock.advance(1);
    expect(t.audio.started.map((s) => s.clip.name)).toEqual(['openai-official::alloy:One two three.', 'openai-official::alloy:Four five.']);
    expect(t.log.list().slice(2)).toEqual(['BufferingChange:Four five.', 'BufferingChange:Four five.', 'ActiveSegmentChange:Four five.']);
  });

  it('waits the paragraph setting alone before a paragraph, divided by the speed', async () => {
    const t = setup({ settings: pauses(300, 400) });
    t.session.bind({ voice: t.v, segments: t.list, backwardStopIndex: 2, forwardStopIndex: null });
    t.session.setSpeed(2);
    t.session.setPaused(false);
    await t.clock.advance(0);
    await t.clock.advance((seconds('Six seven eight.') / 2) * 1000);
    expect(t.session.position).toBe(3);
    await t.clock.advance(199);
    expect(t.audio.started).toHaveLength(1);
    await t.clock.advance(1);
    expect(t.audio.started).toHaveLength(2);
    expect(t.audio.started[1].rate).toBe(2);
  });

  it('waits nothing while both switches are off, whatever the voice’s own delay', async () => {
    const t = setup({ settings: pauses(null, null), sentenceDelay: 300 });
    t.open(2);
    await t.clock.advance(0);
    await t.clock.advance(seconds('Six seven eight.') * 1000);
    expect(t.audio.started).toHaveLength(2);
  });

  it('reads the settings at every boundary', async () => {
    const t = setup({ settings: pauses(0, 0) });
    t.open(0);
    await t.clock.advance(0);
    t.setSettings(pauses(1000, 0));
    await t.clock.advance(seconds('One two three.') * 1000 + 999);
    expect(t.audio.started).toHaveLength(1);
    await t.clock.advance(1);
    expect(t.audio.started).toHaveLength(2);
  });

  it('drops the rest of the gap on a pause, and plays the next segment from its start on Play', async () => {
    const t = setup({ settings: pauses(1000, 0) });
    t.open(0);
    await t.clock.advance(0);
    await t.clock.advance(seconds('One two three.') * 1000 + 200);
    t.session.setPaused(true);
    expect(t.session.inGap).toBe(false);
    await t.clock.advance(5000);
    expect(t.audio.started).toHaveLength(1);
    t.session.setPaused(false);
    await t.clock.advance(0);
    expect(t.audio.started.map((s) => [s.clip.name.slice(s.clip.name.lastIndexOf(':') + 1), s.offset])).toEqual([
      ['One two three.', 0],
      ['Four five.', 0],
    ]);
  });

  it('at the end of the document goes back to where the run began and completes; Play starts there again', async () => {
    const t = setup({ settings: pauses(0, 0) });
    t.open(3);
    await t.clock.advance(0);
    await t.clock.advance(seconds('Nine ten.') * 1000);
    await t.clock.advance(seconds('Eleven.') * 1000);
    expect(t.log.list().slice(-3)).toEqual(['ActiveSegmentChanging:null', 'ActiveSegmentChange:null', 'Complete:null']);
    expect(t.session.position).toBe(3);
    expect(t.session.paused).toBe(false);
    // The manager pauses itself on Complete; Play sets paused = false again
    t.session.setPaused(false);
    await t.clock.advance(0);
    expect(t.audio.started.at(-1)?.clip.name).toBe('openai-official::alloy:Nine ten.');
  });

  it('stops at a forward stop, one past it, and completes (reader.js 39493-39498)', async () => {
    const t = setup({ settings: pauses(0, 0) });
    t.session.bind({ voice: t.v, segments: t.list, backwardStopIndex: 0, forwardStopIndex: 2 });
    t.session.setPaused(false);
    await t.clock.advance(0);
    await t.clock.advance(seconds('One two three.') * 1000 + 1);
    await t.clock.advance(seconds('Four five.') * 1000 + 1);
    expect(t.log.list().slice(-5)).toEqual([
      'ActiveSegmentChanging:null',
      'ActiveSegmentChange:null',
      'ActiveSegmentChanging:Six seven eight.',
      'ActiveSegmentChange:Six seven eight.',
      'Complete:null',
    ]);
    expect(t.session.forwardStopIndex).toBe(null);
  });
});

describe('EngineSession: pause and resume', () => {
  it('cuts at once, keeps the word, and resumes exactly where it stopped within 5 s', async () => {
    const t = setup();
    t.fetch.timings = (s) => (s.text === 'One two three.' ? [{ start: 0, end: 0.2, charStart: 0, charEnd: 3 }, { start: 0.2, end: 0.45, charStart: 4, charEnd: 7 }] : null);
    t.open(0);
    await t.clock.advance(0);
    await t.clock.advance(300);
    expect(t.session.activeTimestampIndex).toBe(1);
    t.session.setPaused(true);
    expect(t.audio.current).toBeUndefined();
    expect(t.session.activeTimestampIndex).toBe(1);
    await t.clock.advance(4900);
    t.session.setPaused(false);
    await t.clock.advance(0);
    expect(t.audio.started.at(-1)?.offset).toBeCloseTo(0.3, 9);
    expect(t.audio.onsets).toEqual([]);
  });

  it('goes back one word after 5 s and two after 20 s, for an English voice', async () => {
    const t = setup();
    t.open(0);
    await t.clock.advance(400);
    t.session.setPaused(true);
    await t.clock.advance(5000);
    t.session.setPaused(false);
    await t.clock.advance(0);
    expect(t.audio.onsets).toEqual([{ position: 0.4, words: 1 }]);
    expect(t.audio.started.at(-1)?.offset).toBeCloseTo(0, 9);
    await t.clock.advance(200);
    t.session.setPaused(true);
    await t.clock.advance(20_000);
    t.session.setPaused(false);
    await t.clock.advance(0);
    expect(t.audio.onsets[1].words).toBe(2);
  });

  it('resumes exactly after a long pause for a voice that is not English', async () => {
    const t = setup({ lang: 'de-DE' });
    t.open(0);
    await t.clock.advance(400);
    t.session.setPaused(true);
    await t.clock.advance(30_000);
    t.session.setPaused(false);
    await t.clock.advance(0);
    expect(t.audio.onsets).toEqual([]);
    expect(t.audio.started.at(-1)?.offset).toBeCloseTo(0.4, 9);
  });

  it('uses a paused offset only for the resume of that pause: a later return starts the sentence from its start', async () => {
    const t = setup({ settings: pauses(0, 0) });
    t.open(0);
    await t.clock.advance(500);
    t.session.setPaused(true);
    t.session.setPaused(false);
    await t.clock.advance(0);
    expect(t.audio.started.at(-1)?.offset).toBeCloseTo(0.5, 9);
    // Plays on into the next sentence, then back to the one once paused on
    await t.clock.advance(400);
    expect(t.session.position).toBe(1);
    t.session.skipBack('sentence');
    await t.clock.advance(600);
    expect(t.audio.started.at(-1)?.clip.name).toBe('openai-official::alloy:One two three.');
    expect(t.audio.started.at(-1)?.offset).toBe(0);
  });

  it('keeps the resume through a skip away and back while paused, as Read Aloud does', async () => {
    const t = setup();
    t.open(0);
    await t.clock.advance(300);
    t.session.setPaused(true);
    t.session.skipAhead('sentence');
    t.session.skipBack('sentence');
    await t.clock.advance(1000);
    t.session.setPaused(false);
    await t.clock.advance(0);
    expect(t.audio.started.at(-1)?.offset).toBeCloseTo(0.3, 9);
  });

  it('plays a sentence paused while its audio was on the way from the start', async () => {
    const t = setup();
    t.fetch.hold = true;
    t.open(0);
    t.session.setPaused(true);
    t.fetch.respond('One two three.');
    await t.clock.advance(0);
    expect(t.audio.started).toHaveLength(0);
    expect(t.session.buffering).toBe(false);
    t.session.setPaused(false);
    await t.clock.advance(0);
    expect(t.audio.started.map((s) => s.offset)).toEqual([0]);
  });

  it('asks a suspended output to run on Play', async () => {
    const t = setup();
    t.audio.isRunning = false;
    t.open(0);
    expect(t.audio.resumes).toBe(1);
  });
});

describe('EngineSession: skipping', () => {
  it('cuts the audio and moves the highlight at once, and fetches the target 600 ms after the last skip', async () => {
    const t = setup();
    t.open(0);
    await t.clock.advance(100);
    t.log.clear();
    t.fetch.requests.length = 0;
    t.session.skipAhead('sentence');
    expect(t.audio.current).toBeUndefined();
    expect(t.log.list()).toEqual(['ActiveSegmentChanging:Four five.']);
    expect(t.session.lastSkipGranularity).toBe('sentence');
    await t.clock.advance(400);
    t.session.skipAhead('sentence');
    await t.clock.advance(599);
    expect(t.audio.started).toHaveLength(1);
    await t.clock.advance(1);
    expect(t.audio.started.at(-1)?.clip.name).toBe('openai-official::alloy:Six seven eight.');
    expect(t.session.lastSkipGranularity).toBe('sentence');
  });

  it('moves only the highlight while paused: Changing and Change at once, nothing fetched', async () => {
    const t = setup();
    t.open(0, true);
    t.log.clear();
    t.session.skipAhead('paragraph');
    expect(t.log.list()).toEqual(['ActiveSegmentChanging:Nine ten.', 'ActiveSegmentChange:Nine ten.']);
    await t.clock.advance(1000);
    expect(t.fetch.requests).toHaveLength(0);
    expect(t.audio.started).toHaveLength(0);
  });

  it('skips by paragraphs and by five with accelerate, clamped to the document', () => {
    const t = setup({ texts: ['¶a', 'b', 'c', '¶d', 'e', '¶f', 'g', 'h', 'i', 'j'] });
    t.open(6, true);
    // From inside a paragraph, back past its own start to the previous one's (reader.js 39424-39429)
    t.session.skipBack('paragraph');
    expect(t.session.position).toBe(3);
    t.session.skipBack('paragraph');
    expect(t.session.position).toBe(0);
    t.session.skipAhead('paragraph');
    expect(t.session.position).toBe(3);
    t.session.skipAhead('sentence');
    t.session.skipBack('paragraph');
    expect(t.session.position).toBe(0);
    t.session.skipAhead('paragraph', true);
    expect(t.session.position).toBe(9);
    t.session.skipBack('sentence', true);
    expect(t.session.position).toBe(4);
    t.session.skipAhead('sentence', true);
    t.session.skipAhead('sentence', true);
    expect(t.session.position).toBe(9);
    t.session.skipBack('sentence', true);
    t.session.skipBack('sentence', true);
    expect(t.session.position).toBe(0);
  });

  it('fetches nothing for a skip whose session ended within the debounce', async () => {
    const t = setup();
    t.open(0);
    await t.clock.advance(100);
    t.fetch.requests.length = 0;
    t.session.skipAhead('paragraph');
    t.session.end();
    await t.clock.advance(2000);
    expect(t.fetch.requests).toHaveLength(0);
  });
});

describe('EngineSession: speed', () => {
  it('re-stretches the clip playing at the same position, a hard cut', async () => {
    const t = setup();
    t.open(0);
    await t.clock.advance(300);
    t.session.setSpeed(1.5);
    expect(t.audio.started.map((s) => [s.offset, s.rate, s.stopped])).toEqual([
      [0, 1, true],
      [0.3, 1.5, false],
    ]);
    await t.clock.advance(200);
    expect(t.session.currentPlaybackTime()).toBeCloseTo(0.6, 9);
  });

  it('applies at the next start while paused, in the gap or buffering', async () => {
    const t = setup({ settings: pauses(500, 0) });
    t.fetch.hold = true;
    t.open(0);
    t.session.setSpeed(2);
    t.fetch.hold = false;
    t.fetch.respond('One two three.');
    await t.clock.advance(0);
    expect(t.audio.started.map((s) => s.rate)).toEqual([2]);
    await t.clock.advance((seconds('One two three.') / 2) * 1000 + 100);
    t.session.setSpeed(1.25);
    expect(t.audio.started).toHaveLength(1);
    await t.clock.advance(400 / 1.25);
    // 500 ms at 2× is 250 ms; the new speed divides the next gap, the clip plays at it
    expect(t.audio.started.map((s) => s.rate)).toEqual([2, 1.25]);
  });
});

describe('EngineSession: errors and Retry', () => {
  it('lands on the failed segment, reports its error word, and fails again on Play without asking', async () => {
    const t = setup();
    t.fetch.answer = () => ({ audio: null, error: 'network' });
    t.open(0);
    await t.clock.advance(0);
    expect(t.log.list()).toEqual(['BufferingChange:One two three.', 'BufferingChange:One two three.', 'ActiveSegmentChange:One two three.', 'Error:One two three.']);
    expect(t.session.error).toBe('network');
    expect(t.notices.at(-1)).toBe('failed');
    t.log.clear();
    t.session.setPaused(false);
    expect(t.log.list()).toEqual(['ActiveSegmentChange:One two three.', 'Error:One two three.']);
    expect(t.fetch.requests).toHaveLength(1);
  });

  it('passes a provider’s own error word through: a rate limit reads as quota-exceeded, a Zotero daily limit as itself', async () => {
    for (const word of ['quota-exceeded', 'daily-limit-exceeded']) {
      const t = setup();
      t.fetch.answer = () => ({ audio: null, error: word });
      t.open(0);
      await t.clock.advance(0);
      expect(t.session.error).toBe(word);
    }
  });

  it('retries only a failed segment: ErrorCleared, then the segment is asked for again', async () => {
    const t = setup();
    let fail = true;
    const answer = t.fetch.answer;
    t.fetch.answer = (s, v) => (fail ? { audio: null, error: 'network' } : answer(s, v));
    t.open(0);
    await t.clock.advance(0);
    fail = false;
    t.log.clear();
    t.session.retry();
    expect(t.log.list()[0]).toBe('ErrorCleared:One two three.');
    expect(t.session.error).toBe(null);
    await t.clock.advance(0);
    expect(t.audio.started.map((s) => s.clip.name)).toEqual(['openai-official::alloy:One two three.']);
    t.session.retry();
    expect(t.fetch.requests).toHaveLength(2 + 3);
  });

  it('reports audio that will not decode as unknown, so the error shows and Retry works', async () => {
    const t = setup();
    let bad = true;
    const answer = t.fetch.answer;
    t.fetch.answer = (s, v) => (bad ? { audio: { name: 'x', duration: 1, undecodable: true } } : answer(s, v));
    t.open(0);
    await t.clock.advance(0);
    expect(t.session.error).toBe('unknown');
    expect(t.log.of('Error')).toEqual(['One two three.']);
    expect(t.errors).toHaveLength(1);
    bad = false;
    t.session.retry();
    await t.clock.advance(0);
    expect(t.audio.started).toHaveLength(1);
  });

  it('has the undecodable answer dropped where it is kept, so Retry reaches the provider again', async () => {
    const t = setup();
    const discarded: string[] = [];
    const session = new EngineSession<FakeClip>({
      clock: t.clock,
      audio: t.audio,
      fetch: (segment, v) => Promise.resolve({ audio: { name: segment.text, duration: 1, undecodable: true } }),
      discard: (segment, v) => discarded.push(`${v.id}:${segment.text}`),
      pauses: () => pauses(0, 0),
      emit: t.log.emit,
    });
    session.bind({ voice: t.v, segments: t.list, backwardStopIndex: 0, forwardStopIndex: null });
    session.setPaused(false);
    await t.clock.advance(0);
    expect(session.error).toBe('unknown');
    expect(discarded).toEqual(['openai-official::alloy:One two three.']);
  });

  it('asks once more for a segment whose read-ahead failed, when playback reaches it', async () => {
    const t = setup({ settings: pauses(0, 0) });
    const answer = t.fetch.answer;
    let fourFails = true;
    t.fetch.answer = (s, v) => (s.text === 'Four five.' && fourFails ? { audio: null, error: 'network' } : answer(s, v));
    t.open(0);
    await t.clock.advance(0);
    expect(t.fetch.texts().filter((x) => x === 'Four five.')).toHaveLength(1);
    expect(t.session.error).toBe(null);
    fourFails = false;
    await t.clock.advance(seconds('One two three.') * 1000);
    expect(t.fetch.texts().filter((x) => x === 'Four five.')).toHaveLength(2);
    expect(t.audio.started.at(-1)?.clip.name).toBe('openai-official::alloy:Four five.');
    expect(t.log.of('Error')).toEqual([]);
  });

  it('fails a segment whose read-ahead playback was waiting on', async () => {
    const t = setup({ settings: pauses(0, 0) });
    t.fetch.hold = true;
    t.open(0);
    t.fetch.respond('One two three.');
    await t.clock.advance(0);
    await t.clock.advance(seconds('One two three.') * 1000);
    expect(t.session.buffering).toBe(true);
    t.fetch.respond('Four five.', { audio: null, error: 'unknown' });
    await flush();
    expect(t.log.of('Error')).toEqual(['Four five.']);
    expect(t.fetch.texts().filter((x) => x === 'Four five.')).toHaveLength(1);
  });

  it('drops an answer that lands after the run was started afresh or ended', async () => {
    const t = setup();
    t.fetch.hold = true;
    t.open(0);
    t.session.end();
    t.fetch.respond('One two three.');
    await t.clock.advance(0);
    expect(t.audio.started).toHaveLength(0);
    expect(t.log.of('ActiveSegmentChange')).toEqual([]);
  });
});

describe('EngineSession: the word, off the audio clock', () => {
  const stamps: WordTiming[] = [
    { start: 0, end: 0.2, charStart: 0, charEnd: 3 },
    { start: 0.2, end: 0.45, charStart: 4, charEnd: 7 },
    { start: 0.45, end: 0.7, charStart: 8, charEnd: 14 },
  ];

  it.each([2, 2.5, 3])('lights short words promptly with a quantized audio clock at %s×', async (speed) => {
    const t = setup({ texts: ['One two three.'] });
    const now = t.audio.now.bind(t.audio);
    const quantum = 128 / 48_000;
    t.audio.now = () => Math.floor(now() / quantum) * quantum;
    t.audio.latencySeconds = 0.0219;
    t.fetch.timings = () => [
      { start: 0, end: 0.08, charStart: 0, charEnd: 3 },
      { start: 0.08, end: 0.16, charStart: 4, charEnd: 7 },
      { start: 0.16, end: 0.24, charStart: 8, charEnd: 13 },
    ];
    t.open(0, true);
    t.session.setSpeed(speed);
    t.session.setPaused(false);
    // The audible start is 21.9 ms. Allow a render quantum and a small
    // retry, not another 15 ms, before each of these 80 ms words lights.
    await t.clock.advance(26);
    expect(t.session.activeTimestampIndex).toBe(0);
    await t.clock.advance(80 / speed);
    expect(t.session.activeTimestampIndex).toBe(1);
    await t.clock.advance(80 / speed);
    expect(t.session.activeTimestampIndex).toBe(2);
    expect(t.log.of('ActiveWordChange')).toHaveLength(3);
    t.session.end();
  });

  it('moves to each word as its start is played, at the speed', async () => {
    const t = setup();
    t.fetch.timings = (s) => (s.text === 'One two three.' ? stamps : null);
    t.session.bind({ voice: t.v, segments: t.list, backwardStopIndex: 0, forwardStopIndex: null });
    t.session.setSpeed(2);
    t.session.setPaused(false);
    await t.clock.advance(0);
    expect(t.log.of('ActiveWordChange')).toEqual(['One two three.']);
    expect(t.session.activeTimestampIndex).toBe(0);
    await t.clock.advance(99);
    expect(t.session.activeTimestampIndex).toBe(0);
    await t.clock.advance(1);
    expect(t.session.activeTimestampIndex).toBe(1);
    await t.clock.advance(125);
    expect(t.session.activeTimestampIndex).toBe(2);
    expect(t.log.of('ActiveWordChange')).toHaveLength(3);
  });

  it('waits for the sound: each word lights the output latency after the clock reaches it', async () => {
    const t = setup();
    t.audio.latencySeconds = 0.2;
    t.fetch.timings = () => stamps;
    t.open(0);
    await t.clock.advance(0);
    expect(t.session.activeTimestampIndex).toBe(null);
    await t.clock.advance(199);
    expect(t.session.activeTimestampIndex).toBe(null);
    await t.clock.advance(1);
    expect(t.session.activeTimestampIndex).toBe(0);
    await t.clock.advance(200);
    expect(t.session.activeTimestampIndex).toBe(1);
  });

  it('stays on the word while the sound stalls, and moves on when it runs again', async () => {
    const t = setup();
    t.fetch.timings = () => stamps;
    t.open(0);
    await t.clock.advance(100);
    t.audio.stall();
    await t.clock.advance(2000);
    expect(t.session.activeTimestampIndex).toBe(0);
    t.audio.unstall();
    await t.clock.advance(150);
    expect(t.session.activeTimestampIndex).toBe(1);
  });

  it('bounds clock checks when sound stalls just before a word, then follows it again', async () => {
    const t = setup();
    t.fetch.timings = () => stamps;
    t.open(0);
    await t.clock.advance(199.5);
    t.audio.stall();
    const now = t.audio.now.bind(t.audio);
    let reads = 0;
    t.audio.now = () => { reads++; return now(); };
    await t.clock.advance(1000);
    expect(t.session.activeTimestampIndex).toBe(0);
    // Includes the fake source's end checks: a frozen clock must not
    // consume a thousand callbacks per second near a boundary.
    expect(reads).toBeLessThan(100);
    t.audio.unstall();
    await t.clock.advance(20);
    expect(t.session.activeTimestampIndex).toBe(1);
    t.session.end();
  });

  it('follows the heard word after a late callback without replaying missed words', async () => {
    const t = setup({ texts: ['One two three.'] });
    t.fetch.timings = () => [
      { start: 0, end: 0.08, charStart: 0, charEnd: 3 },
      { start: 0.08, end: 0.16, charStart: 4, charEnd: 7 },
      { start: 0.16, end: 0.24, charStart: 8, charEnd: 13 },
    ];
    const schedule = t.clock.setTimeout.bind(t.clock);
    t.clock.setTimeout = (fn, ms) => schedule(fn, ms > 0 && ms < 100 ? ms + 35 : ms);
    t.open(0, true);
    t.session.setSpeed(3);
    t.session.setPaused(false);
    await t.clock.advance(0);
    expect(t.session.activeTimestampIndex).toBe(0);
    await t.clock.advance(65);
    expect(t.session.activeTimestampIndex).toBe(2);
    expect(t.log.of('ActiveWordChange')).toHaveLength(2);
    t.session.end();
  });

  it('cancels a short retry on pause and resets stalled backoff on a new source', async () => {
    const t = setup({ texts: ['One two three.'] });
    t.fetch.timings = () => stamps;
    t.open(0);
    await t.clock.advance(199.5);
    t.audio.stall();
    await t.clock.advance(1000);
    t.session.setPaused(true);
    const ticks = t.session.wordClock.ticks;
    await t.clock.advance(100);
    expect(t.session.wordClock.ticks).toBe(ticks);
    t.audio.unstall();
    t.session.setSpeed(3);
    t.session.setPaused(false);
    await t.clock.advance(5);
    expect(t.session.activeTimestampIndex).toBe(1);
    t.session.end();
    const endedTicks = t.session.wordClock.ticks;
    await t.clock.advance(1000);
    expect(t.session.wordClock.ticks).toBe(endedTicks);
  });

  it('on a resume, lights the word under the offset at once, as the timers of words already begun did', async () => {
    const t = setup();
    t.fetch.timings = () => stamps;
    t.open(0);
    await t.clock.advance(300);
    t.session.setPaused(true);
    t.log.clear();
    t.session.setPaused(false);
    await t.clock.advance(0);
    expect(t.log.of('ActiveWordChange')).toEqual(['One two three.']);
    expect(t.session.activeTimestampIndex).toBe(1);
  });

  it('lights a sentence-wide stand-in once, and keeps a negative first start (Kokoro)', async () => {
    const t = setup();
    t.fetch.timings = (s) =>
      s.text === 'One two three.' ? [{ start: 0, end: 86_400, charStart: 0, charEnd: 14 }] : [{ start: -0.05, end: 0.2, charStart: 0, charEnd: 4 }, { start: 0.2, end: 0.5, charStart: 5, charEnd: 9 }];
    t.open(0);
    await t.clock.advance(700);
    expect(t.log.of('ActiveWordChange')).toEqual(['One two three.']);
    await t.clock.advance(1);
    expect(t.session.activeTimestampIndex).toBe(0);
    expect(t.log.of('ActiveWordChange')).toEqual(['One two three.', 'Four five.']);
  });

  it('syncs the word to the sound on demand, and restates it after a carry-on', async () => {
    const t = setup();
    t.fetch.timings = () => stamps;
    t.open(0);
    await t.clock.advance(250);
    t.log.clear();
    t.session.syncActiveWordToPlayback();
    expect(t.log.list()).toEqual([]);
    t.session.restateWord();
    expect(t.log.list()).toEqual(['ActiveWordChange:One two three.']);
  });
});

describe('EngineSession: what the manager reads', () => {
  it('answers a segment’s timings by identity, and none for a segment it has no clip of', async () => {
    const t = setup();
    const stamp = [{ start: 0, end: 1, charStart: 0, charEnd: 3 }];
    t.fetch.timings = (s) => (s.text === 'One two three.' ? stamp : null);
    t.open(0);
    await t.clock.advance(0);
    expect(t.session.getTimestampsForSegment(t.list[0])).toBe(stamp);
    expect(t.session.getTimestampsForSegment({ text: 'One two three.' })).toBe(null);
    expect(t.session.getTimestampsForSegment(t.list[1])).toBe(null);
  });

  it('annotates the previous segment while under half and under 3 s into this one', async () => {
    const t = setup({ settings: pauses(0, 0) });
    t.open(0);
    await t.clock.advance(0);
    expect(t.session.getSegmentToAnnotate()).toBe(t.list[0]);
    await t.clock.advance(seconds('One two three.') * 1000 + 100);
    expect(t.session.position).toBe(1);
    expect(t.session.getSegmentToAnnotate()).toBe(t.list[0]);
    await t.clock.advance(300);
    expect(t.session.getSegmentToAnnotate()).toBe(t.list[1]);
  });

  it('keeps 32 decoded clips, the least recently used out first', async () => {
    const texts = Array.from({ length: 40 }, (_, i) => `Sentence number ${i}.`);
    const t = setup({ texts, settings: pauses(0, 0) });
    t.open(0);
    for (let i = 0; i < 38; i++) await t.clock.advance(seconds(texts[i]) * 1000);
    expect(t.session.store?.clips.size).toBe(32);
  });
});

describe('EngineSession: rebuilds', () => {
  it('carries on when the manager rebuilds onto the same voice and segments: no restart, no fetch', async () => {
    const t = setup();
    t.open(0);
    await t.clock.advance(300);
    const requests = t.fetch.requests.length;
    expect(t.session.bind({ voice: voice(t.v.id), segments: t.list, backwardStopIndex: 0, forwardStopIndex: null })).toBe('carried-on');
    t.session.setPaused(false);
    expect(t.audio.started).toHaveLength(1);
    expect(t.audio.current).toBeDefined();
    expect(t.fetch.requests).toHaveLength(requests);
    // A later redundant Play restarts the sentence, as Read Aloud's does
    t.session.setPaused(false);
    await t.clock.advance(0);
    expect(t.audio.started.map((s) => s.offset)).toEqual([0, 0]);
  });

  it('carries on through a rebuild in the gap, keeping the run’s own start', async () => {
    const t = setup({ settings: pauses(500, 0) });
    t.open(1);
    await t.clock.advance(0);
    await t.clock.advance(seconds('Four five.') * 1000 + 100);
    expect(t.session.inGap).toBe(true);
    expect(t.session.bind({ voice: t.v, segments: t.list, backwardStopIndex: 1, forwardStopIndex: null })).toBe('carried-on');
    t.session.setPaused(false);
    expect(t.session.inGap).toBe(true);
    await t.clock.advance(400);
    expect(t.audio.started.at(-1)?.clip.name).toBe('openai-official::alloy:Six seven eight.');
    expect(t.session.backwardStopIndex).toBe(1);
  });

  it('starts afresh on a jump, on another voice and on new segments', async () => {
    for (const change of ['jump', 'voice', 'segments'] as const) {
      const t = setup();
      t.open(0);
      await t.clock.advance(300);
      const result = t.session.bind({
        voice: change === 'voice' ? voice('azure::en-US-AvaNeural') : t.v,
        segments: change === 'segments' ? segments('¶One two three.', 'Four five.') : t.list,
        backwardStopIndex: change === 'jump' ? 2 : 0,
        forwardStopIndex: null,
        jump: change === 'jump',
      });
      expect(result, change).toBe('started');
      expect(t.audio.current, change).toBeUndefined();
      t.session.setPaused(false);
      await t.clock.advance(0);
      expect(t.audio.started.at(-1)?.offset, change).toBe(0);
    }
  });

  it('after the end, starts afresh', async () => {
    const t = setup();
    t.open(0);
    await t.clock.advance(100);
    t.session.end();
    expect(t.audio.current).toBeUndefined();
    expect(t.session.bind({ voice: t.v, segments: t.list, backwardStopIndex: 0, forwardStopIndex: null })).toBe('started');
  });
});

describe('EngineSession: the output device', () => {
  it('rebuilds a stalled output 400 ms after a device change and replays from where it stopped', async () => {
    const t = setup();
    t.open(0);
    await t.clock.advance(300);
    t.audio.stall();
    t.session.deviceChanged();
    await t.clock.advance(400);
    expect(t.audio.rebuilds).toBe(1);
    expect(t.audio.started.map((s) => [s.offset, s.stopped])).toEqual([
      [0, true],
      [0.3, false],
    ]);
  });

  it('leaves an output whose clock still moves alone', async () => {
    const t = setup();
    t.open(0);
    await t.clock.advance(100);
    t.session.deviceChanged();
    await t.clock.advance(400);
    expect(t.audio.rebuilds).toBe(0);
    expect(t.audio.started).toHaveLength(1);
  });
});

describe('EngineSession: the preparing notice', () => {
  it('shows after 300 ms of waiting for audio and clears when the source starts', async () => {
    const t = setup();
    t.fetch.hold = true;
    t.open(0);
    await t.clock.advance(299);
    expect(t.notices).toEqual([]);
    await t.clock.advance(1);
    expect(t.notices).toEqual(['preparing']);
    t.fetch.respond('One two three.');
    await t.clock.advance(0);
    expect(t.notices).toEqual(['preparing', 'idle']);
  });

  it('never shows in the gap, nor for audio already decoded', async () => {
    const t = setup({ settings: pauses(2000, 0) });
    t.open(0);
    await t.clock.advance(0);
    await t.clock.advance(seconds('One two three.') * 1000 + 2000);
    expect(t.notices).toEqual([]);
  });

  it('waits for the output to run before it clears', async () => {
    const t = setup();
    t.fetch.hold = true;
    t.audio.isRunning = false;
    t.open(0);
    await t.clock.advance(300);
    t.fetch.respond('One two three.');
    await t.clock.advance(0);
    expect(t.notices).toEqual(['preparing']);
    t.audio.isRunning = true;
    t.session.outputChanged();
    expect(t.notices).toEqual(['preparing', 'idle']);
  });

  it('shows 300 ms after a skip, through the debounce, until the target plays', async () => {
    const t = setup();
    t.open(0);
    await t.clock.advance(100);
    t.session.skipAhead('sentence');
    await t.clock.advance(300);
    expect(t.notices).toEqual(['preparing']);
    await t.clock.advance(300);
    expect(t.notices).toEqual(['preparing', 'idle']);
  });

  it('gives way to the failure, and goes on a pause', async () => {
    const t = setup();
    t.fetch.hold = true;
    t.open(0);
    await t.clock.advance(300);
    t.fetch.respond('One two three.', { audio: null, error: 'network' });
    await flush();
    expect(t.notices).toEqual(['preparing', 'idle', 'failed']);
    const u = setup();
    u.fetch.hold = true;
    u.open(0);
    await u.clock.advance(300);
    u.session.setPaused(true);
    expect(u.notices).toEqual(['preparing', 'idle']);
  });
});

/** Segments shaped like the reader's, for `indexOf` by identity. */
export type { EngineSegment };

describe('EngineSession: the texts the plugin warms ahead', () => {
  const texts = ['One.', 'Two.', 'Three.', 'Four.'];

  it('answers the segments after the anchor, in order, up to the count', async () => {
    const t = setup({ texts });
    t.open(0);
    await t.clock.advance(0);
    expect(t.session.upcomingTexts('Two.', 5, () => false)).toEqual(['Three.', 'Four.']);
    expect(t.session.upcomingTexts('One.', 2, () => false)).toEqual(['Two.', 'Three.']);
  });

  it('searches from the segment playing, so a sentence repeated earlier cannot pull the window back', async () => {
    const t = setup({ texts: ['Same.', 'A.', 'Same.', 'B.'] });
    t.open(2);
    await t.clock.advance(0);
    expect(t.session.upcomingTexts('Same.', 3, () => false)).toEqual(['B.']);
  });

  it('leaves out what `skip` refuses and empty text', async () => {
    const t = setup({ texts: ['One.', 'Hidden.', '', 'Two.'] });
    t.open(0);
    await t.clock.advance(0);
    expect(t.session.upcomingTexts('One.', 3, (s) => s.text === 'Hidden.')).toEqual(['Two.']);
  });

  it('answers nothing for an unknown anchor or a session that ended', async () => {
    const t = setup({ texts });
    t.open(0);
    await t.clock.advance(0);
    expect(t.session.upcomingTexts('Missing.', 3, () => false)).toEqual([]);
    t.session.end();
    expect(t.session.upcomingTexts('One.', 3, () => false)).toEqual([]);
  });
});

describe('remaining reading time', () => {
  it('does not consume time while buffering or paused, responds to speed, and survives completion rewind', async () => {
    const t = setup({ texts: ['One two three.'], settings: pauses(0, 0) });
    t.fetch.hold = true;
    t.open();
    expect(t.session.remainingTime().seconds).toBe(1);
    await t.clock.advance(5000);
    expect(t.session.remainingTime().seconds).toBe(1);
    t.fetch.respond('One two three.');
    await t.clock.advance(0);
    expect(t.session.remainingTime().seconds).toBeCloseTo(0.7);
    await t.clock.advance(200);
    t.session.setPaused(true);
    const paused = t.session.remainingTime().seconds;
    await t.clock.advance(1000);
    expect(t.session.remainingTime().seconds).toBe(paused);
    t.session.setSpeed(2);
    expect(t.session.remainingTime().seconds).toBeCloseTo(0.25);
    t.session.setPaused(false);
    await t.clock.advance(250);
    expect(t.session.remainingTime()).toMatchObject({ status: 'finished', seconds: 0 });
    expect(t.session.position).toBe(0);
    t.session.setPaused(false);
    expect(t.session.remainingTime().status).toBe('ready');
  });
});


it('bounds a selected reading range and freezes while its audio is still on the way', async () => {
  const t = setup({ texts: ['One two three.', 'Four five six.', 'Seven eight nine.'], settings: pauses(0, 0) });
  t.fetch.hold = true;
  t.session.bind({ voice: t.v, segments: t.list, backwardStopIndex: 1, forwardStopIndex: 2 });
  t.session.setPaused(false);
  expect(t.session.remainingTime({ title: 'Part I', end: 3 })).toEqual({ status: 'ready', scope: 'selection', seconds: 1 });
  await t.clock.advance(1000);
  expect(t.session.remainingTime().seconds).toBe(1);
  t.fetch.respond('Four five six.');
  await t.clock.advance(701);
  expect(t.session.remainingTime()).toEqual({ status: 'finished', scope: 'selection', seconds: 0 });
});

it('counts only the unconsumed gap and excludes the boundary after a reading section', async () => {
  const t = setup({ texts: ['One two three.', 'Four five six.'], settings: pauses(1000, 0) });
  t.open();
  await t.clock.advance(0);
  expect(t.session.remainingTime({ title: 'Part I', end: 1 }).sectionSeconds).toBeCloseTo(0.7);
  await t.clock.advance(900);
  expect(t.session.remainingTime().seconds).toBeCloseTo(1.5);
  t.session.setPaused(true);
  expect(t.session.remainingTime().seconds).toBeCloseTo(0.7);
  await t.clock.advance(1000);
  expect(t.session.remainingTime().seconds).toBeCloseTo(0.7);
});

it('does not generate speech for estimation and forgets the old voice pace on a new voice', async () => {
  const t = setup({ texts: ['One two three.', 'Four five six.'], settings: pauses(0, 0) });
  t.open(0, true);
  for (let i = 0; i < 100; i++) t.session.remainingTime();
  expect(t.fetch.requests).toHaveLength(0);
  t.session.setPaused(false);
  await t.clock.advance(0);
  t.session.setPaused(true);
  expect(t.session.remainingTime().seconds).toBeCloseTo(1.4);
  t.session.bind({ voice: voice('other'), segments: t.list, backwardStopIndex: 0, forwardStopIndex: null });
  t.session.setPaused(true);
  expect(t.session.remainingTime().seconds).toBe(2);
  expect(t.fetch.requests).toHaveLength(2);
});

it('returns to document scope when Play continues beyond a completed selection', async () => {
  const t = setup({ texts: ['One two three.', 'Four five six.', 'Seven eight nine.'], settings: pauses(0, 0) });
  t.session.bind({ voice: t.v, segments: t.list, backwardStopIndex: 1, forwardStopIndex: 2 });
  t.session.setPaused(false);
  await t.clock.advance(701);
  expect(t.session.remainingTime()).toMatchObject({ scope: 'selection', status: 'finished' });
  t.session.setPaused(false);
  expect(t.session.remainingTime()).toMatchObject({ scope: 'document', status: 'ready' });
});

it('estimates the document when a skip moves past the selection stop', async () => {
  const t = setup({ texts: ['One two three.', 'Four five six.', 'Seven eight nine.'], settings: pauses(0, 0) });
  t.session.bind({ voice: t.v, segments: t.list, backwardStopIndex: 0, forwardStopIndex: 1 });
  t.session.setPaused(true);
  t.session.skipAhead('sentence');
  expect(t.session.remainingTime()).toMatchObject({ status: 'ready', scope: 'document', seconds: 2 });
});
