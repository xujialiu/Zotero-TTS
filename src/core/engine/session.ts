/**
 * One reader tab's reading, played by the Engine (issue #133, ADR 0005).
 *
 * Read Aloud's manager asks the selected voice for a controller and talks
 * only to what comes back (reader.js 82653-82718). The Engine answers every
 * such request of a tab with a controller bound to this session, so the
 * session outlives the manager's rebuilds: a voice list that lands on the
 * voice already playing, or a handoff's switch, rebuilds the controller
 * (#75, #95) and the sentence carries on. A rebuild the manager was told to
 * make somewhere — a jump, new segments, another voice — starts afresh, as
 * a new controller of Read Aloud's does.
 *
 * Everything else is Read Aloud's engine, `RemoteReadAloudController` and
 * its bases (reader.js 39296-39512, 39906-40403), line for line where the
 * manager can tell the difference: the order and timing of every event, the
 * position after each, what a skip, a pause, the end of the document or an
 * error does. The departures settled on 2026-09-23:
 *
 * - The word comes from the audio clock (words.ts), not from a timer per
 *   word armed at the start.
 * - A paused offset is used only by the resume of that pause. Read Aloud's
 *   engine never resets `_indexAtPause` or its offset (40147, 40163-40166,
 *   39318), so a later return to a sentence once paused on starts midway,
 *   or past its end and so not at all.
 * - A failed read-ahead is asked for once more when playback reaches it;
 *   only the fetch playback waits on can fail the segment (clips.ts).
 * - A clip that will not decode fails as `unknown`, so the error shows and
 *   Retry works (clips.ts, issue #42).
 * - The 600 ms skip debounce dies with the session (40222 against
 *   40397-40402): a skip, then Stop, no longer fetches and bills the target.
 * - The output is asked to run on Play (39931-39962): a reading started
 *   without a click or key press in the reader no longer plays silently.
 *
 * And what the plugin adds: the pause between sentences of the pane's
 * settings (gap.ts, issues #44 and #142), and the "Preparing…" notice after 300 ms of
 * waiting for audio (issue #120).
 */

import { ClipError, ClipStore } from './clips';
import { gapBefore, type PauseSettings } from './gap';
import { Handoff, type HandoffOptions } from './handoff';
import { readAheadOrder, runReadAhead } from './read-ahead';
import { skipAheadTarget, skipBackTarget } from './skip';
import type {
  EngineAudio,
  EngineClip,
  EngineClock,
  EngineEventType,
  EngineSegment,
  EngineVoice,
  FetchResult,
  PlayingSource,
  WordTiming,
} from './types';
import { untilNextWord, wordAt, wordAtPosition } from './words';

/** Read Aloud's wait after a skip before the target is fetched (reader.js 39904). */
export const SKIP_DEBOUNCE_MS = 600;
/** How long a device-change probe waits for the clock to move (reader.js 39905). */
export const STALL_PROBE_MS = 400;
/** How long playback waits for audio before "Preparing…" shows (issue #120). */
export const PREPARING_AFTER_MS = 300;
/** Retry a just-early boundary without adding another 15 ms (issue #144). */
export const WORD_TICK_MIN_MS = 1;
/** A frozen audio clock backs off to the previous polling floor. */
const WORD_TICK_STALLED_MS = 15;

export type PlaybackNotice = 'idle' | 'preparing' | 'failed';

export interface SessionDeps<Clip extends EngineClip> {
  clock: EngineClock;
  audio: EngineAudio<Clip>;
  fetch(segment: EngineSegment, voice: EngineVoice, signal?: unknown): Promise<FetchResult>;
  /** A fetched answer whose audio would not decode: drop it wherever it is kept (clips.ts). */
  discard?(segment: EngineSegment, voice: EngineVoice): void;
  /** The pane's pause settings, read at every sentence boundary. */
  pauses(): PauseSettings;
  /** The events Read Aloud's manager listens for. */
  emit(type: EngineEventType, segment: EngineSegment | null): void;
  /** The playback notice: "Preparing…" while audio is late, "failed" on an error, idle otherwise. */
  notice?(kind: PlaybackNotice): void;
  /** A failure worth a line in the error console: why a segment has no audio. */
  log?(e: unknown): void;
  debug?(message: string): void;
}

