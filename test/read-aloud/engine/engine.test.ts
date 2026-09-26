import { describe, expect, it, vi } from 'vitest';
import { createReadAloudMemorySync } from '../../../src/read-aloud/memory-sync';
import { createDocumentVoices, writeDefaultVoice, readDefaultVoice } from '../../../src/core/document-voices';
import type { PrefsBackend } from '../../../src/core/settings';
import { createVoicePick } from '../../../src/read-aloud/engine/voice-pick';
import { createEngine } from '../../../src/read-aloud/engine';
import { VirtualClock } from '../../core/engine/harness';
import { fakeAudio, FakeAudioContext, loadZoteroReadAloud, NativeController, readerWindow, voicesResponse } from './zotero';

const ALLOY = 'openai-official::alloy';
const NOVA = 'openai-official::nova';
const TEXTS = ['One two three.', 'Four five.', 'Six seven eight.', 'Nine ten.'];
const WORDS = [
  { start: 0, end: 0.2, charStart: 0, charEnd: 3 },
  { start: 0.25, end: 0.45, charStart: 4, charEnd: 7 },
  { start: 0.5, end: 0.7, charStart: 8, charEnd: 13 },
];

/**
 * One reader tab with Zotero 10.0.3's own manager, the Engine attached the
 * way the plugin attaches it, and a source answering every segment with
 * 0.05 s of audio per character.
 */
async function setup(options: { attachFirst?: boolean; voices?: Record<string, unknown[]>; fail?: (text: string) => string | null } = {}) {
  const clock = new VirtualClock();
  FakeAudioContext.made = [];
  const window = readerWindow(clock);
  const { ReadAloudManager } = loadZoteroReadAloud();
  const remote = {
    getVoices: async () => ({ voices: options.voices ?? voicesResponse([ALLOY, NOVA]), standardCreditsRemaining: 3, premiumCreditsRemaining: 4 }),
    getAudio: vi.fn(),
    getCreditsRemaining: vi.fn(async () => ({ standardCreditsRemaining: 5, premiumCreditsRemaining: 7 })),
    resetCredits: vi.fn(async () => ({ standardCreditsRemaining: 9, premiumCreditsRemaining: null })),
  };
  let requested = 0;
  const manager = new ReadAloudManager({
    remoteInterface: remote,
    onStateChange: () => {},
    onRequestSegments: () => requested++,
    onComputeRepositionIndex: (position: number) => position,
    onSetVoice: vi.fn(),
  });
  const reader = { _internalReader: { _readAloudManager: manager, _syncPersistedVoicesToManager() {} }, _iframeWindow: window };
  const source = {
    getAudio: vi.fn(async (segment: { text: string }, voice: { id: string }, _options?: { signal?: AbortSignal }) => {
      const error = options.fail?.(segment.text);
      if (error) return { audio: null, error };
      return { audio: fakeAudio(segment.text.length * 0.05), timestamps: segment.text === TEXTS[0] ? WORDS : undefined, voice: voice.id };
    }),
  };
  const notices: string[] = [];
  const errors: unknown[] = [];
  let volume = 100;
  const engine = createEngine({
    exportFunction: (fn) => fn,
    waiveXrays: (value) => value,
    isDead: () => false,
    cloneInto: (value) => value,
    toLocal: (value) => new Float32Array(value),
    audioSource: () => source,
    isPluginVoice: (id) => id.includes('::'),
    pauses: () => ({ sentence: { enabled: true, ms: 0 }, paragraph: { enabled: true, ms: 200 } }),
    volume: () => volume,
    notice: (_reader, kind) => notices.push(kind),
    error: (e) => errors.push(e),
    clock,
  });
  const segments = TEXTS.map((text, i) => ({ text, anchor: i === 0 ? 'paragraphStart' : null }));
  if (options.attachFirst) engine.attach(reader);
  await manager.loadVoices(true);
  manager.setLanguage('en');
  return {
    clock,
    window,
    manager,
    reader,
    remote,
    source,
    engine,
    segments,
    notices,
    errors,
    requested: () => requested,
    setVolume: (level: number) => (volume = level),
    /** Open the player as Zotero does: activate, then the segments the view computed. */
    open(index = 0) {
      manager.activate();
      manager.setSegments(segments, index, null);
    },
    context: () => FakeAudioContext.made.at(-1)!,
    sources: () => FakeAudioContext.made.flatMap((c) => c.sources),
  };
}

