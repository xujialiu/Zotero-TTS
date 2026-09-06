/**
 * How loud Read Aloud plays, for every voice in the player (issue #62).
 *
 * Zotero has no volume of its own: no slider, no key, no pref, and the
 * audio path has no gain stage. Every voice the player offers — Zotero's
 * Standard and Premium, and the plugin's, which are the same
 * `RemoteReadAloudVoice` entries through the same interface — plays
 * through `RemoteReadAloudControllerBase._initAudioContext`
 * (reader.js:39934-39955, 10.0.2-beta.7): a fresh AudioContext, an 80 Hz
 * highpass, a +3 dB peak at 3 kHz and a compressor into the destination,
 * `_filterChainInput` being the highpass, which every decoded buffer's
 * source connects to (`:40025`). The popup's samples go through the same
 * chain (`RemoteSampleReadAloudController`, `:40396`, shares the base).
 * The only knob was the operating system's, which moves every application.
 *
 * So the plugin puts a GainNode ahead of the chain — `source → gain →
 * highpass → …` — at the level the `readAloud.volume` pref names (core/
 * read-aloud-volume.ts). Ahead of the compressor, not behind it: a boost
 * is then soft-limited rather than clipped, an attenuation passes. The
 * seam is `_initAudioContext` itself, the one place the chain is built,
 * called by the constructor and again by `_handleDeviceChange` when
 * Windows rebuilds the chain after an output-device stall (`:39956-39985`)
 * — a shadow there covers every controller and every rebuild. The base
 * class is private to the bundle, so it is reached the way pauses.ts
 * reaches the controller: the manager's `_createController` (`:82644`) is
 * shadowed per tab, the prototype is patched from the first controller it
 * builds, and that first controller — whose chain was built before the
 * shadow existed — gets the gain inserted into its existing chain (nothing
 * has played yet: the audio is still being fetched). A controller already
 * running at attach (an upgrade under a session, issue #38) is patched at
 * attach.
 *
 * Every gain built in a tab is kept, pruned once its context has closed
 * (`destroy()` closes it, `:40133`), so `apply()` can move all of them at
 * once: the pref observer in index.ts calls it, and a change from the pane
 * or the keys lands within the sentence being spoken, in every open tab.
 * Dispose puts the prototypes back and every open chain at 1 — Zotero's
 * own level — so a stopped plugin leaves the audio as Zotero plays it.
 *
 * Compartment rules as in pauses.ts: the wrappers are exported into the
 * reader's compartment, `this` arrives Xray-wrapped and is waived, the
 * originals run through Reflect.apply. The nodes are the reader window's
 * own (`controller._audioContext.createGain()`): the sandbox has no
 * AudioContext of its own, and would not be allowed to connect one here.
 */

import { clampVolume, gainOf } from '../core/read-aloud-volume';
import { createProtoPatches } from './proto-patches';
import { ownerOf } from './system-voices';

type AnyFn = (...args: any[]) => any;

export interface VolumeDeps {
  /** The level in percent, read whenever a chain is built or `apply()` runs — never cached, so the pane and the keys apply at once. */
  getLevel(): number;
  /** Makes a sandbox function callable from the reader's compartment (Components.utils.exportFunction). Optional for tests. */
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  /** Components.utils.waiveXrays for what the reader passes into the exported wrappers. Optional for tests. */
  waiveXrays?(value: unknown): unknown;
  /** Components.utils.isDeadWrapper, so a closed tab's prototype and nodes are skipped instead of throwing. Optional for tests. */
  isDead?(value: unknown): boolean;
  error(e: unknown): void;
  debug?(message: string): void;
}

/** One chain this module gained, as `inspect` reports it. */
export interface ChainReport {
  /** The controller's class: `RemoteReadAloudController` for a session, `RemoteSampleReadAloudController` for a popup sample. */
  kind: string;
  gainValue: number | null;
  /** Whether this is the chain of the manager's live controller. */
  current: boolean;
  /** Whether that controller's `_filterChainInput` is this very node: what proves every source lands on it. */
  inChain: boolean;
  contextState: string | null;
}

export interface VolumeControl {
  /**
   * Shadow the reader's manager, and gain its running controller if there
   * is one; true once the manager is patched. Repeat calls are cheap
   * no-ops, so this may be called on every voices request.
   */
  attach(reader: unknown): boolean;
  /** Move every open chain in every tab to the current level. The pref observer calls it. */
  apply(): void;
  /**
   * What this module sees in a reader, as plain data, for
   * `Zotero.ZoteroTTS.diagnostics.volume()`: which of the two prototypes
   * are patched, the session state, the level and the gain it means, every
   * open chain of the tab with the gain it carries, and `count` — how many
   * chains the hook has gained in the tab, which is what proves it ran.
   */
  inspect(reader: unknown): Record<string, unknown>;
  /** Prototypes held, and how many of them a closed tab has not taken with it. */
  patchCounts(): { total: number; live: number };
  /** Put every prototype back and every open chain at Zotero's own level. */
  dispose(): void;
}

interface Chain {
  gain: any;
  ctx: any;
  controller: any;
  kind: string;
}

interface TabState {
  chains: Chain[];
  count: number;
}

