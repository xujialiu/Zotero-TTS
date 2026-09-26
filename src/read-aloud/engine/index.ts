/**
 * The Engine in Zotero (issue #133, ADR 0005): every voice of the Player
 * plays on the plugin's own engine, behind Read Aloud's manager.
 *
 * The manager builds its engine in one place: `_createController` asks the
 * selected voice for a controller (reader.js 82653-82718), and every voice
 * of the Player is a `RemoteReadAloudVoice`, whose `getController` (40476)
 * builds Read Aloud's. So `getController` is shadowed on that class's
 * prototype, per tab, and answers with a controller of the tab's session
 * (controller.ts, core/engine/session.ts). Samples go on through
 * `getSampleController`, untouched: they stay Read Aloud's.
 *
 * Three more shadows, on the manager's prototype, per tab:
 *
 * - `activeTimestamp`, the getter the word highlight is drawn from
 *   (82229-82235, via `_computeActiveWordSourcePosition`, 83939): it
 *   answers null unless the controller is an `instanceof
 *   RemoteReadAloudController` (82230). For the Engine's controller the
 *   shadow answers what the getter would, without that test.
 * - `setSegments`, the public call a session's first controller follows
 *   (84074, 82543-82549): the voice prototype is reached from a live voice
 *   only, and on a tab's first open the voice list lands a microtask before
 *   the manager activates, so it is patched here, just in time.
 * - `repositionTo`, the public jump (82621-82628): the controller it builds
 *   starts where it was told, never carrying on.
 *
 * Everything else the reader does with reading state goes through the
 * manager, not the controller, so Segmentation, the Highlight, the Follow
 * and the Position carry on as Zotero's (ADR 0005, "The seam").
 *
 * A session outlives the controllers: the manager destroys and rebuilds its
 * controller whenever a voice is applied, and a rebuild onto the same voice
 * over the same segments carries on mid-sentence (#75). A destroyed
 * controller no other follows within the task ends the session: the sound
 * stops and the tab's AudioContext closes.
 *
 * A plugin update pauses the reading (a departure settled 2026-09-23): at
 * shutdown the manager is paused at the active segment and left holding a
 * retired controller, and the successor, at its attach, has the manager
 * build a controller of its own there, paused (`adopt`); Play carries on
 * from that segment with the new version.
 */

import { createReadingSections } from '../reading-sections';
import type { RemainingSnapshot } from '../../core/engine/session';
import type { PauseSettings } from '../../core/engine/gap';
import { EngineSession, type PlaybackNotice } from '../../core/engine/session';
import type { EngineClock, EngineSegment, EngineVoice, FetchResult } from '../../core/engine/types';
import { createProtoPatches } from '../proto-patches';
import { ownerOf } from '../system-voices';
import { createAudioOutput, type AudioOutput, type DecodedClip } from './audio-output';
import { createEngineController, type EngineController } from './controller';

type AnyFn = (...args: any[]) => any;

/** What a tab's fetch needs of the voice: the reader's own, whose `impl` the interface is asked with. */
export interface TabVoice extends EngineVoice {
  readonly reader: any;
}

/** The plugin's composite interface of one reader (remote-interface.ts), called on the plugin's side. */
export interface SegmentAudioSource {
  getAudio(segment: unknown, voice: unknown, options?: { signal?: AbortSignal }): Promise<any>;
  /** Drop a cached answer whose audio would not decode (remote-interface.ts). */
  forget?(segment: unknown, voice: unknown): Promise<void>;
}