describe('the Engine behind Zotero 10.0.3’s manager', () => {
  it.each([
    { paused: true, sameVoice: false, detach: false },
    { paused: false, sameVoice: false, detach: false },
    { paused: false, sameVoice: true, detach: false },
    { paused: true, sameVoice: false, detach: true },
  ])('recovers a stranded player without reading until Play (#149): %j', async ({ paused, sameVoice, detach }) => {
    const t = await setup({ attachFirst: true });
    t.open(2);
    await t.clock.advance(20);
    if (paused) t.manager.pause();
    t.manager._destroyController();
    await Promise.resolve();
    expect(t.engine.session(t.reader)?.ended).toBe(true);
    if (detach) t.engine.detach(t.reader);
    if (!sameVoice) {
      t.manager._voiceID = null;
      t.manager._voice = null;
    }
    const target = sameVoice ? ALLOY : NOVA;
    const pickNotices: string[] = [];
    const pick = createVoicePick({
      engine: t.engine,
      notice: (_reader, kind) => pickNotices.push(kind),
      error: e => t.errors.push(e),
    });
    const values = new Map<string, unknown>();
    const prefs: PrefsBackend = { get: key => values.get(key), set: (key, value) => { values.set(key, value); } };
    writeDefaultVoice(prefs, { id: ALLOY, lang: 'en' });
    const documents = createDocumentVoices(prefs);
    documents.open('user/OTHERDOC');
    const other = documents.get('user/OTHERDOC');
    const memory = createReadAloudMemorySync({
      prefs, documentKey: () => 'user/THISBOOK',
      sameVoice: () => false, globalSpeed: () => false,
      registerObserver: () => null, unregisterObserver: () => {},
      readers: () => [t.reader], isVoicePreview: reader => pick.isPreviewing(reader),
      error: e => t.errors.push(e),
    });
    memory.attach(t.reader);
    pick.attach(t.reader);
    pickNotices.length = 0;
    t.source.getAudio.mockClear();
    t.manager.selectVoice(target);
    expect(t.manager.selectedVoiceID).toBe(target);
    expect(t.manager.paused).toBe(true);
    expect(t.engine.owns(t.manager._controller)).toBe(true);
    expect(t.engine.session(t.reader)?.ended).toBe(false);
    expect(t.engine.session(t.reader)?.position).toBe(2);
    expect(t.manager.activeSegment).toBe(t.segments[2]);
    await t.clock.advance(100);
    expect(t.source.getAudio).not.toHaveBeenCalled();
    expect(pickNotices).toEqual(['selected']);
    expect(pick.inspect(t.reader)?.recoveries).toBe(1);
    expect(documents.get('user/THISBOOK')).toMatchObject({ voice: { id: target, lang: 'en' }, manual: true });
    expect(documents.get('user/OTHERDOC')).toEqual(other);
    expect(readDefaultVoice(prefs)).toEqual({ id: ALLOY, lang: 'en' });
    t.manager.play();
    await t.clock.advance(0);
    expect(t.source.getAudio).toHaveBeenCalledWith(t.segments[2], expect.objectContaining({ id: target }), undefined);
    expect(t.errors).toEqual([]);
    pick.dispose();
    memory.dispose();
    t.engine.dispose();
  });

  it('removes a native fallback if recovery cannot rebuild on the Engine (#149)', async () => {
    const t = await setup({ attachFirst: true });
    t.open(2);
    t.manager.pause();
    t.manager._destroyController();
    await Promise.resolve();
    const target = t.manager.allVoices.find((voice: any) => voice.id === NOVA);
    const fallback = new NativeController(target);
    target.getController = () => fallback;
    const notices: string[] = [];
    const pick = createVoicePick({ engine: t.engine, notice: (_r, kind) => notices.push(kind), error: e => t.errors.push(e) });
    pick.attach(t.reader);
    t.manager.selectVoice(NOVA);
    expect(notices.at(-1)).toBe('failed');
    expect(t.manager.paused).toBe(true);
    expect(t.manager._controller).toBe(null);
    expect(fallback.destroyed).toBe(true);
    pick.dispose();
    t.engine.dispose();
  });

  it('answers the first controller of a tab even when attached before the voice list landed', async () => {
    const t = await setup({ attachFirst: true });
    t.open(0);
    expect(t.engine.owns(t.manager._controller)).toBe(true);
    expect(t.engine.inspect(t.reader).hooks).toEqual({ getController: true, activeTimestamp: true, setSegments: true, repositionTo: true });
    await t.clock.advance(0);
    expect(t.source.getAudio).toHaveBeenCalledWith(t.segments[0], expect.objectContaining({ id: ALLOY }), undefined);
    expect(t.manager.activeSegment).toBe(t.segments[0]);
    expect(t.sources()).toHaveLength(1);
    expect(t.errors).toEqual([]);
  });

  it('feeds the manager’s word highlight past its instanceof test', async () => {
    const t = await setup();
    t.engine.attach(t.reader);
    t.open(0);
    await t.clock.advance(300);
    expect(t.manager._activeTimestampIndex).toBe(1);
    expect(t.manager.activeTimestamp).toEqual(WORDS[1]);
    // Read Aloud's own controller still goes through Zotero's getter
    t.manager._controller = new NativeController(null);
    expect(t.manager.activeTimestamp).toBe(null);
  });

  it('keeps the manager’s state in step: buffering, the active segment, the end of the document', async () => {
    const t = await setup();
    t.engine.attach(t.reader);
    t.manager.activate();
    t.manager.setSegments(t.segments, 3, null);
    expect(t.manager.buffering).toBe(true);
    await t.clock.advance(0);
    expect(t.manager.buffering).toBe(false);
    expect(t.manager.activeSegment).toBe(t.segments[3]);
    await t.clock.advance(501);
    expect(t.manager.paused).toBe(true);
    expect(t.manager.activeSegment).toBe(null);
  });

  it('carries on through a voice list that lands mid-sentence: no restart, the word restated (#75)', async () => {
    const t = await setup();
    t.engine.attach(t.reader);
    t.open(0);
    await t.clock.advance(300);
    const controller = t.manager._controller;
    await t.manager.loadVoices(true);
    expect(t.manager._controller).not.toBe(controller);
    expect(t.engine.owns(t.manager._controller)).toBe(true);
    // The rebuild dropped the manager's word; the Engine restated it a microtask later
    expect(t.manager._activeTimestampIndex).toBe(1);
    expect(t.manager.activeTimestamp).toEqual(WORDS[1]);
    expect(t.sources()).toHaveLength(1);
    expect(t.engine.inspect(t.reader).stats).toMatchObject({ controllers: 2, carriedOn: 1, started: 1 });
  });

  it('starts where told on a jump, and afresh on another voice', async () => {
    const t = await setup();
    t.engine.attach(t.reader);
    t.open(0);
    await t.clock.advance(300);
    t.manager.repositionTo(2);
    await t.clock.advance(0);
    expect(t.manager.activeSegment).toBe(t.segments[2]);
    expect(t.sources().at(-1)!.offset).toBe(0);
    t.manager.selectVoice(NOVA);
    await t.clock.advance(0);
    expect(t.source.getAudio.mock.calls.at(-1)![1]).toMatchObject({ id: NOVA });
    expect(t.engine.inspect(t.reader).stats).toMatchObject({ started: 3, carriedOn: 0 });
  });

  it('ends the session when the manager destroys its controller for good, and closes the tab’s output', async () => {
    const t = await setup();
    t.engine.attach(t.reader);
    t.open(0);
    await t.clock.advance(100);
    t.manager.deactivate();
    await t.clock.advance(0);
    expect(t.engine.session(t.reader)?.ended).toBe(true);
    expect(t.context().state).toBe('closed');
    expect(t.sources()[0].stoppedAt).not.toBe(null);
    expect(t.engine.inspect(t.reader).stats?.ended).toBe(1);
  });

  it('pauses, resumes and changes speed through the manager', async () => {
    const t = await setup();
    t.engine.attach(t.reader);
    t.open(0);
    await t.clock.advance(200);
    t.manager.pause();
    expect(t.sources()[0].stoppedAt).not.toBe(null);
    t.manager.play();
    await t.clock.advance(0);
    expect(t.sources().at(-1)!.offset).toBeCloseTo(0.2, 9);
    t.manager.setSpeed(2);
    const last = t.sources().at(-1)!;
    expect(last.buffer.length).toBe(Math.round(t.sources()[0].buffer.length / 2));
  });

  it('reports a failed segment to the manager, and Retry asks again', async () => {
    let fail = true;
    const t = await setup({ fail: () => (fail ? 'network' : null) });
    t.engine.attach(t.reader);
    t.open(0);
    await t.clock.advance(0);
    expect(t.manager.error).toBe('network');
    expect(t.manager.paused).toBe(true);
    fail = false;
    t.manager.retry();
    expect(t.manager.error).toBe(null);
    await t.clock.advance(0);
    expect(t.sources()).toHaveLength(1);
  });

  it('asks Zotero for credits for a Zotero voice only, as Read Aloud’s controller does', async () => {
    const t = await setup({ voices: { ...voicesResponse([ALLOY]), ...voicesResponse(['zotero-standard-1'], 'standard') } });
    t.engine.attach(t.reader);
    t.open(0);
    await t.manager.refreshCreditsRemaining();
    expect(t.remote.getCreditsRemaining).not.toHaveBeenCalled();
    t.manager.selectTier('standard');
    expect(t.manager.selectedVoiceID).toBe('zotero-standard-1');
    await t.manager.refreshCreditsRemaining();
    expect(t.remote.getCreditsRemaining).toHaveBeenCalledOnce();
    expect(t.manager._controller.voice.provider.standardCreditsRemaining).toBe(5);
    expect(t.manager.hasStandardMinutesRemaining).toBe(true);
    await t.manager.resetCredits();
    expect(t.manager._controller.voice.provider.standardCreditsRemaining).toBe(9);
    expect(t.manager._controller.voice.provider.premiumCreditsRemaining).toBe(7);
  });

  it('moves the volume of an open chain', async () => {
    const t = await setup();
    t.engine.attach(t.reader);
    t.setVolume(40);
    t.open(0);
    await t.clock.advance(0);
    expect(t.engine.inspect(t.reader).audio?.gain).toBe(0.4);
    t.engine.setVolume(70);
    expect(t.engine.inspect(t.reader).audio?.gain).toBe(0.7);
  });

  it('answers the warm chain the sentences after the one asked for', async () => {
    const t = await setup();
    t.engine.attach(t.reader);
    t.open(0);
    await t.clock.advance(0);
    expect(t.engine.upcomingTexts(t.reader, TEXTS[0], 2, () => false)).toEqual([TEXTS[1], TEXTS[2]]);
  });
});

