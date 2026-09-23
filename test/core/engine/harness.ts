/**
 * A virtual clock, a fake audio output and a fake fetch for the Engine's
 * core: every test runs on virtual time, and every clip plays out on it.
 */

import type { EngineAudio, EngineClip, EngineClock, EngineEventType, EngineSegment, EngineVoice, FetchResult, WordTiming } from '../../../src/core/engine/types';

/** Resolve after every pending microtask has run. */
export const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

interface Timer {
  id: number;
  at: number;
  fn: () => void;
}

export class VirtualClock implements EngineClock {
  private time = 0;
  private nextId = 1;
  private timers: Timer[] = [];

  now(): number {
    return this.time;
  }

  setTimeout(fn: () => void, ms: number): unknown {
    const timer = { id: this.nextId++, at: this.time + Math.max(0, Number(ms) || 0), fn };
    this.timers.push(timer);
    return timer.id;
  }

  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((t) => t.id !== handle);
  }

  /** How many timers are armed. */
  get pending(): number {
    return this.timers.length;
  }

  /** Let `ms` of virtual time pass, running each timer when its time comes and every microtask between them. */
  async advance(ms: number): Promise<void> {
    const end = this.time + ms;
    await flush();
    for (;;) {
      const due = this.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.time = Math.max(this.time, due.at);
      due.fn();
      await flush();
    }
    this.time = end;
    await flush();
  }
}

/** A clip as the fake decoder makes it: its length, and which audio it came from. */
export interface FakeClip extends EngineClip {
  readonly name: string;
}

/** Audio as the fake fetch hands it out; `undecodable` makes the decoder reject. */
export interface FakeAudioData {
  name: string;
  duration: number;
  undecodable?: boolean;
}

export interface Started {
  clip: FakeClip;
  offset: number;
  rate: number;
  at: number;
  stopped: boolean;
  ended: boolean;
  /** The context time a handoff cut this source at, while armed. */
  cutAt: number | null;
}

/**
 * The output: a context clock that follows the virtual clock (unless
 * stalled), sources that play out in (duration − offset) ÷ rate, a latency,
 * a running flag.
 */
export class FakeAudio implements EngineAudio<FakeClip> {
  readonly started: Started[] = [];
  latencySeconds = 0;
  isRunning = true;
  resumes = 0;
  rebuilds = 0;
  onsets: { position: number; words: number }[] = [];
  /** What `wordOnset` answers; by default half a second back per word. */
  onset = (position: number, words: number): number => Math.max(0, position - 0.5 * words);
  private stalledAt: number | null = null;
  private stallOffset = 0;

  constructor(private readonly clock: VirtualClock) {}

  async decode(audio: unknown): Promise<FakeClip> {
    const data = audio as FakeAudioData;
    if (!data || data.undecodable) throw new Error('EncodingError: the buffer could not be decoded');
    return { name: data.name, duration: data.duration };
  }

  start(clip: FakeClip, offset: number, rate: number, onEnded: () => void) {
    const entry: Started = { clip, offset, rate, at: this.now(), stopped: false, ended: false, cutAt: null };
    this.started.push(entry);
    // Ends by the context clock, so a stalled output does not play out
    const naturalEnd = entry.at + Math.max(0, clip.duration - offset) / rate;
    let endsAt = naturalEnd;
    let ended = onEnded;
    let timer: unknown = null;
    const check = () => {
      timer = null;
      if (entry.stopped) return;
      const left = endsAt - this.now();
      if (left > 1e-9) {
        timer = this.clock.setTimeout(check, Math.max(10, left * 1000));
        return;
      }
      entry.ended = true;
      ended();
    };
    const arm = () => {
      if (timer !== null) this.clock.clearTimeout(timer);
      timer = this.clock.setTimeout(check, Math.max(0, (endsAt - this.now()) * 1000));
    };
    arm();
    return {
      source: {
        stop: () => {
          entry.stopped = true;
          if (timer !== null) this.clock.clearTimeout(timer);
        },
        stopAt: (when: number, onStopped: () => void) => {
          entry.cutAt = when;
          endsAt = Math.min(when, naturalEnd);
          ended = onStopped;
          arm();
        },
        restoreEnd: (_when: number) => {
          entry.cutAt = null;
          endsAt = naturalEnd;
          ended = onEnded;
          arm();
        },
      },
      startedAt: entry.at,
    };
  }

