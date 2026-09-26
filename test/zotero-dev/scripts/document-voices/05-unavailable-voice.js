(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const missing = 'fish::mul/document-voice-missing-for-146';
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
  const fixture = state.fixtureC || state.fixtures?.C;
  const main = Zotero.getMainWindow?.();
  const readers = () => Zotero.Reader?._readers || [];
  const reader = () => readers().find(entry => entry?.itemID === fixture?.itemID);
  const manager = () => reader()?._internalReader?._readAloudManager;
  const report = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const raw = () => {
    try { return JSON.parse(Services.prefs.getStringPref(prefix + 'documentVoices.user/' + fixture.key)); } catch (_) { return null; }
  };
  const playerDoc = () => reader()?._iframeWindow?.document?.querySelector('#ztts-player-frame')?.contentDocument || null;
  const noticeText = () => {
    const r = reader();
    return r?._iframeWindow?.document?.getElementById('ztts-voice-notice')?.textContent
      || r?._iframeWindow?.document?.getElementById('ztts-speed-toast')?.textContent
      || r?._window?.document?.getElementById('ztts-voice-notice')?.textContent
      || r?._window?.document?.getElementById('ztts-speed-toast')?.textContent || null;
  };
  const openVoicePicker = async () => {
    const doc = await waitFor(() => playerDoc()?.querySelector('[data-pick="voice"]') ? playerDoc() : null, 10000);
    if (!doc) throw new Error('missing-voice player dropdown did not mount');
    doc.querySelector('[data-pick="voice"]').click();
    return waitFor(() => {
      const current = playerDoc();
      const options = [...(current?.querySelectorAll('.popover .option') || [])];
      return options.length ? { doc: current, options } : null;
    }, 5000);
  };
  if (!fixture || !state.voices?.B) throw new Error('unavailable-voice state missing');
  const existing = reader();
  if (!existing) throw new Error('fixture C reader missing');
  if (manager()?.active) existing._internalReader.toggleReadAloudPopup(false);
  await waitFor(() => !manager()?.active, 7000);
  for (const doc of [existing._iframeWindow?.document, existing._window?.document]) {
    for (const id of ['ztts-speed-toast', 'ztts-voice-notice']) {
      try { doc?.getElementById(id)?.remove(); } catch (_) {}
    }
  }
  const missingRecord = { voice: { id: missing, lang: 'mul' }, manual: true, ts: Date.now() };
  const full = prefix + 'documentVoices.user/' + fixture.key;
  Services.prefs.setStringPref(full, JSON.stringify(missingRecord));
  const pulse = prefix + 'documentVoiceChanged';
  Services.prefs.setStringPref(pulse, String(Number(Services.prefs.getStringPref(pulse, '0')) + 1));
  const before = raw();
  const beforeDebug = String(await Zotero.Debug.get()).split('\n').filter(line => /\[zotero-tts\] (?:prefetch: )?fish: \d+ word timestamps/i.test(line)).length;
  if (main?.Zotero_Tabs?.select && existing.tabID) main.Zotero_Tabs.select(existing.tabID);
  existing.focus?.(); existing._iframeWindow?.focus?.();
  try { existing._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
  existing._internalReader.toggleReadAloudPopup(true);
  const frame = await waitFor(() => playerDoc(), 10000);
  if (!frame) throw new Error('missing-voice plugin player frame did not load');
  await sleep(600);
  const firstNotice = await waitFor(() => noticeText(), 2500) || null;
  const beforeEngine = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
  const directBefore = manager()?._controller ?? null;
  let directResult = null, directError = null;
  try { directResult = manager()?._createController?.() ?? null; } catch (e) { directError = String(e); }
  await sleep(300);
  const afterDirect = manager()?._controller ?? null;
  const directGuarded = !directResult && !afterDirect;
  const afterPlayClick = playerDoc()?.querySelector('.play');
  afterPlayClick?.click();
  await sleep(500);
  const secondNotice = await waitFor(() => noticeText(), 2500) || firstNotice;
  const afterPlay = raw();
  const afterDebug = String(await Zotero.Debug.get()).split('\n').filter(line => /\[zotero-tts\] (?:prefetch: )?fish: \d+ word timestamps/i.test(line)).length;
  if (!afterPlay || afterPlay.voice.id !== missing || afterPlay.manual !== true || !directGuarded || afterDebug !== beforeDebug || !/unavailable|saved voice/i.test(`${firstNotice || ''} ${secondNotice || ''}`)) {
    throw new Error(`missing voice was substituted or synthesized: ${JSON.stringify({before, afterPlay, firstNotice, secondNotice, directError, directGuarded, beforeDebug, afterDebug})}`);
  }
  // The failed activation has no controller/session to hand off. Close and
  // reopen the fixture player, then make the available choice on a fresh
  // session before pressing Play.
  existing._internalReader.toggleReadAloudPopup(false);
  await waitFor(() => !manager()?.active, 7000);
  if (main?.Zotero_Tabs?.select && existing.tabID) main.Zotero_Tabs.select(existing.tabID);
  try { existing._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
  existing._internalReader.toggleReadAloudPopup(true);
  await waitFor(() => playerDoc(), 10000);
  const options = await openVoicePicker();
  const available = options.options.find(button => button.textContent?.trim() === state.voices.A.label);
  if (!available) throw new Error(`available voice missing from missing-document player: ${options.options.map(button => button.textContent?.trim()).join(', ')}`);
  available.click();
  const chosen = await waitFor(() => {
    const current = raw();
    return current?.voice?.id === state.voices.A.id && current.manual === true ? current : null;
  }, 7000);
  if (!chosen) throw new Error(`manual available choice did not commit: ${JSON.stringify(raw())}`);
  const play = playerDoc()?.querySelector('.play');
  try { existing._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
  play?.click();
  const active = await waitFor(() => manager()?.active ? { active: true, paused: !!manager().paused, selected: manager().selectedVoiceID } : null, 10000);
  if (!active || active.selected !== state.voices.A.id) throw new Error(`available manual choice did not start: ${JSON.stringify({active,record:raw()})}`);
  if (!manager().paused) existing._internalReader.toggleReadAloudPaused();
  await waitFor(() => manager()?.paused === true, 5000);
  existing._internalReader.toggleReadAloudPopup(false);
  await waitFor(() => !manager()?.active, 7000);
  const after = raw();
  state.unavailable = { key: `user/${fixture.key}`, missing: before, firstNotice, secondNotice, direct: { before: !!directBefore, result: !!directResult, after: !!afterDirect, error: directError }, fishLinesBefore: beforeDebug, fishLinesAfter: afterDebug, chosen, active, after };
  return JSON.stringify({ status: 'PASS', key: `user/${fixture.key}`, missing: before, firstNotice, secondNotice, directGuarded, directError, fishLinesBefore: beforeDebug, fishLinesAfter: afterDebug, chosen, active, after }, null, 1);
})();
