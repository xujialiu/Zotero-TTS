/**
 * A ♥ beside the favorites in the Read Aloud player's own voice list
 * (issue #45), for the case the *Offer only favorite voices* switch is
 * off — which is the default, and the case in which the hearts marked in
 * the settings pane reach the player in no way at all: the list is a flat
 * alphabetical run of every voice the enabled providers publish.
 *
 * The mark is drawn by a stylesheet, not by anything in the voices
 * response, because the popup's option carries exactly three fields —
 * `{ value, label, secondaryLabel }` (buildVoiceOptions, reader.js:38468-
 * 38472) — of which `secondaryLabel` is the credits countdown and is null
 * for every local-tier voice. What the *row* carries is a DOM id built
 * from the voice id: `getOptionId(value)` = `${idPrefix}-option-${value}`
 * with `idPrefix` from React's `useId` (reader.js:37454-37456), rendered
 * at reader.js:37941. Zotero already marks a row this way itself — the
 * option has `padding-inline-start: 22px; position: relative` and the
 * selected one draws `content: "✓"` into that gutter from
 * `.option.selected::before` (reader.css:1253,1255). So the plugin widens
 * the gutter and paints a heart at 22px, where Zotero's check mark keeps
 * its 5px: two aligned columns, which is what makes a list of thousands
 * scannable.
 *
 * The label is therefore left alone, and with it everything the label is
 * also used for: the dropdown's type-ahead (`item.label.toLowerCase()
 * .startsWith`, reader.js:37566), the collapsed control's text
 * (reader.js:37870-37872), the order (voice-catalog.buildVoicesResponse),
 * and the sample sentence Zotero's voices window speaks, which is built
 * from the label (read-aloud-voices.js:3723-3724). The ids Zotero receives
 * are identical whether a voice is marked or not, so nothing about
 * picking, persistence or playback can see this, and — unlike every other
 * setting that edits the player's list (ui/reading-guard.ts) — a heart may
 * be toggled while a tab is reading: only CSS changes, and an open
 * dropdown repaints on the spot.
 *
 * Measured live on 1.10.8 / Zotero 10.0.2-beta.5 (2026-09-04, issue #45):
 * the dropdown is in the reader iframe's own document
 * (resource://zotero/reader/reader.html), a rule named by one row's id
 * gives that row `" ♥"` and every other row `none`, the row height stays
 * 24px and the dropdown's scrollHeight 370px, every option is rendered
 * (options.map, reader.js:37917 — no virtualization, so a row far down the
 * list is marked like the first), and U+2665 falls to the UI sans-serif
 * rather than to an emoji font, so the color is ours to choose.
 *
 * What it does not reach, stated rather than discovered later: the
 * collapsed control, whose trigger carries no id and no per-voice
 * attribute, so the player does not say whether the voice it is reading
 * with is a favorite; and the first-run flow and the Read Aloud Voices
 * window, separate documents with their own bundles, whose rows carry no
 * per-voice attribute either (`VoiceRow`, read-aloud-voices.js:3842-3869).
 * If a Zotero release ever changes the id scheme, no rule matches and the
 * list renders exactly as it does today — nothing breaks, and nothing
 * says so either, which is what `inspect` (diagnostics.favoriteMarks) and
 * the live checklist item are for: they count the rows the rules actually
 * match.
 */

/** The id the plugin's stylesheet carries in a reader document, so it is found again and taken out. */
export const MARK_STYLE_ID = 'ztts-favorite-marks';

/**
 * The player's voice dropdown and nothing else. The popup holds three
 * CustomSelects — tier, language, voice — and only the voice one sits in
 * `.row.voices` (reader.js:38905).
 */
const DROPDOWN = '.read-aloud-popup .row.voices .custom-select-dropdown';

/** Every option row of that list; what `inspect` counts the marks against. */
export const OPTION_SELECTOR = `${DROPDOWN} .option`;

/** Zotero's own entry at the end of the list (`value: 'more-voices'`, reader.js:38899-38903). Not a voice, so it keeps its indent. */
const MORE_VOICES = 'more-voices';

/** U+2665, as CSS. The closing quote ends the escape. */
const GLYPH = '\\2665';

/** The red the pane's own hearts are painted with (ui/voice-browser-rows.ts), so one mark is one color in both places. */
const COLOR = '#e0245e';

/** Zotero's check mark sits at 5px of a 22px gutter; the heart takes the next column, and the label starts after both. */
const GUTTER_START_PX = 22;
const LABEL_START_PX = 38;

/**
 * A voice id inside a quoted attribute value: only the quote and the
 * backslash need escaping. The colons that ids arrive with — React's
 * `:r2:`, our `azure::`, Azure's own `Ethan:MAI-Voice-2` — are literal
 * there, where a `#id` selector would have to escape every one.
 */
