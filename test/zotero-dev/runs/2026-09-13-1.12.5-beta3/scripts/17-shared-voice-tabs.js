return (async () => {
  const state = Zotero.__ztts95NativeState;
  const aID = Zotero.__ztts95Fixture?.itemID;
  const bID = Zotero.__ztts95FixtureB?.itemID;
  const ra = (Zotero.Reader._readers || []).find(r => r?.itemID === aID);
  const rb = (Zotero.Reader._readers || []).find(r => r?.itemID === bID);
  const ma = ra?._internalReader?._readAloudManager;
  const mb = rb?._internalReader?._readAloudManager;
  if (!state || !ra || !rb || !ma || !mb) throw new Error('both fixture managers are required');
  const sameName = 'extensions.zotero.zotero-tts.readAloud.sameForAllDocuments';
  const sameOriginal = { value: Services.prefs.getBoolPref(sameName), user: Services.prefs.prefHasUserValue(sameName) };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const reset = async (m, voiceID, playing) => {
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} await sleep(80); }
    if (m.selectedVoiceID !== voiceID) m.selectVoice(voiceID);
    await sleep(80);
    const mw = Components.utils.waiveXrays(m);
    mw._activeSegment = null; mw._activeTimestampIndex = null; mw._backwardStopIndex = 0; mw._paused = !playing;
    m._createController();
    for (let i = 0; i < 25 && (!m.active || !m._controller?._sourceNode || m._controller._currentIndex !== 0); i++) await sleep(50);
  };
  const pressNext = reader => {
    const rw = reader._iframeWindow;
    Zotero_Tabs.select(reader.tabID);
    reader.focus?.();
    rw.focus?.();
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(rw);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev('.', 'Period', 190, true)), tip.keyup(ev('.', 'Period', 190, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  };
  const readerIndexA = (Zotero.Reader._readers || []).indexOf(ra);
  const readerIndexB = (Zotero.Reader._readers || []).indexOf(rb);
  const diag = index => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()).readers?.[index]?.handoff ?? null;
  const read = m => ({ active: !!m.active, paused: !!m.paused, selected: m.selectedVoiceID ?? null, position: m._controller?._position ?? null, currentIndex: m._controller?._currentIndex ?? null });
  const waitA = async () => {
    const trace = [];
    for (let i = 0; i < 4; i++) {
      const ha = diag(readerIndexA); const hb = diag(readerIndexB);
      trace.push({ ms: i * 100, a: { state: read(ma), handoff: ha }, b: { state: read(mb), handoff: hb } });
      if (i < 3) await sleep(700);
    }
    return trace;
  };
  const out = {};
  try {
    Services.prefs.setBoolPref(sameName, false);
    state.noTimestamps = false; state.failNext = false; state.failVoiceID = null; state.delayMs = 0;
    await reset(ma, 'native95-a', false);
    await reset(mb, 'native95-a', false);
    Services.prefs.setBoolPref(sameName, true);
    await reset(ma, 'native95-a', true);
    await reset(mb, 'native95-a', true);
    state.calls.length = 0; state.delayMs = 500;
    const onKey = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(1, readerIndexA));
    const onPending = { a: diag(readerIndexA), b: diag(readerIndexB), aState: read(ma), bState: read(mb) };
    const onTrace = await waitA();
    out.sameOn = {
      key: onKey,
      pending: onPending,
      trace: onTrace,
      final: { a: { state: read(ma), handoff: diag(readerIndexA) }, b: { state: read(mb), handoff: diag(readerIndexB) } },
      targetCalls: state.calls.filter(c => c.voiceID === 'native95-b').map(c => ({ kind: c.kind, text: c.text })),
    };
    if (ma.active && !ma.paused) ma.pause();
    if (mb.active && !mb.paused) mb.pause();

    Services.prefs.setBoolPref(sameName, false);
    await sleep(100);
    await reset(ma, 'native95-a', true);
    await reset(mb, 'native95-a', true);
    state.calls.length = 0; state.delayMs = 500;
    const offKey = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(1, readerIndexA));
    const offTrace = await waitA();
    out.sameOff = {
      key: offKey,
      trace: offTrace,
      final: { a: { state: read(ma), handoff: diag(readerIndexA) }, b: { state: read(mb), handoff: diag(readerIndexB) } },
      targetCalls: state.calls.filter(c => c.voiceID === 'native95-b').map(c => ({ kind: c.kind, text: c.text })),
    };
    if (ma.active && !ma.paused) ma.pause();
    if (mb.active && !mb.paused) mb.pause();

    Services.prefs.setBoolPref(sameName, true);
    await sleep(100);
    await reset(ma, 'native95-a', true);
    await reset(mb, 'native95-a', false);
    state.calls.length = 0; state.delayMs = 500;
    const pausedKey = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(1, readerIndexA));
    const pausedTrace = await waitA();
    out.pausedOther = {
      key: pausedKey,
      trace: pausedTrace,
      final: { a: { state: read(ma), handoff: diag(readerIndexA) }, b: { state: read(mb), handoff: diag(readerIndexB) } },
      targetCalls: state.calls.filter(c => c.voiceID === 'native95-b').map(c => ({ kind: c.kind, text: c.text })),
    };
  } finally {
    state.delayMs = 0; state.failNext = false; state.failVoiceID = null; state.noTimestamps = false;
    if (ma.active && !ma.paused) { try { ma.pause(); } catch (e) {} }
    if (mb.active && !mb.paused) { try { mb.pause(); } catch (e) {} }
    if (sameOriginal.user) Services.prefs.setBoolPref(sameName, sameOriginal.value);
    else if (sameOriginal.value) Services.prefs.clearUserPref(sameName);
  }
  out.restored = { sameForAllDocuments: { value: Services.prefs.getBoolPref(sameName), user: Services.prefs.prefHasUserValue(sameName) } };
  return JSON.stringify(out, null, 1);
})()
