/**
 * What becomes of Zotero's own Local-tier voices — the operating system's —
 * next to the plugin's, which share that tier. The `hideZoteroLocalVoices`
 * setting decides, and both of its sides live here:
 *
 * - **on**: they are spliced out of the manager's list, so the Local tier
 *   offers only the plugin's entries;
 * - **off**: they stay, and are labeled `Local-Microsoft David Desktop`.
 *   The plugin's own voices never carry a marker (voice-catalog.ts), so
 *   this is what tells the two groups apart — the player draws no divider
 *   between them (buildVoiceOptions sorts by creditsPerMinute alone,
 *   reader.js:38449-38452) and shows no tier beside a voice (issue #9).
 *
 * Costs of the marker, both accepted: the dropdown's type-ahead compares
 * `label.toLowerCase().startsWith(...)` (reader.js:37566), so every OS voice
 * now answers to "l" rather than to its own initial; and the popup's spoken
 * sample is built from the label (reader.js:38192), so it says "Hi, I'm
 * Local-Microsoft David".
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
 * and premium tiers.
 *
 * The marker is put on `BrowserReadAloudVoice.prototype.label`, an accessor
 * (~39629) reached from the first system voice of `_allVoices` — the class
 * is private to the reader's bundle, so an instance is the only way to it.
 * The prefix is computed, never stored, so it is idempotent however often
 * the hook runs and it goes away the moment the switch flips. The original
 * getter is what produces the label (macOS rewrites "(Premium)" there), so
 * the marker rides in front of whatever Zotero would have shown.
 *
 * Not covered, and by the same boundary the hiding has: the first-run
 * dialog and Zotero's "Manage voices" dialog, separate windows running
 * separate bundles (read-aloud-first-run.js, read-aloud-voices.js) with
 * their own copy of the class, which list the OS voices through provider
 * instances of their own. Our voices reach both correctly, since their
 * labels travel in the voices response.
 *
 * Compartment rules as in highlight-style.ts: the wrappers are exported
 * into the reader's compartment, `this` arrives Xray-wrapped and is waived
 * before the voices' prototype getters (tier, id, label) are read, the
 * originals run through Reflect.apply, the reader-side array is mutated
 * with its own splice and primitive arguments only, and the label getter
 * hands back a primitive string.
 */

import { createProtoPatches } from './proto-patches';
import { decodeVoiceId } from './voice-catalog';

type AnyFn = (...args: any[]) => any;

/**
 * What Zotero's own Local voices are labeled with while they are listed
 * beside the plugin's: "Local-Microsoft David Desktop". Not localized — it
 * is a marker, not prose — and spelled like the `TTS-` marker it replaces
 * (issue #9), which the plugin's own voices no longer carry.
 */
export const SYSTEM_VOICE_MARKER = 'Local-';

export interface SystemVoiceHidingDeps {
  /** Whether the voices are hidden. Read on every listing and on every label, so the pane checkbox applies at the next popup open. */
  enabled(): boolean;
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
   * no-ops, so this may be called on every voices request. The voice class
   * is patched later, from inside the hook, as soon as a listing holds one
   * of Zotero's own voices.
   */
  attach(reader: unknown): boolean;
  /**
   * What this module sees in a reader, as plain data, for Tools →
   * Developer → Run JavaScript: the switch, the hook, and — of the voices
   * listed right now — whether the label patch is on their class and what
   * one of Zotero's own voices is called.
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

/**
 * The prototype in `obj`'s chain that owns `name` as an accessor, read
 * through descriptors and never by reading the property: `label` is a
 * getter over an instance field (reader.js:39629, :39250), so probing it
 * the way `ownerOf` does — `typeof proto[name]` — would call the getter
 * with the prototype as `this` and throw on `this.impl.name`.
 */
export function accessorOwnerOf(obj: unknown, name: string): any {
  let proto = obj && typeof obj === 'object' ? Object.getPrototypeOf(obj) : null;
  for (let depth = 0; depth < 8 && proto && proto !== Object.prototype; depth++) {
    if (typeof Object.getOwnPropertyDescriptor(proto, name)?.get === 'function') return proto;
    proto = Object.getPrototypeOf(proto);
  }
  return null;
}

const isSystemLocalVoice = (v: any): boolean => !!v && v.tier === 'local' && decodeVoiceId(String(v.id ?? '')) === null;

const readLabel = (voice: any): string | undefined => {
  try {
    return typeof voice.label === 'string' ? voice.label : undefined;
  } catch (e) {
    return String(e);
  }
};

/** The first of Zotero's own Local voices in a manager's list; null when it holds none. */
function firstSystemVoice(manager: any): any {
  const all = manager?._allVoices;
  if (!all || typeof all.length !== 'number') return null;
  for (let i = 0; i < all.length; i++) if (isSystemLocalVoice(all[i])) return all[i];
  return null;
}

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

  /** Patch this tab's voice class, once a listing has shown us one of its instances. */
  function markSystemVoices(manager: any): void {
    const voice = firstSystemVoice(manager);
    const proto = voice ? accessorOwnerOf(voice, 'label') : null;
    if (!proto || patches.has(proto, 'label')) return;
    patches.shadowGetter(proto, 'label', (original) =>
      function (this: any) {
        const label = Reflect.apply(original, waive(this), []);
        try {
          if (typeof label === 'string' && !deps.enabled()) return SYSTEM_VOICE_MARKER + label;
        } catch (e) {
          deps.error(e);
        }
        return label;
      },
    );
    deps.debug?.(`marking Zotero's own Local voices with ${SYSTEM_VOICE_MARKER}`);
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
            // Exclusive by the switch: what is hidden needs no marker, and
            // the splice would take the instance the marker is reached through
            if (deps.enabled()) stripSystemVoices(waive(this));
            else markSystemVoices(waive(this));
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
      const voice = firstSystemVoice(manager);
      const labelProto = voice ? accessorOwnerOf(voice, 'label') : null;
      const result: Record<string, unknown> = {
        enabled: deps.enabled(),
        patched: !!proto && patches.has(proto),
        // Both of the next two are about the voices listed *now*: while they
        // are hidden there is no instance to reach the class through, and
        // nothing to mark either, so neither field is reported
        labelPatched: voice ? !!labelProto && patches.has(labelProto, 'label') : undefined,
        // The label as it now reads is the proof the patch is in effect: an
        // identity check on the getter reads false through the waived
        // membrane even while it works (multilingual-first.ts). Guarded on
        // its own, so a throwing getter costs its field and not the report
        systemLabel: voice ? readLabel(voice) : undefined,
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
    patches.restoreAll();
  }

  return { attach, inspect, patchCounts: patches.counts, dispose };
}