/** What the manager asked for when it built a controller (`getController`, reader.js 82664). */
export interface BindRequest {
  voice: EngineVoice;
  segments: ArrayLike<EngineSegment>;
  backwardStopIndex: number | null;
  forwardStopIndex: number | null;
  /** The manager was told where to start (`repositionTo`): never a carry-on. */
  jump?: boolean;
}

/** Where a pause left a clip: the only resume that may use it (a departure, see above). */
interface ResumePoint {
  index: number;
  offset: number;
  at: number;
}

export class EngineSession<Clip extends EngineClip = EngineClip> {
  // The run
  voice: EngineVoice | null = null;
  segments: ArrayLike<EngineSegment> | null = null;
  store: ClipStore<Clip> | null = null;
  position = 0;
  backwardStopIndex: number | null = null;
  forwardStopIndex: number | null = null;

  // ReadAloudController (reader.js 39298-39312)
  paused = false;
  speed = 1;
  error: string | null = null;
  buffering = false;
  lastSkipGranularity: string | null = null;
  activeTimestampIndex: number | null = null;
  private gapTimer: unknown = null;
  private skipTimer: unknown = null;

  // RemoteReadAloudControllerBase (reader.js 39907-39930)
  private source: PlayingSource | null = null;
  clip: Clip | null = null;
  isPlaying = false;
  private startedAt = 0;
  private playbackOffset = 0;
  private playbackRate = 1;
  timings: ArrayLike<WordTiming> | null = null;
  /** A voice being prepared to take the reading over (handoff.ts). */
  handoff: Handoff<Clip> | null = null;
  private wordTimer: unknown = null;
  private lastWord: number | null = null;
  private lastWordElapsed: number | null = null;
  private wordRetryMs = WORD_TICK_MIN_MS;
  /** Mechanism evidence for issue #144; counts last for the reading session. */
  readonly wordClock = { ticks: 0, shortWaits: 0, backoffs: 0, lastWaitMs: 0 };

  // RemoteReadAloudController (reader.js 40146-40154)
  currentIndex: number | null = null;
  private resumePoint: ResumePoint | null = null;
  private readonly failed = new Set<number>();

  /** Bumped at every fresh start and at the end: an answer for an older run is dropped. */
  private generation = 0;
  /** No controller holds the session: the manager destroyed the last one and asked for no other. */
  ended = true;
  /** Set by a carry-on bind: the manager's first `paused` write only restates what plays. */
  private carriedOn = false;

  /** The last pause between sentences waited, and how many: what proves the pane's settings reached the gap (issue #44). */
  lastGap: { ms: number; paragraph: boolean; speed: number; at: number } | null = null;
  gaps = 0;
  /** The playback notice's counts (issue #120): waits begun, "Preparing…" shown, waits ended by a source starting, failures shown. */
  readonly noticeCounts = { waits: 0, shown: 0, starts: 0, failed: 0 };

  // The playback notice (issue #120)
  private waiting = false;
  private preparingShown = false;
  private failedShown = false;
  private noticeTimer: unknown = null;

  constructor(private readonly deps: SessionDeps<Clip>) {}

  // ---- Binding ------------------------------------------------------------

  /**
   * A controller was asked for: carry on when it is the same voice over the
   * same segments and nobody said where to start, else start afresh where
   * the manager says. Answers which it did.
   */
  bind(request: BindRequest): 'carried-on' | 'started' {
    if (
      !this.ended &&
      !request.jump &&
      this.voice !== null &&
      this.segments === request.segments &&
      this.voice.id === request.voice.id
    ) {
      // A carry-on keeps the run's own start for the end-of-document rewind
      this.voice = request.voice;
      this.carriedOn = true;
      return 'carried-on';
    }
    this.start(request);
    return 'started';
  }

