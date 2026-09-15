import { adjacentVoice, playerVoices, inspectWordHandoff, pausedWordHandoff } from '../core/voice-switch';
import { withTimeout } from '../core/timeout';
import type { AnyFn } from './proto-patches';

export type VoiceNotice = 'preparing' | 'selected' | 'failed' | 'unavailable';
export interface VoiceSwitcherDeps {
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  waiveXrays?<T>(value: T): T;
  isDead?(value: unknown): boolean;
  notice(reader: unknown, kind: VoiceNotice, label: string): void;
  error(error: unknown): void;
  debug?(message: string): void;
  newAbortController?(reader: any): AbortController;
}
type Boundary = { kind: 'word' | 'sentence'; index: number; offset: number; charStart: number; from: string; to: string };
type AudioReady = { index: number; elapsedMs: number; playingIndex: number; progress: number; oldTimings: number; newTimings: number };
type Report = { controlsAttached: boolean; pending: string | null; stage: string; prepared: number[]; last: Boundary | null;
  wordDecision: string | null; audioReady: AudioReady[] };
type Pending = {
  reader: any; manager: any; old: any; target: any; segments: any; catalog: any; prepared: any;
  originalVoice: string; rate: number; selection: () => void; ready: Set<number>;
  loading: boolean; missed: number; started: number; undo: (() => void)[];
  abort?: AbortController; deadline: number; resumePending?: boolean; sentenceOnlyIndex?: number;
  timer?: ReturnType<typeof setTimeout>; disarm?: () => void; armedNode?: any;
};
export interface VoiceSwitcher {
  attach(reader: unknown): boolean;
  detach(reader: unknown): void;
  isPreviewing(reader: unknown): boolean;
  preparationSignal(reader: unknown, voiceID: string): AbortSignal | undefined;
  step(reader: unknown, direction: -1 | 1): void;
  /** The memory layer supplies its native cross-language restore as the final selection. */
  defer(reader: unknown, voiceID: string, selection: () => void): boolean;
  inspect(reader: unknown): Report | null;
  dispose(): void;
}

const REQUEST_TIMEOUT = 60_000;
const HANDOFF_TIMEOUT = 120_000;

/**
 * A paused native controller prepares the replacement while the current
 * controller continues. Zotero still owns fetching, decoding, time stretching,
 * highlights, sentence transitions and persistence (issue #95). A tier or
 * language pick on a paused player is left to Zotero as it is: the lists
 * must follow such a pick at once, and a prepared switch lands only on Play
 * (issue #110).
 */
