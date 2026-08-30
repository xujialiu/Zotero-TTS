/**
 * Zotero's own Local-tier voices — the operating system's — are taken out
 * of the Read Aloud player, always (issue #17).
 *
 * They share the Local tier with the plugin's, and the player draws no
 * divider between the two groups (buildVoiceOptions sorts by
 * creditsPerMinute alone, reader.js:38449-38452) and shows no tier beside a
 * voice (issue #9). That used to be a setting, with an off-state that
 * marked Zotero's own `Local-Microsoft David Desktop` so the two could be
 * told apart. Both are gone: the system provider
 * (core/providers/system/index.ts, issue #12) republishes the same SAPI /
 * OneCore voices as ordinary plugin voices with everything Zotero's own
 * path cannot give them — the voice browser, samples, favorites, the cache,
 * prefetch and word-level timestamps — so a second, crippled copy of them
 * in the list has nothing left to offer, and the marker has nothing left to
 * distinguish.
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
 * loadVoices rebuilds the list from scratch on each popup open, so a
 * freshly listed set is filtered again on the spot.
 *
 * A system voice is exactly a `local`-tier entry whose id is not one of
 * ours: BrowserReadAloudVoice ids read `local-<voiceURI>`, while
 * RemoteReadAloudVoice returns the published id verbatim (~40436) — ours
 * decode with decodeVoiceId, and Zotero's cloud voices sit in the standard
 * and premium tiers.
 *
 * Not covered, and by the same boundary the marker had: the first-run
 * dialog and Zotero's "Manage voices" dialog, separate windows running
 * separate bundles (read-aloud-first-run.js, read-aloud-voices.js) with
 * their own provider instances. Our voices reach both correctly, since
 * their labels travel in the voices response.
 *
 * A persisted choice naming a voice that is now hidden falls through
 * Zotero's own `_findFallbackVoice`, except where the system provider is
 * enabled — then read-aloud/system-voice-choices.ts has already rewritten
 * it to the plugin's equivalent.
 *
 * Compartment rules as in highlight-style.ts: the wrapper is exported into
 * the reader's compartment, `this` arrives Xray-wrapped and is waived
 * before the voices' prototype getters (tier, id) are read, the original
 * runs through Reflect.apply, and the reader-side array is mutated with its
 * own splice and primitive arguments only.
 */

import { createProtoPatches } from './proto-patches';
import { decodeVoiceId } from './voice-catalog';

type AnyFn = (...args: any[]) => any;

export interface SystemVoiceHidingDeps {
  /** Makes a sandbox function callable from the reader's compartment (Components.utils.exportFunction). Optional for tests. */
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  /** Components.utils.waiveXrays for what the reader passes into the exported wrapper. Optional for tests. */
  waiveXrays?(value: unknown): unknown;
  /** Components.utils.isDeadWrapper, so a closed tab's prototype is skipped instead of throwing (proto-patches.ts). Optional for tests. */
  isDead?(value: unknown): boolean;
  error(e: unknown): void;
  debug?(message: string): void;
}

export interface SystemVoiceHiding {
  /**
   * Patch the reader's manager; true once it is. Repeat calls are cheap
   * no-ops, so this may be called on every voices request.
   */
  attach(reader: unknown): boolean;
  /**
   * What this module sees in a reader, as plain data, for Tools →
   * Developer → Run JavaScript: whether the hook is on, and what the
   * manager lists right now by kind. No `local-system` after a listing is
   * what proves the splice ran.
   */
  inspect(reader: unknown): Record<string, unknown>;
  /** Prototypes held, and how many of them a closed tab has not taken with it. */
  patchCounts(): { total: number; live: number };
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
  const patches = createProtoPatches({ exportFunction: deps.exportFunction, isDead: deps.isDead, error: deps.error });

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
      if (patches.has(proto)) return true;
      patches.shadow(proto, '_resolveVoice', (original) =>
        function (this: any, ...args: unknown[]) {
          try {
            stripSystemVoices(waive(this));
          } catch (e) {
            deps.error(e);
          }
          return Reflect.apply(original, this, args);
        },
      );
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
      const result: Record<string, unknown> = { patched: !!proto && patches.has(proto) };
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
    patches.restoreAll();
  }

  return { attach, inspect, patchCounts: patches.counts, dispose };
}