const escapeId = (id: string): string => id.replace(/[\\"]/g, '\\$&');

/**
 * The rows one voice's id names. A suffix match, so it holds whatever
 * `useId` prefix the tab's React instance hands out, and it cannot collide:
 * a false positive needs a second voice whose id ends with
 * `-option-<this id>`.
 */
export function favoriteRowSelector(id: string): string {
  return `${DROPDOWN} .option[id$="-option-${escapeId(id)}"]`;
}

/**
 * The stylesheet for a set of favorites: the gutter every row shares, then
 * one rule per marked voice. Empty — nothing drawn at all — while only
 * favorites are offered, since every listed voice is one and there is
 * nothing left to tell apart, and empty with nothing marked.
 */
export function favoriteMarksCss(favorites: readonly string[], favoritesOnly: boolean): string {
  if (favoritesOnly) return '';
  const marked = [...new Set(favorites)].filter((id) => typeof id === 'string' && id && id !== MORE_VOICES);
  if (!marked.length) return '';
  const rules = [`${DROPDOWN} .option:not([id$="-option-${MORE_VOICES}"]) { padding-inline-start: ${LABEL_START_PX}px; }`];
  for (const id of marked) {
    rules.push(
      `${favoriteRowSelector(id)}::after { content: "${GLYPH}"; color: ${COLOR};` +
        ` position: absolute; inset-inline-start: ${GUTTER_START_PX}px;` +
        ' height: var(--row-height); display: flex; align-items: center; }',
    );
  }
  return rules.join('\n');
}

export interface FavoriteMarksDeps {
  /** The hearts and the switch, read afresh on every write, so the pane applies to a reader that is already open. */
  marks(): { favorites: readonly string[]; favoritesOnly: boolean };
  /** The reader iframe's document (`reader._iframeWindow.document`), or null while the tab has none yet. */
  documentOf(reader: unknown): unknown;
  /** Components.utils.isDeadWrapper, so a closed tab's document is let go of instead of written into (proto-patches.ts). Optional for tests. */
  isDead?(value: unknown): boolean;
  error(e: unknown): void;
  debug?(message: string): void;
}

export interface FavoriteMarks {
  /** Put the stylesheet in this reader's document, or bring it up to date; true once it is there. Cheap to repeat, so it may run on every voices request. */
  attach(reader: unknown): boolean;
  /** Rewrite every stylesheet held — a heart marked or unmarked, the switch flipped. */
  refresh(): void;
  /** What this module sees in a reader, as plain data: the rules written, and how many rows in the open dropdown they match. */
  inspect(reader: unknown): Record<string, unknown>;
  /** Documents holding the stylesheet, and how many of them a closed tab has not taken with it. */
  counts(): { total: number; live: number };
  /** Take every stylesheet out again. */
  dispose(): void;
}

interface Entry {
  doc: any;
  style: any;
}

export function createFavoriteMarks(deps: FavoriteMarksDeps): FavoriteMarks {
  const entries: Entry[] = [];

  const dead = (value: unknown): boolean => (deps.isDead ? deps.isDead(value) : false);

  /** Entries whose tab is gone are let go of rather than touched: reading a dead wrapper throws (issue #5). */
  function compact(): void {
    for (let i = entries.length - 1; i >= 0; i--) if (dead(entries[i].doc)) entries.splice(i, 1);
  }

  const css = (): string => {
    const { favorites, favoritesOnly } = deps.marks();
    return favoriteMarksCss(favorites, favoritesOnly);
  };

  function write(entry: Entry, text: string): void {
    if (dead(entry.doc)) return;
    entry.style.textContent = text;
  }

  function find(doc: unknown): Entry | null {
    // Identity is safe on a dead wrapper, so this compares before compacting
    return entries.find((entry) => entry.doc === doc) ?? null;
  }

  function attach(reader: unknown): boolean {
    try {
      compact();
      const doc: any = deps.documentOf(reader);
      if (!doc || dead(doc)) return false;
      const held = find(doc);
      if (held) {
        write(held, css());
        return true;
      }
      const style = doc.createElement('style');
      style.setAttribute('id', MARK_STYLE_ID);
      const text = css();
      style.textContent = text;
      (doc.head ?? doc.documentElement).appendChild(style);
      entries.push({ doc, style });
      deps.debug?.(`favorite marks: ${text ? text.split('\n').length - 1 : 0} voices marked in the player's list`);
      return true;
    } catch (e) {
      deps.error(e);
      return false;
    }
  }

  function refresh(): void {
    try {
      compact();
      const text = css();
      for (const entry of entries) {
        try {
          write(entry, text);
        } catch (e) {
          deps.error(e);
        }
      }
    } catch (e) {
      deps.error(e);
    }
  }

  function inspect(reader: unknown): Record<string, unknown> {
    try {
      const doc: any = deps.documentOf(reader);
      if (!doc || dead(doc)) return { present: false };
      const entry = find(doc);
      const { favorites, favoritesOnly } = deps.marks();
      const marked = [...new Set(favorites)];
      const count = (selector: string): number => {
        try {
          return doc.querySelectorAll(selector).length;
        } catch {
          return -1;
        }
      };
      return {
        present: !!entry,
        favoritesOnly,
        favorites: marked.length,
        rules: favoritesOnly ? 0 : marked.length,
        // The list is only in the DOM while the dropdown is open, so 0 here
        // means "nothing to match", not "the rules missed" (reader.js:37874)
        options: count(OPTION_SELECTOR),
        matched: favoritesOnly ? 0 : marked.reduce((n, id) => n + Math.max(0, count(favoriteRowSelector(id))), 0),
      };
    } catch (e) {
      return { error: String(e) };
    }
  }

  function counts(): { total: number; live: number } {
    return { total: entries.length, live: entries.filter((entry) => !dead(entry.doc)).length };
  }

  function dispose(): void {
    for (const entry of entries) {
      try {
        if (!dead(entry.doc)) entry.style.remove();
      } catch (e) {
        deps.error(e);
      }
    }
    entries.length = 0;
  }

  return { attach, refresh, inspect, counts, dispose };
}