describe('the Engine across a plugin update', () => {
  it('takes over a reading Read Aloud’s own controller holds: paused at its segment, Play carries on there', async () => {
    const t = await setup();
    t.open(0);
    expect(t.manager._controller).toBeInstanceOf(NativeController);
    t.manager._activeSegment = t.segments[1];
    t.engine.attach(t.reader);
    expect(t.engine.owns(t.manager._controller)).toBe(true);
    expect(t.manager.paused).toBe(true);
    expect(t.engine.session(t.reader)?.position).toBe(1);
    expect(t.engine.inspect(t.reader).stats?.adopted).toBe(1);
    t.manager.play();
    await t.clock.advance(0);
    expect(t.manager.activeSegment).toBe(t.segments[1]);
    expect(t.sources()).toHaveLength(1);
  });

  it('at shutdown pauses at the segment, silences the tab, and puts Zotero’s methods back', async () => {
    const t = await setup();
    t.engine.attach(t.reader);
    t.open(0);
    await t.clock.advance(100);
    const proto = Object.getPrototypeOf(t.manager._allVoices[0]);
    t.engine.dispose();
    expect(t.manager.paused).toBe(true);
    expect(t.sources()[0].stoppedAt).not.toBe(null);
    expect(Object.prototype.hasOwnProperty.call(proto, 'getController')).toBe(true);
    expect(t.engine.patchCounts()).toEqual({ total: 0, live: 0 });
    // The retired controller does nothing, Play included
    t.manager.play();
    await t.clock.advance(1000);
    expect(t.sources()).toHaveLength(1);
    // A successor takes it from there
    const next = createEngine({
      exportFunction: (fn) => fn,
      waiveXrays: (value) => value,
      isDead: () => false,
      cloneInto: (value) => value,
      toLocal: (value) => new Float32Array(value),
      audioSource: () => t.source,
      isPluginVoice: () => true,
      pauses: () => ({ sentence: { enabled: true, ms: 0 }, paragraph: { enabled: true, ms: 0 } }),
      volume: () => 100,
      notice: () => {},
      error: (e) => t.errors.push(e),
      clock: t.clock,
    });
    t.manager.pause();
    next.attach(t.reader);
    expect(next.owns(t.manager._controller)).toBe(true);
    t.manager.play();
    await t.clock.advance(0);
    expect(t.sources()).toHaveLength(2);
    expect(t.manager.activeSegment).toBe(t.segments[0]);
  });

  it('hands a paused reading back to Read Aloud’s own engine on a disable', async () => {
    const t = await setup();
    t.engine.attach(t.reader);
    t.open(0);
    await t.clock.advance(100);
    t.engine.dispose({ handBack: true });
    expect(t.manager._controller).toBeInstanceOf(NativeController);
    expect(t.manager._controller.paused).toBe(true);
    expect(t.manager._controller.args[1]).toBe(0);
  });
});

