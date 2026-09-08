import { describe, expect, it, vi } from 'vitest';
import { createUnchangedVoice, type UnchangedVoiceDeps } from '../../src/read-aloud/unchanged-voice';

/**
 * Zotero's ReadAloudManager in miniature (reader.js:82497-82524): the voice
 * list, the voice in use, and `_applyVoice` as Zotero wrote it — it looks
 * the voice up in the list again, sets the voice fields, and with the
 * manager active recreates the controller unconditionally. Each tab has
 * its own class, so `makeTab` returns fresh ones.
 */
function makeTab() {
  let nextController = 1;
  class Manager {
    _active = false;
    _paused = true;
    _voiceID: string | null = null;
    _voice: any = null;
    _selectedTier: string | null = null;
    _segmentGranularity: string | null = null;
    _segments: unknown[] | null = null;
    _controller: { id: number; destroyed: boolean } | null = null;
    _allVoices: any[] = [];
    _lang = 'en';
    _requestedSegments = 0;
    get voicesForLanguage() {
      return this._allVoices.filter((v) => v.lang === this._lang);
    }
    _createController() {
      this._destroyController();
      if (!this._voice || !this._segments) return;
      this._controller = { id: nextController++, destroyed: false };
    }
    _destroyController() {
      if (this._controller) {
        this._controller.destroyed = true;
        this._controller = null;
      }
    }
    _applyVoice() {
      const voice = this._allVoices.find((v) => v.id === this._voiceID);
      if (!voice || !this.voicesForLanguage.some((v) => v.id === this._voiceID)) {
        this._voice = null;
        this._destroyController();
        return;
      }
      const granularityChanged = voice.segmentGranularity !== this._segmentGranularity;
      this._voice = voice;
      this._segmentGranularity = voice.segmentGranularity;
      this._selectedTier = voice.tier;
      if (!this._active) return;
      if (!this._segments || granularityChanged) {
        this._segments = null;
        this._requestedSegments += 1;
      } else {
        this._createController();
      }
    }
  }
  const voice = (id: string, tier = 'local', granularity = 'sentence', lang = 'en') => ({ id, tier, segmentGranularity: granularity, lang });
  const manager = new Manager();
  return { Manager, manager, voice, reader: { _internalReader: { _readAloudManager: manager } } };
}

/** A manager reading: the list loaded once, the voice applied, the session active with a controller on the segments. */
function reading(tab: ReturnType<typeof makeTab>, id = 'local::af_bella') {
  const { manager, voice } = tab;
  manager._allVoices = [voice(id), voice('local::am_puck'), voice('azure::en-US-AndrewNeural', 'local')];
  manager._voiceID = id;
  manager._applyVoice();
  manager._active = true;
  manager._paused = false;
  manager._segments = ['one', 'two', 'three'];
  manager._createController();
  return manager._controller!;
}

/** What loadVoices does when it lands: a rebuilt list of new objects, then the resolve's `_applyVoice` on the unchanged id. */
function listLands(tab: ReturnType<typeof makeTab>) {
  const { manager, voice } = tab;
  manager._allVoices = manager._allVoices.map((v) => voice(v.id, v.tier, v.segmentGranularity, v.lang));
  manager._applyVoice();
}

function setup(over: Partial<UnchangedVoiceDeps> = {}) {
  const error = vi.fn();
  const debug = vi.fn();
  const control = createUnchangedVoice({ error, debug, ...over });
  return { control, error, debug };
}

