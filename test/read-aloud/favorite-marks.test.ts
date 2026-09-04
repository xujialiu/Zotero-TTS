import { describe, expect, it, vi } from 'vitest';
import {
  createFavoriteMarks,
  favoriteMarksCss,
  favoriteRowSelector,
  MARK_STYLE_ID,
  type FavoriteMarksDeps,
} from '../../src/read-aloud/favorite-marks';
import { encodeVoiceId } from '../../src/read-aloud/voice-catalog';

const ava = encodeVoiceId('azure', 'en-US-AvaMultilingualNeural');
const bella = encodeVoiceId('local', 'af_bella');
// A Zotero voice: its id carries no `::` and is marked exactly like ours
const zoteroVoice = 'bdd0dcc3-en-US';

/**
 * The reader iframe's document, as much of it as this module touches:
 * `createElement`, an element to append to, and `querySelectorAll` for the
 * inspect report. Elements remember whether they are still in the tree, so a
 * test can prove dispose removed them.
 */
function fakeDocument(rows: Record<string, number> = {}) {
  const nodes: any[] = [];
  const el = (tag: string) => {
    const node: any = {
      tagName: tag,
      attributes: {} as Record<string, string>,
      textContent: '',
      attached: false,
      setAttribute(name: string, value: string) {
        node.attributes[name] = value;
      },
      remove() {
        node.attached = false;
        const at = nodes.indexOf(node);
        if (at !== -1) nodes.splice(at, 1);
      },
    };
    return node;
  };
  const doc: any = {
    createElement: vi.fn(el),
    documentElement: {
      appendChild(node: any) {
        node.attached = true;
        nodes.push(node);
        return node;
      },
    },
    // Keyed by selector, so a test can say how many rows a rule would match
    querySelectorAll: vi.fn((selector: string) => new Array(rows[selector] ?? 0).fill({})),
    nodes,
  };
  return doc;
}

function deps(over: Partial<FavoriteMarksDeps> = {}): FavoriteMarksDeps {
  return {
    marks: () => ({ favorites: [ava], favoritesOnly: false }),
    documentOf: (reader: any) => reader?.document ?? null,
    error: vi.fn(),
    ...over,
  };
}

describe('favoriteMarksCss', () => {
  it('scopes every rule to the player voice dropdown and marks one row per favorite', () => {
    const css = favoriteMarksCss([ava, zoteroVoice], false);
    const root = '.read-aloud-popup .row.voices .custom-select-dropdown';
    expect(css).toContain(`${root} .option[id$="-option-${ava}"]::after`);
    expect(css).toContain(`${root} .option[id$="-option-${zoteroVoice}"]::after`);
    // The gutter the hearts line up in, and the "More voices…" row left out of it
    expect(css).toContain(`${root} .option:not([id$="-option-more-voices"])`);
    expect(css).toContain('padding-inline-start: 38px');
    expect(css).toContain('inset-inline-start: 22px');
    expect(css).toContain('content: "\\2665"');
    expect(css).toContain('color: #e0245e');
    // Nothing outside that dropdown, and no rule for anything not marked
    expect(css.split('\n').filter((line) => line.includes('{') && !line.startsWith(root))).toEqual([]);
    expect(css).not.toContain(bella);
  });

  it('draws nothing while only favorites are offered — every listed voice is one', () => {
    expect(favoriteMarksCss([ava, bella], true)).toBe('');
  });

  it('draws nothing with nothing marked', () => {
    expect(favoriteMarksCss([], false)).toBe('');
  });

  it('escapes a quote and a backslash in a voice id, which comes from a server', () => {
    const css = favoriteMarksCss(['local::odd"voice\\1'], false);
    expect(css).toContain('[id$="-option-local::odd\\"voice\\\\1"]');
  });

  it('marks a voice once however often it is listed', () => {
    const css = favoriteMarksCss([ava, ava], false);
    expect(css.split(favoriteRowSelector(ava)).length - 1).toBe(1);
  });
});

