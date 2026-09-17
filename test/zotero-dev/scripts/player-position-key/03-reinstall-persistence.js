return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, h = state.helpers, slots = state.fixtures;
  if (!h || !slots?.pdf || !slots?.epub || !state.positionShortcut?.persistence) throw new Error('reinstall persistence state is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (test, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { const value = test(); if (value) return value; await sleep(100); } return test(); };
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const frameLayouts = () => ({ pdf: h.frame(slots.pdf)?.getAttribute?.('data-layout') || null, epub: h.frame(slots.epub)?.getAttribute?.('data-layout') || null });
  const pluginDiag = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
  const pluginRows = async () => {
    const raw = await pluginDiag(), result = {};
    for (const kind of ['pdf', 'epub']) { const index = h.index(slots[kind]); result[kind] = raw.readers?.[index] || null; }
    return result;
  };
  const internals = [];
  const end = Date.now() + 24000;
  while (Date.now() < end) {
    internals.length = 0;
    for (const kind of ['pdf', 'epub']) { const m = h.manager(slots[kind]); internals.push({ kind, internal: !!h.internal(slots[kind]), manager: !!m }); }
    if (internals.every(row => row.internal && row.manager)) break;
    await sleep(7000);
  }
  if (!internals.every(row => row.internal && row.manager)) throw new Error('reader internals did not return after reinstall: ' + JSON.stringify(internals));
  const beforeOpen = {};
  for (const kind of ['pdf', 'epub']) { const s = slots[kind], m = h.manager(s), c = m?._controller, f = h.frame(s); beforeOpen[kind] = { active: !!m?.active, paused: !!m?.paused, voice: m?.selectedVoiceID || null, speed: Number(m?.speed) || null, position: Number.isFinite(c?._position) ? c._position : null, hidden: f?.hidden ?? null, layout: f?.getAttribute?.('data-layout') || null }; }
  const initialRows = await pluginRows();
  const prefEvidence = { pref: Services.prefs.getStringPref(layoutPref, ''), user: Services.prefs.prefHasUserValue(layoutPref), diagnosticLayout: (await pluginDiag()).layout, frames: frameLayouts(), beforeOpen, pluginOpen: { pdf: !!initialRows.pdf?.open, epub: !!initialRows.epub?.open } };
  if (prefEvidence.pref !== 'B' || !prefEvidence.user || prefEvidence.diagnosticLayout !== 'B' || prefEvidence.frames.pdf !== 'B' || prefEvidence.frames.epub !== 'B') throw new Error('saved B layout was lost across reinstall: ' + JSON.stringify(prefEvidence));
  const reopened = {};
  for (const kind of ['pdf', 'epub']) {
    const slot = slots[kind]; h.select(slot); const frame = h.frame(slot), button = h.doc(slot)?.getElementById('ztts-player-toggle');
    if (!button) throw new Error('reopen button missing after reinstall for ' + kind);
    if (frame?.hidden !== false) button.click();
    const ready = await wait(() => h.frame(slot)?.hidden === false && h.child(slot)?.document?.querySelector('.player') ? true : null, 10000);
    if (!ready) throw new Error('player frame did not reopen after reinstall for ' + kind);
    if (!h.manager(slot)?.paused) { h.internal(slot)?.toggleReadAloudPaused(); await wait(() => h.manager(slot)?.paused ? true : null, 5000); }
    let raw = await pluginDiag(), row = raw.readers?.[h.index(slot)];
    for (let i = 0; i < 50 && !row?.open; i++) { await sleep(100); raw = await pluginDiag(); row = raw.readers?.[h.index(slot)]; }
    reopened[kind] = { hidden: h.frame(slot)?.hidden ?? null, layout: h.frame(slot)?.getAttribute?.('data-layout') || null, open: !!row?.open, active: !!h.manager(slot)?.active, paused: !!h.manager(slot)?.paused, voice: h.manager(slot)?.selectedVoiceID || null, speed: Number(h.manager(slot)?.speed) || null, position: Number.isFinite(h.manager(slot)?._controller?._position) ? h.manager(slot)._controller._position : null };
    if (reopened[kind].hidden !== false || reopened[kind].layout !== 'B' || !reopened[kind].open || !reopened[kind].active || !reopened[kind].paused) throw new Error('reopened player lost B layout/state for ' + kind + ': ' + JSON.stringify(reopened[kind]));
  }
  state.positionShortcut.reinstall = { internals, prefEvidence, reopened };
  return JSON.stringify({ check: 'in-place reinstall preserves saved layout', expected: 'B/user value and B frame/diagnostic survive reinstall and reopening', observed: state.positionShortcut.reinstall, status: 'PASS' }, null, 1);
})()