export function createVoiceSwitcher(deps: VoiceSwitcherDeps): VoiceSwitcher {
  const pending = new Map<any, Pending>();
  const reports = new WeakMap<object, Report>();
  const attached = new Map<any, { manager: any; undo: (() => void)[] }>();
  const previewing = new Set<unknown>();
  let propagating = 0;
  function select(fn: () => void) { propagating++; try { fn(); } finally { propagating--; } }
  const waive = <T>(value: T): T => deps.waiveXrays ? deps.waiveXrays(value) : value;
  const exported = (fn: AnyFn, target: object) => deps.exportFunction ? deps.exportFunction(fn, target) : fn;
  const managerOf = (reader: any) => waive(reader?._internalReader?._readAloudManager);
  function report(p: Pending): Report { return reports.get(p.reader)!; }
  function notice(reader: unknown, kind: VoiceNotice, label: string) {
    try { deps.notice(reader, kind, label); } catch (e) { deps.error(e); }
  }
  const label = (voice: any) => String(voice?.label ?? voice?.id ?? '');

  const choiceFields = ['_voiceID', '_lang', '_region', '_selectedTier', '_persistedVoices', '_pendingSetVoice'] as const;
  function snapshot(manager: any) {
    const descriptors = choiceFields.map(key => Object.getOwnPropertyDescriptor(manager, key));
    return () => choiceFields.forEach((key, i) => {
      if (descriptors[i]) Object.defineProperty(manager, key, descriptors[i]!);
      else delete manager[key];
    });
  }

  function attach(reader: unknown): boolean {
    const manager = managerOf(reader);
    if (!manager) return false;
    if (attached.get(reader)?.manager === manager) return true;
    detach(reader);
    const undo: (() => void)[] = [];
    attached.set(reader, { manager, undo });
    if (reader && typeof reader === 'object') reports.set(reader, {
      ...(reports.get(reader) ?? { pending: null, stage: 'idle', prepared: [], last: null, wordDecision: null, audioReady: [] }),
      controlsAttached: true,
    });
    try {
      for (const name of ['selectVoice', 'selectTier', 'setLanguage']) {
        const original = manager[name];
        if (typeof original !== 'function') continue;
        undo.push(shadow(manager, name, function (this: any, ...args: any[]) {
          // A tier or language pick while paused goes the native way, so the
          // player's lists follow it at once (issue #110); on Play the sentence
          // restarts, as Zotero's own does. A voice pick keeps the paused
          // handoff of issue #108.
          if (propagating || previewing.has(reader) || !manager.active
            || (name === 'setLanguage' && !waive(args[1])?.persist)
            || (name !== 'selectVoice' && manager.paused)) {
            return Reflect.apply(original, manager, args);
          }
          const restore = snapshot(manager), suppress: (() => void)[] = [];
          let choice: (() => void) | undefined, id: string | undefined;
          previewing.add(reader);
          try {
            // Let native resolution and the language-memory staging choose.
            // No controller, persistence callback, or UI sees this preview.
            for (const method of ['_applyVoice', '_persistCurrentVoice', '_stateChanged']) {
              suppress.push(shadow(manager, method, () => {}));
            }
            Reflect.apply(original, manager, args);
            id = manager.selectedVoiceID;
            choice = snapshot(manager);
          } finally {
            for (const restoreMethod of suppress.reverse()) restoreMethod();
            restore(); previewing.delete(reader);
          }
          const target = playerVoices<any>(manager.allVoices).find(v => v.id === id);
          if (!target) { notice(reader, 'unavailable', ''); return; }
          const selection = () => {
            choice!();
            // _applyVoice owns the final tier, controller and persistence.
            Reflect.apply(manager.selectVoice, manager, [id]);
          };
          if (id === manager.selectedVoiceID) {
            const previous = pending.get(reader); if (previous) cancel(previous);
            // A re-pick cancels pending work without restarting the sentence.
            const restoreApply = shadow(manager, '_applyVoice', () => {});
            try { select(selection); } finally { restoreApply(); }
            notice(reader, 'selected', label(target)); return;
          }
          begin(reader, target, selection);
        }));
      }
      return true;
    } catch (e) { detach(reader); deps.error(e); return false; }
  }

  function detach(reader: unknown) {
    const p = pending.get(reader); if (p) cancel(p);
    const entry = attached.get(reader);
    if (!entry) return;
    for (const undo of entry.undo.reverse()) { try { undo(); } catch (e) { deps.error(e); } }
    attached.delete(reader);
    if (reader && typeof reader === 'object' && reports.has(reader)) reports.get(reader)!.controlsAttached = false;
  }

  /** Own-property shadows only: restore the descriptor, including absence. */
  function shadow(object: any, name: string, fn: AnyFn): () => void {
    const previous = Object.getOwnPropertyDescriptor(object, name);
    object[name] = exported(fn, object);
    return () => {
      if (deps.isDead?.(object)) return;
      if (previous) Object.defineProperty(object, name, previous);
      else delete object[name];
    };
  }

  function cleanup(p: Pending, keepPrepared = false) {
    if (pending.get(p.reader) === p) pending.delete(p.reader);
    if (p.timer !== undefined) clearTimeout(p.timer);
    try { p.disarm?.(); } catch (e) { deps.error(e); }
    p.disarm = undefined;
    for (const undo of p.undo.reverse()) { try { undo(); } catch (e) { deps.error(e); } }
    p.undo.length = 0;
    if (!keepPrepared) {
      try { p.abort?.abort(); } catch (e) { deps.error(e); }
      if (p.prepared) { try { p.prepared.destroy(); } catch (e) { deps.error(e); } }
    }
    report(p).pending = null;
  }
  function cancel(p: Pending) {
    if (pending.get(p.reader) !== p) return;
    report(p).stage = 'cancelled'; cleanup(p);
  }
  function fail(p: Pending, error: unknown) {
    if (pending.get(p.reader) !== p) return;
    report(p).stage = 'failed'; cleanup(p);
    deps.error(error); notice(p.reader, 'failed', label(p.target));
  }
  function valid(p: Pending): boolean {
    return pending.get(p.reader) === p && !deps.isDead?.(p.manager) && !deps.isDead?.(p.old)
      && p.manager.active && p.manager._controller === p.old && !p.old._destroyed
      && p.manager._segments === p.segments && p.manager.selectedVoiceID === p.originalVoice
      && p.manager.allVoices === p.catalog
      && p.manager.speed === p.rate;
  }

  function commit(p: Pending, kind: Boundary['kind'], index: number, offset: number, charStart: number) {
    if (!valid(p) || !p.ready.has(index) || p.old._position !== index) { cancel(p); return; }
    const prepared = p.prepared;
    const last: Boundary = { kind, index, offset, charStart, from: p.originalVoice, to: String(p.target.id) };
    cleanup(p, true);
    let restoreFactory: (() => void) | undefined, restorePlay: (() => void) | undefined;
    try {
      // Native _createController wires its own listeners and copies pause/speed.
      // Its first _speakInternal sees the already decoded buffer in the native cache.
      prepared._position = index;
      p.manager._activeSegment = p.segments[index];
      p.manager._activeTimestampIndex = null;
      const play = prepared._playAudioBuffer;
      restorePlay = shadow(prepared, '_playAudioBuffer', function (this: any, ...args: any[]) {
        restorePlay?.(); restorePlay = undefined;
        if (prepared._position === index && prepared._segments === p.segments) args[1] = offset;
        return Reflect.apply(play, this, args);
      });
      restoreFactory = shadow(p.target, 'getController', () => prepared);
      select(p.selection);
      if (p.manager._controller !== prepared) throw new Error('Zotero-TTS: prepared voice controller was not adopted');
      report(p).stage = 'committed'; report(p).last = last;
      deps.debug?.(`voice handoff ${kind}: ${last.from} -> ${last.to}, segment ${index}, char ${charStart}, offset ${offset}`);
      notice(p.reader, 'selected', label(p.target));
    } catch (e) {
      restorePlay?.();
      if (p.manager._controller !== prepared) prepared.destroy();
      report(p).stage = 'failed'; deps.error(e); notice(p.reader, 'failed', label(p.target));
    } finally { restoreFactory?.(); }
  }

  function armWord(p: Pending): boolean {
    if (p.manager.paused) return false;
    const c = p.old, index = Number(c._position);
    if (p.sentenceOnlyIndex === index) { report(p).wordDecision = 'paused-sentence-fallback'; return false; }
    if (p.disarm && p.armedNode !== c._sourceNode) {
      p.disarm(); p.disarm = undefined; p.armedNode = undefined;
    }
    if (p.disarm) return true;
    if (!p.ready.has(index)) { report(p).wordDecision = 'audio-not-ready-for-current-segment'; return false; }
    if (c._currentIndex !== index || !c._isPlaying) { report(p).wordDecision = 'old-source-not-playing'; return false; }
    const node = c._sourceNode, context = c._audioContext;
    if (!node || context?.state !== 'running') { report(p).wordDecision = 'old-output-not-running'; return false; }
    const buffer = p.prepared._audioBuffers.get(index);
    const progress = Number(c._currentPlaybackTime);
    const decision = inspectWordHandoff(String(p.segments[index]?.text ?? ''), c._currentTimestamps,
      p.prepared._segmentTimestamps.get(index), progress + p.rate * 0.04, Number(c._currentBuffer?.duration), Number(buffer?.duration));
    report(p).wordDecision = decision.reason;
    const boundary = decision.boundary;
    if (!boundary) return false;
    // Use the native buffer-to-context mapping, avoiding time spent reading
    // and validating the two timestamp arrays altogether.
    const when = Number(c._playbackStartContextTime) + (boundary.end - Number(c._playbackOffset)) / Number(c._playbackRate);
    if (!Number.isFinite(when) || when - Number(context.currentTime) < 0.04) {
      report(p).wordDecision = 'boundary-too-close'; return false;
    }
    const previous = node.onended;
    const handler = exported(() => {
      // The audio clock, not a highlight timer, has finished this word.
      p.disarm = undefined;
      if (!valid(p) || c._sourceNode !== node) {
        cancel(p);
        // A catalog refresh can arrive after the last poll but before the
        // scheduled stop. Continue the original buffer from that word end.
        if (!deps.isDead?.(c) && p.manager.active && !p.manager.paused && p.manager._controller === c
          && !c._destroyed && c._sourceNode === node) {
          c._playAudioBuffer(c._currentBuffer, boundary.end, p.manager.speed, c._currentTimestamps);
        }
        return;
      }
      commit(p, 'word', index, boundary.offset, boundary.charStart);
    }, node);
    node.onended = handler;
    p.armedNode = node;
    p.disarm = () => {
      // A later stop() replaces the scheduled stop. Put it beyond natural
      // buffer completion so cancellation does not truncate the old sentence.
      if (c._sourceNode === node && node.onended === handler) {
        node.onended = previous;
        node.stop(Number(context.currentTime) + Math.max(0, Number(c._currentBuffer?.duration) - Number(c._currentPlaybackTime)) / p.rate + 1);
      }
    };
    node.stop(when);
    report(p).stage = 'word';
    return true;
  }

  function resumePrepared(p: Pending) {
    const index = Number(p.old._position);
    if (!valid(p) || !p.manager.paused || !p.ready.has(index)
      || p.old._currentIndex !== index || p.prepared._audioContext?.state !== 'running') return;
    const times = p.old._currentTimestamps;
    const progress = Number(p.old._currentPlaybackTime);
    const boundary = pausedWordHandoff(String(p.segments[index]?.text ?? ''), times,
      p.prepared._segmentTimestamps.get(index), progress,
      Number(p.old._currentBuffer?.duration), Number(p.prepared._audioBuffers.get(index)?.duration));
    // Never jump over an unaligned word to reach a later usable cut.
    if (!boundary) { p.sentenceOnlyIndex = index; return; }
    report(p).wordDecision = 'paused-word-boundary';
    commit(p, 'word', index, boundary.offset, boundary.charStart);
  }

  async function openOutput(p: Pending) {
    const context = p.prepared?._audioContext;
    if (context?.state === 'suspended') {
      await withTimeout(Promise.resolve(context.resume()), 3000,
        () => new Error('Zotero-TTS: the new voice audio output is blocked'));
    }
    if (context?.state !== 'running') throw new Error('Zotero-TTS: the new voice audio output is not running');
  }

  async function load(p: Pending, index: number) {
    if (p.loading || !valid(p)) return;
    p.loading = true;
    try {
      await withTimeout(Promise.resolve(p.prepared._getAudioData(index)), REQUEST_TIMEOUT,
        () => new Error('Zotero-TTS: preparing the next voice timed out'));
      if (!valid(p)) return;
      if (!p.manager.paused) await openOutput(p);
      if (!valid(p)) return;
      p.ready.add(index); report(p).prepared = [...p.ready];
      const observed: AudioReady = { index, elapsedMs: Date.now() - p.started,
        playingIndex: Number(p.old._position), progress: Number(p.old._currentPlaybackTime),
        oldTimings: Number(p.old._currentTimestamps?.length ?? 0),
        newTimings: Number(p.prepared._segmentTimestamps.get(index)?.length ?? 0) };
      report(p).audioReady.push(observed);
      if (report(p).audioReady.length > 8) report(p).audioReady.shift();
      deps.debug?.(`voice audio ready: segment ${index}, ${observed.elapsedMs} ms, playing ${observed.playingIndex} at ${observed.progress}, timings ${observed.oldTimings}/${observed.newTimings}`);
      p.missed = Math.max(p.missed, Number(p.old._position) - index);
      // Audio is available now: schedule the first safe word boundary without
      // waiting for the next polling tick (or another sentence request).
      armWord(p);
    } catch (e) { fail(p, e); }
    finally { p.loading = false; }
  }

  function poll(p: Pending) {
    try {
      if (!valid(p)) { cancel(p); return; }
      if (p.manager.paused) p.deadline = Date.now() + HANDOFF_TIMEOUT;
      if (Date.now() > p.deadline) { fail(p, new Error('Zotero-TTS: no prepared handoff boundary was reached')); return; }
      if (!p.prepared) {
        if (p.target.segmentGranularity !== p.manager._segmentGranularity) throw new Error('Zotero-TTS: pause before switching between different segment granularities');
        const c: any = waive(Reflect.apply(p.target.getController, p.target, [p.segments, p.old._position, p.old._forwardStopIndex]));
        p.prepared = c;
        if (typeof c?._getAudioData !== 'function' || typeof c?._playAudioBuffer !== 'function') throw new Error('Zotero-TTS: this voice cannot prepare audio during playback');
        c.paused = true;
        c.speed = p.rate;
        void load(p, Number(p.old._position));
      } else if (!armWord(p) && !p.loading) {
        const position = Number(p.old._position);
        const future = [...p.ready].some(i => i > position);
        const awaitingTransition = p.ready.has(position) && p.old._currentIndex !== position;
        if (!future && !awaitingTransition) {
          const end = Math.min(p.segments.length - 1, p.old._forwardStopIndex == null ? p.segments.length - 1 : p.old._forwardStopIndex - 1);
          const index = Math.min(end, position + Math.min(8, p.missed + 1));
          if (index > position && !p.ready.has(index)) {
            report(p).stage = 'sentence'; void load(p, index);
          }
        }
      }
      if (pending.get(p.reader) === p) p.timer = setTimeout(() => poll(p), 25);
    } catch (e) { fail(p, e); }
  }

  function begin(reader: any, target: any, selection: () => void): boolean {
    const manager = managerOf(reader);
    const existing = pending.get(reader);
    if (existing && existing.target.id === target.id) { existing.selection = selection; return true; }
    if (existing) cancel(existing);
    if (!manager?.active) return false;
    const old = waive(manager._controller);
    if (!old || !manager._segments?.length) { notice(reader, 'unavailable', label(target)); return true; }
    const p: Pending = { reader, manager, old, target, selection, segments: manager._segments, catalog: manager.allVoices, originalVoice: manager.selectedVoiceID,
      rate: manager.speed, prepared: null, ready: new Set(), loading: false, missed: 0, started: Date.now(), undo: [],
      deadline: Date.now() + HANDOFF_TIMEOUT, abort: deps.newAbortController?.(reader) };
    const last = reports.get(reader)?.last ?? null;
    reports.set(reader, { controlsAttached: attached.has(reader), pending: String(target.id), stage: 'preparing', prepared: [], last, wordDecision: null, audioReady: [] });
    pending.set(reader, p);
    try {
      // Manual actions cancel synchronously, before they change playback. A
      // changed controller or destroyed reader is also caught by the poll.
      for (const name of ['deactivate', 'applyPersistedVoices', 'skipBack', 'skipAhead', 'setSpeed', 'jumpTo', 'repositionTo', 'clearSegments']) {
        const original = manager[name];
        if (typeof original !== 'function') continue;
        p.undo.push(shadow(manager, name, function (this: unknown, ...args: unknown[]) {
          cancel(p); return Reflect.apply(original, this, args);
        }));
      }
      const pause = manager.pause;
      if (typeof pause === 'function') p.undo.push(shadow(manager, 'pause', function (this: unknown, ...args: unknown[]) {
        p.resumePending = false;
        p.disarm?.(); p.disarm = undefined; p.armedNode = undefined;
        return Reflect.apply(pause, this, args);
      }));
      if (typeof manager.play === 'function') {
        const play = manager.play;
        p.undo.push(shadow(manager, 'play', function (this: unknown, ...args: unknown[]) {
          if (manager.paused && p.ready.has(Number(old._position)) && p.prepared._audioContext?.state === 'suspended') {
            if (!p.resumePending) {
              p.resumePending = true;
              void openOutput(p).then(() => {
                if (!valid(p) || !p.resumePending) return;
                p.resumePending = false;
                resumePrepared(p);
                Reflect.apply(play, manager, args);
              }, error => {
                if (!valid(p) || !p.resumePending) return;
                fail(p, error);
                Reflect.apply(play, manager, args);
              });
            }
            return;
          }
          resumePrepared(p);
          return Reflect.apply(play, this, args);
        }));
      }
      if (typeof old._speakInternal !== 'function') throw new Error('Zotero-TTS: no native sentence transition is available');
      const speak = old._speakInternal;
      p.undo.push(shadow(old, '_speakInternal', function (this: unknown, ...args: unknown[]) {
        const index = Number(old._position);
        if (valid(p) && !manager.paused && p.ready.has(index) && old._currentIndex !== index) {
          commit(p, 'sentence', index, 0, 0); return;
        }
        return Reflect.apply(speak, this, args);
      }));
      const destroy = old.destroy;
      p.undo.push(shadow(old, 'destroy', function (this: unknown, ...args: unknown[]) {
        cancel(p); return Reflect.apply(destroy, this, args);
      }));
      notice(reader, 'preparing', label(target));
      // Coalesce a quick run of key presses before issuing synthesis requests.
      p.timer = setTimeout(() => poll(p), 120);
      return true;
    } catch (e) { fail(p, e); return true; }
  }

  function step(reader: unknown, direction: -1 | 1) {
    try {
      attach(reader);
      const manager = managerOf(reader);
      if (!manager?.active) return;
      const list = playerVoices<any>(manager.voicesForLanguage);
      const requested = pending.get(reader)?.target.id;
      const selected = list.some(v => v.id === requested) ? requested : manager.selectedVoiceID;
      const voice = adjacentVoice(list, selected, direction);
      if (!voice) {
        if (!list.some(v => v.id === selected)) notice(reader, 'unavailable', '');
        return;
      }
      if (voice.id === manager.selectedVoiceID) {
        const old = pending.get(reader); if (old) cancel(old);
        notice(reader, 'selected', label(voice)); return;
      }
      const selection = () => Reflect.apply(manager.selectVoice, manager, [voice.id]);
      if (!begin(reader, voice, selection)) { select(selection); notice(reader, 'selected', label(voice)); }
    } catch (e) { deps.error(e); notice(reader, 'failed', ''); }
  }

  return {
    attach, detach,
    isPreviewing: reader => previewing.has(reader),
    preparationSignal(reader, voiceID) {
      const p = pending.get(reader);
      return p && (p.target.id === voiceID || p.target.impl?.id === voiceID) ? p.abort?.signal : undefined;
    },
    step,
    defer(reader, voiceID, selection) {
      if (!propagating) return false;
      const manager = managerOf(reader);
      if (!manager?.active) return false;
      const voice = playerVoices<any>(manager.allVoices).find(v => v.id === voiceID);
      return voice ? begin(reader, voice, selection) : false;
    },
    inspect(reader) { return reader && typeof reader === 'object' ? reports.get(reader) ?? null : null; },
    dispose() {
      for (const p of [...pending.values()]) cancel(p);
      for (const reader of [...attached.keys()]) detach(reader);
    },
  };
}