  private start(request: BindRequest): void {
    this.handoff?.cancel();
    this.generation++;
    this.clearGap();
    this.cancelSkip();
    this.stopSource();
    this.store?.close();
    this.settleNotice();
    this.voice = request.voice;
    this.segments = request.segments;
    this.store = new ClipStore<Clip>({
      segments: request.segments,
      voice: request.voice,
      clock: this.deps.clock,
      fetch: this.deps.fetch,
      decode: (audio) => this.deps.audio.decode(audio),
      discard: this.deps.discard,
    });
    // A new controller of Read Aloud's (reader.js 39396-39404)
    this.position = request.backwardStopIndex ?? 0;
    this.backwardStopIndex = request.backwardStopIndex;
    this.forwardStopIndex = request.forwardStopIndex;
    this.paused = false;
    this.error = null;
    this.buffering = false;
    this.lastSkipGranularity = null;
    this.activeTimestampIndex = null;
    this.clip = null;
    this.isPlaying = false;
    this.playbackOffset = 0;
    this.playbackRate = 1;
    this.timings = null;
    this.currentIndex = null;
    this.resumePoint = null;
    this.failed.clear();
    this.carriedOn = false;
    this.ended = false;
  }

  /** The manager destroyed its controller and asked for no other: stop everything, fetch nothing more. */
  end(): void {
    this.handoff?.cancel();
    this.generation++;
    this.ended = true;
    this.carriedOn = false;
    this.clearGap();
    this.cancelSkip();
    this.stopSource();
    this.store?.close();
    this.store = null;
    this.setBufferingQuietly(false);
    this.settleNotice();
  }

  // ---- The controller's members ---------------------------------------------

  /** `paused = …` (reader.js 39316-39323). */
  setPaused(paused: boolean): void {
    if (this.carriedOn) {
      this.carriedOn = false;
      if (paused === this.paused) return;
    }
    if (this.ended) return;
    if (paused) {
      const now = this.deps.clock.now();
      if (this.isPlaying && this.clip && this.currentIndex !== null) {
        this.resumePoint = { index: this.currentIndex, offset: this.currentPlaybackTime(), at: now };
      } else if (this.resumePoint) {
        // Every pause restarts Read Aloud's pause clock, a repeated one too (`_pausedAt`, reader.js 39317-39319)
        this.resumePoint.at = now;
      }
    }
    this.paused = paused;
    this.clearGap();
    this.speak();
  }

  /** `speed = …` (reader.js 39327-39330, 40051-40058): a clip playing is re-stretched where it is. */
  setSpeed(speed: number): void {
    this.handoff?.cancel();
    this.speed = speed;
    if (this.ended) return;
    if (this.isPlaying && this.clip) {
      const offset = this.currentPlaybackTime();
      const timings = this.timings;
      this.stopSource();
      this.playClip(this.clip, offset, this.speed, timings);
    }
  }

  skipBack(granularity: string = 'paragraph', accelerate = false): void {
    if (this.ended || !this.segments) return;
    this.lastSkipGranularity = granularity;
    this.skipTo(skipBackTarget(this.segments, this.position, granularity, accelerate));
  }

  skipAhead(granularity: string = 'paragraph', accelerate = false): void {
    if (this.ended || !this.segments) return;
    this.lastSkipGranularity = granularity;
    this.skipTo(skipAheadTarget(this.segments, this.position, granularity, accelerate));
  }

  /** `retry()` (reader.js 40247-40257): only a segment that failed is asked for again. */
  retry(): void {
    if (this.ended) return;
    const index = this.position;
    if (!this.failed.has(index)) return;
    this.failed.delete(index);
    this.error = null;
    this.deps.emit('ErrorCleared', this.currentSegment);
    this.paused = false;
    this.speak();
  }

