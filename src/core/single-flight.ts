/**
 * One run at a time, and at most one waiting behind it — the scheduling
 * both WebDAV transports share (read-aloud/position-transport.ts, #40;
 * core/settings-sync-transport.ts, #68). A poke while a run is in flight
 * does not start a second one: it is folded into a single trailing run that
 * starts when the current one ends, carrying the last trigger's name and
 * the strongest `force` asked for meanwhile. So a burst of tab opens costs
 * one round trip plus one, never one per tab, and nothing ever blocks the
 * caller: `poke` returns at once, `flush` resolves when its run has ended.
 */

export interface SingleFlight {
  /** Schedule a run; never blocks, a burst coalesces into the running one plus one trailing run. */
  poke(trigger: string): void;
  /** One awaited, forced run — the shutdown's final push; it runs even inside a failure window. */
  flush(trigger: string): Promise<void>;
  running(): boolean;
}

/** `run` must never reject; what it reports is its own business (the stats and the gated error report). */
export function createSingleFlight(run: (trigger: string, force: boolean) => Promise<void>): SingleFlight {
  let inFlight: Promise<void> | null = null;
  let trailing: { trigger: string; force: boolean; promise: Promise<void>; resolve: () => void } | null = null;

  function request(trigger: string, force: boolean): Promise<void> {
    if (inFlight) {
      if (trailing) {
        trailing.trigger = trigger;
        trailing.force = trailing.force || force;
      } else {
        let resolve!: () => void;
        const promise = new Promise<void>((r) => {
          resolve = r;
        });
        trailing = { trigger, force, promise, resolve };
      }
      return trailing.promise;
    }
    inFlight = run(trigger, force).finally(() => {
      inFlight = null;
      if (trailing) {
        const next = trailing;
        trailing = null;
        void request(next.trigger, next.force).finally(next.resolve);
      }
    });
    return inFlight;
  }

  return {
    poke: (trigger) => {
      void request(trigger, false);
    },
    flush: (trigger) => request(trigger, true),
    running: () => inFlight !== null,
  };
}
