/**
 * The Handoff: the reading passing from one voice to another without
 * stopping (issues #95, #108), inside the Engine (issue #133).
 *
 * A voice picked while a document is read is prepared in the background
 * while the old voice goes on: its audio for the sentence being read, then
 * up to eight sentences ahead when it is late. The new voice takes over at
 * the first word boundary both voices time at least 40 ms ahead (the
 * word-boundary matcher of core/voice-switch.ts), cut on the audio clock;
 * failing that, at the start of the next sentence it has audio for. Picks
 * in quick succession coalesce for 120 ms before anything is requested. A
 * request may take 60 s and the whole switch 120 s (the clock stops while
 * paused), then the switch fails and the old voice reads on. A skip, a speed
 * change, a jump or Stop calls it off.
 *
 * Paused, the preparation is silent; on Play the new voice starts at the
 * paused word when that word is identified exactly in both voices' timings,
 * else the old voice resumes and hands over later.
 *
 * Until now this was a second controller of Read Aloud's, built behind the
 * manager's back and made to play by moving sixteen of its private fields
 * (read-aloud/voice-switch.ts). Here the new voice's clips are a second
 * ClipStore of the session, and taking over is the session swapping its
 * voice and clips; the manager is then told of the new voice through its
 * own selection (`commit`), and its rebuild of the controller carries on
 * (session.ts `bind`).
 */

import { inspectWordHandoff, pausedWordHandoff, type WordBoundary } from '../voice-switch';
import { ClipStore } from './clips';
import type { SessionDeps } from './session';
import type { EngineSession } from './session';
import type { EngineClip, EngineSegment, EngineVoice } from './types';

export type VoiceNotice = 'preparing' | 'ready' | 'cancelled' | 'selected' | 'failed' | 'unavailable';

/** Picks within this long of each other are one switch. */
export const HANDOFF_COALESCE_MS = 120;
/** How often the preparation looks at where playback is. */
export const HANDOFF_POLL_MS = 25;
/** One request of the new voice's audio. */
export const HANDOFF_REQUEST_MS = 60_000;
/** The whole switch, while not paused. */
export const HANDOFF_SWITCH_MS = 120_000;
/** A word boundary must lie at least this far ahead on the audio clock, in seconds. */
export const HANDOFF_LEAD_SECONDS = 0.04;
/** How many sentences ahead the new voice is prepared when it cannot catch the current one. */
export const HANDOFF_AHEAD = 8;
/** How long a suspended output may take to run again. */
export const OUTPUT_OPEN_MS = 3000;

export interface HandoffBoundary {
  kind: 'word' | 'sentence';
  index: number;
  offset: number;
  charStart: number;
  from: string;
  to: string;
}

export interface AudioReady {
  index: number;
  elapsedMs: number;
  playingIndex: number;
  progress: number;
  oldTimings: number;
  newTimings: number;
}

/** What `diagnostics.voiceSwitch()` reports of a reader's switches. */
export interface HandoffReport {
  pending: string | null;
  stage: string;
  prepared: number[];
  last: HandoffBoundary | null;
  wordDecision: string | null;
  audioReady: AudioReady[];
}

export interface HandoffOptions {
  target: EngineVoice;
  /**
   * The manager's own selection of the new voice, made once the new voice
   * has the reading; false when the manager did not take it (its rebuild
   * left no controller of the Engine's).
   */
  commit(): boolean | void;
  /** What else calls the switch off: the manager's voice or voice list moved under it. */
  valid?(): boolean;
  notice(kind: VoiceNotice): void;
  /** Aborts the preparation's requests when the switch is called off. */
  abort?: { signal: unknown; abort(): void } | null;
  /** Written as the switch goes, for the diagnostics. */
  report: HandoffReport;
}

export class Handoff<Clip extends EngineClip> {
  readonly ready = new Set<number>();
  readonly store: ClipStore<Clip>;
  private readonly segments: ArrayLike<EngineSegment>;
  private readonly originalVoice: string;
  private readonly rate: number;
  private readonly started: number;
  private deadline: number;
  private loading = false;
  private loadedFirst = false;
  private missed = 0;
  private sentenceOnlyIndex: number | null = null;
  private noticeReady = false;
  private resumePending = false;
  private timer: unknown = null;
  private armed: unknown = null;
  private done = false;