describe('createUnchangedVoice', () => {
  it('keeps the controller when the list lands on the voice already playing, and refreshes what Zotero sets from the new list', () => {
    const tab = makeTab();
    const { control, debug } = setup();
    expect(control.attach(tab.reader)).toBe(true);
    const controller = reading(tab);
    const before = tab.manager._voice;
    listLands(tab);
    expect(tab.manager._controller).toBe(controller);
    expect(controller.destroyed).toBe(false);
    // The voice object is the new list's, the tier from it, the id unchanged
    expect(tab.manager._voice).not.toBe(before);
    expect(tab.manager._voice.id).toBe('local::af_bella');
    expect(tab.manager._selectedTier).toBe('local');
    expect(control.inspect(tab.reader)).toEqual({ patched: true, active: true, voice: 'local::af_bella', kept: 1, last: 'local::af_bella' });
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('local::af_bella'));
  });

  // The lists are the reader realm's: their `find` / `some` cannot call a
  // sandbox callback and answer undefined / false without a throw, which
  // left 1.11.4-beta5's guard inert live. The guard walks them by index.
  it('keeps it when the lists are foreign arrays whose find and some answer nothing', () => {
    const tab = makeTab();
    const { control } = setup();
    control.attach(tab.reader);
    const controller = reading(tab);
    class ForeignArray<T> extends Array<T> {
      find(): undefined {
        return undefined;
      }
      some(): boolean {
        return false;
      }
    }
    const foreign = <T>(items: T[]): ForeignArray<T> => {
      const list = new ForeignArray<T>();
      for (const item of items) list.push(item);
      return list;
    };
    const { voice } = tab;
    tab.manager._allVoices = foreign([voice('local::af_bella'), voice('local::am_puck')]) as any;
    Object.defineProperty(tab.manager, 'voicesForLanguage', { get: () => foreign(tab.manager._allVoices.filter((v) => v.lang === 'en')), configurable: true });
    tab.manager._applyVoice();
    expect(tab.manager._controller).toBe(controller);
    expect(controller.destroyed).toBe(false);
    expect(tab.manager._voice.id).toBe('local::af_bella');
    expect(control.inspect(tab.reader)?.kept).toBe(1);
  });

  it('keeps it through a pause too: a paused session resumes where it was', () => {
    const tab = makeTab();
    const { control } = setup();
    control.attach(tab.reader);
    const controller = reading(tab);
    tab.manager._paused = true;
    listLands(tab);
    expect(tab.manager._controller).toBe(controller);
    expect(control.inspect(tab.reader)?.kept).toBe(1);
  });

  it("leaves Zotero's path alone when the voice changed: a pick or a fallback rebuilds", () => {
    const tab = makeTab();
    const { control } = setup();
    control.attach(tab.reader);
    const controller = reading(tab);
    tab.manager._voiceID = 'local::am_puck';
    tab.manager._applyVoice();
    expect(controller.destroyed).toBe(true);
    expect(tab.manager._controller).not.toBe(controller);
    expect(tab.manager._voice.id).toBe('local::am_puck');
    expect(control.inspect(tab.reader)?.kept).toBe(0);
  });

  // A tab's first open: nothing plays until the list lands, and the resolve
  // must set the voice fields for activate() — Zotero's own method does
  it("leaves Zotero's path alone on an idle manager", () => {
    const tab = makeTab();
    const { control } = setup();
    control.attach(tab.reader);
    tab.manager._allVoices = [tab.voice('local::af_bella')];
    tab.manager._voiceID = 'local::af_bella';
    tab.manager._applyVoice();
    expect(tab.manager._voice.id).toBe('local::af_bella');
    expect(tab.manager._controller).toBeNull();
    expect(control.inspect(tab.reader)?.kept).toBe(0);
  });

  it("leaves Zotero's path alone with no controller to keep, and when the segments are gone", () => {
    const tab = makeTab();
    const { control } = setup();
    control.attach(tab.reader);
    reading(tab);
    tab.manager._destroyController();
    listLands(tab);
    expect(tab.manager._controller).not.toBeNull();
    expect(control.inspect(tab.reader)?.kept).toBe(0);
    const again = makeTab();
    control.attach(again.reader);
    reading(again);
    again.manager._segments = null;
    listLands(again);
    // Zotero asks the view for segments again; no controller until they land
    expect(again.manager._requestedSegments).toBe(1);
    expect(control.inspect(again.reader)?.kept).toBe(0);
  });

  it("leaves Zotero's path alone when the voice vanished from the list: the controller goes, as Zotero has it", () => {
    const tab = makeTab();
    const { control } = setup();
    control.attach(tab.reader);
    const controller = reading(tab);
    tab.manager._allVoices = [tab.voice('local::am_puck')];
    tab.manager._applyVoice();
    expect(controller.destroyed).toBe(true);
    expect(tab.manager._voice).toBeNull();
    expect(control.inspect(tab.reader)?.kept).toBe(0);
  });

  it("leaves Zotero's path alone when the voice's granularity changed", () => {
    const tab = makeTab();
    const { control } = setup();
    control.attach(tab.reader);
    reading(tab);
    tab.manager._allVoices = [tab.voice('local::af_bella', 'local', 'word')];
    tab.manager._applyVoice();
    // Zotero asks the view for segments again (the controller goes when they land)
    expect(tab.manager._segments).toBeNull();
    expect(tab.manager._requestedSegments).toBe(1);
    expect(tab.manager._segmentGranularity).toBe('word');
    expect(control.inspect(tab.reader)?.kept).toBe(0);
  });

  it('falls back to Zotero’s method, logging, when the check itself throws', () => {
    const tab = makeTab();
    const { control, error } = setup();
    control.attach(tab.reader);
    const controller = reading(tab);
    Object.defineProperty(tab.manager, 'voicesForLanguage', {
      get() {
        throw new Error('dead object');
      },
    });
    // The shadow logs and hands over; Zotero's own method then meets the same throw
    expect(() => tab.manager._applyVoice()).toThrow('dead object');
    expect(error).toHaveBeenCalledWith(expect.any(Error));
    expect(controller.destroyed).toBe(false);
    expect(control.inspect(tab.reader)?.kept).toBe(0);
  });

  it('patches each tab’s prototype once, reports the counts, and restores on dispose', () => {
    const tab = makeTab();
    const { control } = setup();
    const original = tab.Manager.prototype._applyVoice;
    expect(control.attach(tab.reader)).toBe(true);
    expect(control.attach(tab.reader)).toBe(true);
    expect(tab.Manager.prototype._applyVoice).not.toBe(original);
    expect(control.patchCounts()).toEqual({ total: 1, live: 1 });
    const other = makeTab();
    control.attach(other.reader);
    expect(control.patchCounts()).toEqual({ total: 2, live: 2 });
    control.dispose();
    expect(tab.Manager.prototype._applyVoice).toBe(original);
    expect(control.patchCounts()).toEqual({ total: 0, live: 0 });
  });

  it('reports null for a reader without a manager, and attaches nothing there', () => {
    const { control } = setup();
    expect(control.attach({ _internalReader: {} })).toBe(false);
    expect(control.attach(null)).toBe(false);
    expect(control.inspect({ _internalReader: {} })).toBeNull();
  });

  it('inspects a reader whose manager is idle: patched, not active, no voice, nothing kept', () => {
    const tab = makeTab();
    const { control } = setup();
    control.attach(tab.reader);
    expect(control.inspect(tab.reader)).toEqual({ patched: true, active: false, voice: null, kept: 0, last: null });
  });
});
