/**
 * Distinguish native playback resume from an explicit return/skip (#93),
 * and — since 1.13.2 — let a resume of a paused session wait for the pull
 * that precedes it (docs/spec/SYNC-FORMAT.md 6.8: "before resume, a pull
 * bounded at two seconds", the player's play included).
 *
 * The wrap is of `reader._internalReader.toggleReadAloudPaused`, the one
 * method the player's play button, the reader's Space key (reader.js
 * 82089) and the plugin's own toggle all go through (84220-84238): with no
 * argument it flips the manager's `paused`; `false` un-pauses, `true`
 * pauses. Only the un-pause of an active, paused session is a resume, and
 * only that is offered to `beforeResume`. Everything else — pausing, an
 * idle reader, a session that is not paused — runs the original at once,
 * as before.
 *
 * `beforeResume(reader, control)` answers `true` to take the resume over:
 * the wrapper then returns to Zotero at once (the original returns
 * undefined anyway) and the hook settles later through `control.resume()`,
 * which runs the original un-pause, or `control.release()`, which runs
 * nothing — for when the hook has already started playback another way. A
 * second press while one is pending is **ignored**: the simplest rule, and
 * the one a user pressing play twice in two seconds expects; the pending
 * resume is what they asked for. The hook answering anything else, or
 * throwing, means the original runs now.
 */
import type { AnyFn, ProtoPatchDeps } from './proto-patches';

export interface ResumeControl {
  /** Run the original un-pause now (once; later calls do nothing). */
  resume(): void;
  /** Settle without running it: playback was started another way. */
  release(): void;
}

export interface ResumeGuardDeps extends ProtoPatchDeps {
  waiveXrays?(value: unknown): unknown;
  /** Offered the un-pause of an active, paused session; `true` takes it over. */
  beforeResume?(reader: unknown, control: ResumeControl): boolean | void;
}

export function createResumeGuard(deps: ResumeGuardDeps) {
  const records = new Map<any, { target: any; depth: number; pending: boolean; undo(): void }>();
  const dead = (value: any) => !!deps.isDead?.(value);
  function detach(reader: any) {
    const record = records.get(reader);
    if (!record) return;
    records.delete(reader);
    try { if (!dead(record.target)) record.undo(); } catch (e) { deps.error(e); }
  }
  return {
    attach(reader: any) {
      for (const [key, record] of records) if (dead(record.target)) detach(key);
      if (records.has(reader)) return;
      const raw = reader?._internalReader;
      const target: any = deps.waiveXrays && raw ? deps.waiveXrays(raw) : raw;
      if (!target || typeof target.toggleReadAloudPaused !== 'function') return;
      const descriptor = Object.getOwnPropertyDescriptor(target, 'toggleReadAloudPaused');
      const original: AnyFn = target.toggleReadAloudPaused;
      const record = { target, depth: 0, pending: false, undo: () => {} };
      const run = function(self: any, args: any[]) {
        record.depth++;
        try { return Reflect.apply(original, self, args); }
        finally { record.depth--; }
      };
      const fn = function(this: any, ...args: any[]) {
        // A resume: an active, paused session asked to un-pause (no
        // argument flips `paused`; `false` un-pauses outright)
        let resume = false;
        try {
          const manager = target._readAloudManager;
          resume = !!manager?.active && !!manager?.paused && (args[0] === undefined || args[0] === false);
        } catch {
          resume = false;
        }
        if (resume && deps.beforeResume) {
          if (record.pending) return undefined;
          const self = this;
          let settled = false;
          const control: ResumeControl = {
            resume: () => {
              if (settled) return;
              settled = true;
              record.pending = false;
              run(self, args);
            },
            release: () => {
              settled = true;
              record.pending = false;
            },
          };
          let taken = false;
          try {
            record.pending = true;
            taken = deps.beforeResume(reader, control) === true;
          } catch (e) {
            deps.error(e);
            taken = false;
          }
          if (taken) return undefined;
          record.pending = false;
          settled = true;
        }
        return run(this, args);
      };
      const wrapper = deps.exportFunction ? deps.exportFunction(fn, target) : fn;
      target.toggleReadAloudPaused = wrapper;
      record.undo = () => {
        if (target.toggleReadAloudPaused !== wrapper) return;
        if (descriptor) Object.defineProperty(target, 'toggleReadAloudPaused', descriptor);
        else delete target.toggleReadAloudPaused;
      };
      records.set(reader, record);
    },
    resuming(reader: any): boolean { return (records.get(reader)?.depth ?? 0) > 0; },
    /** A resume of this reader is waiting on its pull. */
    pending(reader: any): boolean { return records.get(reader)?.pending ?? false; },
    detach,
    dispose() { for (const reader of [...records.keys()]) detach(reader); },
  };
}