  constructor(
    private readonly session: EngineSession<Clip>,
    private readonly deps: SessionDeps<Clip>,
    private readonly options: HandoffOptions,
  ) {
    this.segments = session.segments!;
    this.originalVoice = session.voice!.id;
    this.rate = session.speed;
    this.started = deps.clock.now();
    this.deadline = this.started + HANDOFF_SWITCH_MS;
    this.store = new ClipStore<Clip>({
      segments: this.segments,
      voice: options.target,
      clock: deps.clock,
      fetch: deps.fetch,
      decode: (audio) => deps.audio.decode(audio),
      discard: deps.discard,
      signal: options.abort?.signal,
    });
  }

  get target(): EngineVoice {
    return this.options.target;
  }

  get pending(): boolean {
    return !this.done;
  }

  /** The voices the switch is between, which the reading guard must not take away (issue #121). */
  get voices(): string[] {
    return [this.originalVoice, this.options.target.id];
  }

  begin(): void {
    this.options.notice('preparing');
    // A quick run of key presses is one switch: nothing is requested before this
    this.timer = this.deps.clock.setTimeout(() => this.poll(), HANDOFF_COALESCE_MS);
  }

  /** The same voice picked again: the preparation goes on, with the newest selection. */
  retarget(commit: () => void): void {
    this.options.commit = commit;
  }

  valid(): boolean {
    const s = this.session;
    if (this.done || s.handoff !== this || s.ended || s.segments !== this.segments) return false;
    if (s.voice?.id !== this.originalVoice || s.speed !== this.rate) return false;
    try {
      return this.options.valid?.() ?? true;
    } catch (e) {
      this.deps.log?.(e);
      return false;
    }
  }

  // ---- Preparing ------------------------------------------------------------

  private poll(): void {
    this.timer = null;
    try {
      if (!this.valid()) {
        this.cancel();
        return;
      }
      this.updatePausedNotice();
      const now = this.deps.clock.now();
      if (this.session.paused) this.deadline = now + HANDOFF_SWITCH_MS;
      if (now > this.deadline) {
        this.fail(new Error('Zotero-TTS: no prepared handoff boundary was reached'));
        return;
      }
      if (!this.loadedFirst) {
        this.loadedFirst = true;
        void this.load(this.session.position);
      } else if (!this.armWord() && !this.loading) {
        const position = this.session.position;
        let future = false;
        for (const index of this.ready) if (index > position) future = true;
        const awaitingTransition = this.ready.has(position) && this.session.currentIndex !== position;
        if (!future && !awaitingTransition) {
          const last = this.segments.length - 1;
          const forward = this.session.forwardStopIndex;
          const end = Math.min(last, forward === null ? last : forward - 1);
          const index = Math.min(end, position + Math.min(HANDOFF_AHEAD, this.missed + 1));
          if (index > position && !this.ready.has(index)) {
            this.options.report.stage = 'sentence';
            void this.load(index);
          }
        }
      }
      if (!this.done) this.timer = this.deps.clock.setTimeout(() => this.poll(), HANDOFF_POLL_MS);
    } catch (e) {
      this.fail(e);
    }
  }

  private async load(index: number): Promise<void> {
    if (this.loading || !this.valid()) return;
    this.loading = true;
    try {
      await this.within(this.store.get(index), HANDOFF_REQUEST_MS, 'Zotero-TTS: preparing the next voice timed out');
      if (!this.valid()) return;
      if (!this.session.paused) await this.openOutput();
      if (!this.valid()) return;
      this.ready.add(index);
      const report = this.options.report;
      report.prepared = [...this.ready];
      const observed: AudioReady = {
        index,
        elapsedMs: this.deps.clock.now() - this.started,
        playingIndex: this.session.position,
        progress: this.session.currentPlaybackTime(),
        oldTimings: Number(this.session.timings?.length ?? 0),
        newTimings: Number(this.store.timings.get(index)?.length ?? 0),
      };
      report.audioReady.push(observed);
      if (report.audioReady.length > 8) report.audioReady.shift();
      this.deps.debug?.(
        `voice audio ready: segment ${index}, ${observed.elapsedMs} ms, playing ${observed.playingIndex} at ${observed.progress}, timings ${observed.oldTimings}/${observed.newTimings}`,
      );
      this.missed = Math.max(this.missed, this.session.position - index);
      // Audio is here: the first safe word boundary is armed at once, not at the next look
      this.armWord();
      this.updatePausedNotice();
    } catch (e) {
      this.fail(e);
    } finally {
      this.loading = false;
    }
  }