  /** The word timings of a segment's clip, if it has any (reader.js 40381-40385). */
  getTimestampsForSegment(segment: unknown): ArrayLike<WordTiming> | null {
    const index = this.indexOf(segment);
    if (index < 0 || !this.store) return null;
    return this.store.timings.get(index) ?? null;
  }

  /** The segment an annotation made now belongs to: the previous one while under half and under 3 s into this one (reader.js 39386-39395). */
  getSegmentToAnnotate(): EngineSegment | null {
    if (!this.segments) return null;
    const seconds = this.currentPlaybackTime();
    const fraction = this.clip ? seconds / this.clip.duration : 0;
    if (fraction < 0.5 && seconds < 3) {
      const previous = this.position - 1;
      if (previous >= 0) return this.segments[previous];
    }
    return this.currentSegment;
  }

  /** The word playing now, at once, when the highlight switches to Word (reader.js 40122-40137). */
  syncActiveWordToPlayback(): void {
    const timings = this.timings;
    if (!timings?.length || !this.isPlaying) return;
    const index = wordAtPosition(timings, this.heardPosition());
    if (index === null || this.activeTimestampIndex === index) return;
    this.activeTimestampIndex = index;
    this.lastWord = index;
    this.deps.emit('ActiveWordChange', this.currentSegment);
  }

  /**
   * After a carry-on the manager has dropped the word it highlighted
   * (`_destroyController`, reader.js 82726): say it again, once the new
   * controller's listeners are in place.
   */
  restateWord(): void {
    if (this.ended || this.activeTimestampIndex === null || !this.isPlaying) return;
    this.deps.emit('ActiveWordChange', this.currentSegment);
  }

  get currentSegment(): EngineSegment | null {
    return this.segments?.[this.position] ?? null;
  }

  /**
   * The texts of the segments after the one whose text is `text`, for the
   * plugin's own read-ahead of its voices' audio (remote-interface.ts
   * `prefetchAfter`): at most `count`, in reading order, looked for from the
   * segment playing so a sentence repeated earlier cannot pull the window
   * back, and without the empty ones and those `skip` refuses.
   */
  upcomingTexts(text: string, count: number, skip: (segment: EngineSegment) => boolean): string[] {
    const segments = this.segments;
    const length = !this.ended && segments ? segments.length : 0;
    if (!length) return [];
    const playing = this.currentIndex ?? this.position;
    const from = playing >= 0 && playing < length ? playing : 0;
    let at = -1;
    for (let i = from; i < length; i++) {
      if (segments![i]?.text === text) {
        at = i;
        break;
      }
    }
    if (at === -1) return [];
    const out: string[] = [];
    for (let i = at + 1; i < length && out.length < count; i++) {
      const segment = segments![i];
      const t = segment?.text;
      if (typeof t === 'string' && t && !skip(segment)) out.push(t);
    }
    return out;
  }

  // ---- The handoff ----------------------------------------------------------

  /** Prepare `options.target` to take the reading over (handoff.ts); a switch already pending is called off. */
  prepareHandoff(options: HandoffOptions): Handoff<Clip> | null {
    if (this.ended || !this.voice || !this.segments) return null;
    this.handoff?.cancel();
    const handoff = new Handoff<Clip>(this, this.deps, options);
    this.handoff = handoff;
    handoff.begin();
    return handoff;
  }

  /**
   * The handoff's new voice takes the reading: its clips become the
   * session's, and segment `index` plays from `offset` of the new voice's
   * clip — now, or on Play when paused — through the same start as any
   * other segment, so the manager hears what a new controller of Read
   * Aloud's would tell it.
   */
  takeOver(voice: EngineVoice, store: ClipStore<Clip>, index: number, offset: number): void {
    const old = this.store;
    this.voice = voice;
    this.store = store;
    if (old && old !== store) old.close();
    // A new controller of Read Aloud's knows no failures of the old voice
    this.failed.clear();
    this.stopSource();
    this.resumePoint = { index, offset, at: this.deps.clock.now() };
    if (!this.paused) this.speakInternal();
  }

