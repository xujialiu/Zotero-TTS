/** Manual input arms visibility checks; automatic scrolling alone never does (#100). */
export function intersectsViewport(box: readonly number[], viewport: readonly number[]): boolean {
  return box.length === 4 && box.every(Number.isFinite) &&
    Math.max(box[0], viewport[0]) < Math.min(box[2], viewport[2]) &&
    Math.max(box[1], viewport[1]) < Math.min(box[3], viewport[3]);
}

interface Deps {
  enabled(): boolean;
  following(): boolean;
  available?(): boolean;
  /** Stable source position, not an activeSegment object recreated by word updates. */
  sentenceKey?(): string | null;
  paused?(): boolean;
  /** Capture and measure the current sentence after movement, without navigating. */
  capture(): () => boolean | null;
  stop(): void;
  disengage(reason: string): void;
  resume(): void;
  error(error: unknown): void;
}

export type ManualFollow = ReturnType<typeof createManualFollow>;

export function createManualFollow(deps: Deps) {
  let tracking = false;
  let suspended = false;
  let reason = '';
  let protectedKey: string | null = null;
  let settled = false;
  const holds = new Set<string>();
  let tasks = 0;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const cancel = () => { clear(); tracking = false; suspended = false; protectedKey = null; settled = false; tasks = 0; generation++; };
  function currentKey(): string | null {
    try { return deps.sentenceKey?.() ?? null; }
    catch (error) { deps.error(error); return null; }
  }
  function check(): boolean | null {
    if (!tracking) return null;
    if (!deps.enabled() || deps.available?.() === false || (!deps.following() && !suspended)) { cancel(); return null; }
    try {
      const result = deps.capture()();
      if (result === false && !suspended) {
        suspended = true;
        deps.disengage(reason);
      }
      return result;
    } catch (error) { deps.error(error); return null; }
  }
  function settle() {
    if (!tracking) return;
    clear();
    // This only coalesces a known gesture; it never classifies a scroll as manual.
    timer = setTimeout(() => {
      timer = null;
      const result = check();
      if (!tracking) return;
      settled = !holds.size && !tasks;
      const key = currentKey();
      const advanced = !deps.sentenceKey || (key != null && key !== protectedKey);
      if (tracking && settled && result === true && advanced && !deps.paused?.()) {
        cancel(); deps.resume();
      }
      // Outside/hidden views wait for scroll, playback or restoration signals.
    }, 180);
  }
  function begin(why: string) {
    if (!deps.following() && !suspended) return;
    if (!deps.enabled()) { cancel(); deps.disengage(why); return; }
    protectedKey = currentKey();
    settled = false;
    if (!tracking) {
      tracking = true;
      reason = why;
      try { deps.stop(); } catch (error) { deps.error(error); }
    }
    settle();
  }
  return {
    get active() { return tracking && !suspended; },
    get interacting() { return tracking && (!settled || holds.size > 0 || tasks > 0); },
    get sentenceProtected() { return tracking && !!deps.sentenceKey && protectedKey !== null && currentKey() === protectedKey; },
    get suspended() { return suspended; },
    begin, cancel, settle,
    retry() { if (timer === null) settle(); },
    scroll() { if (tracking) { check(); settle(); } },
    hold(value: boolean, source = 'pointer') { if (value) holds.add(source); else holds.delete(source); if (!value) settle(); },
    releaseHolds() { holds.clear(); settle(); },
    /** Preserve the original navigation Promise while keeping its asynchronous work protected. */
    task() {
      if (!tracking) return () => {};
      tasks++;
      const current = generation;
      return () => { if (current === generation) { tasks--; settle(); } };
    },
  };
}