it('publishes the document and top-level section estimates through the real manager contract', async () => {
  const t = await setup({ attachFirst: true });
  t.segments.forEach((segment, i) => Object.assign(segment, { position: { start: [i, 0, 0], end: [i, 0, segment.text.length] } }));
  Object.assign(t.reader._internalReader, { _sdt: { structure: { catalog: { outline: [{ title: 'Part I', ref: [0] }, { title: 'Part II', ref: [2] }] } } } });
  t.open();
  await t.clock.advance(0);
  t.manager.pause();
  expect(t.engine.remainingTime(t.reader)).toMatchObject({ status: 'ready', scope: 'document', sectionTitle: 'Part I' });
  expect(t.engine.remainingTime(t.reader).sectionSeconds).toBeCloseTo(1.2);
  const before = t.source.getAudio.mock.calls.length;
  for (let i = 0; i < 20; i++) t.engine.remainingTime(t.reader);
  expect(t.source.getAudio).toHaveBeenCalledTimes(before);
  t.manager.repositionTo(2);
  expect(t.engine.remainingTime(t.reader).sectionTitle).toBe('Part II');
  t.engine.dispose();
});

it('keeps document time when a chapter adapter cannot read Zotero state, reporting the failure once', async () => {
  const t = await setup({ attachFirst: true });
  Object.defineProperty(t.reader._internalReader, '_sdt', { get() { throw new Error('outline unavailable'); } });
  t.open();
  for (let i = 0; i < 3; i++) expect(t.engine.remainingTime(t.reader)).toMatchObject({ status: 'ready', scope: 'document' });
  expect(t.errors).toHaveLength(1);
  t.engine.dispose();
});
