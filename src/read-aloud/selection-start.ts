/** Correct only shared sentence boundaries in Zotero's start lookup (#105). */
import { createProtoPatches, type ProtoPatchDeps } from './proto-patches';
import { ownerOf } from './system-voices';

function compareRefs(a: unknown, b: unknown): number | null {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || !b.length) return null;
  for (const ref of [a, b]) {
    for (let i = 0; i < ref.length; i++) {
      if (!Number.isInteger(ref[i]) || ref[i] < 0) return null;
    }
  }
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return Math.sign(a.length - b.length);
}

export function createSelectionStart(deps: ProtoPatchDeps & { waiveXrays?<T>(value: T): T }) {
  const patches = createProtoPatches(deps);
  const waive = <T>(value: T): T => deps.waiveXrays ? deps.waiveXrays(value) : value;
  const observations = new WeakMap<object, { corrected: number; last: { native: number; corrected: number } | null }>();
  function attach(reader: any): boolean {
    try {
      const ir = waive(reader?._internalReader);
      const proto = ir && ownerOf(ir, '_findReadAloudStartIndex');
      if (!proto) return false;
      patches.shadow(proto, '_findReadAloudStartIndex', original => function (this: any, ...args: any[]) {
        // Leave null, gap and terminal fallbacks to Zotero. If upstream fixes
        // its >= comparison (reader.js:71313), this becomes a no-op.
        const native = Reflect.apply(original, this, args);
        try {
          const self = waive(this);
          const segments = waive(args[0]);
          if (!Number.isInteger(native) || native < 0 || native + 1 >= segments?.length) return native;
          const target = waive(args[1]);
          const mapped = Array.isArray(target?.start) && Array.isArray(target?.end)
            ? target : self._sdt?.mapper.sourceToSDTPosition(target);
          const start = mapped?.start;
          const next = segments[native + 1]?.position;
          if (compareRefs(segments[native]?.position?.end, start) !== 0
            || compareRefs(next?.start, start) !== 0
            || compareRefs(next?.start, next?.end) !== -1) return native;
          const entry = observations.get(self) ?? { corrected: 0, last: null };
          entry.corrected++;
          entry.last = { native, corrected: native + 1 };
          observations.set(self, entry);
          return native + 1;
        } catch (e) { deps.error(e); return native; }
      });
      return true;
    } catch (e) { deps.error(e); return false; }
  }
  return {
    attach,
    inspect(reader: any) {
      const ir = waive(reader?._internalReader);
      if (!ir) return null;
      const proto = ownerOf(ir, '_findReadAloudStartIndex');
      return { patched: !!proto && patches.has(proto, '_findReadAloudStartIndex'),
        ...(observations.get(ir) ?? { corrected: 0, last: null }) };
    },
    patchCounts: patches.counts,
    dispose: patches.restoreAll,
  };
}
