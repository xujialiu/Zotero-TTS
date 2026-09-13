return (async () => {
  const state = Zotero.__zttsAllHandoff, fixture = state && state.fixture, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const out = { status: 'PASS', tiers: [], errors: [] };
  if (!fixture) { out.status = 'NOT TESTABLE'; out.errors.push('fixture missing'); return JSON.stringify(out, null, 1); }
  const list = Zotero.Reader._readers || [];
  let reader = null; for (let i = 0; i < list.length; i++) if (list[i] && list[i].itemID === fixture.itemID) { reader = list[i]; break; }
  const internal = reader && reader._internalReader, manager = internal && internal._readAloudManager;
  if (!reader || !manager) { out.status = 'NOT TESTABLE'; out.errors.push('fixture manager missing'); return JSON.stringify(out, null, 1); }
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) { out.errors.push('pause: ' + String(e)); } }
  for (const tier of ['standard', 'premium']) {
    const row = { tier, selection: null, start: null, restoredHandoff: null, errors: [] };
    try { manager.selectTier(tier); } catch (e) { row.errors.push('selectTier: ' + String(e)); out.tiers.push(row); continue; }
    await sleep(120);
    const voices = manager.voices || [], sample = [];
    for (let i = 0; i < Math.min(5, voices.length || 0); i++) { const v = voices[i]; sample.push({ id: String(v && v.id || ''), label: String(v && v.label || ''), language: v && v.language || null, granularity: v && v.segmentGranularity || null, credits: v && v.creditsPerMinute == null ? null : v.creditsPerMinute }); }
    const chosen = voices[0], chosenID = chosen && chosen.id ? String(chosen.id) : null;
    row.selection = { selectedTier: manager._selectedTier || null, voiceCount: voices.length || 0, sample, chosen: chosenID };
    if (!chosenID) { row.errors.push('no official voice in selected tier'); out.status = 'NOT TESTABLE'; out.tiers.push(row); continue; }
    try { manager.selectVoice(chosenID); } catch (e) { row.errors.push('selectVoice: ' + String(e)); out.status = 'NOT TESTABLE'; out.tiers.push(row); continue; }
    try { manager.repositionTo(0); } catch (e) { row.errors.push('reposition: ' + String(e)); }
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) { row.errors.push('pause after reposition: ' + String(e)); } }
    await sleep(100);
    try { Zotero_Tabs.select(reader.tabID); reader.focus && reader.focus(); reader._iframeWindow && reader._iframeWindow.focus && reader._iframeWindow.focus(); reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) { row.errors.push('focus/activation: ' + String(e)); }
    const rw = reader._iframeWindow, tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor), K = rw.KeyboardEvent, ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    let key = null; try { tip.beginInputTransactionForTests(rw); key = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32, true)), tip.keyup(ev(' ', 'Space', 32, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))]; if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction(); } catch (e) { row.errors.push('start key: ' + String(e)); }
    const started = Date.now(); let running = null;
    for (let i = 0; i < 360; i++) { const c = manager._controller, context = c && c._audioContext, s = { active: !!manager.active, paused: !!manager.paused, position: c && Number.isFinite(c._position) ? c._position : null, currentIndex: c && Number.isFinite(c._currentIndex) ? c._currentIndex : null, source: !!(c && c._sourceNode), playing: !!(c && c._isPlaying), audioState: context && context.state || null, audioTime: context && Number.isFinite(context.currentTime) ? context.currentTime : null, duration: c && c._currentBuffer && Number.isFinite(c._currentBuffer.duration) ? c._currentBuffer.duration : null }; if (s.active && !s.paused && s.source && s.playing && s.audioState === 'running' && s.position === 0) { running = s; break; } await sleep(15); }
    row.start = { key, elapsedMs: Date.now() - started, running, selectedAfter: manager.selectedVoiceID || null };
    if (running) { await sleep(150); try { manager.pause(); } catch (e) { row.errors.push('pause after probe: ' + String(e)); } }
    else { row.errors.push('official audio did not reach running state'); out.status = 'NOT TESTABLE'; if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} } }
    let d = null; try { d = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()); const idx = (Zotero.Reader._readers || []).indexOf(reader); row.restoredHandoff = d.readers && d.readers[idx] && d.readers[idx].handoff || null; } catch (e) { row.errors.push('diagnostic: ' + String(e)); }
    out.tiers.push(row);
  }
  if (out.tiers.some(row => row.errors.length)) out.status = out.status === 'PASS' ? 'NOT TESTABLE' : out.status;
  return JSON.stringify(out, null, 1);
})()