export function createVolumeControl(deps: VolumeDeps): VolumeControl {
  const patches = createProtoPatches({ exportFunction: deps.exportFunction, isDead: deps.isDead, error: deps.error });
  const waive = (value: unknown): any => (deps.waiveXrays ? deps.waiveXrays(value) : value);
  const isDead = (value: unknown): boolean => {
    try {
      return deps.isDead ? !!deps.isDead(value) : false;
    } catch {
      return false;
    }
  };
  // Per manager, so a tab's record dies with the tab; the set is what apply() walks
  const states = new WeakMap<object, TabState>();
  const allStates = new Set<TabState>();

  function stateOf(manager: object): TabState {
    let state = states.get(manager);
    if (!state) {
      state = { chains: [], count: 0 };
      states.set(manager, state);
      allStates.add(state);
    }
    return state;
  }

  /** Whether the chain is gone: its context closed by the controller's destroy, or dead with its tab. */
  const closed = (chain: Chain): boolean => {
    try {
      return isDead(chain.gain) || isDead(chain.ctx) || chain.ctx.state === 'closed';
    } catch {
      return true;
    }
  };

  const prune = (state: TabState): void => {
    state.chains = state.chains.filter((chain) => !closed(chain));
  };

  const kindOf = (controller: any): string => {
    try {
      return String(controller?.constructor?.name ?? 'unknown');
    } catch {
      return 'unknown';
    }
  };

  /** Put a gain at the level ahead of this controller's chain, unless the chain already starts at one of ours. */
  function insertGain(controller: any, state: TabState): boolean {
    if (!controller) return false;
    const ctx = controller._audioContext;
    const input = controller._filterChainInput;
    if (!ctx || !input || typeof ctx.createGain !== 'function') return false;
    prune(state);
    if (state.chains.some((chain) => chain.gain === input)) return true;
    // Read before the chain is touched: a broken setting leaves it as Zotero built it
    const level = gainOf(deps.getLevel());
    const gain = ctx.createGain();
    gain.gain.value = level;
    gain.connect(input);
    controller._filterChainInput = gain;
    const kind = kindOf(controller);
    state.chains.push({ gain, ctx, controller, kind });
    state.count += 1;
    deps.debug?.(`volume gain inserted (${kind})`);
    return true;
  }

  /** Shadow `_initAudioContext` on the prototype behind this controller, and gain this controller's chain; true once the prototype is patched. */
  function patchController(controller: any, state: TabState): boolean {
    const proto = controller ? ownerOf(controller, '_initAudioContext') : null;
    if (!proto) return false;
    if (!patches.has(proto, '_initAudioContext')) {
      patches.shadow(proto, '_initAudioContext', (original) =>
        function (this: unknown, ...args: unknown[]) {
          const result = Reflect.apply(original, this, args);
          try {
            insertGain(waive(this), state);
          } catch (e) {
            deps.error(e);
          }
          return result;
        },
      );
      deps.debug?.('volume attached to the controllers');
    }
    try {
      insertGain(controller, state);
    } catch (e) {
      deps.error(e);
    }
    return true;
  }

  function attach(reader: any): boolean {
    try {
      const manager = waive(reader?._internalReader?._readAloudManager);
      const proto = manager ? ownerOf(manager, '_createController') : null;
      if (!proto) return false;
      const state = stateOf(manager);
      if (!patches.has(proto, '_createController')) {
        patches.shadow(proto, '_createController', (original) =>
          function (this: unknown, ...args: unknown[]) {
            const result = Reflect.apply(original, this, args);
            try {
              patchController(waive(this)?._controller, state);
            } catch (e) {
              deps.error(e);
            }
            return result;
          },
        );
        deps.debug?.('volume attached');
      }
      // A session already open when this instance started (issue #38): its
      // controller was built before the shadow above existed
      patchController(manager._controller, state);
      return true;
    } catch (e) {
      deps.error(e);
      return false;
    }
  }

  function apply(): void {
    let level: number;
    try {
      level = gainOf(deps.getLevel());
    } catch (e) {
      deps.error(e);
      return;
    }
    for (const state of allStates) {
      prune(state);
      for (const chain of state.chains) {
        try {
          chain.gain.gain.value = level;
        } catch (e) {
          deps.error(e);
        }
      }
    }
  }

  const read = <T>(fn: () => T): T | null => {
    try {
      return fn();
    } catch {
      return null;
    }
  };

  function inspect(reader: any): Record<string, unknown> {
    try {
      const manager = waive(reader?._internalReader?._readAloudManager);
      const managerProto = manager ? ownerOf(manager, '_createController') : null;
      const controller = manager?._controller ?? null;
      const controllerProto = controller ? ownerOf(controller, '_initAudioContext') : null;
      const level = clampVolume(deps.getLevel());
      const state = manager ? states.get(manager) : undefined;
      if (state) prune(state);
      const chains: ChainReport[] = (state?.chains ?? []).map((chain) => ({
        kind: chain.kind,
        gainValue: read(() => Number(chain.gain.gain.value)),
        current: !!controller && chain.controller === controller,
        inChain: !!controller && read(() => controller._filterChainInput === chain.gain) === true,
        contextState: read(() => String(chain.ctx.state)),
      }));
      return {
        patched: {
          manager: !!managerProto && patches.has(managerProto, '_createController'),
          controller: !!controllerProto && patches.has(controllerProto, '_initAudioContext'),
        },
        active: !!manager?.active,
        paused: !!manager?.paused,
        level,
        gain: gainOf(level),
        chains,
        count: state?.count ?? 0,
      };
    } catch (e) {
      return { error: String(e) };
    }
  }

  function dispose(): void {
    for (const state of allStates) {
      prune(state);
      for (const chain of state.chains) {
        try {
          chain.gain.gain.value = 1;
        } catch (e) {
          deps.error(e);
        }
      }
      state.chains = [];
    }
    allStates.clear();
    patches.restoreAll();
  }

  return { attach, apply, inspect, patchCounts: patches.counts, dispose };
}
