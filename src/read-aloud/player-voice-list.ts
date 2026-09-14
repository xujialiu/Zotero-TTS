import { dropdownLanguage } from './language-dropdown';
import type { AnyFn } from './proto-patches';

export interface PlayerVoiceListDeps {
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  waiveXrays?<T>(value: T): T;
  isDead?(value: unknown): boolean;
  error(e: unknown): void;
}

/** One regional list for the native popup and keyboard stepping (#106). */
export function createPlayerVoiceList(deps: PlayerVoiceListDeps) {
  const entries: { manager: any; own?: PropertyDescriptor; original: AnyFn }[] = [];
  const waive = <T>(value: T): T => deps.waiveXrays ? deps.waiveXrays(value) : value;
  const managerOf = (reader: any) => waive(reader?._internalReader?._readAloudManager);
  const prune = () => {
    for (let i = entries.length - 1; i >= 0; i--) if (deps.isDead?.(entries[i].manager)) entries.splice(i, 1);
  };

  function regional(list: any, selectedID: unknown): any {
    let language = '';
    // Reader arrays cannot call sandbox callbacks. Keep their voice instances
    // and array realm: cloning voices would lose their native methods.
    for (let i = 0; i < list.length; i++) {
      if (list[i]?.id === selectedID && typeof list[i].language === 'string') {
        language = dropdownLanguage(list[i].language); break;
      }
    }
    // A generic fallback must remain applicable even with a stale requested
    // region. _applyVoice also reads this getter after setting the voice ID.
    if (!language.includes('-')) return list;
    const result: any = Reflect.apply(list.slice, list, []);
    for (let i = result.length - 1; i >= 0; i--) {
      if (typeof result[i]?.language !== 'string' || dropdownLanguage(result[i].language) !== language) {
        Reflect.apply(result.splice, result, [i, 1]);
      }
    }
    return result;
  }

  function attach(reader: unknown): boolean {
    try {
      prune();
      const manager = managerOf(reader);
      if (!manager) return false;
      if (entries.some(e => e.manager === manager)) return true;
      let owner = manager;
      while (owner && !Object.prototype.hasOwnProperty.call(owner, 'voicesForLanguage')) owner = Object.getPrototypeOf(owner);
      const descriptor = owner && Object.getOwnPropertyDescriptor(owner, 'voicesForLanguage');
      if (!descriptor?.get) return false;
      const original = descriptor.get;
      const own = Object.getOwnPropertyDescriptor(manager, 'voicesForLanguage');
      const getter = function (this: any) {
        const m = waive(this);
        const list = Reflect.apply(original, m, []);
        try { return regional(list, m.selectedVoiceID); }
        catch (e) { deps.error(e); return list; }
      };
      Object.defineProperty(manager, 'voicesForLanguage', {
        configurable: true, enumerable: descriptor.enumerable,
        get: deps.exportFunction ? deps.exportFunction(getter, manager) : getter,
      });
      entries.push({ manager, own, original });
      return true;
    } catch (e) { deps.error(e); return false; }
  }

  function inspect(reader: unknown) {
    const manager = managerOf(reader);
    if (!manager) return null;
    const entry = entries.find(e => e.manager === manager);
    const native = entry ? Reflect.apply(entry.original, manager, []) : manager.voicesForLanguage;
    const offered = manager.voicesForLanguage;
    return { patched: !!entry, compatible: native?.length ?? 0, offered: offered?.length ?? 0,
      selected: manager.selectedVoiceID ?? null };
  }

  function dispose() {
    prune();
    for (const { manager, own } of entries.reverse()) {
      try {
        if (own) Object.defineProperty(manager, 'voicesForLanguage', own);
        else delete manager.voicesForLanguage;
      } catch (e) { deps.error(e); }
    }
    entries.length = 0;
  }
  return { attach, inspect, dispose, patchCounts: () => {
    prune(); return { total: entries.length, live: entries.length };
  } };
}
