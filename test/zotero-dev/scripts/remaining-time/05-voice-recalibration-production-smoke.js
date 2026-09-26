(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const params = run.params;
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 15000, step = 75) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const readerOf = id => { for (const reader of Zotero.Reader?._readers || []) if (reader?.itemID === id) return reader; return null; };
  const diag = id => { try { const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine()); for (const row of d.readers || []) if (row?.itemID === id) return row; } catch (_) {} return null; };
  const documentDiag = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const focus = reader => {
    const host = Zotero.getMainWindow();
    if (host?.windowState === 2 && host.restore) host.restore();
    try { Services.focus.focusWindow(host, true); } catch (_) {}
    host?.focus?.();
    try { Zotero_Tabs.select(reader.tabID); reader._window?.focus?.(); reader.focus?.(); reader._iframeWindow?.focus?.(); } catch (_) {}
  };
  const trustedToggle = reader => {
    focus(reader);
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const win = reader._window, K = win.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(win);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32, true)), tip.keyup(ev(' ', 'Space', 32, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    tip.endInputTransaction?.();
    return ret;
  };
  const importFixture = async (relative, title) => {
    const item = await Zotero.Attachments.importFromFile({ file: PathUtils.join(params.fixturesDir, ...String(relative).split('/')), libraryID: Zotero.Libraries.userLibraryID, title });
    return { id: item.id, key: item.key, title: item.getField('title'), relative };
  };
  const openReader = async fixture => {
    const opened = Zotero.Reader.open(fixture.id, null, { openInBackground: false, allowDuplicate: false });
    if (opened?.then) await opened;
    const reader = await waitFor(() => { const candidate = readerOf(fixture.id); return candidate?._internalReader?._readAloudManager ? candidate : null; }, 24000);
    if (!reader) throw new Error('reader did not initialize for ' + fixture.relative);
    focus(reader);
    return reader;
  };
  const closeReader = async reader => {
    if (!reader) return;
    try { reader._internalReader?.toggleReadAloudPopup(false); } catch (_) {}
    await sleep(250);
    try { reader.close?.(); } catch (_) {}
    await waitFor(() => !readerOf(reader.itemID), 10000, 80);
  };
  const frameDoc = reader => reader?._iframeWindow?.document?.querySelector('#ztts-player-frame')?.contentDocument || null;
  const waitFrame = async reader => await waitFor(() => frameDoc(reader)?.querySelector('.player') ? frameDoc(reader) : null, 15000);
  const openPicker = async (reader, key) => {
    const doc = await waitFrame(reader);
    const button = doc?.querySelector(`[data-pick="${key}"]`);
    if (!button) throw new Error('player ' + key + ' picker missing');
    if (doc.querySelector('.popover')) {
      try { button.click(); } catch (_) {}
      await sleep(100);
    }
    button.click();
    const opened = await waitFor(() => {
      const current = frameDoc(reader);
      const options = [...(current?.querySelectorAll('.popover .option') || [])];
      return options.length ? { doc: current, options } : null;
    }, 8000);
    return opened || { doc: frameDoc(reader), options: [] };
  };
  const pickOption = async (reader, key, predicate, label) => {
    const opened = await openPicker(reader, key);
    const option = opened.options.find(button => predicate(String(button.textContent || '').trim(), button));
    if (!option && (key === 'provider' || key === 'locale')) return String(opened.doc?.querySelector(`[data-pick="${key}"] .value`)?.textContent || '').trim();
    if (!option) throw new Error('player ' + key + ' option missing: ' + label + '; got ' + opened.options.map(button => String(button.textContent || '').trim()).join(', '));
    const chosen = String(option.textContent || '').trim();
    option.click();
    await sleep(250);
    return chosen;
  };
  const ensurePaused = async reader => {
    const m = reader._internalReader?._readAloudManager;
    if (m?.active && !m.paused) reader._internalReader.toggleReadAloudPaused();
    await waitFor(() => m?.paused === true, 5000);
  };
  const runTag = String(params.runId || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_');
  const out = { step: 'voice-recalibration-production-smoke', deterministic: null, production: null };

  prefs.setBoolPref(prefix + 'readAloud.sameForAllDocuments', false);
  prefs.setBoolPref(prefix + 'fish.enabled', false);
  prefs.setBoolPref(prefix + 'system.enabled', false);
  prefs.setBoolPref(prefix + 'local.enabled', true);
  prefs.setStringPref(prefix + 'local.baseURL', String(params.deterministicBaseURL));
  prefs.setStringPref(prefix + 'readAloud.defaultVoice', JSON.stringify({ id: 'local::af_bella', lang: 'en' }));
  prefs.setStringPref(prefix + 'readAloud.memory', JSON.stringify({ speed: 1, voice: { id: 'local::af_bella', lang: 'en' } }));
  const deterministicFixture = await importFixture('remaining-time/remaining-time.epub', 'Zotero-TTS #148 player voice ' + runTag);
  state.fixtures = state.fixtures || {};
  state.fixtures.voice = deterministicFixture;
  const deterministicReader = await openReader(deterministicFixture);
  const internal = deterministicReader._internalReader;
  if (!internal._state?.readAloudState?.popupOpen) internal.toggleReadAloudPopup(true);
  if (!await waitFrame(deterministicReader)) throw new Error('deterministic player did not mount');
  await waitFor(() => deterministicReader._internalReader?._readAloudManager?.active ? deterministicReader._internalReader._readAloudManager : null, 12000);
  const manager = deterministicReader._internalReader._readAloudManager;
  await ensurePaused(deterministicReader);
  const providerOptions = await openPicker(deterministicReader, 'provider');
  const providerLabels = providerOptions.options.map(button => String(button.textContent || '').trim());
  const chosenProvider = await pickOption(deterministicReader, 'provider', label => /kokoro|local/i.test(label) || providerLabels[0] === label, 'Kokoro/Local');
  const localeOptions = await openPicker(deterministicReader, 'locale');
  const localeLabels = localeOptions.options.map(button => String(button.textContent || '').trim());
  const chosenLocale = await pickOption(deterministicReader, 'locale', label => /english/i.test(label) || localeLabels[0] === label, 'English');
  const voiceOptions = await openPicker(deterministicReader, 'voice');
  const voiceLabels = voiceOptions.options.map(button => String(button.textContent || '').trim());
  const chosenBella = await pickOption(deterministicReader, 'voice', label => /deterministic bella/i.test(label), 'Deterministic Bella');
  await ensurePaused(deterministicReader);
  const firstKeys = trustedToggle(deterministicReader);
  const firstReady = await waitFor(() => { const row = diag(deterministicFixture.id); return row?.session?.voice === 'local::af_bella' && row.session.store?.timings > 0 ? row : null; }, 12000);
  await ensurePaused(deterministicReader);
  const firstRow = diag(deterministicFixture.id);
  const first = { provider: chosenProvider, locale: chosenLocale, voice: chosenBella, keys: firstKeys, row: firstRow ? { voice: firstRow.session?.voice, clipDuration: firstRow.session?.clipDuration, remaining: firstRow.session?.remainingTime, store: firstRow.session?.store } : null, ready: !!firstReady };
  if (!first.ready || first.row?.voice !== 'local::af_bella') throw new Error('deterministic Bella player path did not produce a clip: ' + JSON.stringify({ first, providerLabels, localeLabels, voiceLabels }));

  const beforePaused = { selected: manager.selectedVoiceID, remaining: diag(deterministicFixture.id)?.session?.remainingTime || null };
  const immediateHeart = await pickOption(deterministicReader, 'voice', label => /deterministic heart/i.test(label), 'Deterministic Heart');
  const afterPickPaused = { selected: manager.selectedVoiceID, active: !!manager.active, paused: !!manager.paused, voiceSwitch: JSON.parse(await Zotero.ZoteroTTS.diagnostics.voiceSwitch()), documentVoices: await documentDiag() };
  const playButton = frameDoc(deterministicReader)?.querySelector('.play');
  if (!playButton) throw new Error('player Play button missing after paused voice pick');
  playButton.click();
  let switched = await waitFor(() => { const row = diag(deterministicFixture.id); return row?.session?.voice === 'local::af_heart' && row.session.store?.timings > 0 ? row : null; }, 12000);
  if (!switched || manager.selectedVoiceID !== 'local::af_heart') {
    trustedToggle(deterministicReader);
    switched = await waitFor(() => { const row = diag(deterministicFixture.id); return row?.session?.voice === 'local::af_heart' && row.session.store?.timings > 0 ? row : null; }, 12000);
  }
  await ensurePaused(deterministicReader);
  const afterRow = diag(deterministicFixture.id);
  const afterResume = { selected: manager.selectedVoiceID, row: afterRow?.session ? { voice: afterRow.session.voice, clipDuration: afterRow.session.clipDuration, remaining: afterRow.session.remainingTime, store: afterRow.session.store } : null, voiceSwitch: JSON.parse(await Zotero.ZoteroTTS.diagnostics.voiceSwitch()), documentVoices: await documentDiag() };
  out.deterministic = { providerLabels, localeLabels, voiceLabels, first, beforePaused, immediateHeart, afterPickPaused: { selected: afterPickPaused.selected, active: afterPickPaused.active, paused: afterPickPaused.paused, voiceSwitch: afterPickPaused.voiceSwitch }, afterResume, changedAfterPlay: !!switched && afterResume.selected === 'local::af_heart', durationDistinct: first.row?.clipDuration !== afterResume.row?.clipDuration };
  if (!out.deterministic.changedAfterPlay || !out.deterministic.durationDistinct) throw new Error('player voice pick did not commit a distinct measured voice after Play: ' + JSON.stringify(out.deterministic));
  await closeReader(deterministicReader);

  prefs.setBoolPref(prefix + 'local.enabled', false);
  prefs.setBoolPref(prefix + 'fish.enabled', true);
  prefs.setStringPref(prefix + 'readAloud.memory', JSON.stringify({ speed: 1, voice: { id: '', lang: 'en' } }));
  prefs.setStringPref(prefix + 'readAloud.defaultVoice', JSON.stringify({ id: '', lang: 'en' }));
  const productionFixture = await importFixture('fixture-b.pdf', 'Zotero-TTS #148 player Fish smoke ' + runTag);
  state.fixtures.production = productionFixture;
  const productionReader = await openReader(productionFixture);
  const pi = productionReader._internalReader;
  if (!pi._state?.readAloudState?.popupOpen) pi.toggleReadAloudPopup(true);
  if (!await waitFrame(productionReader)) throw new Error('Fish production player did not mount');
  await waitFor(() => pi._readAloudManager?.allVoices?.length ? pi._readAloudManager : null, 20000);
  await ensurePaused(productionReader);
  const fishProvider = await pickOption(productionReader, 'provider', label => /fish audio/i.test(label), 'Fish Audio');
  const fishLocale = await pickOption(productionReader, 'locale', label => /english/i.test(label), 'English');
  const fishVoiceOptions = await openPicker(productionReader, 'voice');
  const fishVoiceLabels = fishVoiceOptions.options.map(button => String(button.textContent || '').trim());
  const chosenFish = fishVoiceLabels[0];
  if (!chosenFish) throw new Error('Fish voice picker listed no voice');
  await pickOption(productionReader, 'voice', label => label === chosenFish, chosenFish);
  await ensurePaused(productionReader);
  // Close the paused popup, then use a trusted Shift+Space start. This makes
  // Gecko create/resume the AudioContext inside the user gesture instead of
  // leaving a context created by the popup's chrome call suspended.
  try { productionReader._internalReader.toggleReadAloudPopup(false); } catch (_) {}
  await waitFor(() => !productionReader._internalReader?._readAloudManager?.active, 7000);
  try { productionReader._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
  trustedToggle(productionReader);
  const fishStarted = await waitFor(() => { const row = diag(productionFixture.id); return row?.session?.voice?.startsWith('fish::') && row.session.store?.requests > 0 && row.audio?.state === 'running' && row.session?.clipDuration > 0 && row.session?.playing ? row : null; }, 20000);
  await ensurePaused(productionReader);
  const fishRow = diag(productionFixture.id);
  out.production = { provider: fishProvider, locale: fishLocale, offeredVoiceLabels: fishVoiceLabels.slice(0, 8), chosenFish, started: !!fishStarted, row: fishRow?.session ? { voice: fishRow.session.voice, clipDuration: fishRow.session.clipDuration, requests: fishRow.session.store?.requests, audio: fishRow.audio, remaining: fishRow.session.remainingTime } : null };
  if (!fishStarted || !fishRow?.session?.voice?.startsWith('fish::') || !(fishRow.session.store?.requests > 0) || fishRow.audio?.state !== 'running' || !(fishRow.session?.clipDuration > 0)) throw new Error('configured Fish player path did not produce a running decoded clip: ' + JSON.stringify(out.production));
  await closeReader(productionReader);
  Zotero.getMainWindow()?.minimize?.();
  state.voiceResults = out;
  return JSON.stringify(out, null, 1);
})()
