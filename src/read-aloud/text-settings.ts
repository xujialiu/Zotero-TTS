import { DEFAULT_BRACKET_PAIRS } from '../core/speech-text';
import { createProtoPatches, type ProtoPatchDeps } from './proto-patches';
import { ownerOf } from './system-voices';

type Deps = ProtoPatchDeps & { getEnabled(): boolean; getPairs?(): string; waiveXrays?<T>(value: T): T };

/** Keep speech preparation stable until deactivate/activate, across controller rebuilds. */
export function createTextSettings(deps: Deps) {
  const patches = createProtoPatches(deps);
  const values = new WeakMap<object, { enabled: boolean; pairs: string }>();
  const waive = <T>(value: T): T => deps.waiveXrays ? deps.waiveXrays(value) : value;
  const managerOf = (reader: any): any => waive(reader?._internalReader?._readAloudManager);

  const configured = () => ({ enabled: deps.getEnabled(), pairs: deps.getPairs?.() ?? DEFAULT_BRACKET_PAIRS });

  function snapshot(reader: unknown) {
    const m = managerOf(reader);
    if (!m?._active) return configured();
    if (!values.has(m)) values.set(m, configured());
    return values.get(m)!;
  }

  const enabled = (reader: unknown) => snapshot(reader).enabled;
  const pairs = (reader: unknown) => snapshot(reader).pairs;

  function attach(reader: unknown): boolean {
    try {
      const m = managerOf(reader);
      const proto = m ? ownerOf(m, 'activate') : null;
      if (!proto) return false;
      // An in-place upgrade may find a session already active.
      if (m._active && !values.has(m)) values.set(m, configured());
      patches.shadow(proto, 'activate', original => function (this: unknown, ...args: unknown[]) {
        const manager = waive(this) as any;
        if (!manager._active) values.set(manager, configured());
        return Reflect.apply(original, this, args);
      });
      return true;
    } catch (e) { deps.error(e); return false; }
  }

  return {
    attach, enabled, pairs,
    inspect(reader: unknown) {
      const m = managerOf(reader);
      return m ? { patched: patches.has(ownerOf(m, 'activate'), 'activate'), active: !!m._active,
        configured: deps.getEnabled(), effective: enabled(reader), configuredPairs: configured().pairs, effectivePairs: pairs(reader) } : null;
    },
    patchCounts: () => patches.counts(),
    dispose: () => patches.restoreAll(),
  };
}
