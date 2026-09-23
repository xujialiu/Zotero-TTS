/**
 * The shapes the Engine's core works with (issue #133, ADR 0005). The core
 * is pure logic: no Zotero, no Web Audio, no window — the Zotero-facing half
 * (read-aloud/engine/) hands it a clock, an audio output and a fetch, and
 * turns what it announces into the events Read Aloud's manager listens for.
 *
 * Segments and timestamps are the reader's own objects: they are only ever
 * read, by index and by field, never iterated with a method that takes a
 * callback (MEMORY/code.md, Compartments).
 */

/** One segment as the reader's segmentation hands it over: a sentence, with where a paragraph starts. */
export interface EngineSegment {
  readonly text: string;
  readonly anchor?: string | null;
}

/** One word timing, in seconds of the provider's audio and characters of the segment's text (reader.js `normalizedOffsetsToRawOffsets`). */
export interface WordTiming {
  readonly start: number;
  readonly end: number;
  readonly charStart: number;
  readonly charEnd: number;
}

/** What the Engine needs to know of a voice. */
export interface EngineVoice {
  /** The voice's id, as the manager knows it. */
  readonly id: string;
  /** The locale (`impl.locale`): the long-pause rewind applies only to `en…` (reader.js 40206). */
  readonly lang: string;
  /** The catalog's own pause between sentences, in ms (`impl.sentenceDelay ?? 0`, reader.js 40473-40475). */
  readonly sentenceDelay: number;
}

/** What a fetch answers: audio with its word timings, or one of Zotero's three error words (or a Zotero voice's own, passed through). */
export type FetchResult<Audio = unknown> =
  | { audio: Audio; timestamps?: ArrayLike<WordTiming> | null; error?: undefined }
  | { audio?: null; timestamps?: undefined; error?: string | null };

/** The events Read Aloud's manager listens for on its controller (reader.js 82675-82711). */
export type EngineEventType =
  | 'BufferingChange'
  | 'ActiveSegmentChanging'
  | 'ActiveSegmentChange'
  | 'ActiveWordChange'
  | 'Complete'
  | 'Error'
  | 'ErrorCleared';

/** Timers and the wall clock (performance.now), injected so the tests run on virtual time. */
export interface EngineClock {
  /** Milliseconds, monotonic. */
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** One started source. */
export interface PlayingSource {
  /** Stop at once; its end is not reported. */
  stop(): void;
  /** Stop at context time `when` and call `onStopped` then, instead of reporting an end (a handoff's word boundary). */
  stopAt(when: number, onStopped: () => void): void;
  /** Undo `stopAt`: play on and report the end again; `when` is a stop time past the natural end. */
  restoreEnd(when: number): void;
}

/** A decoded clip: all the core reads of it is its length. */
export interface EngineClip {
  /** Seconds of the provider's audio, unstretched. */
  readonly duration: number;
}

/**
 * The audio output of one reader tab: one AudioContext through the copied
 * chain (speech-chain.ts), the time-stretch (time-stretch.ts), and the
 * sources playing into them. The core decides what plays when; this plays.
 */
export interface EngineAudio<Clip extends EngineClip = EngineClip> {
  /** Decode fetched audio; rejects when it will not decode. */
  decode(audio: unknown): Promise<Clip>;
  /**
   * Stretch `clip` to `rate` and start it `offset` seconds into the
   * unstretched audio, now (reader.js 40019-40037). `onEnded` fires when it
   * plays out, never after `stop()`. `startedAt` is the context time read
   * once the stretch is done, as Read Aloud's engine reads it.
   */
  start(clip: Clip, offset: number, rate: number, onEnded: () => void): { source: PlayingSource; startedAt: number };
  /** The context's clock, in seconds. */
  now(): number;
  /** Seconds between the context's clock and the sound reaching the listener. */
  latency(): number;
  /** Whether the output runs: a suspended context plays nothing. */
  running(): boolean;
  /** Ask the output to run (a context made without user activation starts suspended). */
  resume(): void;
  /** Throw the context away and build a new one with the same chain: the output device went away (reader.js 39964-39993). */
  rebuild(): void;
  /** Read Aloud's own word-onset search on the clip (word-onset.ts). */
  wordOnset(clip: Clip, position: number, wordBoundaries: number): number;
}
