import { describe, expect, it } from 'vitest';
import { buildSpeechChain, type ChainContext } from '../../../src/core/engine/speech-chain';
import { loadZoteroReference } from './zotero-reference';

/** A node that records what is set on it and where it connects, at the Web Audio defaults. */
class RecordedNode {
  readonly edges: unknown[] = [];
  constructor(
    readonly kind: string,
    readonly params: Record<string, unknown>,
  ) {}
  connect<T>(destination: T): T {
    this.edges.push(destination);
    return destination;
  }
}

function recordingContext(): ChainContext & { created: RecordedNode[] } {
  const created: RecordedNode[] = [];
  const make = (kind: string, params: Record<string, unknown>) => {
    const node = new RecordedNode(kind, params);
    Object.assign(node, params);
    created.push(node);
    return node as any;
  };
  return {
    created,
    destination: { kind: 'destination' },
    createGain: () => make('gain', { gain: { value: 1 } }),
    createBiquadFilter: () => make('biquad', { type: 'lowpass', frequency: { value: 350 }, gain: { value: 0 }, Q: { value: 1 } }),
    createDynamicsCompressor: () =>
      make('compressor', { threshold: { value: -24 }, knee: { value: 30 }, ratio: { value: 12 }, attack: { value: 0.003 }, release: { value: 0.25 } }),
  };
}

/** The chain from `node` to the destination, node by node, with every setting. */
function walk(node: unknown): unknown[] {
  const out: unknown[] = [];
  let at: any = node;
  while (at instanceof RecordedNode) {
    expect(at.edges, `${at.kind} feeds exactly one node`).toHaveLength(1);
    out.push({ kind: at.kind, ...JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(at.params).map((k) => [k, (at as any)[k]])))) });
    at = at.edges[0];
  }
  out.push(at);
  return out;
}

/** The graph Zotero 10.0.3's own `_initAudioContext` builds on a recording context. */
function zoteroChain(): unknown[] {
  let context: ReturnType<typeof recordingContext> | null = null;
  const AudioContext = function () {
    context = recordingContext();
    return context;
  };
  const host = new (loadZoteroReference(AudioContext).InitAudioContextHost)();
  host._initAudioContext();
  expect(host._audioContext).toBe(context);
  return walk(host._filterChainInput);
}

describe('buildSpeechChain', () => {
  it('builds Zotero 10.0.3’s filter chain node for node, behind the volume', () => {
    const context = recordingContext();
    const chain = buildSpeechChain(context, 100);
    const ours = walk(chain.input);
    expect(ours[0]).toEqual({ kind: 'gain', gain: { value: 1 } });
    expect(ours.slice(1)).toEqual(zoteroChain());
    expect(ours.at(-1)).toBe(context.destination);
    expect(chain.volume).toBe(chain.input);
  });

  it('spells the chain out: highpass 80 Hz Q 0.7, peak 3 kHz +3 dB Q 1, a compressor at its defaults', () => {
    const ours = walk(buildSpeechChain(recordingContext(), 100).input);
    expect(ours.slice(1, 4)).toEqual([
      { kind: 'biquad', type: 'highpass', frequency: { value: 80 }, gain: { value: 0 }, Q: { value: 0.7 } },
      { kind: 'biquad', type: 'peaking', frequency: { value: 3000 }, gain: { value: 3 }, Q: { value: 1 } },
      { kind: 'compressor', threshold: { value: -24 }, knee: { value: 30 }, ratio: { value: 12 }, attack: { value: 0.003 }, release: { value: 0.25 } },
    ]);
  });

  it('sets the volume as a gain of level ÷ 100, never above 1', () => {
    expect(buildSpeechChain(recordingContext(), 40).volume.gain.value).toBe(0.4);
    expect(buildSpeechChain(recordingContext(), 0).volume.gain.value).toBe(0);
    expect(buildSpeechChain(recordingContext(), 150).volume.gain.value).toBe(1);
    expect(buildSpeechChain(recordingContext(), 'loud').volume.gain.value).toBe(1);
  });
});
