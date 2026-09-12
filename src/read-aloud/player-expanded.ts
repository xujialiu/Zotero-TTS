import { OPTIONS_BUTTON_SELECTOR, PLAYER_POPUP_SELECTOR } from '../ui/player-options';

/** A showing is initialized once, even after the user folds it by hand. */
export const READY_ATTRIBUTE = 'data-ztts-expanded-ready';
export const EXPANSION_TIMEOUT_MS = 1000;
const STYLE_ID = 'ztts-player-expanded';
const GATE_CSS = `${PLAYER_POPUP_SELECTOR}:not([${READY_ATTRIBUTE}]) { visibility: hidden !important; }`;
// Scope the shared Options selector to the popup already found.
const BUTTON_SELECTOR = OPTIONS_BUTTON_SELECTOR.slice(PLAYER_POPUP_SELECTOR.length).trim();

export interface PlayerExpandedDeps {
  enabled(): boolean;
  documentOf(reader: any): Document | null | undefined;
  /** Observe child-list changes and class changes; return a disconnect function. */
  observe(doc: Document, changed: () => void): () => void;
  isDead?(value: unknown): boolean;
  error(error: unknown): void;
}

interface Entry {
  doc: Document;
  style: HTMLStyleElement;
  disconnect: () => void;
  popup: Element | null;
  timer: ReturnType<typeof setTimeout> | null;
  clicked: boolean;
  outcome: string;
  enabled: boolean;
}

/**
 * Attach before Zotero constructs the UI. React's Options click commits
 * asynchronously, so observing the popup and clicking alone cannot prevent
 * a collapsed first frame. A stylesheet hides only uninitialized popups;
 * the ready marker survives manual folding for the rest of that showing.
 * Existing popups are adopted unchanged. No playback state is touched.
 */
export function createPlayerExpanded(deps: PlayerExpandedDeps) {
  const entries = new Map<Document, Entry>();
  const dead = (doc: Document) => deps.isDead?.(doc) ?? false;

  function cancel(entry: Entry): void {
    if (entry.timer !== null) clearTimeout(entry.timer);
    entry.timer = null;
  }

  function release(entry: Entry, outcome: string): void {
    cancel(entry);
    entry.popup?.setAttribute(READY_ATTRIBUTE, '');
    entry.outcome = outcome;
  }

  function fail(entry: Entry, error: unknown): void {
    // Release the document-wide gate first, even if touching the popup fails.
    cancel(entry);
    try { entry.style.textContent = ''; } catch { /* A closed document has no controls to reveal. */ }
    entry.enabled = false;
    entry.outcome = 'failed';
    deps.error(error);
  }

  function scan(entry: Entry): void {
    try {
      if (dead(entry.doc)) { detach(entry); return; }
      const popup = entry.doc.querySelector(PLAYER_POPUP_SELECTOR);
      if (popup !== entry.popup) {
        cancel(entry);
        entry.popup?.removeAttribute(READY_ATTRIBUTE);
        entry.popup = popup;
        entry.clicked = false;
        entry.outcome = popup ? 'new' : 'absent';
      }
      if (!popup || popup.hasAttribute(READY_ATTRIBUTE)) return;
      if (!entry.enabled) { release(entry, 'unchanged'); return; }
      if (popup.classList.contains('expanded')) { release(entry, 'expanded'); return; }
      if (entry.clicked) return;

      const button = popup.querySelector<HTMLButtonElement>(BUTTON_SELECTOR);
      if (!button || typeof button.click !== 'function') {
        release(entry, 'failed');
        deps.error(new Error('Zotero-TTS: player Options button not found; showing the ordinary player.'));
        return;
      }
      entry.clicked = true;
      entry.outcome = 'pending';
      entry.timer = setTimeout(() => {
        try {
          if (dead(entry.doc)) { detach(entry); return; }
          if (entry.doc.querySelector(PLAYER_POPUP_SELECTOR) !== popup) { scan(entry); return; }
          // A commit can arrive before the mutation callback is delivered.
          if (popup.classList.contains('expanded')) { release(entry, 'expanded'); return; }
          release(entry, 'failed');
          deps.error(new Error('Zotero-TTS: player expansion timed out; showing the ordinary player.'));
        } catch (error) { fail(entry, error); }
      }, EXPANSION_TIMEOUT_MS);
      try { button.click(); }
      catch (error) { release(entry, 'failed'); deps.error(error); }
    } catch (error) { fail(entry, error); }
  }

  function detach(entry: Entry): void {
    cancel(entry);
    entries.delete(entry.doc);
    try { entry.disconnect(); } catch (error) { deps.error(error); }
    if (dead(entry.doc)) return;
    // Remove CSS first; cleanup must never strand hidden controls.
    try { entry.style.remove(); } catch (error) { deps.error(error); }
    try { entry.popup?.removeAttribute(READY_ATTRIBUTE); } catch (error) { deps.error(error); }
  }

  function attach(reader: any, earlyDocument?: Document): boolean {
    let entry: Entry | undefined;
    try {
      for (const held of entries.values()) if (dead(held.doc)) detach(held);
      const doc = earlyDocument ?? deps.documentOf(reader);
      if (!doc || dead(doc)) return false;
      if (entries.has(doc)) return true;
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      entry = { doc, style, disconnect: () => {}, popup: doc.querySelector(PLAYER_POPUP_SELECTOR),
        timer: null, clicked: false, outcome: 'attached', enabled: deps.enabled() };
      // Startup/reload and settings changes leave already-visible players alone.
      if (entry.popup) release(entry, 'existing');
      const held = entry;
      entry.disconnect = deps.observe(doc, () => scan(held));
      style.textContent = entry.enabled ? GATE_CSS : '';
      (doc.head ?? doc.documentElement).appendChild(style);
      entries.set(doc, entry);
      return true;
    } catch (error) {
      if (entry) detach(entry);
      deps.error(error);
      return false;
    }
  }

  function refresh(): void {
    for (const entry of entries.values()) {
      try {
        if (dead(entry.doc)) { detach(entry); continue; }
        const enabled = deps.enabled();
        if (entry.enabled === enabled) continue;
        cancel(entry);
        entry.popup?.removeAttribute(READY_ATTRIBUTE);
        entry.popup = entry.doc.querySelector(PLAYER_POPUP_SELECTOR);
        release(entry, 'setting-changed');
        entry.enabled = enabled;
        entry.style.textContent = enabled ? GATE_CSS : '';
      } catch (error) { fail(entry, error); }
    }
  }

  function inspect(reader: any): Record<string, unknown> {
    try {
      const doc = deps.documentOf(reader);
      const entry = doc ? entries.get(doc) : undefined;
      if (!entry || dead(entry.doc)) return { attached: false };
      return { attached: true, enabled: entry.enabled, popup: !!entry.popup,
        ready: !!entry.popup?.hasAttribute(READY_ATTRIBUTE),
        expanded: !!entry.popup?.classList.contains('expanded'),
        clicked: entry.clicked, pending: entry.timer !== null, outcome: entry.outcome };
    } catch (error) { return { error: String(error) }; }
  }

  return { attach, refresh, inspect, detach(reader: any) {
    const doc = deps.documentOf(reader);
    const entry = doc ? entries.get(doc) : undefined;
    if (entry) detach(entry);
  }, dispose() { for (const entry of entries.values()) detach(entry); } };
}
