/**
 * One reader tab's sound (issue #133, ADR 0006): an AudioContext of the
 * reader window, the volume and Read Aloud's own filter chain
 * (core/engine/speech-chain.ts), and the sources that play into them.
 *
 * Read Aloud's engine builds a context per controller and closes it with
 * the controller (reader.js 39931-39963, 40138-40143). The Engine keeps one
 * per reading session instead, so a controller the manager rebuilds
 * mid-sentence keeps its sound; it is built when the first clip is decoded
 * and closed when the session ends. It is the reader window's, as Read
 * Aloud's is: the sandbox has no AudioContext of its own.
 *
 * Every clip is decoded by the context and time-stretched by the copy of
 * Read Aloud's WSOLA (core/engine/time-stretch.ts). The stretch reads every
 * sample hundreds of times, which through the reader window's wrapper would
 * crawl, so it runs over copies of the samples on the plugin's side, made
 * once per clip when first needed, and its output is copied back into a
 * buffer of the context. At 1× the clip's own buffer plays and nothing is
 * copied. The numbers are the same either side, so the output is the one
 * Read Aloud's engine would play.
 *
 * Compartment rules (MEMORY/code.md): the context, its nodes and buffers
 * are the reader window's; what crosses into it — the bytes to decode, the
 * stretched samples — is cloned in; the callbacks it calls are exported.
 */

import { gainOf } from '../../core/read-aloud-volume';
import { buildSpeechChain, type SpeechChain } from '../../core/engine/speech-chain';
import { stretchAudioBuffer, type PcmBuffer, type PcmBufferFactory } from '../../core/engine/time-stretch';
import type { EngineAudio, EngineClip, PlayingSource } from '../../core/engine/types';
import { findWordOnset } from '../../core/engine/word-onset';

type AnyFn = (...args: any[]) => any;

/** A decoded clip: the context's AudioBuffer, and its samples on the plugin's side once the stretch or the word onset has needed them. */
export interface DecodedClip extends EngineClip {
  readonly buffer: any;
  local: PcmBuffer | null;
}

export interface AudioOutputDeps {
  /** The reader window, whose AudioContext this is; null once the tab is gone. */
  window(): any;
  /** `Components.utils.cloneInto(value, window)`: bytes and samples into the reader window. */
  toWindow<T>(value: T, window: any): T;
  /** `Components.utils.cloneInto(value, sandbox)`: a reader Float32Array's samples onto the plugin's side. */
  toLocal(value: Float32Array): Float32Array;
  /** `Components.utils.exportFunction`: the callbacks the context calls. */
  exportFunction(fn: AnyFn, target: object): AnyFn;
  /** The volume in percent, read whenever a chain is built. */
  level(): number;
  /** The context started or stopped running. */
  onStateChange(): void;
  /** An audio device came or went (reader.js 39940). */
  onDeviceChange(): void;
  error(e: unknown): void;
}

export interface AudioOutput extends EngineAudio<DecodedClip> {
  /** Move the volume of the open chain. */
  setVolume(level: number): void;
  /** Close the context; the next clip builds another. */
  close(): void;
  /** What the diagnostics report. */
  inspect(): { state: string; sampleRate: number | null; latency: number; gain: number | null; contexts: number };
}

