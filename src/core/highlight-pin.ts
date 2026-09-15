import { HIGHLIGHT_LEVEL_OBSERVER, HIGHLIGHT_SWITCH_OBSERVERS, zoteroLevelFor, type HighlightLevels, type ZoteroHighlightLevel } from './highlight-level';

/**
 * Zotero's highlight level, kept equal to the plugin's switches (issue
 * #114): `reader.readAloud.highlightGranularity` is written to
 * `zoteroLevelFor(switches)` when the pin starts, again whenever either
 * switch changes, and written back inside its own observer whenever
 * anything else writes it — Zotero's settings window, a script. So Zotero's
 * own Highlight current stops being a choice while the plugin runs, and
 * every path Zotero has for the level carries the plugin's value: its
 * per-reader observer repaints every open tab inside the write
 * (`xpcom/reader.js:671` → `:1241` → `setReadAloudHighlightGranularity`,
 * `reader.js:83948`; measured for issue #67), and a tab opened later reads
 * the pref at construction (`xpcom/reader.js:268` → `reader.js:82990`).
 * Nothing of the reader's is hooked.
 *
 * Pref observers fire synchronously inside `Zotero.Prefs.set`, in
 * registration order, and a write of an unchanged value notifies nobody
 * (CLAUDE.md). A foreign write therefore reaches the readers registered
 * before this pin with the foreign value first, then — inside the pin's
 * write-back, a nested notification — with the plugin's; the readers
 * registered after the pin read the pref when their turn comes and see
 * the plugin's value only. Both end where the switches say. The
 * write-back cannot loop: inside it the value already agrees.
 *
 * At stop the observers come off and the pref stays where the plugin
 * left it: Zotero alone then highlights as the plugin last set, and its
 * menulist works again (ui/zotero-highlight-menu.ts greys it meanwhile).
 */

export interface HighlightPinDeps {
  /** The plugin's switches as they read now (highlight-level.ts readHighlightLevels). */
  levels(): HighlightLevels;
  /** Zotero's pref as it reads now. */
  zoteroLevel(): unknown;
  setZoteroLevel(level: ZoteroHighlightLevel): void;
  /** `Zotero.Prefs.registerObserver` on a name relative to `extensions.zotero.`; returns the unregister. */
  observe(name: string, changed: () => void): () => void;
  log?(e: unknown): void;
}

export interface HighlightPinReport {
  started: boolean;
  wanted: ZoteroHighlightLevel;
  zotero: unknown;
  pinned: boolean;
  /** Foreign writes undone since the pin started. */
  snapped: number;
}

export interface HighlightPin {
  start(): void;
  stop(): void;
  /** Write Zotero's pref to the switches' level if it differs; whether it wrote. */
  apply(): boolean;
  inspect(): HighlightPinReport;
}

export function createHighlightPin(deps: HighlightPinDeps): HighlightPin {
  const log = (e: unknown) => deps.log?.(e);
  let unobserve: Array<() => void> = [];
  let started = false;
  let snapped = 0;

  const wanted = (): ZoteroHighlightLevel => zoteroLevelFor(deps.levels());

  function apply(): boolean {
    const level = wanted();
    try {
      if (deps.zoteroLevel() === level) return false;
      deps.setZoteroLevel(level);
      return true;
    } catch (e) {
      log(e);
      return false;
    }
  }

  // Zotero's pref written by something else: put the switches' level back
  function snap(): void {
    try {
      if (deps.zoteroLevel() === wanted()) return;
      snapped++;
      deps.setZoteroLevel(wanted());
    } catch (e) {
      log(e);
    }
  }

  function start(): void {
    if (started) return;
    started = true;
    apply();
    for (const [name, handler] of [
      [HIGHLIGHT_LEVEL_OBSERVER, snap],
      [HIGHLIGHT_SWITCH_OBSERVERS.sentence, apply],
      [HIGHLIGHT_SWITCH_OBSERVERS.word, apply],
    ] as const) {
      try {
        unobserve.push(deps.observe(name, handler));
      } catch (e) {
        log(e);
      }
    }
  }

  function stop(): void {
    if (!started) return;
    started = false;
    const off = unobserve;
    unobserve = [];
    for (const fn of off) {
      try {
        fn();
      } catch (e) {
        log(e);
      }
    }
  }

  function inspect(): HighlightPinReport {
    const level = wanted();
    let zotero: unknown = null;
    try {
      zotero = deps.zoteroLevel();
    } catch (e) {
      zotero = String(e);
    }
    return { started, wanted: level, zotero, pinned: zotero === level, snapped };
  }

  return { start, stop, apply, inspect };
}
