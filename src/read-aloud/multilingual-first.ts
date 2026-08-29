import { MULTILINGUAL } from '../core/providers/types';
import { createProtoPatches } from './proto-patches';

/**
 * Pins "Multiple languages" to the top of the Read Aloud popup's language
 * dropdown; the other entries keep their alphabetical order.
 *
 * The order cannot be chosen from the catalog: the popup sorts its options
 * by display label, hard-coded (LanguageRegionSelect, reader.js ~38149,
 * `result.sort((a, b) => a.label.localeCompare(b.label))`). The label,
 * though, is produced by `Intl.DisplayNames.prototype.of` — a prototype
 * method of the reader iframe's compartment, patchable per reader exactly
 * like Zotero's own prototypes (highlight-style.ts). The shadow returns
 * the label for `mul` with one leading space:
 *
 * - ICU collates the space before every letter and Han character, in every
 *   locale checked (en, zh, ja, de, fr, es — the comparator runs in the
 *   app's locale), so the entry sorts first;
 * - the option rows and the closed dropdown render with
 *   `white-space: nowrap`, whose white-space collapsing removes a leading
 *   space, so the label displays unchanged (also mid-sentence in the
 *   "no voices for {language}" status, where two spaces collapse to one).
 *
 * Costs: the dropdown's type-ahead ("m"/"d" jumps to a matching label) no
 * longer finds this entry — it is already first — and the first-run promo
 * popups (separate windows, read-aloud-first-run.js) keep the plain
 * label and their alphabetical position. If a Zotero update changes the
 * sort or the rendering, the entry falls back to sorting alphabetically —
 * nothing breaks.
 */

export const SORT_FIRST_PREFIX = ' ';

type AnyFn = (...args: any[]) => any;

export interface MultilingualFirstDeps {
  /** Makes a sandbox function callable from the reader's compartment (Components.utils.exportFunction). Optional for tests. */
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  /** Components.utils.waiveXrays for what the reader passes into the exported wrapper. Optional for tests. */
  waiveXrays?(value: unknown): unknown;
  /**
   * Components.utils.cloneInto toward the reader's compartment. inspect's
   * probe hands the DisplayNames constructor an options object, and a
   * reader-compartment native cannot read a sandbox-allocated one — it
   * sees no `type` and throws (the 2026-08-26 diagnostics crash).
   */
  cloneInto?(reader: unknown, value: unknown): unknown;
  /** Components.utils.isDeadWrapper, so a closed tab's prototype is skipped instead of throwing (proto-patches.ts). Optional for tests. */
  isDead?(value: unknown): boolean;
  error(e: unknown): void;
  debug?(message: string): void;
}

export interface MultilingualFirst {
  /** Patch the reader iframe's Intl.DisplayNames; true once it is. Repeat calls are cheap no-ops. */
  attach(reader: unknown): boolean;
  /** What this module sees in a reader, as plain data, for Tools → Developer → Run JavaScript. */
  inspect(reader: unknown): Record<string, unknown>;
  /** Prototypes held, and how many of them a closed tab has not taken with it. */
  patchCounts(): { total: number; live: number };
  /** Put every patched prototype back. */
  dispose(): void;
}

export function createMultilingualFirst(deps: MultilingualFirstDeps): MultilingualFirst {
  const patches = createProtoPatches({ exportFunction: deps.exportFunction, isDead: deps.isDead, error: deps.error });

  const waive = (value: unknown): any => (deps.waiveXrays ? deps.waiveXrays(value) : value);

  // In the live incident of 2026-08-26 the sandbox read the window's
  // WebIDL members fine (clearTimeout) while the JS globals (Intl) read as
  // undefined — an Xray-flavored view. A probe sandbox built the same way
  // saw Intl directly, so the exact trigger is not pinned down; the waived
  // window exposes the reader compartment's real global in every observed
  // state, so all access goes through it (a waiver of an already
  // transparent wrapper is the same object — never harmful).
  const protoOf = (reader: any): any => {
    const proto = waive(reader?._iframeWindow)?.Intl?.DisplayNames?.prototype;
    return proto && typeof proto.of === 'function' ? proto : null;
  };

  function attach(reader: any): boolean {
    try {
      const proto = protoOf(reader);
      if (!proto) return false;
      if (patches.has(proto)) return true;
      patches.shadow(proto, 'of', (original) =>
        function (this: unknown, ...args: unknown[]) {
          const label = Reflect.apply(original, waive(this), args);
          return args[0] === MULTILINGUAL && typeof label === 'string' ? SORT_FIRST_PREFIX + label : label;
        },
      );
      deps.debug?.('multilingual-first attached');
      return true;
    } catch (e) {
      deps.error(e);
      return false;
    }
  }

  // Every probe guarded on its own: one failing must cost its field, not
  // the report (the first live run lost the intl views to the mulLabel
  // throw, which was the very data needed to diagnose it)
  function inspect(reader: any): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    try {
      const raw = reader?._iframeWindow;
      const win = waive(raw);
      // Both views of the window, so a wrapper-behavior change shows at a glance
      result.intl = { direct: typeof raw?.Intl, waived: typeof win?.Intl };
      const proto = protoOf(reader);
      result.patched = !!proto && patches.has(proto);
      // No identity check on proto.of: a function read back through the
      // waived membrane is a different wrapper object than the reference
      // exportFunction returned (verified live — it read false while the
      // patch worked). The prefixed mulLabel below, produced through the
      // real prototype, is the proof that the patch is in effect.
      if (win?.Intl?.DisplayNames) {
        try {
          const options = deps.cloneInto ? deps.cloneInto(reader, { type: 'language' }) : { type: 'language' };
          result.mulLabel = new win.Intl.DisplayNames(undefined, options).of(MULTILINGUAL);
        } catch (e) {
          result.mulLabelError = String(e);
        }
      }
    } catch (e) {
      result.error = String(e);
    }
    return result;
  }

  function dispose(): void {
    patches.restoreAll();
  }

  return { attach, inspect, patchCounts: patches.counts, dispose };
}