  /** The source playing now, which a handoff's cut is armed on. */
  get playingSource(): PlayingSource | null {
    return this.source;
  }

  /** Where the clip playing started on the audio clock, from where in it, at what rate (reader.js 39913-39922). */
  get clipStartedAt(): number {
    return this.startedAt;
  }

  get clipOffset(): number {
    return this.playbackOffset;
  }

  get clipRate(): number {
    return this.playbackRate;
  }

  /** Stop the clip playing at context time `when` and call `onCut` then, instead of its end; answers the source armed, or null. */
  cutAt(when: number, onCut: () => void): PlayingSource | null {
    const source = this.source;
    if (!source || !this.isPlaying) return null;
    source.stopAt(when, () => {
      if (this.source === source) onCut();
    });
    return source;
  }

  /** Take a cut back: the clip plays to its end, reported as ever. */
  uncut(armed: unknown): void {
    if (!this.source || armed !== this.source || !this.clip) return;
    const remaining = Math.max(0, this.clip.duration - this.currentPlaybackTime()) / this.playbackRate;
    this.source.restoreEnd(this.deps.audio.now() + remaining + 1);
  }

  /** Play the current clip on from `offset`: a cut whose switch was called off at the last moment. */
  continueFrom(offset: number): void {
    if (this.ended || this.paused || !this.clip) return;
    this.playClip(this.clip, offset, this.speed, this.timings);
  }

  // ---- Speaking -------------------------------------------------------------

  private speak(cause?: 'skip'): void {
    if (cause === 'skip') {
      // Read Aloud's lodash debounce: the target is fetched 600 ms after the last skip
      this.cancelSkip();
      this.skipTimer = this.deps.clock.setTimeout(() => {
        this.skipTimer = null;
        this.speakInternal();
      }, SKIP_DEBOUNCE_MS);
      return;
    }
    this.speakInternal();
  }

  /** `_speakInternal` (reader.js 40162-40221). */
  private speakInternal(): void {
    if (this.ended || !this.segments || !this.store) return;
    if (this.paused) {
      this.stop();
      this.settleNotice();
      return;
    }
    const index = this.position;
    const segment = this.segments[index];
    if (!segment) return;
    // A voice being prepared takes the next sentence it has audio for
    if (this.handoff?.sentenceStart(index)) return;
    const generation = this.generation;
    const store = this.store;
    const handleError = (): void => {
      if (generation !== this.generation || this.position !== index) return;
      this.setBuffering(false);
      this.segmentStart(segment, index);
      this.deps.emit('Error', segment);
      this.showFailed();
    };
    if (this.failed.has(index)) {
      handleError();
      return;
    }
    // A context made without user activation starts suspended; Read Aloud's never resumed it
    if (!this.deps.audio.running()) this.deps.audio.resume();
    this.setBuffering(true);
    this.waitForAudio();
    store.get(index).then(
      (clip) => {
        if (generation !== this.generation || this.position !== index) return;
        this.setBuffering(false);
        if (this.ended || this.paused) return;
        this.currentIndex = index;
        this.segmentStart(segment, index);
        const offset = this.resumeOffset(index, clip);
        try {
          this.playClip(clip, offset, this.speed, store.timings.get(index) ?? null);
        } catch (e) {
          this.deps.log?.(e);
          this.failPlayback(index, 'unknown');
          handleError();
          return;
        }
        this.readAheadFrom(index + 1);
      },
      (e: unknown) => {
        if (generation !== this.generation || this.position !== index) return;
        if (!(e instanceof ClipError && e.stage === 'closed')) this.deps.log?.(e);
        this.failPlayback(index, e instanceof ClipError ? e.code : 'unknown');
        handleError();
      },
    );
  }

