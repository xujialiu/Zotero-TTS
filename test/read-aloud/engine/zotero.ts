/**
 * Zotero 10.0.3's own Read Aloud manager, run from the verbatim excerpt in
 * test/fixtures/engine/read-aloud-manager-10.0.3.js, and a reader window as
 * far as the Engine uses one: EventTarget, Event, Promise, and an
 * AudioContext whose clock is the virtual clock of the core's harness.
 */

import { readFileSync } from 'node:fs';
import type { VirtualClock } from '../../core/engine/harness';

const SOURCE = readFileSync(new URL('../../fixtures/engine/read-aloud-manager-10.0.3.js', import.meta.url), 'utf8');

/** Read Aloud's own controller, as far as the manager and the tests see it: what a voice built before the Engine was in place. */
export class NativeController extends EventTarget {
  readonly native = true;
  speed = 1;
  paused = false;
  buffering = false;
  error = null;
  activeTimestampIndex = null;
  lastSkipGranularity = null;
  destroyed = false;
  readonly args: unknown[];
  constructor(
    readonly voice: unknown,
    ...args: unknown[]
  ) {
    super();
    this.args = args;
  }
  destroy() {
    this.destroyed = true;
  }
  getTimestampsForSegment() {
    return [{ start: 0, end: 1, charStart: 0, charEnd: 1, native: true }];
  }
  getSegmentToAnnotate() {
    return null;
  }
  syncActiveWordToPlayback() {}
  async refreshCreditsRemaining() {}
  async resetCredits() {}
  skipBack() {}
  skipAhead() {}
  retry() {}
}

export interface ZoteroReadAloud {
  ReadAloudManager: any;
  RemoteReadAloudVoice: any;
  RemoteReadAloudController: typeof NativeController;
}

export function loadZoteroReadAloud(): ZoteroReadAloud {
  const scope = {
    RemoteReadAloudController: NativeController,
    RemoteSampleReadAloudController: class {},
    BrowserReadAloudProvider: class {
      async getVoices() {
        return [];
      }
    },
    navigator: { languages: ['en-US'] },
  };
  return new Function(
    ...Object.keys(scope),
    `${SOURCE}\nreturn { ReadAloudManager, RemoteReadAloudVoice, RemoteReadAloudController };`,
  )(...Object.values(scope));
}

/** A voices response of the plugin's shape (voice-catalog.ts buildVoicesResponse) for these ids, all en-US. */
export function voicesResponse(ids: string[], tier = 'local'): Record<string, unknown[]> {
  return {
    [tier]: ids.map((id) => ({
      voices: { [id]: { label: id.split('::').pop()!.toUpperCase() } },
      locales: { 'en-US': [id] },
      segmentGranularity: 'sentence',
      sentenceDelay: 0,
      cacheVersion: 'v1',
    })),
  };
}

// ---- A reader window -----------------------------------------------------------

/** Encoded audio as the fake decoder reads it: its length in seconds. */
export function fakeAudio(seconds: number): { arrayBuffer(): Promise<ArrayBuffer> } {
  return { arrayBuffer: async () => new Float64Array([seconds]).buffer };
}

const SAMPLE_RATE = 8000;

export class FakeAudioBuffer {
  readonly channels: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
  copyToChannel(source: Float32Array, channel: number): void {
    this.channels[channel].set(source);
  }
}

class FakeNode {
  readonly edges: unknown[] = [];
  connect<T>(destination: T): T {
    this.edges.push(destination);
    return destination;
  }
  disconnect(): void {
    this.edges.length = 0;
  }
}

export interface SourceRecord {
  buffer: FakeAudioBuffer;
  when: number;
  offset: number;
  at: number;
  stoppedAt: number | null;
  ended: boolean;
}

export class FakeAudioContext extends EventTarget {
  static clock: VirtualClock;
  static made: FakeAudioContext[] = [];
  state = 'running';
  readonly sampleRate = SAMPLE_RATE;
  outputLatency = 0;
  baseLatency = 0;
  readonly destination = { kind: 'destination' };
  readonly sources: SourceRecord[] = [];
  readonly decoded: unknown[] = [];
  resumes = 0;
  private readonly born = FakeAudioContext.clock.now();

  constructor() {
    super();
    FakeAudioContext.made.push(this);
  }

  get currentTime(): number {
    return (FakeAudioContext.clock.now() - this.born) / 1000;
  }

  createGain() {
    return Object.assign(new FakeNode(), { gain: { value: 1 } });
  }

  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: 'lowpass', frequency: { value: 350 }, gain: { value: 0 }, Q: { value: 1 } });
  }

  createDynamicsCompressor() {
    return new FakeNode();
  }

  createBuffer(channels: number, length: number, rate: number) {
    return new FakeAudioBuffer(channels, length, rate);
  }

  async decodeAudioData(bytes: ArrayBuffer) {
    this.decoded.push(bytes);
    const seconds = new Float64Array(bytes)[0];
    if (!Number.isFinite(seconds)) throw new Error('EncodingError');
    return new FakeAudioBuffer(1, Math.round(seconds * SAMPLE_RATE), SAMPLE_RATE);
  }

  createBufferSource() {
    const context = this;
    const clock = FakeAudioContext.clock;
    let timer: unknown = null;
    const record: SourceRecord = { buffer: null as unknown as FakeAudioBuffer, when: 0, offset: 0, at: 0, stoppedAt: null, ended: false };
    const node = Object.assign(new FakeNode(), {
      buffer: null as FakeAudioBuffer | null,
      onended: null as null | (() => void),
      start(when: number, offset: number) {
        record.buffer = node.buffer!;
        record.when = when;
        record.offset = offset;
        record.at = context.currentTime;
        context.sources.push(record);
        arm(context.currentTime + Math.max(0, node.buffer!.duration - offset));
      },
      stop(when?: number) {
        record.stoppedAt = when ?? context.currentTime;
        arm(Math.min(record.stoppedAt, record.at + Math.max(0, node.buffer!.duration - record.offset)));
      },
    });
    function arm(endsAt: number) {
      if (timer !== null) clock.clearTimeout(timer);
      timer = clock.setTimeout(() => {
        timer = null;
        record.ended = true;
        node.onended?.();
      }, Math.max(0, (endsAt - context.currentTime) * 1000));
    }
    return node;
  }

  async resume() {
    this.resumes++;
    this.state = 'running';
    this.dispatchEvent(new Event('statechange'));
  }

  async close() {
    this.state = 'closed';
  }
}

/** The reader window of one tab. */
export function readerWindow(clock: VirtualClock) {
  FakeAudioContext.clock = clock;
  return {
    EventTarget,
    Event,
    Promise,
    AudioContext: FakeAudioContext,
    navigator: { mediaDevices: new EventTarget() },
  };
}
