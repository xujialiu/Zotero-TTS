(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 15000, step = 100) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const value = test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const pollAsync = async (test, ms = 15000, step = 100) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const readers = () => Zotero.Reader?._readers || [];
  const reader = readers().find(entry => entry?.itemID === state.fixtures?.A?.itemID);
  if (!reader || !state.fixtures?.B || !state.voices?.A || !state.voices?.B) throw new Error('document-pick state missing');
  const manager = () => reader._internalReader?._readAloudManager;
  const documentReport = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const rawRecord = () => {
    const full = prefix + 'documentVoices.' + (state.readers?.A?.diagnostic?.key || `user/${state.fixtures.A.key}`);
    try { return JSON.parse(Services.prefs.getStringPref(full)); } catch (_) { return null; }
  };
  const voiceEntries = () => {
    const list = manager()?.allVoices;
    const result = [];
    for (let i = 0; i < (list?.length || 0); i++) {
      const voice = list[i];
      if (typeof voice?.id === 'string') result.push({ id: voice.id, label: String(voice.label || voice.name || voice.id) });
    }
    return result;
  };
  const playerDoc = () => reader._iframeWindow?.document?.querySelector('#ztts-player-frame')?.contentDocument || null;
  const openVoicePicker = async () => {
    const doc = await waitFor(() => playerDoc()?.querySelector('[data-pick="voice"]') ? playerDoc() : null, 10000);
    if (!doc) throw new Error('player voice dropdown did not mount');
    const picker = doc.querySelector('[data-pick="voice"]');
    picker.click();
    return waitFor(() => {
      const current = playerDoc();
      const options = [...(current?.querySelectorAll('.popover .option') || [])];
      return options.length ? { doc: current, options } : null;
    }, 5000);
  };
  const pickVoiceFromPlayer = async label => {
    const opened = await openVoicePicker();
    const option = opened.options.find(button => button.textContent?.trim() === label);
    if (!option) throw new Error(`player voice option missing: ${label}; got ${opened.options.map(button => button.textContent?.trim()).join(', ')}`);
    option.click();
  };
  const voiceSwitchReport = async () => {
    const report = JSON.parse(await Zotero.ZoteroTTS.diagnostics.voiceSwitch());
    const index = readers().findIndex(entry => entry === reader);
    return { ...report.readers?.[index], index };
  };
  const pressNextVoice = () => {
    const rw = reader._iframeWindow;
    if (!rw) throw new Error('reader iframe window missing for trusted voice shortcut');
    reader.focus?.(); rw.focus?.();
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const event = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, shiftKey, bubbles: true, cancelable: true });
    tip.beginInputTransactionForTests(rw);
    const out = {
      shiftDown: tip.keydown(event('Shift', 'ShiftLeft', 16, true)),
      keyDown: tip.keydown(event('.', 'Period', 190, true)),
      keyUp: tip.keyup(event('.', 'Period', 190, true)),
      shiftUp: tip.keyup(event('Shift', 'ShiftLeft', 16)),
    };
    tip.endInputTransaction?.();
    return out;
  };
  const fixtureEntry = async () => {
    const report = await documentReport();
    return report.readers.find(entry => entry.key?.endsWith('/' + state.fixtures.A.key));
  };
  const m0 = manager();
  if (!m0) throw new Error('fixture A manager missing');
  const before = await fixtureEntry();
  if (!before?.saved || before.saved.voice.id !== state.voices.A.id || before.saved.manual !== false) throw new Error(`fixture A was not inherited A before pick: ${JSON.stringify(before)}`);
  const main = Zotero.getMainWindow?.();
  if (main?.Zotero_Tabs?.select && reader.tabID) main.Zotero_Tabs.select(reader.tabID);
  reader.focus?.();
  reader._iframeWindow?.focus?.();
  try { reader._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
  reader._internalReader.toggleReadAloudPopup(true);
  const active = await waitFor(() => manager()?.active ? manager() : null, 10000);
  if (!active) throw new Error('fixture A player did not activate');
  const togglePaused = () => reader._internalReader.toggleReadAloudPaused();
  if (!manager().paused) togglePaused();
  await waitFor(() => manager()?.paused === true, 5000);
  const frame = await waitFor(() => playerDoc(), 10000);
  if (!frame) throw new Error('fixture A plugin player frame did not load');
  const offered = voiceEntries();
  if (!offered.some(entry => entry.id === state.voices.B.id)) throw new Error(`player does not offer B: ${JSON.stringify(offered)}`);

  // A real dropdown pick while the session is playing: the diagnostic trace
  // records the dry-run preview before the Engine's handoff commits it.
  if (manager().paused) togglePaused();
  await waitFor(() => manager()?.paused === false, 5000);
  const beforePick = await fixtureEntry();
  const immediateBefore = rawRecord();
  await pickVoiceFromPlayer(state.voices.B.label);
  const immediateAfter = rawRecord();
  const trace = [];
  let committed = null;
  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    const record = await fixtureEntry();
    const handoff = await voiceSwitchReport();
    trace.push({ t: Date.now(), selected: handoff?.selected || manager()?.selectedVoiceID || null, stage: handoff?.handoff?.stage || null, pending: handoff?.handoff?.pending || null, manual: record?.saved?.manual ?? null, voice: record?.saved?.voice?.id ?? null });
    if (record?.saved?.manual === true && record.saved.voice.id === state.voices.B.id && manager()?.selectedVoiceID === state.voices.B.id) { committed = record; break; }
    await sleep(150);
  }
  if (!committed) throw new Error(`player B handoff did not commit: ${JSON.stringify(trace.slice(0, 2).concat(trace.slice(-2)))}`);
  const previewHeld = immediateAfter?.voice?.id === state.voices.A.id && immediateAfter?.manual === false
    || trace.some(entry => entry.voice === state.voices.A.id && entry.manual === false && entry.stage);

  // Re-pick the already selected voice: the native pref does not move, but
  // the document record must still carry explicit manual intent and a new ts.
  if (!manager().paused) togglePaused();
  await waitFor(() => manager()?.paused === true, 5000);
  const sameBefore = await fixtureEntry();
  await pickVoiceFromPlayer(state.voices.B.label);
  const sameAfter = await pollAsync(async () => {
    const current = await fixtureEntry();
    return current?.saved?.manual === true && current.saved.voice.id === state.voices.B.id && current.saved.ts > sameBefore.saved.ts ? current : null;
  }, 5000);
  if (!sameAfter) throw new Error('same-value player pick did not refresh manual document record');

  // The real Shift+. shortcut exercises the same voice-pick path. It wraps
  // the two offered Fish voices, so B moves to A, then the dropdown restores B.
  if (manager().paused) {
    try { reader._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
    togglePaused();
    await waitFor(() => manager()?.paused === false, 5000);
  }
  const selectedBeforeShortcut = manager().selectedVoiceID;
  const shortcut = pressNextVoice();
  const switched = await pollAsync(async () => {
    const current = await fixtureEntry();
    return manager()?.selectedVoiceID && manager().selectedVoiceID !== selectedBeforeShortcut && current?.saved?.manual === true ? { current, voice: manager().selectedVoiceID } : null;
  }, 18000, 150);
  if (!switched) throw new Error(`voice shortcut did not switch: ${JSON.stringify({shortcut,selectedBeforeShortcut,selected:manager()?.selectedVoiceID})}`);
  if (manager().selectedVoiceID !== state.voices.B.id) {
    await pickVoiceFromPlayer(state.voices.B.label);
    await waitFor(() => manager()?.selectedVoiceID === state.voices.B.id && rawRecord()?.voice?.id === state.voices.B.id, 18000, 150);
  }
  const after = await fixtureEntry();
  if (!after?.saved || after.saved.voice.id !== state.voices.B.id || after.saved.manual !== true) throw new Error(`final document pick is not manual B: ${JSON.stringify(after)}`);
  state.documentPick = { key: before.key, before, beforePick, immediateBefore, immediateAfter, committed, sameBefore, sameAfter, shortcut, switched, after, trace: trace.slice(0, 2).concat(trace.slice(-2)) };
  return JSON.stringify({ status: 'PASS', key: before.key, offered, before, immediateBefore, immediateAfter, committed, previewHeld, sameBefore, sameAfter, shortcut, switched, after, trace: trace.slice(0, 2).concat(trace.slice(-2)) }, null, 1);
})();