describe('createFavoriteMarks', () => {
  it('puts one stylesheet in the reader document and writes the CSS into it', () => {
    const marks = createFavoriteMarks(deps());
    const doc = fakeDocument();
    expect(marks.attach({ document: doc })).toBe(true);
    expect(doc.nodes).toHaveLength(1);
    const style = doc.nodes[0];
    expect(style.tagName).toBe('style');
    expect(style.attributes.id).toBe(MARK_STYLE_ID);
    expect(style.textContent).toContain(favoriteRowSelector(ava));
  });

  it('attaches once per document: a second call rewrites the same element', () => {
    let favorites: string[] = [ava];
    const marks = createFavoriteMarks(deps({ marks: () => ({ favorites, favoritesOnly: false }) }));
    const doc = fakeDocument();
    marks.attach({ document: doc });
    favorites = [bella];
    marks.attach({ document: doc });
    expect(doc.nodes).toHaveLength(1);
    expect(doc.createElement).toHaveBeenCalledTimes(1);
    expect(doc.nodes[0].textContent).toContain(favoriteRowSelector(bella));
    expect(doc.nodes[0].textContent).not.toContain(favoriteRowSelector(ava));
  });

  it('refreshes every attached reader when a heart is toggled', () => {
    let favorites: string[] = [ava];
    const marks = createFavoriteMarks(deps({ marks: () => ({ favorites, favoritesOnly: false }) }));
    const one = fakeDocument();
    const two = fakeDocument();
    marks.attach({ document: one });
    marks.attach({ document: two });
    favorites = [ava, bella];
    marks.refresh();
    for (const doc of [one, two]) expect(doc.nodes[0].textContent).toContain(favoriteRowSelector(bella));
  });

  it('empties the stylesheet when the last heart goes, rather than leaving the marks behind', () => {
    let favorites: string[] = [ava];
    const marks = createFavoriteMarks(deps({ marks: () => ({ favorites, favoritesOnly: false }) }));
    const doc = fakeDocument();
    marks.attach({ document: doc });
    favorites = [];
    marks.refresh();
    expect(doc.nodes[0].textContent).toBe('');
  });

  it('is false for a reader whose document is not there yet, and holds nothing', () => {
    const marks = createFavoriteMarks(deps());
    expect(marks.attach({})).toBe(false);
    expect(marks.counts()).toEqual({ total: 0, live: 0 });
  });

  it('lets go of a document whose tab has closed instead of writing into it', () => {
    let gone: unknown = null;
    const closed = fakeDocument();
    const open = fakeDocument();
    const marks = createFavoriteMarks(deps({ isDead: (value) => value === gone }));
    marks.attach({ document: closed });
    marks.attach({ document: open });
    expect(marks.counts()).toEqual({ total: 2, live: 2 });
    // The tab closes: its document is a dead wrapper, and touching it would throw
    gone = closed;
    closed.nodes[0].textContent = 'stale';
    marks.refresh();
    expect(closed.nodes[0].textContent).toBe('stale');
    expect(open.nodes[0].textContent).toContain(favoriteRowSelector(ava));
    expect(marks.counts()).toEqual({ total: 1, live: 1 });
  });

  it('takes its stylesheets out again on dispose', () => {
    const marks = createFavoriteMarks(deps());
    const doc = fakeDocument();
    marks.attach({ document: doc });
    marks.dispose();
    expect(doc.nodes).toHaveLength(0);
    expect(marks.counts()).toEqual({ total: 0, live: 0 });
  });

  it('reports what the rules match right now, which is what proves they ran', () => {
    const marks = createFavoriteMarks(deps({ marks: () => ({ favorites: [ava, bella], favoritesOnly: false }) }));
    const doc = fakeDocument({
      '.read-aloud-popup .row.voices .custom-select-dropdown .option': 14,
      [favoriteRowSelector(ava)]: 1,
      [favoriteRowSelector(bella)]: 0,
    });
    marks.attach({ document: doc });
    expect(marks.inspect({ document: doc })).toMatchObject({ present: true, favorites: 2, rules: 2, options: 14, matched: 1 });
  });

  it('reports a reader it never attached to as absent instead of throwing', () => {
    const marks = createFavoriteMarks(deps());
    expect(marks.inspect({})).toMatchObject({ present: false });
  });

  it('reports the error and carries on when a document refuses the element', () => {
    const error = vi.fn();
    const marks = createFavoriteMarks(deps({ error }));
    const doc = fakeDocument();
    doc.createElement = () => {
      throw new Error('no');
    };
    expect(marks.attach({ document: doc })).toBe(false);
    expect(error).toHaveBeenCalled();
  });
});
