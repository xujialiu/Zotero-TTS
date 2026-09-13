return (async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const prefKeys = [
    'readAloud.volume',
    'readAloud.sameForAllDocuments',
    'readAloud.globalSpeed',
    'readAloud.favoriteVoices',
    'readAloud.favoritesOnly',
    'readAloud.sentenceDelayEnabled',
    'readAloud.sentenceDelayMs',
    'readAloud.paragraphDelayEnabled',
    'readAloud.paragraphDelayMs',
    'shortcuts.previousVoice',
    'shortcuts.nextVoice',
    'webdav.syncPositions',
    'webdav.autoUploadSettings',
    'webdav.syncSettings',
    'readAloud.memory',
  ];
  const full = suffix => prefix + suffix;
  const read = suffix => {
    const name = full(suffix);
    let value = null;
    try { value = Zotero.Prefs.get('zotero-tts.' + suffix); } catch (e) {}
    return { value, user: Services.prefs.prefHasUserValue(name) };
  };
  const prefs = {};
  for (const suffix of prefKeys) prefs[suffix] = read(suffix);
  const nativeName = 'extensions.zotero.reader.readAloudVoices';
  let nativeValue = null;
  try { nativeValue = Zotero.Prefs.get('reader.readAloudVoices'); } catch (e) {}
  prefs['reader.readAloudVoices'] = { value: nativeValue, user: Services.prefs.prefHasUserValue(nativeName) };

  const root = {
    version: 'issue-95-followup-v1',
    baseline: { prefs, debugStoring: !!Zotero.Debug.storing },
    voices: ['followup95-a', 'followup95-b', 'followup95-c', 'followup95-d'],
    fixtures: {
      a: { key: 'a', label: 'A', itemID: null, reader: null, window: null, guard: null, originalMethod: null, originalSlots: null, remote: null, calls: [], stopCalls: [], preparedPlays: [], delayMs: 0, delayVoiceID: null, failVoiceID: null, failNext: false, noTimestamps: false, audioDuration: 6, openError: null, loadError: null },
      b: { key: 'b', label: 'B', itemID: null, reader: null, window: null, guard: null, originalMethod: null, originalSlots: null, remote: null, calls: [], stopCalls: [], preparedPlays: [], delayMs: 0, delayVoiceID: null, failVoiceID: null, failNext: false, noTimestamps: false, audioDuration: 6, openError: null, loadError: null },
    },
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  root.sleep = sleep;
  root.restorePref = (name, entry) => {
    if (!entry) return;
    if (!entry.user) {
      if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name);
      return;
    }
    if (typeof entry.value === 'boolean') Services.prefs.setBoolPref(name, entry.value);
    else if (Number.isInteger(entry.value)) Services.prefs.setIntPref(name, entry.value);
    else if (typeof entry.value === 'string') Services.prefs.setStringPref(name, entry.value);
  };
  const clone = (value, targetWindow) => Components.utils.cloneInto(value, targetWindow, { cloneFunctions: false });
  const makeWav = (fixture, targetWindow) => {
    const rate = 8000;
    const frames = Math.max(1, Math.round(rate * fixture.audioDuration));
    const bytes = 44 + frames * 2;
    const data = new Uint8Array(bytes);
    const view = new DataView(data.buffer);
    const put = (at, value) => { for (let i = 0; i < value.length; i++) data[at + i] = value.charCodeAt(i); };
    put(0, 'RIFF'); view.setUint32(4, bytes - 8, true); put(8, 'WAVE'); put(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); put(36, 'data'); view.setUint32(40, frames * 2, true);
    return new targetWindow.Blob([data], { type: 'audio/wav' });
  };
  const timestampRows = (fixture, text) => {
    const rows = [];
    const re = /[\p{L}\p{N}\p{M}'’]+/gu;
    let match;
    while ((match = re.exec(text)) !== null) rows.push({ start: 0, end: 0, charStart: match.index, charEnd: match.index + match[0].length });
    const span = Math.max(0.2, fixture.audioDuration - 0.2);
    const count = Math.max(1, rows.length);
    for (let i = 0; i < rows.length; i++) {
      rows[i].start = 0.1 + i * (span / count);
      rows[i].end = 0.1 + (i + 1) * (span / count);
    }
    return rows;
  };
  root.makeRemote = (fixture, targetWindow) => {
    const IDs = root.voices;
    const catalog = {
      voices: Object.fromEntries(IDs.map(id => [id, { label: 'Native Follow-up ' + id.slice(-1).toUpperCase() }])),
      locales: { 'en-US': IDs },
      segmentGranularity: 'sentence',
      sentenceDelay: 0,
      cacheVersion: root.version,
    };
    const response = value => clone(value, targetWindow);
    const remote = {
      getVoices: () => targetWindow.Promise.resolve(response({ voices: { standard: [catalog], premium: [], local: [] }, standardCreditsRemaining: 0, premiumCreditsRemaining: 0 })),
      getAudio: (segment, voice) => {
        const text = segment === 'sample' ? 'sample' : String(segment?.text ?? '');
        const voiceID = String(voice?.id ?? '');
        fixture.calls.push({ kind: segment === 'sample' ? 'sample' : 'segment', voiceID, text, at: Date.now() });
        const result = () => {
          if (fixture.failNext || fixture.failVoiceID === voiceID) {
            fixture.failNext = false;
            if (fixture.failVoiceID === voiceID) fixture.failVoiceID = null;
            return response({ audio: null, error: 'followup-native-failure', noStore: true });
          }
          const audio = makeWav(fixture, targetWindow);
          if (segment === 'sample') return response({ audio, marker: 'issue-95-followup-sample' });
          return response({ audio, marker: 'issue-95-followup-segment', timestamps: fixture.noTimestamps ? undefined : timestampRows(fixture, text) });
        };
        if (fixture.delayMs > 0 && (!fixture.delayVoiceID || fixture.delayVoiceID === voiceID)) {
          return new targetWindow.Promise(resolve => targetWindow.setTimeout(() => resolve(result()), fixture.delayMs));
        }
        return targetWindow.Promise.resolve(result());
      },
      getCreditsRemaining: () => targetWindow.Promise.resolve(response({ standardCreditsRemaining: 0, premiumCreditsRemaining: 0 })),
      resetCredits: () => targetWindow.Promise.resolve(response({ standardCreditsRemaining: 0, premiumCreditsRemaining: 0 })),
    };
    fixture.remote = remote;
    return Components.utils.cloneInto(remote, targetWindow, { cloneFunctions: true });
  };
  root.installGuard = fixture => {
    const reader = fixture.reader;
    if (!reader || !fixture.window) return false;
    if (!fixture.guard) {
      fixture.originalMethod = Object.getOwnPropertyDescriptor(reader, '_getReadAloudRemoteInterface') ?? null;
      fixture.guard = targetWindow => root.makeRemote(fixture, targetWindow);
    }
    reader._getReadAloudRemoteInterface = fixture.guard;
    return true;
  };
  root.injectSlots = fixture => {
    const reader = fixture.reader;
    const internal = reader?._internalReader;
    const manager = internal?._readAloudManager;
    if (!reader || !internal || !manager || !fixture.window || !fixture.guard) return false;
    const options = Components.utils.waiveXrays(manager._options);
    const internalWaived = Components.utils.waiveXrays(internal);
    if (!fixture.originalSlots) fixture.originalSlots = { options: options.remoteInterface, internal: internalWaived._readAloudRemoteInterface };
    const cloned = fixture.guard(fixture.window);
    options.remoteInterface = cloned;
    internalWaived._readAloudRemoteInterface = cloned;
    return true;
  };
  root.openFixture = async (fixture, background = true) => {
    const readers = Zotero.Reader._readers || [];
    const originalPush = readers.push;
    let openPromise = null;
    try {
      readers.push = function (...items) {
        const result = Reflect.apply(originalPush, this, items);
        for (const item of items) {
          if (item?.itemID !== fixture.itemID) continue;
          fixture.reader = item;
          fixture.window = item._iframeWindow ?? null;
          root.installGuard(fixture);
        }
        return result;
      };
      openPromise = Zotero.Reader.open(fixture.itemID, null, { openInBackground: background, allowDuplicate: false });
    } catch (e) {
      fixture.openError = String(e);
    } finally {
      readers.push = originalPush;
    }
    if (openPromise && typeof openPromise.then === 'function') {
      Promise.resolve(openPromise).catch(e => { fixture.openError = String(e); });
    }
    for (let i = 0; i < 80; i++) {
      if (!fixture.reader) fixture.reader = (Zotero.Reader._readers || []).find(r => r?.itemID === fixture.itemID) ?? null;
      if (fixture.reader?._internalReader?._readAloudManager) break;
      await sleep(50);
    }
    if (!fixture.reader) return { itemID: fixture.itemID, reader: false, error: fixture.openError };
    fixture.window = fixture.reader._iframeWindow;
    root.installGuard(fixture);
    root.injectSlots(fixture);
    const manager = fixture.reader._internalReader?._readAloudManager;
    try { await Promise.resolve(manager?.loadVoices?.(true)); } catch (e) { fixture.loadError = String(e); }
    return {
      itemID: fixture.itemID,
      reader: true,
      index: (Zotero.Reader._readers || []).indexOf(fixture.reader),
      loadError: fixture.loadError,
      manager: root.read(fixture),
    };
  };
  root.openPopup = async fixture => {
    const reader = fixture.reader;
    const internal = reader?._internalReader;
    const manager = internal?._readAloudManager;
    if (!reader || !internal || !manager) throw new Error('fixture manager is missing');
    try { internal.toggleReadAloudPopup(true); } catch (e) { fixture.popupError = String(e); }
    for (let i = 0; i < 70; i++) {
      if (manager._allVoices?.length && manager._segments?.length) break;
      await sleep(50);
    }
    return { popupError: fixture.popupError ?? null, state: root.read(fixture), voices: manager._allVoices?.length ?? 0, segments: manager._segments?.length ?? 0 };
  };
  root.read = fixture => {
    const reader = fixture?.reader;
    const manager = reader?._internalReader?._readAloudManager;
    const controller = manager?._controller;
    const view = reader?._internalReader?._primaryView;
    const state = view?._readAloudState;
    const activeTimestamp = manager?.activeTimestamp;
    const wordPosition = state?.activeWordSourcePosition;
    const segment = manager?.activeSegment;
    return {
      active: !!manager?.active,
      paused: !!manager?.paused,
      popupOpen: !!reader?._internalReader?._state?.readAloudState?.popupOpen,
      selected: manager?.selectedVoiceID ?? null,
      tier: manager?._selectedTier ?? null,
      segmentGranularity: manager?._segmentGranularity ?? null,
      position: Number.isFinite(controller?._position) ? controller._position : null,
      currentIndex: Number.isFinite(controller?._currentIndex) ? controller._currentIndex : null,
      progress: Number.isFinite(controller?._currentPlaybackTime) ? controller._currentPlaybackTime : null,
      sourcePosition: segment?.sourcePosition ? { pageIndex: segment.sourcePosition.pageIndex ?? null, rects: segment.sourcePosition.rects?.length ?? null } : null,
      activeTimestamp: activeTimestamp ? { start: activeTimestamp.start, end: activeTimestamp.end, charStart: activeTimestamp.charStart, charEnd: activeTimestamp.charEnd, text: String(segment?.text ?? '').slice(activeTimestamp.charStart, activeTimestamp.charEnd) } : null,
      wordPosition: wordPosition ? { pageIndex: wordPosition.pageIndex ?? null, rects: wordPosition.rects?.length ?? null, nextPageRects: wordPosition.nextPageRects?.length ?? null } : null,
      viewPrimary: view?._readAloudHighlightedPosition ? { pageIndex: view._readAloudHighlightedPosition.pageIndex ?? null, rects: view._readAloudHighlightedPosition.rects?.length ?? null } : null,
      viewState: state ? { popupOpen: !!state.popupOpen, highlightGranularity: state.highlightGranularity ?? null, segmentGranularity: state.segmentGranularity ?? null, wordPositionPresent: !!state.activeWordSourcePosition } : null,
      audio: { state: controller?._audioContext?.state ?? null, time: controller?._audioContext?.currentTime ?? null, playing: !!controller?._isPlaying, source: !!controller?._sourceNode },
    };
  };
  root.activate = async (fixture, voiceID = root.voices[0], playing = true) => {
    const manager = fixture.reader?._internalReader?._readAloudManager;
    if (!manager) throw new Error('fixture manager is missing');
    if (!manager.active) { try { manager.activate(); } catch (e) {} }
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} await sleep(80); }
    if (manager.selectedVoiceID !== voiceID) {
      try { manager.selectTier('standard'); } catch (e) {}
      try { manager.selectVoice(voiceID); } catch (e) {}
      await sleep(100);
    }
    if (!manager.active) { try { manager.activate(); } catch (e) {} }
    try { manager.repositionTo(0); } catch (e) {
      const mw = Components.utils.waiveXrays(manager);
      mw._activeSegment = null; mw._activeTimestampIndex = null; mw._backwardStopIndex = 0;
      try { manager._createController(); } catch (ignored) {}
    }
    if (playing) { try { manager.play(); } catch (e) {} }
    else { try { manager.pause(); } catch (e) {} }
    await sleep(100);
    return root.read(fixture);
  };
  root.pressStart = fixture => {
    const reader = fixture.reader;
    const rw = fixture.window;
    if (!reader || !rw) throw new Error('fixture window is missing');
    try { Zotero_Tabs.select(reader.tabID); } catch (e) {}
    try { reader.focus?.(); rw.focus?.(); } catch (e) {}
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const ev = (key, code, keyCode) => new K('', { key, code, keyCode, bubbles: true, cancelable: true });
    tip.beginInputTransactionForTests(rw);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32)), tip.keyup(ev(' ', 'Space', 32)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  };
  root.waitPlaying = async (fixture, max = 50) => {
    const trace = [];
    for (let i = 0; i < max; i++) {
      const state = root.read(fixture);
      trace.push({ ms: i * 100, state });
      if (state.active && !state.paused && state.audio.state === 'running' && state.audio.source) return { trace, final: state, playing: true };
      await sleep(100);
    }
    return { trace, final: root.read(fixture), playing: false };
  };
  root.diag = fixture => {
    const index = (Zotero.Reader._readers || []).indexOf(fixture?.reader);
    try {
      const diagnostic = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch());
      return { index, handoff: diagnostic.readers?.[index]?.handoff ?? null, selected: diagnostic.readers?.[index]?.selected ?? null };
    } catch (e) { return { index, error: String(e), handoff: null, selected: null }; }
  };

  // Snapshot first; temporary sync and transport state are disabled before any
  // fixture is imported or opened. The baseline is refreshed every run.
  Services.prefs.setBoolPref(full('webdav.syncPositions'), false);
  Services.prefs.setBoolPref(full('webdav.autoUploadSettings'), false);
  Services.prefs.setBoolPref(full('webdav.syncSettings'), false);
  Services.prefs.setIntPref(full('readAloud.volume'), 0);
  Services.prefs.setBoolPref(full('readAloud.sameForAllDocuments'), false);
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);
  Services.prefs.setStringPref(full('readAloud.memory'), JSON.stringify({ speed: 1, voice: { id: root.voices[0], lang: 'en' } }));
  Zotero.__ztts95Followup = root;
  const summary = {};
  for (const [suffix, entry] of Object.entries(prefs)) {
    const secret = suffix === 'readAloud.memory' || suffix === 'reader.readAloudVoices' || suffix === 'readAloud.favoriteVoices';
    summary[suffix] = secret
      ? { present: entry.value !== null && entry.value !== undefined, chars: typeof entry.value === 'string' ? entry.value.length : null, user: entry.user }
      : { value: entry.value, user: entry.user };
  }
  return JSON.stringify({ version: root.version, baseline: summary, temporary: {
    syncPositions: { value: Zotero.Prefs.get('zotero-tts.webdav.syncPositions'), user: Services.prefs.prefHasUserValue(full('webdav.syncPositions')) },
    autoUploadSettings: { value: Zotero.Prefs.get('zotero-tts.webdav.autoUploadSettings'), user: Services.prefs.prefHasUserValue(full('webdav.autoUploadSettings')) },
    syncSettings: { value: Zotero.Prefs.get('zotero-tts.webdav.syncSettings'), user: Services.prefs.prefHasUserValue(full('webdav.syncSettings')) },
    volume: { value: Zotero.Prefs.get('zotero-tts.readAloud.volume'), user: Services.prefs.prefHasUserValue(full('readAloud.volume')) },
    sameForAllDocuments: { value: Zotero.Prefs.get('zotero-tts.readAloud.sameForAllDocuments'), user: Services.prefs.prefHasUserValue(full('readAloud.sameForAllDocuments')) },
    debugStoring: !!Zotero.Debug.storing,
  } }, null, 1);
})()
