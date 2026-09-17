import type { AnyFn } from './proto-patches';
import { ownerOf } from './system-voices';

export type PlaybackNotice = 'idle' | 'preparing' | 'failed';
interface Deps {
  notice(reader: unknown, kind: PlaybackNotice): void;
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  waiveXrays?<T>(value: T): T;
  isDead?(value: unknown): boolean;
  error(error: unknown): void;
}
interface State {
  reader: unknown;
  manager: any;
  controller: any;
  phase: 'idle' | 'waiting' | 'playing' | 'delay' | 'failed';
  visible: boolean;
  timer?: ReturnType<typeof setTimeout>;
  waits: number;
  starts: number;
  attached: boolean;
  acceptErrors: boolean;
  undo: (() => void)[];
  unlisten: (() => void)[];
  patched: Map<object, Set<string>>;
}

/** Observe native playback, never synthesis/prefetch. Buffering ends before
 * source.start; _speak runs only after the intentional sentence delay (#120). */
export function createPlaybackNotice(deps: Deps) {
  const states = new Map<unknown, State>();
  const waive = <T>(value: T): T => deps.waiveXrays ? deps.waiveXrays(value) : value;
  const alive = (value: unknown) => !!value && !deps.isDead?.(value);
  const guard = (fn: () => void) => { try { fn(); } catch (error) { deps.error(error); } };
  function emit(s: State, kind: PlaybackNotice) { guard(() => deps.notice(s.reader, kind)); }
  function settle(s: State, phase: State['phase']) {
    if (s.timer !== undefined) clearTimeout(s.timer);
    s.timer = undefined;
    const clear = s.visible || s.phase === 'failed';
    s.visible = false;
    s.phase = phase;
    if (clear) emit(s, 'idle');
  }
  function current(s: State, c: any): boolean {
    return s.attached && alive(s.manager) && alive(c) && s.manager._controller === c && !c._destroyed;
  }
  function wantsAudio(s: State): boolean { return s.attached && alive(s.manager) && s.manager.active && !s.manager.paused; }
  function wait(s: State) {
    if (!wantsAudio(s) || s.phase === 'waiting') return;
    s.acceptErrors = true;
    settle(s, 'waiting');
    s.waits++;
    s.timer = setTimeout(() => guard(() => {
      s.timer = undefined;
      if (!wantsAudio(s) || s.phase !== 'waiting') return;
      s.visible = true;
      emit(s, 'preparing');
    }), 300);
  }
  function failed(s: State, c: any) {
    if (!current(s, c) || !s.manager.active || !s.acceptErrors || s.phase === 'failed') return;
    settle(s, 'failed');
    emit(s, 'failed');
  }
  function started(s: State, c: any) {
    if (!current(s, c) || !wantsAudio(s) || !c._isPlaying || !c._sourceNode) return;
    if (c._audioContext?.state !== 'running') { wait(s); return; }
    s.starts++;
    settle(s, 'playing');
  }
  function patch(s: State, object: any, key: string, wrap: (original: AnyFn) => AnyFn) {
    if (!object || typeof object[key] !== 'function' || s.patched.get(object)?.has(key)) return;
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    const original = object[key];
    const fn = wrap(original);
    const exported = deps.exportFunction ? deps.exportFunction(fn, object) : fn;
    object[key] = exported;
    if (!s.patched.has(object)) s.patched.set(object, new Set());
    s.patched.get(object)!.add(key);
    s.undo.push(() => {
      if (!alive(object)) return;
      if (descriptor) Object.defineProperty(object, key, descriptor);
      else delete object[key];
    });
  }
  function listen(s: State, target: any, event: string, fn: () => void) {
    if (!target?.addEventListener) return;
    const callback = () => guard(fn);
    const exported = deps.exportFunction ? deps.exportFunction(callback, target) : callback;
    target.addEventListener(event, exported);
    s.unlisten.push(() => { if (alive(target)) target.removeEventListener(event, exported); });
  }
  function syncController(s: State) {
    const c = waive(s.manager._controller);
    if (s.controller === c) return;
    for (const undo of s.unlisten.splice(0)) guard(undo);
    s.controller = c;
    if (!alive(c)) return;
    // Prototype hooks stay underneath #119's temporary instance wrappers;
    // restoring a one-shot voice hook must not remove this observer.
    const proto = c;
    patch(s, ownerOf(proto, '_speak'), '_speak', original => function (this: any, ...args: any[]) {
      const self = waive(this);
      guard(() => { if (current(s, self)) { if (self.paused) settle(s, 'idle'); else wait(s); } });
      return Reflect.apply(original, this, args);
    });
    patch(s, ownerOf(proto, '_scheduleSpeak'), '_scheduleSpeak', original => function (this: any, ...args: any[]) {
      guard(() => { if (current(s, waive(this))) settle(s, 'delay'); });
      return Reflect.apply(original, this, args);
    });
    patch(s, ownerOf(proto, '_playAudioBuffer'), '_playAudioBuffer', original => function (this: any, ...args: any[]) {
      const self = waive(this);
      try {
        const result = Reflect.apply(original, this, args);
        guard(() => started(s, self));
        return result;
      } catch (error) { guard(() => failed(s, self)); throw error; }
    });
    listen(s, c, 'Error', () => failed(s, c));
    listen(s, c._audioContext, 'statechange', () => started(s, c));
    if (c._isPlaying && c._audioContext?.state === 'running') settle(s, 'playing');
  }
  function refresh(s: State) {
    if (!s.attached || !alive(s.manager)) return;
    syncController(s);
    if (!s.manager.active) { settle(s, 'idle'); return; }
    if (s.manager.paused) { if (s.phase !== 'failed') settle(s, 'idle'); return; }
    const c = s.controller;
    if (!c || (c.buffering && s.phase !== 'failed' && c._delayTimeout == null)) wait(s);
  }
  function detach(reader: unknown) {
    const s = states.get(reader);
    if (!s) return;
    s.attached = false;
    settle(s, 'idle');
    for (const undo of s.unlisten.splice(0)) guard(undo);
    for (const undo of s.undo.reverse()) guard(undo);
    states.delete(reader);
  }
  function attach(reader: any): boolean {
    try {
      if (!alive(reader) || !alive(reader._internalReader)) return false;
      const manager = waive(reader._internalReader._readAloudManager);
      if (!alive(manager)) return false;
      if (states.get(reader)?.manager === manager) return true;
      detach(reader);
      const s: State = { reader, manager, controller: null, phase: 'idle', visible: false,
        waits: 0, starts: 0, attached: true, acceptErrors: false, undo: [], unlisten: [], patched: new Map() };
      states.set(reader, s);
      const proto = manager;
      for (const name of ['_stateChanged', '_createController']) {
        patch(s, ownerOf(proto, name), name, original => function (this: any, ...args: any[]) {
          const result = Reflect.apply(original, this, args);
          guard(() => refresh(s));
          return result;
        });
      }
      for (const name of ['pause', 'deactivate', 'destroy']) {
        patch(s, ownerOf(proto, name), name, original => function (this: any, ...args: any[]) {
          guard(() => { s.acceptErrors = false; settle(s, 'idle'); });
          return Reflect.apply(original, this, args);
        });
      }
      refresh(s);
      return true;
    } catch (error) { detach(reader); deps.error(error); return false; }
  }
  return {
    attach, detach,
    inspect(reader: unknown) {
      const s = states.get(reader);
      return { attached: !!s, phase: s?.phase ?? 'idle', preparingRequested: s?.visible ?? false,
        waits: s?.waits ?? 0, sourceStarts: s?.starts ?? 0 };
    },
    dispose() { for (const reader of [...states.keys()]) detach(reader); },
  };
}
