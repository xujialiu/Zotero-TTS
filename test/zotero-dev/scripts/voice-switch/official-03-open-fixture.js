return (async () => {
  const file = 'C:\\Users\\xujia\\orca\\workspaces\\zotero_plugin_tts\\bug_-95_2\\test\\fixtures\\fixture-a.pdf';
  const state = Zotero.__zttsOfficialFollowup, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  if (!state) throw new Error('baseline script has not run');
  const title = 'Zotero-TTS official voice handoff fixture ' + Date.now();
  const out = { status: 'FAIL', title, errors: [] };
  let imported;
  try { imported = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title }); }
  catch (e) { out.errors.push('import: ' + String(e)); return JSON.stringify(out, null, 1); }
  const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
  if (!item || !item.id) { out.errors.push('no item returned'); return JSON.stringify(out, null, 1); }
  state.fixture = { itemID: item.id, key: item.key, title };
  try {
    const opened = Zotero.Reader.open(item.id, null, { openInBackground: true, allowDuplicate: false });
    if (opened && typeof opened.then === 'function') Promise.resolve(opened).catch(e => { state.fixture.openError = String(e); });
  } catch (e) { state.fixture.openError = String(e); }
  let reader = null;
  for (let i = 0; i < 120; i++) {
    const list = Zotero.Reader._readers || [];
    for (let j = 0; j < list.length; j++) if (list[j] && list[j].itemID === item.id) { reader = list[j]; break; }
    if (reader && reader._internalReader && reader._internalReader._readAloudManager) break;
    await sleep(40);
  }
  const internal = reader && reader._internalReader, manager = internal && internal._readAloudManager;
  if (!reader || !manager) { out.errors.push('reader or manager missing'); return JSON.stringify(out, null, 1); }
  state.fixture.reader = reader;
  state.fixture.readerIndex = (Zotero.Reader._readers || []).indexOf(reader);
  try { Zotero_Tabs.select(reader.tabID); reader.focus && reader.focus(); reader._iframeWindow && reader._iframeWindow.focus && reader._iframeWindow.focus(); internal.toggleReadAloudPopup(true); }
  catch (e) { out.errors.push('popup: ' + String(e)); }
  for (let i = 0; i < 100; i++) {
    if ((manager._allVoices || []).length && (manager._segments || []).length) break;
    await sleep(40);
  }
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) { out.errors.push('pause: ' + String(e)); } }
  const counts = {}, examples = {}, languages = {};
  const all = manager._allVoices || [];
  for (let i = 0; i < all.length; i++) {
    const v = all[i], tier = String(v && v.tier || 'unknown'), lang = String(v && v.language || '');
    counts[tier] = (counts[tier] || 0) + 1;
    languages[lang] = (languages[lang] || 0) + 1;
    if (!examples[tier]) examples[tier] = [];
    if (examples[tier].length < 4) examples[tier].push({ id: String(v.id || ''), label: String(v.label || ''), language: lang, credits: v.creditsPerMinute == null ? null : Number(v.creditsPerMinute) });
  }
  const controller = manager._controller, stateNow = { active: !!manager.active, paused: !!manager.paused, popupOpen: !!(internal._state && internal._state.readAloudState && internal._state.readAloudState.popupOpen), selected: manager.selectedVoiceID || null, tier: manager._selectedTier || null, segments: manager._segments ? manager._segments.length : 0, allVoices: all.length, audioState: controller && controller._audioContext && controller._audioContext.state || null, audioTime: controller && controller._audioContext && Number.isFinite(controller._audioContext.currentTime) ? controller._audioContext.currentTime : null };
  out.status = stateNow.segments && stateNow.allVoices ? 'PASS' : 'FAIL';
  out.itemID = item.id; out.key = item.key; out.readerIndex = state.fixture.readerIndex; out.manager = stateNow; out.tierCounts = counts; out.tierExamples = examples; out.languageCount = Object.keys(languages).length;
  return JSON.stringify(out, null, 1);
})()