  /** Where a clip starts: 0, or the pause this start resumes (reader.js 40200-40216). */
  private resumeOffset(index: number, clip: Clip): number {
    const resume = this.resumePoint;
    this.resumePoint = null;
    if (!resume || resume.index !== index) return 0;
    const pausedFor = (this.deps.clock.now() - resume.at) / 1000;
    // Short pause (under 5 seconds): resume from exact position
    if (pausedFor < 5) return resume.offset;
    // Medium pause (5-20 seconds): jump back one word boundary; long (20+): two
    if (this.voice?.lang.startsWith('en')) {
      return this.deps.audio.wordOnset(clip, resume.offset, pausedFor >= 20 ? 2 : 1);
    }
    return resume.offset;
  }

  private failPlayback(index: number, code: string): void {
    this.error = code;
    this.failed.add(index);
  }

  /** `_handleSegmentStart` (reader.js 39480-39483). */
  private segmentStart(segment: EngineSegment, index: number): void {
    this.position = index;
    this.deps.emit('ActiveSegmentChange', segment);
  }

  /** `_handleSegmentEnd` (reader.js 39484-39511). */
  private segmentEnd(segment: EngineSegment, index: number): void {
    if (this.paused || !this.segments) return;
    this.lastSkipGranularity = null;
    this.deps.emit('ActiveSegmentChanging', null);
    this.deps.emit('ActiveSegmentChange', null);
    if (this.position !== index) return;
    const last = this.segments.length - 1;
    if (this.forwardStopIndex !== null && this.position === this.forwardStopIndex - 1) {
      this.position = Math.min(this.position + 1, last);
      this.forwardStopIndex = null;
      this.deps.emit('ActiveSegmentChanging', this.currentSegment);
      this.deps.emit('ActiveSegmentChange', this.currentSegment);
      this.deps.emit('Complete', null);
    } else if (this.position === last) {
      this.position = this.backwardStopIndex ?? 0;
      this.deps.emit('Complete', null);
    } else {
      this.position++;
      let gap: number;
      try {
        gap = gapBefore(this.currentSegment, this.speed, this.deps.pauses());
      } catch (e) {
        // A broken setting must not stall the reading: the voice's own delay, as Read Aloud waits
        this.deps.log?.(e);
        gap = Math.max(0, this.voice?.sentenceDelay ?? 0) + (this.currentSegment?.anchor === 'paragraphStart' ? 200 : 0);
      }
      this.lastGap = { ms: gap, paragraph: this.currentSegment?.anchor === 'paragraphStart', speed: this.speed, at: this.deps.clock.now() };
      this.gaps++;
      this.scheduleSpeak(gap);
    }
  }

  private scheduleSpeak(delay: number): void {
    this.settleNotice();
    this.gapTimer = this.deps.clock.setTimeout(() => {
      this.gapTimer = null;
      this.speak();
    }, delay);
  }

  /** `_skipTo` (reader.js 39460-39469). */
  private skipTo(position: number): void {
    this.handoff?.cancel();
    this.clearGap();
    this.position = position;
    this.stop();
    this.deps.emit('ActiveSegmentChanging', this.currentSegment);
    if (!this.paused) this.waitForAudio();
    this.speak('skip');
    if (this.paused) this.deps.emit('ActiveSegmentChange', this.currentSegment);
  }

  /** Fetch ahead after a clip starts (reader.js 40258-40328). */
  private readAheadFrom(startIndex: number): void {
    const store = this.store;
    if (!store || !this.segments) return;
    const generation = this.generation;
    const order = readAheadOrder({
      segments: this.segments,
      startIndex,
      playingIndex: this.currentIndex ?? this.position,
      remaining: Math.max(0, (this.clip?.duration ?? 0) - this.currentPlaybackTime()),
      speed: this.speed,
      forwardStopIndex: this.forwardStopIndex,
      timer: store.timer,
    });
    runReadAhead(order, (index) => store.get(index), () => generation !== this.generation || store.closed);
  }

  // ---- Playing a clip -------------------------------------------------------