  now(): number {
    if (this.stalledAt !== null) return this.stalledAt;
    return this.clock.now() / 1000 - this.stallOffset;
  }

  /** The context clock stops moving, as on a Windows output that went away. */
  stall(): void {
    this.stalledAt = this.now();
  }

  unstall(): void {
    if (this.stalledAt === null) return;
    this.stallOffset = this.clock.now() / 1000 - this.stalledAt;
    this.stalledAt = null;
  }

  latency(): number {
    return this.latencySeconds;
  }

  running(): boolean {
    return this.isRunning;
  }

  resume(): void {
    this.resumes++;
  }

  rebuild(): void {
    this.rebuilds++;
    this.stalledAt = null;
    this.stallOffset = 0;
  }

  wordOnset(_clip: FakeClip, position: number, words: number): number {
    this.onsets.push({ position, words });
    return this.onset(position, words);
  }

  /** The source playing now, if any. */
  get current(): Started | undefined {
    const last = this.started[this.started.length - 1];
    return last && !last.stopped && !last.ended ? last : undefined;
  }
}

interface Pending {
  segment: EngineSegment;
  voice: EngineVoice;
  signal: unknown;
  resolve(result: FetchResult): void;
}

/**
 * The fetch: every request recorded; answered at once from `answer` unless
 * `hold` is on, then by `respond`.
 */
export class FakeFetch {
  readonly requests: { text: string; voice: string; signal: unknown }[] = [];
  readonly waiting: Pending[] = [];
  hold = false;
  /** Seconds of audio per character of text. */
  secondsPerChar = 0.05;
  timings: (segment: EngineSegment) => WordTiming[] | null = () => null;
  answer: (segment: EngineSegment, voice: EngineVoice) => FetchResult = (segment, voice) => ({
    audio: { name: `${voice.id}:${segment.text}`, duration: segment.text.length * this.secondsPerChar } satisfies FakeAudioData,
    timestamps: this.timings(segment),
  });

  readonly fetch = (segment: EngineSegment, voice: EngineVoice, signal?: unknown): Promise<FetchResult> => {
    this.requests.push({ text: segment.text, voice: voice.id, signal });
    if (!this.hold) return Promise.resolve(this.answer(segment, voice));
    return new Promise((resolve) => this.waiting.push({ segment, voice, signal, resolve }));
  };

  /** Answer the held request for `text` (the oldest one), with `result` or the default answer. */
  respond(text: string, result?: FetchResult): void {
    const index = this.waiting.findIndex((p) => p.segment.text === text);
    if (index < 0) throw new Error(`no request for ${text}`);
    const [pending] = this.waiting.splice(index, 1);
    pending.resolve(result ?? this.answer(pending.segment, pending.voice));
  }

  texts(): string[] {
    return this.requests.map((r) => r.text);
  }
}

/** Every event the session sent, as `type:text` (`type:null` for none). */
export class EventLog {
  readonly events: { type: EngineEventType; segment: EngineSegment | null }[] = [];
  readonly emit = (type: EngineEventType, segment: EngineSegment | null): void => {
    this.events.push({ type, segment });
  };
  list(): string[] {
    return this.events.map((e) => `${e.type}:${e.segment ? e.segment.text : 'null'}`);
  }
  clear(): void {
    this.events.length = 0;
  }
  of(type: EngineEventType): string[] {
    return this.events.filter((e) => e.type === type).map((e) => (e.segment ? e.segment.text : 'null'));
  }
}

export const voice = (id = 'openai-official::alloy', lang = 'en-US', sentenceDelay = 0): EngineVoice => ({ id, lang, sentenceDelay });

/** Segments with the given texts; a leading `¶` marks a paragraph start. */
export function segments(...texts: string[]): EngineSegment[] {
  return texts.map((t) => (t.startsWith('¶') ? { text: t.slice(1), anchor: 'paragraphStart' } : { text: t, anchor: null }));
}
