/**
 * Hides Zotero's own Local-tier voices — the operating system's — so the
 * Local tier offers only the plugin's entries (the `hideZoteroLocalVoices`
 * setting; the entries then drop their TTS- prefix, which happens in
 * voice-catalog.ts, not here).
 *
 * The system voices never pass through the remote interface: the reader's
 * BrowserReadAloudProvider lists them straight from the iframe's
 * window.speechSynthesis (reader.js ~39696) and ReadAloudManager.loadVoices
 * concatenates `_allVoices = [...remoteVoices, ...browserVoices]`
 * (~82023), so the composite getVoices cannot filter them. What every path
 * that (re)builds or re-reads the list does call, synchronously right
 * after, is `_resolveVoice` — loadVoices (every popup open), setLanguage,
 * selectTier, applyPersistedVoices. So that method is shadowed per reader,
 * and on entry the system voices are spliced out of `_allVoices` in place.
 * loadVoices rebuilds the list from scratch on each popup open, so the
 * switch applies, in both directions, the next time the popup opens.
 *
 * A system voice is exactly a `local`-tier entry whose id is not one of
 * ours: BrowserReadAloudVoice ids read `local-<voiceURI>`, while
 * RemoteReadAloudVoice returns the published id verbatim (~40436) — ours
 * decode with decodeVoiceId, and Zotero's cloud voices sit in the standard
 * and premium tiers. Not covered: the one-time first-run promo popup,
 * which lists voices through provider instances of its own (useVoiceData).
 *
 * Compartment rules as in highlight-style.ts: the wrapper is exported into
 * the reader's compartment, `this` arrives Xray-wrapped and is waived
 * before the voices' prototype getters (tier, id) are read, the original
 * runs through Reflect.apply, and the reader-side array is mutated with
 * its own splice and primitive arguments only.
 */

import { decodeVoiceId } from './voice-catalog';

type AnyFn = (...args: any[]) => any;

export interface SystemVoiceHidingDeps {
  /** Read on every listing, so the pane checkbox applies on the next popup open. */
  enabled(): boolean;
  /** Makes a sandbox function callable from the reader's compartment (Components.utils.exportFunction). Optional for tests. */
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  /** Components.utils.waiveXrays for what the reader passes into the exported wrapper. Optional for tests. */
  waiveXrays?(value: unknown): unknown;
  error(e: unknown): void;
  debug?(message: string): void;
}

export interface SystemVoiceHiding {
  /** Patch the reader's manager; true once it is. Repeat calls are cheap no-ops, so this may be called on every voices request. */
  attach(reader: unknown): boolean;
  /** What this module sees in a reader, as plain data, for Tools → Developer → Run JavaScript. */
  inspect(reader: unknown): Record<string, unknown>;
  /** Put every patched prototype back. */
  dispose(): void;
}

/** The prototype in `obj`'s chain that owns the method, so the patch lands where Zotero defined it. */
export function ownerOf(obj: unknown, name: string): any {
  let proto = obj && typeof obj === 'object' ? Object.getPrototypeOf(obj) : null;
  for (let depth = 0; depth < 8 && proto && proto !== Object.prototype; depth++) {
    if (Object.prototype.hasOwnProperty.call(proto, name) && typeof proto[name] === 'function') return proto;
    proto = Object.getPrototypeOf(proto);
  }
  return null;
}

const isSystemLocalVoice = (v: any): boolean => !!v && v.tier === 'local' && decodeVoiceId(String(v.id ?? '')) === null;

export function createSystemVoiceHiding(deps: SystemVoiceHidingDeps): SystemVoiceHiding {
  const patches: Array<{ proto: any; name: string; original: AnyFn }> = [];

  const waive = (value: unknown): any => (deps.waiveXrays ? deps.waiveXrays(value) : value);

  function stripSystemVoices(manager: any): void {
    const all = manager?._allVoices;
    if (!all || typeof all.length !== 'number') return;
    let removed = 0;
    for (let i = all.length - 1; i >= 0; i--) {
      if (isSystemLocalVoice(all[i])) {
        all.splice(i, 1);
        removed += 1;
      }
    }
    if (removed) deps.debug?.(`hid ${removed} system voice${removed === 1 ? '' : 's'} from the Local tier`);
  }

  function attach(reader: any): boolean {
    try {
      const manager = reader?._internalReader?._readAloudManager;
      const proto = manager ? ownerOf(manager, '_resolveVoice') : null;
      if (!proto) return false;
      if (patches.some((p) => p.proto === proto)) return true;
      const original = proto._resolveVoice as AnyFn;
      const wrapper = function (this: any, ...args: unknown[]) {
        try {
          if (deps.enabled()) stripSystemVoices(waive(this));
        } catch (e) {
          deps.error(e);
        }
        return Reflect.apply(original, this, args);
      };
      proto._resolveVoice = deps.exportFunction ? deps.exportFunction(wrapper, proto) : wrapper;
      patches.push({ proto, name: '_resolveVoice', original });
      deps.debug?.('system-voice hiding attached');
      return true;
    } catch (e) {
      deps.error(e);
      return false;
    }
  }

  function inspect(reader: any): Record<string, unknown> {
    try {
      const manager = waive(reader?._internalReader?._readAloudManager);
      const proto = manager ? ownerOf(manager, '_resolveVoice') : null;
      const result: Record<string, unknown> = {
        enabled: deps.enabled(),
        patched: !!proto && patches.some((p) => p.proto === proto),
      };
      const all = manager?._allVoices;
      if (all && typeof all.length === 'number') {
        const counts: Record<string, number> = {};
        for (let i = 0; i < all.length; i++) {
          const v = all[i];
          if (!v) continue;
          const kind = v.tier === 'local' ? (isSystemLocalVoice(v) ? 'local-system' : 'local-plugin') : String(v.tier);
          counts[kind] = (counts[kind] ?? 0) + 1;
        }
        result.voices = counts;
      }
      return result;
    } catch (e) {
      return { error: String(e) };
    }
  }

  function dispose(): void {
    for (const { proto, name, original } of patches.reverse()) {
      try {
        proto[name] = original;
      } catch (e) {
        deps.error(e);
      }
    }
    patches.length = 0;
  }

  return { attach, inspect, dispose };
}
