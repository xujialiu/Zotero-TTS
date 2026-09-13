/** Manual input arms visibility checks; automatic scrolling alone never does (#100). */
export function intersectsViewport(box: readonly number[], viewport: readonly number[]): boolean {
  return box.length === 4 && box.every(Number.isFinite) &&
    Math.max(box[0], viewport[0]) < Math.min(box[2], viewport[2]) &&
    Math.max(box[1], viewport[1]) < Math.min(box[3], viewport[3]);
}

interface Deps {
  enabled(): boolean;
  following(): boolean;
  /** Snapshot the sentence, but remeasure its fragments after each movement. */
  capture(): () => boolean | null;
  stop(): void;
  disengage(reason: string): void;
  resume(): void;
  error(error: unknown): void;
}

export type ManualFollow = ReturnType<typeof createManualFollow>;

export function createManualFollow(deps: Deps) {
  let probe: (() => boolean | null) | null = null;
  let reason = '';
  const holds = new Set<string>();
  let tasks = 0;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const cancel = () => { clear(); probe = null; tasks = 0; generation++; };
  function check(): boolean | null {
    if (!probe) return null;
    if (!deps.following()) { cancel(); return null; }
    try {
      const result = probe();
      if (result === false) { const why = reason; cancel(); deps.disengage(why); }
      return result;
    } catch (error) { deps.error(error); return null; }
  }
  function settle() {
    if (!probe) return;
    clear();
    // This only coalesces a known gesture; it never classifies a scroll as manual.
    timer = setTimeout(() => {
      timer = null;
      const result = check();
      if (probe && !holds.size && !tasks && result === true) {
        cancel(); deps.resume();
      }
      // Hidden/unmeasurable views wait for a real scroll or restoration signal.
    }, 180);
  }
  function begin(why: string) {
    if (!deps.following()) return;
    if (!deps.enabled()) { cancel(); deps.disengage(why); return; }
    if (!probe) {
      try { probe = deps.capture(); }
      catch (error) { deps.error(error); probe = () => null; }
      reason = why;
      try { deps.stop(); } catch (error) { deps.error(error); }
    }
    settle();
  }
  return {
    get active() { return probe !== null; },
    begin, cancel, settle,
    retry() { if (timer === null) settle(); },
    scroll() { if (probe) { check(); settle(); } },
    hold(value: boolean, source = 'pointer') { if (value) holds.add(source); else holds.delete(source); if (!value) settle(); },
    releaseHolds() { holds.clear(); settle(); },
    /** Preserve the original navigation Promise while keeping its asynchronous work protected. */
    task() {
      if (!probe) return () => {};
      tasks++;
      const current = generation;
      return () => { if (current === generation) { tasks--; settle(); } };
    },
  };
}