/** Samples on the plugin's side, zeroed: where the stretch writes. */
class LocalPcm implements PcmBuffer {
  private readonly channels: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

const localBuffers: PcmBufferFactory<PcmBuffer> = {
  createBuffer: (numberOfChannels, length, sampleRate) => new LocalPcm(numberOfChannels, length, sampleRate),
};

export function createAudioOutput(deps: AudioOutputDeps): AudioOutput {
  let context: any = null;
  let chain: SpeechChain | null = null;
  let win: any = null;
  let contexts = 0;
  let unlisten: (() => void)[] = [];

  function open(): any {
    if (context && context.state !== 'closed') return context;
    const w = deps.window();
    if (!w) throw new Error('Zotero-TTS: the reader window is gone');
    win = w;
    context = new w.AudioContext();
    chain = buildSpeechChain(context, deps.level());
    contexts++;
    const stateChange = deps.exportFunction(() => deps.onStateChange(), w);
    context.addEventListener('statechange', stateChange);
    const devices = w.navigator?.mediaDevices;
    const deviceChange = deps.exportFunction(() => deps.onDeviceChange(), w);
    devices?.addEventListener?.('devicechange', deviceChange);
    const opened = context;
    unlisten = [
      () => opened.removeEventListener('statechange', stateChange),
      () => devices?.removeEventListener?.('devicechange', deviceChange),
    ];
    return context;
  }

  function close(): void {
    for (const undo of unlisten.splice(0)) {
      try {
        undo();
      } catch {
        // A window already gone took its listeners with it
      }
    }
    const closing = context;
    context = null;
    chain = null;
    if (closing && closing.state !== 'closed') {
      try {
        void Promise.resolve(closing.close()).catch(() => {});
      } catch (e) {
        deps.error(e);
      }
    }
  }

  /** The clip's samples on the plugin's side; each channel is copied on first read, so a clip played at 1× is never copied. */
  function local(clip: DecodedClip): PcmBuffer {
    if (!clip.local) {
      const buffer = clip.buffer;
      const copies: (Float32Array | undefined)[] = [];
      clip.local = {
        sampleRate: Number(buffer.sampleRate),
        numberOfChannels: Number(buffer.numberOfChannels),
        length: Number(buffer.length),
        getChannelData: (channel: number) => (copies[channel] ??= deps.toLocal(buffer.getChannelData(channel))),
      };
    }
    return clip.local;
  }

  /** The buffer that plays `clip` at `rate`: its own at 1×, else the stretch copied into the context. */
  function stretched(clip: DecodedClip, rate: number): any {
    const pcm = local(clip);
    const out = stretchAudioBuffer(pcm, rate, localBuffers);
    if (out === pcm) return clip.buffer;
    const buffer = context.createBuffer(out.numberOfChannels, out.length, out.sampleRate);
    for (let channel = 0; channel < out.numberOfChannels; channel++) {
      buffer.copyToChannel(deps.toWindow(out.getChannelData(channel), win), channel);
    }
    return buffer;
  }

  return {
    async decode(audio: unknown): Promise<DecodedClip> {
      const ctx = open();
      const bytes = await (audio as Blob).arrayBuffer();
      const buffer = await ctx.decodeAudioData(deps.toWindow(bytes, win));
      return { buffer, duration: Number(buffer.duration), local: null };
    },

    start(clip: DecodedClip, offset: number, rate: number, onEnded: () => void): { source: PlayingSource; startedAt: number } {
      const ctx = open();
      // reader.js 40029-40046: the stretched buffer always plays at 1×
      const buffer = stretched(clip, rate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(chain!.input);
      const startedAt = Number(ctx.currentTime);
      source.start(0, offset / rate);
      let live = true;
      let ended: () => void = onEnded;
      source.onended = deps.exportFunction(() => {
        if (!live) return;
        live = false;
        ended();
      }, win);
      return {
        source: {
          stop() {
            live = false;
            try {
              source.onended = null;
              source.stop();
            } catch {
              // Already stopped
            }
            try {
              source.disconnect();
            } catch {
              // A closed context took it
            }
          },
          // A later stop() replaces an earlier one's time (Web Audio's AudioScheduledSourceNode)
          stopAt(when: number, onStopped: () => void) {
            ended = onStopped;
            source.stop(when);
          },
          restoreEnd(when: number) {
            ended = onEnded;
            source.stop(when);
          },
        },
        startedAt,
      };
    },

    now(): number {
      return context ? Number(context.currentTime) : 0;
    },

    latency(): number {
      if (!context) return 0;
      const output = Number(context.outputLatency);
      const base = Number(context.baseLatency);
      return (Number.isFinite(output) && output > 0 ? output : 0) + (Number.isFinite(base) && base > 0 ? base : 0);
    },

    running(): boolean {
      return !!context && context.state === 'running';
    },

    resume(): void {
      try {
        const ctx = open();
        void Promise.resolve(ctx.resume()).catch((e: unknown) => deps.error(e));
      } catch (e) {
        deps.error(e);
      }
    },

    rebuild(): void {
      close();
      open();
    },

    wordOnset(clip: DecodedClip, position: number, wordBoundaries: number): number {
      return findWordOnset(local(clip), position, wordBoundaries);
    },

    setVolume(level: number): void {
      if (chain) chain.volume.gain.value = gainOf(level);
    },

    close,

    inspect() {
      return {
        state: context ? String(context.state) : 'none',
        sampleRate: context ? Number(context.sampleRate) : null,
        latency: this.latency(),
        gain: chain ? Number(chain.volume.gain.value) : null,
        contexts,
      };
    },
  };
}
