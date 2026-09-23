/**
 * One voice's clips for one run of segments: fetched, decoded and kept the
 * way Read Aloud's engine keeps them (`_getAudioData` / `_fetchAudio`,
 * reader.js 40329-40380) — up to 32 decoded clips and their word timings,
 * least recently used out first, and one fetch per segment however many
 * callers ask while it is on its way.
 *
 * Two of Read Aloud's faults are left behind here (issue #133). A clip that
 * arrives but will not decode fails as `unknown`, where Read Aloud's engine
 * set no error at all, so the reading stopped without a word and Retry did
 * nothing (40177-40184, issue #42). And a failure is the caller's to keep:
 * this store remembers none, so a segment whose read-ahead failed is asked
 * for once more when playback reaches it (40359-40361).
 */

import { LruMap } from './lru';
import { FetchTimer } from './read-ahead';
import type { EngineClip, EngineClock, EngineSegment, EngineVoice, FetchResult, WordTiming } from './types';

/** Read Aloud keeps 32 decoded clips (reader.js 39901). */
export const CLIP_CACHE_CAPACITY = 32;

/** A fetch or decode that produced no clip; `code` is the error word the manager shows. */
export class ClipError extends Error {
  constructor(
    readonly code: string,
    readonly stage: 'fetch' | 'decode' | 'closed',
    readonly cause?: unknown,
  ) {
    super(`Zotero-TTS: no audio (${stage}: ${code})`);
    this.name = 'ClipError';
  }
}

export interface ClipStoreDeps<Clip extends EngineClip> {
  segments: ArrayLike<EngineSegment>;
  voice: EngineVoice;
  clock: EngineClock;
  fetch(segment: EngineSegment, voice: EngineVoice, signal?: unknown): Promise<FetchResult>;
  decode(audio: unknown): Promise<Clip>;
  /** Passed to every fetch: a handoff's preparation can be called off (handoff.ts). */
  signal?: unknown;
}

export class ClipStore<Clip extends EngineClip> {
  readonly clips = new LruMap<number, Clip>(CLIP_CACHE_CAPACITY);
  readonly timings = new LruMap<number, ArrayLike<WordTiming>>(CLIP_CACHE_CAPACITY);
  readonly inflight = new Map<number, Promise<Clip>>();
  readonly timer = new FetchTimer();
  /** Fetches issued, for the diagnostics and the tests. */
  requests = 0;
  closed = false;

  constructor(readonly deps: ClipStoreDeps<Clip>) {}

  get voice(): EngineVoice {
    return this.deps.voice;
  }

  get segments(): ArrayLike<EngineSegment> {
    return this.deps.segments;
  }

  /** The clip of segment `index`: cached, on its way, or fetched now. */
  get(index: number): Promise<Clip> {
    const cached = this.clips.get(index);
    if (cached) return Promise.resolve(cached);
    const inflight = this.inflight.get(index);
    if (inflight) return inflight;
    const segment = this.deps.segments[index];
    const job = this.fetchAndDecode(index, segment).finally(() => this.inflight.delete(index));
    this.inflight.set(index, job);
    return job;
  }

  /** The clip of segment `index` if it is decoded and kept; refreshes it, as Read Aloud's `get` does. */
  cached(index: number): Clip | undefined {
    return this.clips.get(index);
  }

  /** Stop keeping anything; answers on their way are decoded no more. */
  close(): void {
    this.closed = true;
    this.clips.clear();
    this.timings.clear();
    this.inflight.clear();
  }

  private async fetchAndDecode(index: number, segment: EngineSegment): Promise<Clip> {
    const started = this.deps.clock.now();
    this.requests++;
    let result: FetchResult;
    try {
      result = await this.deps.fetch(segment, this.deps.voice, this.deps.signal);
    } catch (e) {
      throw new ClipError('unknown', 'fetch', e);
    }
    if (this.closed) throw new ClipError('unknown', 'closed');
    if (!result?.audio) throw new ClipError(result?.error || 'unknown', 'fetch');
    this.timer.record(segment, this.deps.clock.now() - started);
    let clip: Clip;
    try {
      clip = await this.deps.decode(result.audio);
    } catch (e) {
      throw new ClipError('unknown', 'decode', e);
    }
    if (this.closed) throw new ClipError('unknown', 'closed');
    this.clips.set(index, clip);
    if (result.timestamps) this.timings.set(index, result.timestamps);
    return clip;
  }
}
