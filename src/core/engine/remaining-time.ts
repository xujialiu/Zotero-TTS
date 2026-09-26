import { computeGap, type PauseSettings } from './gap';
import type { EngineSegment } from './types';

/** An initial listening estimate, not word timing. Mixed scripts retain both contributions. */
function textSeconds(text: string): number {
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? [];
  const words = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  return cjk.length / 5 + words.length / 3;
}

/** Prefix updates and sums in logarithmic time; refreshing a novel never walks its sentences. */
class Sums {
  private readonly values: Float64Array;
  constructor(length: number) { this.values = new Float64Array(length + 1); }
  add(index: number, value: number): void {
    for (let i = index + 1; i < this.values.length; i += i & -i) this.values[i] += value;
  }
  private prefix(end: number): number {
    let sum = 0;
    for (let i = end; i > 0; i -= i & -i) sum += this.values[i];
    return sum;
  }
  range(from: number, to: number): number { return this.prefix(to) - this.prefix(from); }
}

/** One voice over one segment list. Audio measurements outlive decoded clip eviction. */
export class RemainingTime {
  private readonly base: Float64Array;
  private readonly paragraphs: Uint32Array;
  private readonly knownBase: Sums;
  private readonly knownSeconds: Sums;
  private readonly durations = new Map<number, number>();
  private sampleBase = 0;
  private sampleSeconds = 0;

  constructor(segments: ArrayLike<EngineSegment>) {
    this.base = new Float64Array(segments.length + 1);
    this.paragraphs = new Uint32Array(segments.length + 1);
    this.knownBase = new Sums(segments.length);
    this.knownSeconds = new Sums(segments.length);
    for (let i = 0; i < segments.length; i++) {
      this.base[i + 1] = this.base[i] + textSeconds(segments[i].text);
      this.paragraphs[i + 1] = this.paragraphs[i] + (segments[i].anchor === 'paragraphStart' ? 1 : 0);
    }
  }

  record(index: number, seconds: number): void {
    if (index < 0 || index >= this.base.length - 1 || !Number.isFinite(seconds) || seconds < 0) return;
    const prior = this.durations.get(index);
    if (prior !== undefined) return;
    const base = this.base[index + 1] - this.base[index];
    this.durations.set(index, seconds);
    this.knownBase.add(index, base);
    this.knownSeconds.add(index, seconds);
    // Silent skips are known durations, but must not teach a voice to speak infinitely fast.
    if (base > 0 && seconds > 0.05) { this.sampleBase += base; this.sampleSeconds += seconds; }
  }

  /** [from, to), with the current clip offset in original audio seconds. No leading/trailing gap. */
  seconds(from: number, to: number, speed: number, pauses: PauseSettings, offset = 0): number | null {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to >= this.base.length || !Number.isFinite(speed) || speed <= 0) return null;
    const factor = this.sampleBase > 0 ? this.sampleSeconds / this.sampleBase : 1;
    const base = this.base[to] - this.base[from] - this.knownBase.range(from, to);
    const speech = Math.max(0, base * factor + this.knownSeconds.range(from, to) - offset) / speed;
    const paragraphs = this.paragraphs[to] - this.paragraphs[from + 1];
    const sentence = computeGap({ paragraph: false, speed, settings: pauses });
    const paragraph = computeGap({ paragraph: true, speed, settings: pauses });
    return speech + ((to - from - 1 - paragraphs) * sentence + paragraphs * paragraph) / 1000;
  }
}
