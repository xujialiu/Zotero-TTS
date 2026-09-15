import { describe, expect, it, vi } from 'vitest';
import {
  createZoteroHighlightMenu,
  ZOTERO_HIGHLIGHT_MENULIST_ID,
  type MenuDocumentLike,
  type ZoteroHighlightMenuDeps,
} from '../../src/ui/zotero-highlight-menu';

function fakeMenu(initial: Record<string, string> = {}) {
  const attrs = new Map(Object.entries(initial));
  return {
    attrs,
    getAttribute: (k: string) => attrs.get(k) ?? null,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
  };
}

type Menu = ReturnType<typeof fakeMenu>;

function setup(hint = 'Chosen in Zotero-TTS') {
  let offer: ((doc: MenuDocumentLike, onUnload: (fn: () => void) => void) => void) | null = null;
  const stopWatching = vi.fn();
  const observers: Array<{ doc: unknown; changed: () => void; disconnect: ReturnType<typeof vi.fn> }> = [];
  const dead = new Set<unknown>();
  const error = vi.fn();
  const deps: ZoteroHighlightMenuDeps = {
    hint: () => hint,
    watchSettingsWindows: vi.fn((onDocument) => {
      offer = onDocument;
      return stopWatching;
    }),
    observe: vi.fn((doc, changed) => {
      const disconnect = vi.fn();
      observers.push({ doc, changed, disconnect });
      return disconnect;
    }),
    isDead: (value) => dead.has(value),
    error,
  };
  const menu = createZoteroHighlightMenu(deps);
  /** A settings window offered to the module: its General pane loaded (the menulist there) or not yet. */
  const open = (withMenu: boolean, initial?: Record<string, string>) => {
    const doc = {
      menu: (withMenu ? fakeMenu(initial) : null) as Menu | null,
      getElementById: (id: string) => (id === ZOTERO_HIGHLIGHT_MENULIST_ID ? doc.menu : null),
    };
    let unloadFn: (() => void) | null = null;
    if (!offer) throw new Error('not watching');
    offer(doc, (fn) => void (unloadFn = fn));
    return {
      doc,
      menu: () => doc.menu!,
      loadGeneral: (init?: Record<string, string>) => {
        doc.menu = fakeMenu(init);
        for (const o of observers) if (o.doc === doc) o.changed();
      },
      unload: () => unloadFn?.(),
      die: () => dead.add(doc),
      observersOf: () => observers.filter((o) => o.doc === doc),
    };
  };
  /** A document offered as it is, with no unload wiring — for one that cannot be read at all. */
  const offerRaw = (doc: MenuDocumentLike) => {
    if (!offer) throw new Error('not watching');
    offer(doc, () => {});
  };
  return { menu, deps, error, stopWatching, open, offerRaw, observers, watching: () => offer !== null };
}

describe("Zotero's Highlight current menulist, greyed and hinted (issue #114)", () => {
  it('greys the menulist of a settings window whose General pane is loaded, with the hint, without observing', () => {
    const s = setup();
    s.menu.start();
    const w = s.open(true);
    expect(w.menu().attrs.get('disabled')).toBe('true');
    expect(w.menu().attrs.get('tooltiptext')).toBe('Chosen in Zotero-TTS');
    expect(s.deps.observe).not.toHaveBeenCalled();
    expect(s.menu.inspect()).toEqual({ started: true, windows: [{ found: true, disabled: true }] });
  });

  it('waits for the General pane when the menulist is not there yet, then stops watching that document', () => {
    const s = setup();
    s.menu.start();
    const w = s.open(false);
    expect(w.observersOf()).toHaveLength(1);
    expect(s.menu.inspect().windows).toEqual([{ found: false, disabled: false }]);
    w.loadGeneral();
    expect(w.menu().attrs.get('disabled')).toBe('true');
    expect(w.menu().attrs.get('tooltiptext')).toBe('Chosen in Zotero-TTS');
    expect(w.observersOf()[0].disconnect).toHaveBeenCalledTimes(1);
    expect(s.menu.inspect().windows).toEqual([{ found: true, disabled: true }]);
    // A later mutation changes nothing and touches the element once
    w.menu().attrs.set('tooltiptext', 'edited');
    w.observersOf()[0].changed();
    expect(w.menu().attrs.get('tooltiptext')).toBe('edited');
  });

  it('restores what it changed at stop, and only that', () => {
    const s = setup();
    s.menu.start();
    const plain = s.open(true, { tooltiptext: 'Zotero says' });
    const already = s.open(true, { disabled: 'true' });
    s.menu.stop();
    expect(plain.menu().attrs.has('disabled')).toBe(false);
    expect(plain.menu().attrs.get('tooltiptext')).toBe('Zotero says');
    expect(already.menu().attrs.get('disabled')).toBe('true');
    expect(already.menu().attrs.has('tooltiptext')).toBe(false);
    expect(s.stopWatching).toHaveBeenCalledTimes(1);
    expect(s.menu.inspect()).toEqual({ started: false, windows: [] });
  });

  it('a stop before the General pane loaded disconnects its observer', () => {
    const s = setup();
    s.menu.start();
    const w = s.open(false);
    s.menu.stop();
    expect(w.observersOf()[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('forgets an unloaded window and skips a dead one at stop', () => {
    const s = setup();
    s.menu.start();
    const gone = s.open(true);
    gone.unload();
    expect(s.menu.inspect().windows).toEqual([]);
    const dead = s.open(true);
    dead.die();
    expect(() => s.menu.stop()).not.toThrow();
    expect(dead.menu().attrs.get('disabled')).toBe('true');
    expect(s.error).not.toHaveBeenCalled();
  });

  it('logs a document it cannot read, forgets it, and goes on with the rest', () => {
    const s = setup();
    s.menu.start();
    s.offerRaw({
      getElementById: () => {
        throw new Error('dead object');
      },
    });
    const fine = s.open(true);
    expect(s.error).toHaveBeenCalledWith(expect.any(Error));
    expect(fine.menu().attrs.get('disabled')).toBe('true');
    expect(s.menu.inspect().windows).toEqual([{ found: true, disabled: true }]);
  });

  it('starts once however often start is called, and stops the window watch once', () => {
    const s = setup();
    s.menu.start();
    s.menu.start();
    expect(s.deps.watchSettingsWindows).toHaveBeenCalledTimes(1);
    s.menu.stop();
    s.menu.stop();
    expect(s.stopWatching).toHaveBeenCalledTimes(1);
  });

  it('re-reads the hint for every window, so a locale switch is not frozen', () => {
    let hint = 'one';
    const s = setup();
    s.deps.hint = () => hint;
    s.menu.start();
    const first = s.open(true);
    hint = 'two';
    const second = s.open(true);
    expect(first.menu().attrs.get('tooltiptext')).toBe('one');
    expect(second.menu().attrs.get('tooltiptext')).toBe('two');
  });
});
