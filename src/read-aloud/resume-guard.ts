/** Distinguish native playback resume from an explicit return/skip (#93). */
import type { AnyFn, ProtoPatchDeps } from './proto-patches';

export function createResumeGuard(deps: ProtoPatchDeps & { waiveXrays?(value: unknown): unknown }) {
  const records = new Map<any, { target: any; depth: number; undo(): void }>();
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
      const record = { target, depth: 0, undo: () => {} };
      const fn = function(this: any, ...args: any[]) {
        record.depth++;
        try { return Reflect.apply(original, this, args); }
        finally { record.depth--; }
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
    detach,
    dispose() { for (const reader of [...records.keys()]) detach(reader); },
  };
}