  // ---- At a word, playing ---------------------------------------------------

  /** Arm the cut at the first word boundary both voices time far enough ahead; true while one is armed. */
  private armWord(): boolean {
    const s = this.session;
    const report = this.options.report;
    if (s.paused) return false;
    const index = s.position;
    if (this.sentenceOnlyIndex === index) {
      report.wordDecision = 'paused-sentence-fallback';
      return false;
    }
    if (this.armed !== null && this.armed !== s.playingSource) this.disarm();
    if (this.armed !== null) return true;
    if (!this.ready.has(index)) {
      report.wordDecision = 'audio-not-ready-for-current-segment';
      return false;
    }
    if (s.currentIndex !== index || !s.isPlaying) {
      report.wordDecision = 'old-source-not-playing';
      return false;
    }
    if (!s.playingSource || !this.deps.audio.running()) {
      report.wordDecision = 'old-output-not-running';
      return false;
    }
    const progress = s.currentPlaybackTime();
    const decision = inspectWordHandoff(
      String(this.segments[index]?.text ?? ''),
      s.timings,
      this.store.timings.get(index),
      progress + this.rate * HANDOFF_LEAD_SECONDS,
      Number(s.clip?.duration),
      Number(this.store.clips.get(index)?.duration),
    );
    report.wordDecision = decision.reason;
    const boundary = decision.boundary;
    if (!boundary) return false;
    // The clock that plays the old clip, mapped back from its unstretched time
    const when = s.clipStartedAt + (boundary.end - s.clipOffset) / s.clipRate;
    if (!Number.isFinite(when) || when - this.deps.audio.now() < HANDOFF_LEAD_SECONDS) {
      report.wordDecision = 'boundary-too-close';
      return false;
    }
    let armed: unknown = null;
    armed = s.cutAt(when, () => this.cut(armed, index, boundary));
    if (armed === null) return false;
    this.armed = armed;
    report.stage = 'word';
    return true;
  }

  /** The old voice has played up to the boundary. */
  private cut(armed: unknown, index: number, boundary: WordBoundary): void {
    this.armed = null;
    const s = this.session;
    if (!this.valid() || s.playingSource !== armed) {
      this.cancel();
      // Called off between the last look and the cut: the old voice reads on from that word's end
      if (!s.ended && !s.paused && s.playingSource === armed) s.continueFrom(boundary.end);
      return;
    }
    this.commit('word', index, boundary.offset, boundary.charStart);
  }

  private disarm(): void {
    const armed = this.armed;
    this.armed = null;
    if (armed !== null) this.session.uncut(armed);
  }

  // ---- At a sentence --------------------------------------------------------

  /** The session is about to speak segment `index`: the new voice takes it when it has its audio. */
  sentenceStart(index: number): boolean {
    if (!this.valid() || this.session.paused || !this.ready.has(index) || this.session.currentIndex === index) return false;
    return this.commit('sentence', index, 0, 0);
  }

  // ---- Paused ---------------------------------------------------------------

  private pausedBoundary(): WordBoundary | null {
    const s = this.session;
    const index = s.position;
    if (!this.valid() || !s.paused || !this.ready.has(index) || s.currentIndex !== index) return null;
    return pausedWordHandoff(
      String(this.segments[index]?.text ?? ''),
      s.timings,
      this.store.timings.get(index),
      s.currentPlaybackTime(),
      Number(s.clip?.duration),
      Number(this.store.clips.get(index)?.duration),
    );
  }

  private updatePausedNotice(): void {
    if (!this.valid() || !this.session.paused) return;
    const ready = !!this.pausedBoundary();
    if (ready === this.noticeReady) return;
    this.noticeReady = ready;
    this.options.notice(ready ? 'ready' : 'preparing');
  }

  /** The manager's `pause`, with a switch pending: `proceed` pauses. */
  pause(proceed: () => void): void {
    this.resumePending = false;
    this.disarm();
    proceed();
    this.updatePausedNotice();
  }

  /** The manager's `play`, with a switch pending: `proceed` plays, after the new voice has taken the paused word if it can. */
  play(proceed: () => void): void {
    const s = this.session;
    if (this.valid() && s.paused && this.ready.has(s.position) && !this.deps.audio.running()) {
      if (!this.resumePending) {
        this.resumePending = true;
        this.openOutput().then(
          () => {
            if (!this.valid() || !this.resumePending) return;
            this.resumePending = false;
            this.resumePrepared();
            proceed();
          },
          (error: unknown) => {
            if (!this.valid() || !this.resumePending) return;
            this.fail(error);
            proceed();
          },
        );
      }
      return;
    }
    this.resumePrepared();
    proceed();
  }