  /** `_playAudioBuffer` (reader.js 40019-40050). */
  private playClip(clip: Clip, offset: number, rate: number, timings: ArrayLike<WordTiming> | null): void {
    this.stopSource();
    this.clip = clip;
    this.playbackOffset = offset;
    this.playbackRate = rate;
    this.timings = timings;
    let source: PlayingSource | null = null;
    const started = this.deps.audio.start(clip, offset, rate, () => {
      if (this.source !== source) return;
      this.isPlaying = false;
      this.clearWordClock();
      const segment = this.currentSegment;
      if (segment) this.segmentEnd(segment, this.position);
    });
    source = started.source;
    this.source = source;
    this.startedAt = started.startedAt;
    this.isPlaying = true;
    this.outputStarted();
    if (timings?.length) this.startWordClock();
  }

  /** `_stop` (reader.js 40059-40064). */
  private stop(): void {
    if (this.isPlaying) this.playbackOffset = this.currentPlaybackTime();
    this.stopSource();
  }

  /** `_stopSource` (reader.js 40065-40078). */
  private stopSource(): void {
    if (this.source) {
      const source = this.source;
      this.source = null;
      try {
        source.stop();
      } catch (e) {
        this.deps.log?.(e);
      }
    }
    this.isPlaying = false;
    this.clearWordClock();
  }

  /**
   * Where playback is in the unstretched clip, by the audio clock
   * (`_currentPlaybackTime`, reader.js 39998-40004): the stretched clip plays
   * at 1×, so the time since its start times the rate.
   */
  currentPlaybackTime(): number {
    if (!this.isPlaying || !this.clip) return this.playbackOffset;
    const elapsed = (this.deps.audio.now() - this.startedAt) * this.playbackRate;
    return Math.min(this.playbackOffset + elapsed, this.clip.duration);
  }

  /** What the listener hears now: the same, less the output latency. */
  private heardPosition(): number {
    if (!this.isPlaying || !this.clip) return this.playbackOffset;
    return this.playbackOffset + this.heardElapsed();
  }

  /** Seconds of unstretched audio heard since the clip started; negative before its first sound arrives. */
  private heardElapsed(): number {
    return (this.deps.audio.now() - this.startedAt - this.deps.audio.latency()) * this.playbackRate;
  }

  // ---- The word, off the audio clock ---------------------------------------

  private startWordClock(): void {
    this.lastWord = null;
    this.clearWordClock();
    this.lastWordElapsed = null;
    this.wordRetryMs = WORD_TICK_MIN_MS;
    // Read Aloud's first word timers fire from a setTimeout too (reader.js 40094)
    this.wordTimer = this.deps.clock.setTimeout(() => this.wordTick(), 0);
  }

  private wordTick(): void {
    this.wordTimer = null;
    const timings = this.timings;
    if (this.ended || !this.isPlaying || !timings?.length) return;
    const elapsed = this.heardElapsed();
    this.wordClock.ticks++;
    // Quantization can repeat a read even while sound plays. Back off
    // gradually, and reset as soon as audio time advances; never spin on
    // a suspended output just before a boundary.
    this.wordRetryMs = elapsed === this.lastWordElapsed
      ? Math.min(WORD_TICK_STALLED_MS, this.wordRetryMs * 2)
      : WORD_TICK_MIN_MS;
    this.lastWordElapsed = elapsed;
    const index = wordAt(timings, this.playbackOffset, elapsed);
    if (index !== null && index !== this.lastWord) {
      this.lastWord = index;
      this.activeTimestampIndex = index;
      this.deps.emit('ActiveWordChange', this.currentSegment);
    }
    const next = untilNextWord(timings, this.playbackOffset, elapsed);
    if (next === null) return;
    const ms = Math.max(this.wordRetryMs, (next / this.playbackRate) * 1000);
    if (ms < WORD_TICK_STALLED_MS) this.wordClock.shortWaits++;
    if (this.wordRetryMs > WORD_TICK_MIN_MS) this.wordClock.backoffs++;
    this.wordClock.lastWaitMs = ms;
    this.wordTimer = this.deps.clock.setTimeout(() => this.wordTick(), ms);
  }

