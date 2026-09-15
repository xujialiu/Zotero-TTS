import { describe, expect, it, vi } from 'vitest';
import { HIGHLIGHT_LEVEL_OBSERVER, HIGHLIGHT_SWITCH_OBSERVERS, type HighlightLevels } from '../../src/core/highlight-level';
import { createHighlightPin, type HighlightPinDeps } from '../../src/core/highlight-pin';

/**
 * Zotero's prefs as far as the pin sees them: one value for Zotero's level,
 * the plugin's two switches, and observers that fire synchronously inside
 * a write, in registration order — what `Zotero.Prefs.set` does. A write
 * of an unchanged value notifies nobody, as in Zotero.
 */
function fakeZotero(initialLevel: unknown, initialLevels: HighlightLevels = { sentence: true, word: true }) {
  let level = initialLevel;
  let levels = { ...initialLevels };
  const observers = new Map<string, Array<() => void>>();
  const notify = (name: string) => {
    for (const fn of [...(observers.get(name) ?? [])]) fn();
  };
  const writes: unknown[] = [];
  const deps: HighlightPinDeps = {
    levels: () => levels,
    zoteroLevel: () => level,
    setZoteroLevel: (value) => {
      writes.push(value);
      if (level === value) return;
      level = value;
      notify(HIGHLIGHT_LEVEL_OBSERVER);
    },
    observe: vi.fn((name: string, changed: () => void) => {
      if (!observers.has(name)) observers.set(name, []);
      observers.get(name)!.push(changed);
      return () => {
        const list = observers.get(name) ?? [];
        const at = list.indexOf(changed);
        if (at >= 0) list.splice(at, 1);
      };
    }),
    log: vi.fn(),
  };
  return {
    deps,
    writes,
    level: () => level,
    /** A write from anywhere else: Zotero's settings window, a script. */
    foreignWrite: (value: unknown) => {
      if (level === value) return;
      level = value;
      notify(HIGHLIGHT_LEVEL_OBSERVER);
    },
    /** The plugin's switch prefs written by the pane, the key or a restore: each changed one notifies. */
    setLevels: (next: HighlightLevels) => {
      const changed = (['sentence', 'word'] as const).filter((k) => levels[k] !== next[k]);
      levels = { ...next };
      for (const k of changed) notify(HIGHLIGHT_SWITCH_OBSERVERS[k]);
    },
    /** An observer of Zotero's pref registered before the pin's — a reader opened earlier — recording every value it saw. */
    earlierReader: () => {
      const seen: unknown[] = [];
      deps.observe(HIGHLIGHT_LEVEL_OBSERVER, () => seen.push(level));
      return seen;
    },
    observerCount: () => [...observers.values()].reduce((n, list) => n + list.length, 0),
  };
}

describe('the highlight pin (issue #114)', () => {
  it("starts by writing Zotero's pref to the switches' level, whatever it held — paragraph included", () => {
    const z = fakeZotero('paragraph');
    const pin = createHighlightPin(z.deps);
    expect(z.level()).toBe('paragraph');
    pin.start();
    expect(z.level()).toBe('word');
    expect(z.writes).toEqual(['word']);
    expect(pin.inspect()).toEqual({ started: true, wanted: 'word', zotero: 'word', pinned: true, snapped: 0 });
  });

  it('writes nothing when the pref already agrees', () => {
    const z = fakeZotero('sentence', { sentence: true, word: false });
    createHighlightPin(z.deps).start();
    expect(z.writes).toEqual([]);
  });

  it("follows the switches: the Word switch is Zotero's word or sentence; the Sentence switch alone moves nothing of Zotero's", () => {
    const z = fakeZotero('word');
    createHighlightPin(z.deps).start();
    z.setLevels({ sentence: true, word: false });
    expect(z.level()).toBe('sentence');
    z.setLevels({ sentence: false, word: false });
    expect(z.level()).toBe('sentence');
    z.setLevels({ sentence: false, word: true });
    expect(z.level()).toBe('word');
    z.setLevels({ sentence: true, word: true });
    expect(z.writes).toEqual(['sentence', 'word']);
  });

  it('writes a foreign value back inside its own observer, once per write, and counts it', () => {
    const z = fakeZotero('word');
    const reader = z.earlierReader();
    const pin = createHighlightPin(z.deps);
    pin.start();
    z.foreignWrite('sentence');
    expect(z.level()).toBe('word');
    expect(z.writes).toEqual(['word']);
    // The reader registered before the pin saw the foreign value and then the pin's, in the same write
    expect(reader).toEqual(['sentence', 'word']);
    z.foreignWrite('paragraph');
    expect(z.level()).toBe('word');
    expect(pin.inspect().snapped).toBe(2);
    expect(z.deps.log).not.toHaveBeenCalled();
  });

  it('a switch write that lands while a foreign write is being undone still ends on the switches', () => {
    const z = fakeZotero('word');
    createHighlightPin(z.deps).start();
    z.setLevels({ sentence: true, word: false });
    z.foreignWrite('word');
    expect(z.level()).toBe('sentence');
  });

  it('does not fight a write that fails: logs it and reports unpinned', () => {
    const z = fakeZotero('paragraph');
    z.deps.setZoteroLevel = () => {
      throw new Error('pref refused');
    };
    const pin = createHighlightPin(z.deps);
    expect(() => pin.start()).not.toThrow();
    expect(z.deps.log).toHaveBeenCalledWith(expect.any(Error));
    expect(pin.inspect()).toMatchObject({ started: true, wanted: 'word', zotero: 'paragraph', pinned: false });
  });

  it('apply() reports whether it wrote', () => {
    const z = fakeZotero('sentence');
    const pin = createHighlightPin(z.deps);
    expect(pin.apply()).toBe(true);
    expect(pin.apply()).toBe(false);
    expect(z.level()).toBe('word');
  });

  it('stops: the observers come off and the pref stays where the plugin left it', () => {
    const z = fakeZotero('paragraph');
    const pin = createHighlightPin(z.deps);
    pin.start();
    expect(z.observerCount()).toBe(3);
    pin.stop();
    expect(z.observerCount()).toBe(0);
    expect(z.level()).toBe('word');
    z.foreignWrite('paragraph');
    expect(z.level()).toBe('paragraph');
    z.setLevels({ sentence: true, word: false });
    expect(z.level()).toBe('paragraph');
    expect(pin.inspect().started).toBe(false);
  });

  it('starting twice registers once', () => {
    const z = fakeZotero('word');
    const pin = createHighlightPin(z.deps);
    pin.start();
    pin.start();
    expect(z.observerCount()).toBe(3);
    pin.stop();
    pin.stop();
    expect(z.observerCount()).toBe(0);
  });

  it('an observer registration that throws is logged, and the pin still applies', () => {
    const z = fakeZotero('sentence');
    z.deps.observe = () => {
      throw new Error('no observers here');
    };
    const pin = createHighlightPin(z.deps);
    expect(() => pin.start()).not.toThrow();
    expect(z.level()).toBe('word');
    expect(z.deps.log).toHaveBeenCalled();
    expect(() => pin.stop()).not.toThrow();
  });
});
