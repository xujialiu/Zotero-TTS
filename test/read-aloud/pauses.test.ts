import { describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from '../../src/core/settings';
import { computeGap, createPauses, pauseSettingsOf, type PauseSettings, type PausesDeps, ZOTERO_PARAGRAPH_MS } from '../../src/read-aloud/pauses';

const settings = (sentence: [boolean, number], paragraph: [boolean, number]): PauseSettings => ({
  sentence: { enabled: sentence[0], ms: sentence[1] },
  paragraph: { enabled: paragraph[0], ms: paragraph[1] },
});
const zoteros = settings([false, 0], [false, 0]);
const defaults = pauseSettingsOf(DEFAULTS.readAloud);

describe('pauseSettingsOf', () => {
  it('reads the four prefs: on at 0 between sentences, on at 200 before a paragraph', () => {
    expect(defaults).toEqual(settings([true, 0], [true, 200]));
  });
});

describe('computeGap', () => {
  // Premium Voice 1 today: sentenceDelay 300, +200 before a paragraph
  const premium = { nativeSentence: 300 };

  it('hands Zotero its own number through, unscaled, while both switches are off', () => {
    expect(computeGap({ ...premium, scheduled: 300, paragraph: false, speed: 1, settings: zoteros })).toBe(300);
    expect(computeGap({ ...premium, scheduled: 500, paragraph: true, speed: 1, settings: zoteros })).toBe(500);
    expect(computeGap({ ...premium, scheduled: 500, paragraph: true, speed: 2, settings: zoteros })).toBe(500);
    expect(computeGap({ nativeSentence: 0, scheduled: 200, paragraph: true, speed: 3, settings: zoteros })).toBe(200);
  });

  it('at the defaults runs sentence to sentence and keeps 200 before a paragraph at 1×', () => {
    expect(computeGap({ ...premium, scheduled: 300, paragraph: false, speed: 1, settings: defaults })).toBe(0);
    expect(computeGap({ ...premium, scheduled: 500, paragraph: true, speed: 1, settings: defaults })).toBe(200);
    expect(computeGap({ nativeSentence: 0, scheduled: 0, paragraph: false, speed: 1, settings: defaults })).toBe(0);
    expect(computeGap({ nativeSentence: 0, scheduled: 200, paragraph: true, speed: 1, settings: defaults })).toBe(200);
  });

  it('divides an enabled part by the speed, rounded to whole milliseconds', () => {
    const on = settings([true, 1000], [true, 400]);
    expect(computeGap({ ...premium, scheduled: 300, paragraph: false, speed: 2, settings: on })).toBe(500);
    expect(computeGap({ ...premium, scheduled: 500, paragraph: true, speed: 2, settings: on })).toBe(700);
    expect(computeGap({ nativeSentence: 0, scheduled: 200, paragraph: true, speed: 1.5, settings: defaults })).toBe(133);
    expect(computeGap({ nativeSentence: 0, scheduled: 0, paragraph: false, speed: 1.7, settings: settings([true, 300], [false, 0]) })).toBe(176);
  });

  it('mixes: one part the setting, the other Zotero’s own', () => {
    // Sentence set, paragraph left to Zotero: the extra is what Zotero added, unscaled
    expect(computeGap({ ...premium, scheduled: 500, paragraph: true, speed: 2, settings: settings([true, 0], [false, 0]) })).toBe(200);
    // Paragraph set, sentence left to Zotero: the voice's own 300, unscaled, plus the setting scaled
    expect(computeGap({ ...premium, scheduled: 500, paragraph: true, speed: 2, settings: settings([false, 0], [true, 400]) })).toBe(500);
    expect(computeGap({ ...premium, scheduled: 300, paragraph: false, speed: 2, settings: settings([false, 0], [true, 400]) })).toBe(300);
  });

  it('counts a speed that is not a positive number as 1×, and a delay that is not a number as none', () => {
    const on = settings([true, 300], [true, 200]);
    for (const speed of [0, -1, NaN, Infinity, undefined as unknown as number]) {
      expect(computeGap({ nativeSentence: 0, scheduled: 0, paragraph: false, speed, settings: on })).toBe(300);
    }
    expect(computeGap({ nativeSentence: NaN, scheduled: NaN, paragraph: true, speed: 1, settings: zoteros })).toBe(0);
    expect(computeGap({ nativeSentence: -50, scheduled: -50, paragraph: false, speed: 1, settings: zoteros })).toBe(0);
    expect(computeGap({ nativeSentence: 0, scheduled: 0, paragraph: false, speed: 1, settings: settings([true, NaN], [true, -5]) })).toBe(0);
  });
});

/**
 * One reader tab: its own copies of the manager and controller classes, as
 * each tab has its own bundle. The controller's `end()` is the tail of
 * Zotero's `_handleSegmentEnd` (reader.js:39502-39507): advance, take the
 * voice's delay, add the paragraph extra when the upcoming segment starts
 * one, schedule.
 */
function makeTab(voiceDelay = 300) {
  const segments = [{ text: 'a' }, { text: 'b', anchor: 'paragraphStart' }, { text: 'c' }, { text: 'd' }];
  class Controller {
    voice: any;
    _segments: any[];
    _position = 0;
    _speed = 1;
    scheduled: unknown[] = [];
    constructor(voice: any, segs: any[]) {
      this.voice = voice;
      this._segments = segs;
    }
    get speed() {
      return this._speed;
    }
    set speed(speed: number) {
      this._speed = speed;
    }
    get _currentSegment() {
      return this._segments[this._position];
    }
    _scheduleSpeak(delay: unknown) {
      this.scheduled.push(delay);
    }
    end() {
      this._position++;
      let delay = this.voice.sentenceDelay;
      if (this._currentSegment?.anchor === 'paragraphStart') delay += ZOTERO_PARAGRAPH_MS;
      this._scheduleSpeak(delay);
    }
  }
  class Manager {
    _controller: Controller | null = null;
    _voice: any = { id: 'bdd0dcc3-en-US', tier: 'premium', sentenceDelay: voiceDelay };
    _speed = 1;
    _active = false;
    _paused = true;
    get speed() {
      return this._speed;
    }
    get active() {
      return this._active;
    }
    get paused() {
      return this._paused;
    }
    _createController() {
      this._controller = new Controller(this._voice, segments);
      this._controller.speed = this._speed;
    }
  }
  const manager = new Manager();
  return { Controller, Manager, manager, reader: { _internalReader: { _readAloudManager: manager } } };
}

function make(overrides: Partial<PausesDeps> = {}) {
  const error = vi.fn();
  let current: PauseSettings = defaults;
  const pauses = createPauses({ getSettings: () => current, error, now: () => 1_700_000_000_000, ...overrides });
  return { pauses, error, set: (s: PauseSettings) => (current = s) };
}

describe('createPauses', () => {
  it('does not attach without a manager', () => {
    const { pauses, error } = make();
    expect(pauses.attach(null)).toBe(false);
    expect(pauses.attach({})).toBe(false);
    expect(pauses.attach({ _internalReader: {} })).toBe(false);
    expect(pauses.patchCounts()).toEqual({ total: 0, live: 0 });
    expect(error).not.toHaveBeenCalled();
  });

  it('patches the controller from the first one the manager builds, and schedules the settings’ gap', () => {
    const { manager, reader } = makeTab();
    const { pauses, error, set } = make();
    expect(pauses.attach(reader)).toBe(true);
    expect(pauses.patchCounts()).toEqual({ total: 1, live: 1 });

    manager._createController();
    const controller = manager._controller!;
    expect(pauses.patchCounts()).toEqual({ total: 2, live: 2 });

    // 0 → 1, a paragraph start: the defaults keep Zotero's 200 and drop the voice's 300
    controller.end();
    expect(controller.scheduled).toEqual([200]);

    // 1 → 2, no paragraph, at 2× with both parts set
    set(settings([true, 1000], [true, 400]));
    manager._speed = 2;
    controller.speed = 2;
    controller.end();
    expect(controller.scheduled).toEqual([200, 500]);

    expect(pauses.inspect(reader)).toMatchObject({
      patched: { manager: true, controller: true },
      speed: 2,
      voice: { id: 'bdd0dcc3-en-US', tier: 'premium', nativeSentenceDelay: 300 },
      gaps: { sentence: 500, paragraph: 700 },
      last: { scheduled: 300, delay: 500, paragraph: false, speed: 2, nativeSentence: 300, at: 1_700_000_000_000 },
      count: 2,
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('with both switches off hands Zotero’s own number through, even at speed', () => {
    const { manager, reader } = makeTab();
    const { pauses, set } = make();
    set(zoteros);
    pauses.attach(reader);
    manager._createController();
    const controller = manager._controller!;
    controller.speed = 2;
    controller.end();
    controller.end();
    expect(controller.scheduled).toEqual([500, 300]);
    expect(pauses.inspect(reader)).toMatchObject({ gaps: { sentence: 300, paragraph: 500 }, last: { scheduled: 300, delay: 300, paragraph: false } });
  });

  it('reads the settings on every boundary, so a change lands on the next sentence', () => {
    const { manager, reader } = makeTab(0);
    const { pauses, set } = make();
    pauses.attach(reader);
    manager._createController();
    const controller = manager._controller!;
    controller.end(); // paragraph: 200
    set(settings([true, 150], [true, 50]));
    controller.end(); // sentence: 150
    set(zoteros);
    controller.end(); // Zotero's own: 0
    expect(controller.scheduled).toEqual([200, 150, 0]);
  });

  // Issue #38: an in-place upgrade under a paused session — the controller
  // exists before this instance ever sees the manager
  it('patches a controller that is already running when it attaches', () => {
    const { manager, reader } = makeTab();
    manager._createController();
    const controller = manager._controller!;
    const { pauses } = make();
    expect(pauses.attach(reader)).toBe(true);
    expect(pauses.patchCounts()).toEqual({ total: 2, live: 2 });
    controller.end();
    expect(controller.scheduled).toEqual([200]);
  });

  it('patches each prototype once per tab, however often attached and however many controllers', () => {
    const { manager, reader } = makeTab();
    const { pauses } = make();
    pauses.attach(reader);
    pauses.attach(reader);
    manager._createController();
    manager._createController();
    pauses.attach(reader);
    expect(pauses.patchCounts()).toEqual({ total: 2, live: 2 });

    const other = makeTab();
    pauses.attach(other.reader);
    other.manager._createController();
    expect(pauses.patchCounts()).toEqual({ total: 4, live: 4 });
    // Each tab keeps its own record
    other.manager._controller!.end();
    expect(pauses.inspect(reader)).toMatchObject({ count: 0, last: null });
    expect(pauses.inspect(other.reader)).toMatchObject({ count: 1 });
  });

  it('puts both prototypes back on dispose', () => {
    const { Controller, Manager, manager, reader } = makeTab();
    const createController = Manager.prototype._createController;
    const scheduleSpeak = Controller.prototype._scheduleSpeak;
    const { pauses } = make();
    pauses.attach(reader);
    manager._createController();
    expect(Manager.prototype._createController).not.toBe(createController);
    expect(Controller.prototype._scheduleSpeak).not.toBe(scheduleSpeak);

    pauses.dispose();
    expect(Manager.prototype._createController).toBe(createController);
    expect(Controller.prototype._scheduleSpeak).toBe(scheduleSpeak);
    expect(pauses.patchCounts()).toEqual({ total: 0, live: 0 });
    // Zotero's own arithmetic again
    manager._controller!.end();
    expect(manager._controller!.scheduled).toEqual([500]);
  });

  it('logs a failure inside the shadow and lets Zotero’s own number through', () => {
    const { manager, reader } = makeTab();
    const { pauses, error } = make({
      getSettings: () => {
        throw new Error('prefs gone');
      },
    });
    pauses.attach(reader);
    manager._createController();
    manager._controller!.end();
    expect(manager._controller!.scheduled).toEqual([500]);
    expect(error).toHaveBeenCalledTimes(1);
    expect(pauses.inspect(reader)).toMatchObject({ error: expect.stringContaining('prefs gone') });
  });

  it('exports the wrappers into the reader’s compartment and waives what comes back', () => {
    const { manager, reader } = makeTab();
    const exportFunction = vi.fn((fn: any) => fn);
    const waiveXrays = vi.fn((v: any) => v);
    const { pauses } = make({ exportFunction, waiveXrays });
    pauses.attach(reader);
    manager._createController();
    manager._controller!.end();
    expect(exportFunction).toHaveBeenCalledTimes(2);
    expect(waiveXrays).toHaveBeenCalled();
  });

  it('inspects a tab with no session as unpatched on the controller side', () => {
    const { reader } = makeTab();
    const { pauses } = make();
    pauses.attach(reader);
    expect(pauses.inspect(reader)).toMatchObject({
      patched: { manager: true, controller: false },
      active: false,
      settings: defaults,
      gaps: { sentence: 0, paragraph: 200 },
      last: null,
      count: 0,
    });
    expect(pauses.inspect({})).toMatchObject({ patched: { manager: false, controller: false }, voice: null });
  });
});
