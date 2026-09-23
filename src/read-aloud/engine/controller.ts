/**
 * The controller Read Aloud's manager gets from the Engine (issue #133,
 * ADR 0005): an object of the reader window with the members the manager
 * uses of `RemoteReadAloudController` (reader.js 82653-82718), each handed
 * to the tab's session (core/engine/session.ts).
 *
 * It is an EventTarget of the reader window, so the manager's
 * `addEventListener` is the window's own, and every event is a window
 * `Event` carrying `segment`, as Read Aloud's `ReadAloudEvent` does
 * (39513-39519). Its members are accessors and methods exported into the
 * window; what they answer is the reader's own objects — segments, timing
 * arrays cloned in when the clip arrived, the window's promises — or
 * primitives (MEMORY/code.md, Compartments).
 *
 * The credit members work as Read Aloud's do (39353-39367, 40223-40246):
 * read from the voice and its provider, and for a Zotero voice refreshed
 * through the provider's interface. A plugin voice's refresh and reset do
 * nothing, which ends the minute-by-minute `tts/credits` request the
 * manager makes while a controller exists (82641-82646) for readings with
 * the plugin's voices.
 */

import type { EngineSession } from '../../core/engine/session';
import type { EngineEventType, EngineSegment } from '../../core/engine/types';
import type { DecodedClip } from './audio-output';

type AnyFn = (...args: any[]) => any;

export interface ControllerDeps {
  /** The reader window the manager lives in. */
  window: any;
  exportFunction(fn: AnyFn, target: object): AnyFn;
  waiveXrays<T>(value: T): T;
  /** A promise of the reader window settling as `job` does (the manager awaits the credit calls). */
  promise(job: Promise<unknown>): unknown;
  /** The manager destroyed this controller (`_destroyController`, reader.js 82719-82727). */
  destroyed(): void;
  error(e: unknown): void;
}

export interface EngineController {
  /** The reader-window object the manager holds. */
  readonly object: any;
  /** Send an event to the manager's listeners; nothing once destroyed. */
  dispatch(type: EngineEventType, segment: EngineSegment | null): void;
  /** Whether the manager still holds it. */
  readonly live: boolean;
  /** Stop answering: every member reads its last value, every call does nothing. */
  retire(): void;
}

export interface ControllerBinding {
  session: EngineSession<DecodedClip>;
  /** The reader's voice the manager asked, waived. */
  voice: any;
  /** Whether it is one of Zotero's own voices, whose credits are Zotero's. */
  zoteroVoice: boolean;
}

export function createEngineController(binding: ControllerBinding, deps: ControllerDeps): EngineController {
  const { session, voice, zoteroVoice } = binding;
  const win = deps.window;
  const target = deps.waiveXrays(new win.EventTarget());
  let live = true;
  const guard = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (e) {
      deps.error(e);
      return fallback;
    }
  };
  const define = (name: string, get: () => unknown, set?: (value: unknown) => void): void => {
    Object.defineProperty(target, name, {
      get: deps.exportFunction(() => guard(get, null), win),
      ...(set ? { set: deps.exportFunction((value: unknown) => guard(() => set(value), undefined), win) } : {}),
      enumerable: true,
      configurable: true,
    });
  };
  const method = (name: string, fn: (...args: any[]) => unknown): void => {
    Object.defineProperty(target, name, {
      value: deps.exportFunction((...args: unknown[]) => guard(() => fn(...args), undefined), win),
      enumerable: false,
      configurable: true,
      writable: true,
    });
  };

  // State (reader.js 39313-39382)
  define('paused', () => session.paused, (value) => live && session.setPaused(!!value));
  define('speed', () => session.speed, (value) => live && session.setSpeed(Number(value)));
  define('buffering', () => session.buffering);
  define('error', () => session.error);
  define('activeTimestampIndex', () => session.activeTimestampIndex);
  define('lastSkipGranularity', () => session.lastSkipGranularity);
  define('position', () => session.position);
  define('voice', () => voice);
  define('lang', () => voice.language);

  // Credits (reader.js 39353-39361)
  define('minutesRemaining', () => voice.minutesRemaining ?? null);
  define('hasStandardMinutesRemaining', () => {
    const remaining = voice.provider?.standardCreditsRemaining;
    return remaining !== null && remaining !== undefined && remaining > 0;
  });

  // Playback (reader.js 39417-39459, 40247-40257, 40381-40385, 39386-39395, 40122-40137)
  method('skipBack', (granularity?: unknown, accelerate?: unknown) => {
    if (live) session.skipBack(granularity === undefined ? 'paragraph' : String(granularity), !!accelerate);
  });
  method('skipAhead', (granularity?: unknown, accelerate?: unknown) => {
    if (live) session.skipAhead(granularity === undefined ? 'paragraph' : String(granularity), !!accelerate);
  });
  method('retry', () => {
    if (live) session.retry();
  });
  method('getTimestampsForSegment', (segment: unknown) => session.getTimestampsForSegment(segment ? deps.waiveXrays(segment) : segment) ?? null);
  method('getSegmentToAnnotate', () => session.getSegmentToAnnotate() ?? null);
  method('syncActiveWordToPlayback', () => {
    if (live) session.syncActiveWordToPlayback();
  });
  method('destroy', () => {
    if (!live) return;
    live = false;
    deps.destroyed();
  });
  method('refreshCreditsRemaining', () => deps.promise(zoteroVoice && live ? credits('getCreditsRemaining') : Promise.resolve()));
  method('resetCredits', () => deps.promise(zoteroVoice && live ? credits('resetCredits') : Promise.resolve()));

  /** Read Aloud's own credit refresh for a Zotero voice (reader.js 40223-40246). */
  async function credits(call: 'getCreditsRemaining' | 'resetCredits'): Promise<void> {
    const provider = voice.provider;
    const result = await provider.remote[call]();
    const standard = result?.standardCreditsRemaining ?? null;
    const premium = result?.premiumCreditsRemaining ?? null;
    if (standard !== null) provider.standardCreditsRemaining = standard;
    if (premium !== null) provider.premiumCreditsRemaining = premium;
  }

  return {
    object: target,
    get live() {
      return live;
    },
    dispatch(type, segment) {
      if (!live) return;
      const event = deps.waiveXrays(new win.Event(type));
      event.segment = segment ?? null;
      target.dispatchEvent(event);
    },
    retire() {
      live = false;
    },
  };
}
