/**
 * Zotero's own **Highlight current** menulist — Settings → General → Read
 * Aloud — greyed out and given a hint while the plugin runs (issue #114):
 * the level is the plugin's two switches now, and Zotero's pref is kept
 * equal to them (core/highlight-pin.ts), so the menulist shows the truth
 * but a pick there would be written back at once. Greyed, it says so
 * before the pick; its tooltip says where the choice is made.
 *
 * The menulist is `#read-aloud-highlight-granularity-menulist`
 * (`preferences_general.xhtml:230`, Zotero 10.0.3-beta.1). Zotero's
 * settings window loads each pane lazily and announces nothing when one
 * lands (`preferences.js:299-368` — a sandboxed script, a stylesheet
 * processing instruction, the markup appended to the pane's container),
 * so a window whose General pane is not loaded yet is watched with a
 * MutationObserver until the element appears, then left alone. Windows
 * come from `watchSettingsWindows`: the ones open now and every one opened
 * later (index.ts: `Services.wm` and `Services.ww`).
 *
 * At stop the two attributes go back to what they were, on every window
 * still alive; an unloaded window is forgotten when it unloads, a dead one
 * is skipped. The pref itself is not this module's: the pin leaves it
 * where the plugin last set it, and the menulist works again.
 */

export const ZOTERO_HIGHLIGHT_MENULIST_ID = 'read-aloud-highlight-granularity-menulist';

const DISABLED = 'disabled';
const TOOLTIP = 'tooltiptext';

export interface MenuElementLike {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export interface MenuDocumentLike {
  getElementById(id: string): MenuElementLike | null;
}

export interface ZoteroHighlightMenuDeps {
  /** The hint, localized; read per window. */
  hint(): string;
  /**
   * Hands over every Zotero settings window's document, open now or opened
   * later, with a way to hear its unload; returns what stops the watch.
   */
  watchSettingsWindows(onDocument: (doc: MenuDocumentLike, onUnload: (fn: () => void) => void) => void): () => void;
  /** Observe the document's subtree until the returned disconnect is called. */
  observe(doc: MenuDocumentLike, changed: () => void): () => void;
  /** Components.utils.isDeadWrapper — a window gone without its unload heard. Optional for tests. */
  isDead?(value: unknown): boolean;
  error(e: unknown): void;
}

export interface ZoteroHighlightMenuReport {
  started: boolean;
  windows: Array<{ found: boolean; disabled: boolean }>;
}

export interface ZoteroHighlightMenu {
  start(): void;
  stop(): void;
  inspect(): ZoteroHighlightMenuReport;
}

interface Entry {
  doc: MenuDocumentLike;
  element: MenuElementLike | null;
  original: { disabled: string | null; tooltip: string | null } | null;
  disconnect: (() => void) | null;
}

export function createZoteroHighlightMenu(deps: ZoteroHighlightMenuDeps): ZoteroHighlightMenu {
  const entries: Entry[] = [];
  let stopWatching: (() => void) | null = null;
  let started = false;

  const dead = (value: unknown): boolean => {
    try {
      return deps.isDead?.(value) ?? false;
    } catch {
      return false;
    }
  };

  function forget(entry: Entry): void {
    if (entry.disconnect) {
      try {
        entry.disconnect();
      } catch (e) {
        deps.error(e);
      }
      entry.disconnect = null;
    }
    const at = entries.indexOf(entry);
    if (at >= 0) entries.splice(at, 1);
  }

  /** Grey the menulist if it is there; whether it was. */
  function grey(entry: Entry): boolean {
    const element = entry.doc.getElementById(ZOTERO_HIGHLIGHT_MENULIST_ID);
    if (!element) return false;
    entry.element = element;
    entry.original ??= { disabled: element.getAttribute(DISABLED), tooltip: element.getAttribute(TOOLTIP) };
    element.setAttribute(DISABLED, 'true');
    element.setAttribute(TOOLTIP, deps.hint());
    if (entry.disconnect) {
      entry.disconnect();
      entry.disconnect = null;
    }
    return true;
  }

  function adopt(doc: MenuDocumentLike, onUnload: (fn: () => void) => void): void {
    const entry: Entry = { doc, element: null, original: null, disconnect: null };
    entries.push(entry);
    try {
      onUnload(() => forget(entry));
      if (grey(entry)) return;
      entry.disconnect = deps.observe(doc, () => {
        if (entry.element) return;
        try {
          if (dead(doc)) forget(entry);
          else grey(entry);
        } catch (e) {
          deps.error(e);
          forget(entry);
        }
      });
    } catch (e) {
      deps.error(e);
      forget(entry);
    }
  }

  function restore(entry: Entry): void {
    if (!entry.element || !entry.original || dead(entry.doc) || dead(entry.element)) return;
    const { disabled, tooltip } = entry.original;
    if (disabled === null) entry.element.removeAttribute(DISABLED);
    else entry.element.setAttribute(DISABLED, disabled);
    if (tooltip === null) entry.element.removeAttribute(TOOLTIP);
    else entry.element.setAttribute(TOOLTIP, tooltip);
  }

  function start(): void {
    if (started) return;
    started = true;
    try {
      stopWatching = deps.watchSettingsWindows(adopt);
    } catch (e) {
      deps.error(e);
      stopWatching = null;
    }
  }

  function stop(): void {
    if (!started) return;
    started = false;
    try {
      stopWatching?.();
    } catch (e) {
      deps.error(e);
    }
    stopWatching = null;
    for (const entry of [...entries]) {
      try {
        restore(entry);
      } catch (e) {
        deps.error(e);
      }
      forget(entry);
    }
  }

  function inspect(): ZoteroHighlightMenuReport {
    return {
      started,
      windows: entries.map((entry) => ({
        found: entry.element !== null,
        disabled: !!entry.element && !dead(entry.element) && entry.element.getAttribute(DISABLED) === 'true',
      })),
    };
  }

  return { start, stop, inspect };
}