export interface EngineDeps {
  exportFunction(fn: AnyFn, target: object): AnyFn;
  waiveXrays<T>(value: T): T;
  isDead(value: unknown): boolean;
  /** `Components.utils.cloneInto(value, target)`. */
  cloneInto<T>(value: T, target: unknown): T;
  /** A copy of a reader Float32Array on the plugin's side. */
  toLocal(value: Float32Array): Float32Array;
  /** The interface built for this reader, which fetches every voice's audio as Read Aloud's engine had it fetched. */
  audioSource(reader: unknown): SegmentAudioSource | null;
  /** Whether a voice id is one of the plugin's (voice-catalog.ts decodeVoiceId). */
  isPluginVoice(id: string): boolean;
  /** The pane's pause settings, read at every sentence boundary. */
  pauses(): PauseSettings;
  /** The volume pref, in percent. */
  volume(): number;
  /** The playback notice of a reader (ui/voice-notice.ts). */
  notice(reader: unknown, kind: PlaybackNotice): void;
  error(e: unknown): void;
  debug?(message: string): void;
  /** Injected by the tests; timers and Date.now otherwise. */
  clock?: EngineClock;
  /** Injected by the tests; a resolved promise's `then` otherwise. */
  microtask?(fn: () => void): void;
}

/** One reader tab. */
interface Tab {
  reader: any;
  manager: any;
  window: any;
  session: EngineSession<DecodedClip>;
  audio: AudioOutput;
  controller: EngineController | null;
  /** Set around `repositionTo`: the controller it builds starts where told. */
  jump: boolean;
  stats: { controllers: number; carriedOn: number; started: number; ended: number; adopted: number; late: number; fallbacks: number };
}

export interface EngineReport {
  attached: boolean;
  hooks: { getController: boolean; activeTimestamp: boolean; setSegments: boolean; repositionTo: boolean };
  controller: { ours: boolean; live: boolean } | null;
  session: Record<string, unknown> | null;
  audio: ReturnType<AudioOutput['inspect']> | null;
  stats: Tab['stats'] | null;
}

export interface Engine {
  /** Patch the reader's manager and voices, and take over a reading someone else's controller holds; true once attached. Idempotent. */
  attach(reader: unknown): boolean;
  /** The reader's tab is closing: stop its sound. */
  detach(reader: unknown): void;
  /** Whether a controller the manager holds is the Engine's. */
  owns(controller: unknown): boolean;
  /** The session of a reader, for the handoff and the diagnostics. */
  session(reader: unknown): EngineSession<DecodedClip> | null;
  /** A reader's voice as the Engine plays it. */
  voiceOf(voice: any): TabVoice;
  /** Whether the reader's manager holds a live controller of the Engine's. */
  bound(reader: unknown): boolean;
  /** The texts after `text`, for the plugin's warm chain (remote-interface.ts). */
  upcomingTexts(reader: unknown, text: string, count: number, skip: (segment: EngineSegment) => boolean): string[];
  /** Move every tab's volume. */
  setVolume(level: number): void;
  remainingTime(reader: unknown): RemainingSnapshot;
  inspect(reader: unknown): EngineReport;
  patchCounts(): { total: number; live: number };
  /**
   * Stop: pause every reading at its segment, silence every tab, put
   * every prototype back. `handBack` (a disable or uninstall) then has each
   * paused manager build a controller of Zotero's own, so Play works
   * without the plugin; an update leaves that to the successor.
   */
  dispose(options?: { handBack?: boolean }): void;
}

const defaultClock: EngineClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** The prototype in `obj`'s chain that owns the accessor `name`. */
function accessorOwnerOf(obj: unknown, name: string): any {
  let proto = obj && typeof obj === 'object' ? Object.getPrototypeOf(obj) : null;
  for (let depth = 0; depth < 8 && proto && proto !== Object.prototype; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (descriptor) return typeof descriptor.get === 'function' ? proto : null;
    proto = Object.getPrototypeOf(proto);
  }
  return null;
}