  private clearWordClock(): void {
    if (this.wordTimer !== null) {
      this.deps.clock.clearTimeout(this.wordTimer);
      this.wordTimer = null;
    }
  }

  // ---- The output device ----------------------------------------------------

  /**
   * An audio device came or went. Gecko on Windows leaves a context on a
   * removed output silent: if the clock has not moved 400 ms later, the
   * output is rebuilt and the clip replays from where it stopped
   * (reader.js 39964-39993).
   */
  deviceChanged(): void {
    if (this.ended || !this.isPlaying || !this.clip) return;
    const source = this.source;
    const sampled = this.deps.audio.now();
    this.deps.clock.setTimeout(() => {
      if (this.ended || this.source !== source || !this.isPlaying || !this.clip) return;
      if (this.deps.audio.now() > sampled) return;
      const clip = this.clip;
      const offset = this.currentPlaybackTime();
      const rate = this.playbackRate;
      const timings = this.timings;
      this.stopSource();
      this.deps.audio.rebuild();
      this.playClip(clip, offset, rate, timings);
    }, STALL_PROBE_MS);
  }

  /** The output started or stopped running: a source already started is now heard. */
  outputChanged(): void {
    if (this.isPlaying && this.waiting) this.outputStarted();
  }

  // ---- Buffering and the notice ---------------------------------------------

  private setBuffering(buffering: boolean): void {
    if (this.buffering === buffering) return;
    this.buffering = buffering;
    this.deps.emit('BufferingChange', this.currentSegment);
  }

  private setBufferingQuietly(buffering: boolean): void {
    this.buffering = buffering;
  }

  /** Playback wants audio it does not have yet: "Preparing…" if that lasts 300 ms. */
  private waitForAudio(): void {
    if (this.paused || this.waiting) return;
    if (this.failedShown) {
      this.failedShown = false;
      this.deps.notice?.('idle');
    }
    this.waiting = true;
    this.noticeCounts.waits++;
    this.noticeTimer = this.deps.clock.setTimeout(() => {
      this.noticeTimer = null;
      if (!this.waiting || this.paused || this.ended) return;
      this.preparingShown = true;
      this.noticeCounts.shown++;
      this.deps.notice?.('preparing');
    }, PREPARING_AFTER_MS);
  }

  /** A source started: the wait is over once the output runs (issue #120). */
  private outputStarted(): void {
    if (!this.waiting) return;
    if (!this.deps.audio.running()) return;
    this.noticeCounts.starts++;
    this.settleNotice();
  }

  private settleNotice(): void {
    if (this.noticeTimer !== null) {
      this.deps.clock.clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
    this.waiting = false;
    if (this.preparingShown || this.failedShown) {
      this.preparingShown = false;
      this.failedShown = false;
      this.deps.notice?.('idle');
    }
  }

  private showFailed(): void {
    this.settleNotice();
    this.failedShown = true;
    this.noticeCounts.failed++;
    this.deps.notice?.('failed');
  }

  // ---- Small things ----------------------------------------------------------

  private clearGap(): void {
    if (this.gapTimer !== null) {
      this.deps.clock.clearTimeout(this.gapTimer);
      this.gapTimer = null;
    }
  }

  private cancelSkip(): void {
    if (this.skipTimer !== null) {
      this.deps.clock.clearTimeout(this.skipTimer);
      this.skipTimer = null;
    }
  }

  /** A segment's index in the run, by identity, walked by index (types.ts). */
  indexOf(segment: unknown): number {
    const segments = this.segments;
    if (!segments || !segment) return -1;
    for (let i = 0; i < segments.length; i++) if (segments[i] === segment) return i;
    return -1;
  }

  /** Whether a gap between sentences is running. */
  get inGap(): boolean {
    return this.gapTimer !== null;
  }

  /** Whether a skip is waiting out its debounce. */
  get skipPending(): boolean {
    return this.skipTimer !== null;
  }
}