  private resumePrepared(): void {
    const s = this.session;
    const index = s.position;
    if (!this.valid() || !s.paused || !this.ready.has(index) || !this.deps.audio.running()) return;
    const boundary = this.pausedBoundary();
    // Never jump over an unaligned word to reach a later usable cut
    if (!boundary) {
      this.sentenceOnlyIndex = index;
      return;
    }
    this.options.report.wordDecision = 'paused-word-boundary';
    this.commit('word', index, boundary.offset, boundary.charStart);
  }

  // ---- Taking over ----------------------------------------------------------

  private commit(kind: HandoffBoundary['kind'], index: number, offset: number, charStart: number): boolean {
    const s = this.session;
    if (!this.valid() || !this.ready.has(index) || s.position !== index) {
      this.cancel();
      return false;
    }
    const last: HandoffBoundary = { kind, index, offset, charStart, from: this.originalVoice, to: this.options.target.id };
    const report = this.options.report;
    this.finish('committed');
    report.last = last;
    this.deps.debug?.(`voice handoff ${kind}: ${last.from} -> ${last.to}, segment ${index}, char ${charStart}, offset ${offset}`);
    s.takeOver(this.options.target, this.store, index, offset);
    let taken = true;
    try {
      // The manager's own selection: its rebuild of the controller carries on (session.ts bind)
      taken = this.options.commit() !== false;
    } catch (e) {
      this.deps.log?.(e);
      taken = false;
    }
    if (!taken) {
      report.stage = 'failed';
      this.deps.log?.(new Error('Zotero-TTS: the manager did not take the new voice'));
      this.options.notice('failed');
      return true;
    }
    this.watchStart();
    return true;
  }

  /** "Selected" once the new voice is heard; "failed" if it has not started by the deadline. */
  private watchStart(): void {
    const target = this.options.target.id;
    const check = (): void => {
      const s = this.session;
      if (s.ended || s.voice?.id !== target || (s.handoff !== null && s.handoff !== this)) {
        this.options.notice('cancelled');
        return;
      }
      if (s.isPlaying && this.deps.audio.running()) {
        this.options.notice('selected');
        return;
      }
      if (this.deps.clock.now() > this.deadline) {
        this.options.report.stage = 'failed';
        this.deps.log?.(new Error('Zotero-TTS: the new voice did not start'));
        this.options.notice('failed');
        return;
      }
      this.deps.clock.setTimeout(check, HANDOFF_POLL_MS);
    };
    // The new voice's clip starts once its (cached) clip is handed over, a microtask on
    this.deps.clock.setTimeout(check, 0);
  }

  // ---- Ending ---------------------------------------------------------------

  cancel(): void {
    if (this.done) return;
    this.finish('cancelled');
    this.options.notice('cancelled');
  }

  fail(error: unknown): void {
    if (this.done) return;
    this.finish('failed');
    this.deps.log?.(error);
    this.options.notice('failed');
  }

  private finish(stage: string): void {
    this.done = true;
    this.options.report.stage = stage;
    this.options.report.pending = null;
    if (this.timer !== null) {
      this.deps.clock.clearTimeout(this.timer);
      this.timer = null;
    }
    this.disarm();
    if (this.session.handoff === this) this.session.handoff = null;
    if (stage !== 'committed') {
      try {
        this.options.abort?.abort();
      } catch (e) {
        this.deps.log?.(e);
      }
      this.store.close();
    }
  }

  // ---- Small things ---------------------------------------------------------

  private async openOutput(): Promise<void> {
    if (this.deps.audio.running()) return;
    this.deps.audio.resume();
    const until = this.deps.clock.now() + OUTPUT_OPEN_MS;
    while (!this.deps.audio.running()) {
      if (this.deps.clock.now() >= until) throw new Error('Zotero-TTS: the new voice audio output is blocked');
      await new Promise<void>((resolve) => this.deps.clock.setTimeout(resolve, HANDOFF_POLL_MS));
    }
  }

  private within<T>(job: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = this.deps.clock.setTimeout(() => reject(new Error(message)), ms);
      job.then(
        (value) => {
          this.deps.clock.clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          this.deps.clock.clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