export function createEngine(deps: EngineDeps): Engine {
  const sectionFor = createReadingSections();
  const estimateErrors = new WeakSet<object>();
  const patches = createProtoPatches({ exportFunction: deps.exportFunction, isDead: deps.isDead, error: deps.error });
  const clock = deps.clock ?? defaultClock;
  const microtask = deps.microtask ?? ((fn: () => void) => void Promise.resolve().then(fn));
  const waive = <T>(value: T): T => (value && (typeof value === 'object' || typeof value === 'function') ? deps.waiveXrays(value) : value);
  const alive = (value: unknown): boolean => {
    try {
      return !!value && !deps.isDead(value);
    } catch {
      return false;
    }
  };
  /** Per manager, so a tab's record dies with it. */
  const tabs = new WeakMap<object, Tab>();
  /** Every tab attached, for the volume and the dispose; pruned of the dead. */
  const all = new Set<Tab>();
  /** Every controller the Engine made, the reader-window object it hands out. */
  const controllers = new WeakSet<object>();
  let disposed = false;

  const managerOf = (reader: any): any => {
    try {
      return alive(reader) && alive(reader._internalReader) ? waive(reader._internalReader._readAloudManager) : null;
    } catch {
      return null;
    }
  };

  const tabOfReader = (reader: unknown): Tab | null => {
    const manager = managerOf(reader);
    return manager ? (tabs.get(manager) ?? null) : null;
  };

  function createTab(reader: any, manager: any, window: any): Tab {
    let session: EngineSession<DecodedClip> | null = null;
    const audio = createAudioOutput({
      window: () => (alive(window) ? window : null),
      toWindow: (value, target) => deps.cloneInto(value, target),
      toLocal: deps.toLocal,
      exportFunction: deps.exportFunction,
      level: deps.volume,
      onStateChange: () => session?.outputChanged(),
      onDeviceChange: () => session?.deviceChanged(),
      error: deps.error,
    });
    const tab: Tab = {
      reader,
      manager,
      window,
      session: null as unknown as EngineSession<DecodedClip>,
      audio,
      controller: null,
      jump: false,
      stats: { controllers: 0, carriedOn: 0, started: 0, ended: 0, adopted: 0, late: 0, fallbacks: 0 },
    };
    session = new EngineSession<DecodedClip>({
      clock,
      audio,
      fetch: (segment, voice, signal) => fetchFor(tab, segment, voice as TabVoice, signal),
      discard: (segment, voice) => {
        const source = deps.audioSource(tab.reader);
        if (source?.forget) void source.forget(segment, (voice as TabVoice).reader.impl).catch(deps.error);
      },
      pauses: deps.pauses,
      emit: (type, segment) => tab.controller?.dispatch(type, segment),
      notice: (kind) => {
        try {
          deps.notice(tab.reader, kind);
        } catch (e) {
          deps.error(e);
        }
      },
      log: deps.error,
      debug: deps.debug,
    });
    tab.session = session;
    return tab;
  }

  /** A segment's audio, through the reader's interface: the plugin's providers for its voices, Zotero's own call for Zotero's (ADR 0005). */
  async function fetchFor(tab: Tab, segment: EngineSegment, voice: TabVoice, signal?: unknown): Promise<FetchResult> {
    const source = deps.audioSource(tab.reader);
    if (!source) return { audio: null, error: 'unknown' };
    const result = await source.getAudio(segment, voice.reader.impl, signal ? { signal: signal as AbortSignal } : undefined);
    if (!alive(tab.window)) {
      // The tab closed while this was on its way: nothing is waiting for it (issue #116)
      tab.stats.late++;
      deps.debug?.('late audio dropped: its reader window was gone');
      return { audio: null, error: 'unknown' };
    }
    const timestamps = result?.timestamps;
    return {
      audio: result?.audio ?? null,
      // The manager reads them in its own window (activeTimestamp): cloned in once, here
      timestamps: timestamps ? deps.cloneInto(timestamps, tab.window) : null,
      error: result?.error ?? null,
    } as FetchResult;
  }

  /** A reader's voice, waived, as the session plays it. */
  function voiceOf(voice: any): TabVoice {
    return {
      id: String(voice.id ?? ''),
      lang: String(voice.language ?? ''),
      sentenceDelay: Number(voice.sentenceDelay) || 0,
      reader: voice,
    };
  }

  /** The controller for a voice's `getController`: a new one on the tab's session. */
  function controllerFor(tab: Tab, voice: any, segments: ArrayLike<EngineSegment>, backwardStopIndex: unknown, forwardStopIndex: unknown): EngineController {
    tab.controller?.retire();
    const tabVoice = voiceOf(voice);
    const id = tabVoice.id;
    const jump = tab.jump;
    tab.jump = false;
    const result = tab.session.bind({
      voice: tabVoice,
      segments,
      backwardStopIndex: typeof backwardStopIndex === 'number' ? backwardStopIndex : null,
      forwardStopIndex: typeof forwardStopIndex === 'number' ? forwardStopIndex : null,
      jump,
    });
    const controller: EngineController = createEngineController(
      { session: tab.session, voice, zoteroVoice: !deps.isPluginVoice(id) },
      {
        window: tab.window,
        exportFunction: deps.exportFunction,
        waiveXrays: waive,
        promise: (job) => new tab.window.Promise((resolve: (value: unknown) => void, reject: (e: unknown) => void) => job.then(resolve, reject)),
        destroyed: () => destroyed(tab, controller),
        error: deps.error,
      },
    );
    controllers.add(controller.object);
    tab.controller = controller;
    tab.stats.controllers++;
    if (result === 'carried-on') {
      tab.stats.carriedOn++;
      // The manager forgot the lit word with the old controller; its listeners are wired once this returns
      microtask(() => {
        if (tab.controller === controller) tab.session.restateWord();
      });
    } else {
      tab.stats.started++;
    }
    deps.debug?.(`engine: controller ${result} for ${id}`);
    return controller;
  }

  /** The manager destroyed a controller: unless another follows in this task, the session ends. */
  function destroyed(tab: Tab, controller: EngineController): void {
    if (tab.controller !== controller) return;
    tab.controller = null;
    microtask(() => {
      if (tab.controller !== null || tab.session.ended) return;
      tab.session.end();
      tab.audio.close();
      tab.stats.ended++;
    });
  }

  /** Shadow `getController` on the prototype of the tab's remote voices, found through any live one. */
  function patchVoices(tab: Tab): void {
    let voices: any;
    try {
      voices = tab.manager.allVoices;
    } catch {
      return;
    }
    const length = voices ? Number(voices.length) || 0 : 0;
    for (let i = 0; i < length; i++) {
      const voice = waive(voices[i]);
      if (!voice?.provider?.remote) continue;
      const proto = ownerOf(voice, 'getController');
      if (!proto) continue;
      patches.shadow(proto, 'getController', (original) =>
        function (this: unknown, segments: unknown, backwardStopIndex: unknown, forwardStopIndex: unknown) {
          if (!disposed && alive(tab.window)) {
            try {
              return controllerFor(tab, waive(this), waive(segments) as ArrayLike<EngineSegment>, backwardStopIndex, forwardStopIndex).object;
            } catch (e) {
              // Better Read Aloud's own engine than no reading at all; loud in the console
              deps.error(e);
              tab.stats.fallbacks++;
            }
          }
          return Reflect.apply(original, this, [segments, backwardStopIndex, forwardStopIndex]);
        },
      );
      return;
    }
  }

  function patchManager(tab: Tab): void {
    const manager = tab.manager;
    const getterProto = accessorOwnerOf(manager, 'activeTimestamp');
    if (getterProto) {
      patches.shadowGetter(getterProto, 'activeTimestamp', (original) =>
        function (this: unknown) {
          const m = waive(this) as any;
          const controller = m?._controller;
          if (!controller || !controllers.has(waive(controller))) return Reflect.apply(original, this, []);
          // reader.js 82229-82235, less the instanceof test
          const index = m._activeTimestampIndex;
          const segment = m._activeSegment;
          if (index === null || index === undefined || !segment) return null;
          const timings = tabs.get(m)?.session.getTimestampsForSegment(waive(segment));
          return timings?.[index] ?? null;
        },
      );
    }
    const setSegmentsProto = ownerOf(manager, 'setSegments');
    if (setSegmentsProto) {
      patches.shadow(setSegmentsProto, 'setSegments', (original) =>
        function (this: unknown, ...args: unknown[]) {
          const tab = tabs.get(waive(this) as object);
          if (tab) patchVoices(tab);
          return Reflect.apply(original, this, args);
        },
      );
    }
    const repositionProto = ownerOf(manager, 'repositionTo');
    if (repositionProto) {
      patches.shadow(repositionProto, 'repositionTo', (original) =>
        function (this: unknown, ...args: unknown[]) {
          const tab = tabs.get(waive(this) as object);
          if (!tab) return Reflect.apply(original, this, args);
          patchVoices(tab);
          tab.jump = true;
          try {
            return Reflect.apply(original, this, args);
          } finally {
            tab.jump = false;
          }
        },
      );
    }
  }

  /** The index of the manager's active segment in its segments, walked by index; -1 when none. */
  function activeIndex(manager: any): number {
    const segments = manager.segments;
    const active = manager.activeSegment;
    const length = segments ? Number(segments.length) || 0 : 0;
    if (!active) return -1;
    for (let i = 0; i < length; i++) if (segments[i] === active) return i;
    return -1;
  }

  /**
   * A reading open under a controller that is not this Engine's — a previous
   * instance's, retired at its shutdown, or Read Aloud's own from before
   * the Engine — pauses, and the manager builds one of the Engine's where
   * it stands (`setSegments` recomputes the start from the active segment,
   * reader.js 82659-82663).
   */
  function adopt(tab: Tab): void {
    const manager = tab.manager;
    const controller = manager._controller;
    if (!manager.active || !controller || controllers.has(waive(controller))) return;
    const segments = manager.segments;
    if (!segments || !Number(segments.length)) return;
    if (!manager.paused) manager.pause();
    const index = activeIndex(manager);
    const start = index >= 0 ? index : typeof manager._backwardStopIndex === 'number' ? manager._backwardStopIndex : 0;
    manager.setSegments(segments, start, null);
    tab.stats.adopted++;
    deps.debug?.(`engine: took over a reading at segment ${start}`);
  }

  function attach(reader: any): boolean {
    if (disposed) return false;
    try {
      const manager = managerOf(reader);
      const window = reader?._iframeWindow;
      if (!manager || !alive(window)) return false;
      let tab = tabs.get(manager);
      const first = !tab;
      if (!tab) {
        tab = createTab(reader, manager, window);
        tabs.set(manager, tab);
        all.add(tab);
      }
      patchManager(tab);
      patchVoices(tab);
      // Only a tab this instance meets for the first time can hold another
      // instance's reading; later, a controller not ours is a fallback the
      // log already reported, and taking it over would pause the reading
      if (first) adopt(tab);
      return true;
    } catch (e) {
      deps.error(e);
      return false;
    }
  }

  function remainingTime(reader: unknown): RemainingSnapshot {
    const session = tabOfReader(reader)?.session;
    if (!session || session.ended) return { status: 'estimating', scope: 'document', seconds: null };
    const report = (error: unknown) => {
      if (reader && typeof reader === 'object' && !estimateErrors.has(reader)) {
        estimateErrors.add(reader);
        deps.error(error);
      }
    };
    let section;
    try { section = session.segments ? sectionFor(reader, session.segments, session.position) : undefined; }
    catch (error) { report(error); }
    try { return session.remainingTime(section); }
    catch (error) {
      report(error);
      return { status: 'unavailable', scope: 'document', seconds: null };
    }
  }

  function silence(tab: Tab): void {
    tab.controller?.retire();
    tab.controller = null;
    tab.session.end();
    tab.audio.close();
  }

  function prune(): void {
    for (const tab of all) if (!alive(tab.manager) || !alive(tab.window)) all.delete(tab);
  }

  return {
    attach,

    detach(reader) {
      const tab = tabOfReader(reader);
      if (!tab) return;
      try {
        silence(tab);
      } catch (e) {
        deps.error(e);
      }
      all.delete(tab);
    },

    owns: (controller) => !!controller && controllers.has(waive(controller as object)),

    session: (reader) => tabOfReader(reader)?.session ?? null,

    voiceOf: (voice) => voiceOf(waive(voice)),

    bound: (reader) => tabOfReader(reader)?.controller?.live === true,

    upcomingTexts(reader, text, count, skip) {
      try {
        return tabOfReader(reader)?.session.upcomingTexts(text, count, skip) ?? [];
      } catch (e) {
        deps.error(e);
        return [];
      }
    },

    setVolume(level) {
      prune();
      for (const tab of all) {
        try {
          tab.audio.setVolume(level);
        } catch (e) {
          deps.error(e);
        }
      }
    },

    remainingTime,

    inspect(reader) {
      const tab = tabOfReader(reader);
      const manager = managerOf(reader);
      const read = <T>(fn: () => T): T | null => {
        try {
          return fn();
        } catch {
          return null;
        }
      };
      const voiceProto = read(() => {
        const voices = manager?.allVoices;
        for (let i = 0; i < (Number(voices?.length) || 0); i++) {
          const voice = waive(voices[i]);
          if (voice?.provider?.remote) return ownerOf(voice, 'getController');
        }
        return null;
      });
      const held = read(() => manager?._controller) ?? null;
      const session = tab?.session;
      return {
        attached: !!tab,
        hooks: {
          getController: !!voiceProto && patches.has(voiceProto, 'getController'),
          activeTimestamp: !!manager && patches.has(accessorOwnerOf(manager, 'activeTimestamp'), 'activeTimestamp'),
          setSegments: !!manager && patches.has(ownerOf(manager, 'setSegments'), 'setSegments'),
          repositionTo: !!manager && patches.has(ownerOf(manager, 'repositionTo'), 'repositionTo'),
        },
        controller: held ? { ours: controllers.has(waive(held)), live: !!tab?.controller && tab.controller.object === waive(held) && tab.controller.live } : null,
        session: session
          ? {
              remainingTime: remainingTime(reader),
              voice: session.voice?.id ?? null,
              position: session.position,
              currentIndex: session.currentIndex,
              paused: session.paused,
              speed: session.speed,
              buffering: session.buffering,
              error: session.error,
              playing: session.isPlaying,
              inGap: session.inGap,
              skipPending: session.skipPending,
              ended: session.ended,
              activeTimestampIndex: session.activeTimestampIndex,
              playbackTime: session.currentPlaybackTime(),
              clipDuration: session.clip?.duration ?? null,
              gaps: { count: session.gaps, last: session.lastGap },
              notices: { ...session.noticeCounts },
              wordClock: { ...session.wordClock },
              handoff: session.handoff ? { target: session.handoff.target.id, pending: session.handoff.pending } : null,
              store: session.store
                ? {
                    requests: session.store.requests,
                    clips: session.store.clips.size,
                    timings: session.store.timings.size,
                    inflight: session.store.inflight.size,
                    msPerChar: session.store.timer.perCharMs,
                  }
                : null,
            }
          : null,
        audio: tab ? tab.audio.inspect() : null,
        stats: tab ? { ...tab.stats } : null,
      };
    },

    patchCounts: () => patches.counts(),

    dispose(options = {}) {
      if (disposed) return;
      prune();
      // A plugin update pauses the reading at its segment (ADR 0005)
      const paused: Tab[] = [];
      for (const tab of all) {
        try {
          if (tab.controller?.live && tab.manager.active && !tab.manager.paused) tab.manager.pause();
          if (tab.controller?.live) paused.push(tab);
        } catch (e) {
          deps.error(e);
        }
        try {
          silence(tab);
        } catch (e) {
          deps.error(e);
        }
      }
      disposed = true;
      patches.restoreAll();
      if (options.handBack) {
        for (const tab of paused) {
          try {
            const segments = tab.manager.segments;
            if (!tab.manager.active || !segments) continue;
            const index = activeIndex(tab.manager);
            tab.manager.setSegments(segments, index >= 0 ? index : 0, null);
          } catch (e) {
            deps.error(e);
          }
        }
      }
      all.clear();
    },
  };
}
