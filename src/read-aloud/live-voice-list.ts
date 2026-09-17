import { withTimeout } from '../core/timeout';
import type { AnyFn } from './proto-patches';
import { isPlayerOpen } from './player-stop';

interface LiveVoiceListDeps {
  readers(): readonly any[];
  /** A plain object in the reader compartment. Native loadVoices only needs
   * _options and its two completion callbacks (reader.js:82310-82322). */
  stage(reader: any): any;
  tierOf(id: string): string | null;
  protectedVoices(reader: any): readonly string[];
  ended?(): void;
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  promise?(reader: any, job: Promise<void>): any;
  waiveXrays?<T>(value: T): T;
  isDead?(value: unknown): boolean;
  error(error: unknown): void;
}

/** Discover on a separate receiver, then publish choices without touching
 * the active controller, voice, position, or persisted selection (#121). */
export function createLiveVoiceList(deps: LiveVoiceListDeps) {
  type Entry = { reader: any; manager: any; original: AnyFn; own?: PropertyDescriptor; hook: AnyFn;
    revision: number; applied: number; loading: number; retained: number; undoEnd?: () => void };
  const entries = new Map<any, Entry>();
  const waive = <T>(value: T): T => deps.waiveXrays ? deps.waiveXrays(value) : value;
  const exported = (fn: AnyFn, target: object) => deps.exportFunction ? deps.exportFunction(fn, target) : fn;
  let disposed = false;

  async function load(entry: Entry, remote: boolean): Promise<void> {
    const revision = ++entry.revision;
    entry.loading++;
    try {
      const m = entry.manager;
      const stage = waive(deps.stage(entry.reader));
      stage._options = m._options;
      stage._resolveVoice = exported(() => {}, stage);
      stage._stateChanged = exported(() => {}, stage);
      await withTimeout(Promise.resolve(Reflect.apply(entry.original, stage, [remote])), 45_000,
        () => new Error('Zotero-TTS: voice list refresh timed out'));
      if (disposed || revision !== entry.revision || deps.isDead?.(m) || !isPlayerOpen(entry.reader)) return;
      const list = stage._allVoices;
      // Walk native arrays by index; their callbacks cannot enter the sandbox.
      for (let i = list.length - 1; i >= 0; i--) {
        const voice = list[i], tier = deps.tierOf(String(voice.id));
        if (tier && voice.impl) voice.impl.tier = tier;
        else if (!tier && voice.tier === 'local') Reflect.apply(list.splice, list, [i, 1]);
      }
      let retained = 0;
      if (m.active) {
        for (const id of new Set(deps.protectedVoices(entry.reader))) {
          let original: any = m._voice?.id === id ? m._voice : null;
          for (let i = 0; !original && i < m._allVoices.length; i++) if (m._allVoices[i].id === id) original = m._allVoices[i];
          if (!original) continue;
          let at = -1;
          for (let i = 0; i < list.length; i++) if (list[i].id === id) { at = i; break; }
          if (at < 0) { Reflect.apply(list.push, list, [original]); retained++; }
          else list[at] = original;
        }
      }
      if (m.active) {
        // A prepared handoff holds this catalog by identity. Keep it and
        // both voice objects while publishing unrelated choices.
        Reflect.apply(m._allVoices.splice, m._allVoices, [0, m._allVoices.length]);
        for (let i = 0; i < list.length; i++) Reflect.apply(m._allVoices.push, m._allVoices, [list[i]]);
      } else m._allVoices = list;
      m._devMode = stage._devMode;
      if (!m.active) Reflect.apply(m._resolveVoice, m, []);
      Reflect.apply(m._stateChanged, m, []);
      entry.applied++;
      entry.retained = retained;
    } catch (error) {
      if (!disposed && !deps.isDead?.(entry.manager)) deps.error(error);
    } finally { entry.loading--; }
  }

  function attach(reader: any): boolean {
    if (disposed || entries.has(reader)) return !disposed;
    const manager = waive(reader?._internalReader?._readAloudManager);
    if (typeof manager?.loadVoices !== 'function') return false;
    const original = manager.loadVoices;
    const entry: Entry = { reader, manager, original, own: Object.getOwnPropertyDescriptor(manager, 'loadVoices'),
      hook: original, revision: 0, applied: 0, loading: 0, retained: 0 };
    entry.hook = exported((remote: boolean) => {
      const job = load(entry, remote);
      return deps.promise ? deps.promise(reader, job) : job;
    }, manager);
    manager.loadVoices = entry.hook;
    if (typeof manager.deactivate === 'function') {
      const own = Object.getOwnPropertyDescriptor(manager, 'deactivate'), inner = manager.deactivate;
      const hook = exported(function (this: unknown, ...args: unknown[]) {
        const result = Reflect.apply(inner, this, args);
        entry.revision++;
        void Promise.resolve().then(() => { if (!disposed) deps.ended?.(); }).catch(deps.error);
        return result;
      }, manager);
      manager.deactivate = hook;
      entry.undoEnd = () => {
        if (manager.deactivate !== hook) return;
        if (own) Object.defineProperty(manager, 'deactivate', own); else delete manager.deactivate;
      };
    }
    entries.set(reader, entry);
    return true;
  }

  async function refresh(): Promise<void> {
    await Promise.all(deps.readers().map(async reader => {
      if (!isPlayerOpen(reader) || !attach(reader)) return;
      const entry = entries.get(reader)!;
      await load(entry, !!reader._internalReader?._state?.loggedIn);
    }));
  }
  function inspect(reader: any) {
    const entry = entries.get(reader);
    return entry ? { applied: entry.applied, loading: entry.loading, retained: entry.retained, revision: entry.revision } : null;
  }
  function detach(reader: any) {
    const entry = entries.get(reader);
    if (!entry) return;
    entry.revision++;
    entries.delete(reader);
    if (deps.isDead?.(entry.manager)) return;
    entry.undoEnd?.();
    if (entry.manager.loadVoices !== entry.hook) return;
    if (entry.own) Object.defineProperty(entry.manager, 'loadVoices', entry.own);
    else delete entry.manager.loadVoices;
  }
  return { attach, detach, refresh, inspect,
    invalidate() {
      for (const entry of entries.values()) {
        entry.revision++;
        if (deps.isDead?.(entry.manager)) { entries.delete(entry.reader); continue; }
        if (!isPlayerOpen(entry.reader)) {
          // A warm reopen resolves the cached list before discovery lands.
          // After settings changed, that list must not start an old voice.
          const m = entry.manager;
          Reflect.apply(m._allVoices.splice, m._allVoices, [0, m._allVoices.length]);
          m._voice = null;
          m._voiceID = null;
        }
      }
    },
    dispose() {
      disposed = true;
      for (const reader of [...entries.keys()]) detach(reader);
    },
  };
}
