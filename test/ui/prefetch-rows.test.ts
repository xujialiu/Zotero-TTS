import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { CACHE_AUDIO_CHECKBOX_ID, initPrefetchRows, PREFETCH_ENABLED_OBSERVER } from '../../src/ui/prefetch-rows';
import { englishAttribute } from '../setup';

const CACHE = `${PREF_PREFIX}cacheAudio`;
const PREFETCH = `${PREF_PREFIX}prefetchEnabled`;

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown>; writes: string[] } {
  const store = { ...initial };
  const writes: string[] = [];
  return {
    store,
    writes,
    get: (k) => store[k],
    set: (k, v) => {
      writes.push(k);
      store[k] = v;
    },
  };
}

class FakeCheckbox {
  disabled = false;
}

function setup(initial: Record<string, unknown> = {}) {
  const box = new FakeCheckbox();
  const doc = { getElementById: (id: string) => (id === CACHE_AUDIO_CHECKBOX_ID ? box : null) };
  const prefs = fakePrefs(initial);
  let observer: (() => void) | null = null;
  let unregistered = false;
  const rows = initPrefetchRows(doc, {
    prefs,
    watch: (onChange) => {
      observer = onChange;
      return () => void (unregistered = true);
    },
  });
  return {
    prefs,
    rows,
    box,
    flip: (on: boolean) => {
      prefs.store[PREFETCH] = on;
      observer?.();
    },
    unregistered: () => unregistered,
  };
}

describe('initPrefetchRows', () => {
  it('turns the cache on and locks its checkbox while prefetch is on', () => {
    const { prefs, box } = setup({ [PREFETCH]: true, [CACHE]: false });
    expect(prefs.store[CACHE]).toBe(true);
    expect(box.disabled).toBe(true);
  });

  it('leaves the cache alone and editable while prefetch is off', () => {
    const { prefs, box } = setup({ [PREFETCH]: false, [CACHE]: false });
    expect(prefs.store[CACHE]).toBe(false);
    expect(prefs.writes).toEqual([]);
    expect(box.disabled).toBe(false);
  });

  // Default prefs are not stored: writing the value it already holds would
  // materialize a user pref for nothing (notes/NOTES.md).
  it('does not write a cache pref that is already on', () => {
    const { prefs, box } = setup({ [PREFETCH]: true, [CACHE]: true });
    expect(prefs.writes).toEqual([]);
    expect(box.disabled).toBe(true);
  });

  it('follows the switch both ways', () => {
    const pane = setup({ [PREFETCH]: false, [CACHE]: false });
    expect(pane.box.disabled).toBe(false);

    pane.flip(true);
    expect(pane.prefs.store[CACHE]).toBe(true);
    expect(pane.box.disabled).toBe(true);

    // Off again: the cache stays on — it was turned on, not borrowed — but
    // the user may switch it off now.
    pane.flip(false);
    expect(pane.prefs.store[CACHE]).toBe(true);
    expect(pane.box.disabled).toBe(false);
  });

  // Both defaults are on, so an untouched profile locks the cache too.
  it('takes the defaults for prefs that are not set', () => {
    const { prefs, box } = setup();
    expect(prefs.writes).toEqual([]);
    expect(box.disabled).toBe(true);
  });

  it('repaints on refresh, for a restored backup', () => {
    const pane = setup({ [PREFETCH]: false, [CACHE]: false });
    pane.prefs.store[PREFETCH] = true;
    pane.rows.refresh();
    expect(pane.prefs.store[CACHE]).toBe(true);
    expect(pane.box.disabled).toBe(true);
  });

  it('unregisters its observer when the pane closes', () => {
    const pane = setup();
    expect(pane.unregistered()).toBe(false);
    pane.rows.dispose();
    expect(pane.unregistered()).toBe(true);
  });

  it('names the switch as Zotero.Prefs.registerObserver does', () => {
    expect(PREFETCH_ENABLED_OBSERVER).toBe('zotero-tts.prefetchEnabled');
    expect(`extensions.zotero.${PREFETCH_ENABLED_OBSERVER}`).toBe(PREFETCH);
  });
});

describe('addon/content/preferences.xhtml', () => {
  const xhtml = readFileSync(new URL('../../addon/content/preferences.xhtml', import.meta.url), 'utf8');
  const rowOf = (marker: string) => {
    const at = xhtml.indexOf(marker);
    expect(at, marker).toBeGreaterThan(-1);
    return xhtml.slice(xhtml.lastIndexOf('<hbox', at), xhtml.indexOf('</hbox>', at));
  };

  it('gives the cache checkbox the id the lock reaches it by', () => {
    const row = rowOf(`preference="${CACHE}"`);
    expect(row).toContain(`id="${CACHE_AUDIO_CHECKBOX_ID}"`);
  });

  // The ? icon's text is its message's .help (addon/locale, issue #30)
  it('explains both settings with a ?, and says they are one feature', () => {
    const helpOf = (row: string) => englishAttribute(row.match(/<label class="ztts-help"[^>]*data-l10n-id="([^"]+)"/)?.[1] ?? '', 'help') ?? '';
    const prefetch = helpOf(rowOf(`preference="${PREFETCH}"`));
    expect(prefetch).toMatch(/3 ahead on its own/);
    expect(prefetch).toMatch(/stays on while this is on/);

    const cache = helpOf(rowOf(`preference="${CACHE}"`));
    expect(cache).toMatch(/emptied when Zotero restarts/);
    expect(cache).toMatch(/cannot be turned off while prefetch is on/);
  });
});
