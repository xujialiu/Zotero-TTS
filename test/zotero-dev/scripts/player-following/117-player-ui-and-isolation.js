return (async () => {
  const state = Zotero.ZoteroTTSRun.state, h = state.helpers;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 7000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { let value = null; try { value = await test(); } catch (e) {} if (value) return value; await sleep(100); }
    return test();
  };
  const readerOf = id => { for (const reader of Zotero.Reader?._readers || []) if (reader?.itemID === id) return reader; return null; };
  const frameOf = reader => reader?._iframeWindow?.document?.getElementById('ztts-player-frame');
  const iconOf = reader => reader?._iframeWindow?.document?.getElementById('ztts-player-toggle');
  const managerOf = reader => reader?._internalReader?._readAloudManager;
  const diag = async reader => {
    try {
      const raw = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
      let index = -1, i = 0;
      for (const candidate of Zotero.Reader?._readers || []) { if (candidate === reader) { index = i; break; } i++; }
      // pluginPlayer.inspect() intentionally keeps the snapshot narrow and
      // omits item ids. Its reader rows follow Zotero.Reader._readers order;
      // retain both ids and this index in the result for fixture identity.
      return { readerIndex: index, row: index >= 0 ? raw.readers?.[index] || null : null, count: raw.readers?.length ?? 0 };
    } catch (e) { return { error: String(e) }; }
  };
  const ui = reader => {
    const frame = frameOf(reader), doc = frame?.contentDocument, mode = doc?.querySelector('.mode');
    const root = doc?.querySelector('.player');
    return {
      hidden: frame ? !!frame.hidden : null, layout: frame?.getAttribute('data-layout') || null,
      frameStyle: frame ? { left: frame.style.left, top: frame.style.top, bottom: frame.style.bottom, width: frame.style.width, height: frame.style.height } : null,
      player: !!root, rootClass: root?.className || null, modeText: mode?.textContent?.trim() || null,
      modeTitle: mode?.title || null, modeLabel: mode?.getAttribute('aria-label') || null,
      modePressed: mode?.getAttribute('aria-pressed') || null,
    };
  };
  const managerState = reader => {
    const m = managerOf(reader), c = m?._controller;
    return { active: !!m?.active, paused: !!m?.paused, position: Number.isFinite(c?._position) ? c._position : null, voice: m?.selectedVoiceID || null };
  };
  const pair = async reader => {
    const d = await diag(reader), s = d?.row?.state || null;
    return { automatic: s?.automatic ?? null, plugin: { readerIndex: d?.readerIndex ?? null, rows: d?.count ?? null, hasRow: !!d?.row }, state: s ? { automatic: s.automatic, active: s.active, paused: s.paused, position: s.position } : null, ui: ui(reader), manager: managerState(reader) };
  };
  const openPlayer = async reader => {
    const frame = frameOf(reader);
    if (!frame) throw new Error('player frame missing');
    if (frame.hidden) iconOf(reader)?.click();
    await waitFor(() => !frameOf(reader)?.hidden && !!frameOf(reader)?.contentDocument?.querySelector('.player'));
    if (frameOf(reader)?.hidden || !frameOf(reader)?.contentDocument?.querySelector('.player')) throw new Error('player did not open');
    await sleep(350);
  };
  const pauseWithButton = async reader => {
    const frame = frameOf(reader), button = frame?.contentDocument?.querySelector('.play');
    if (managerOf(reader)?.active && !managerOf(reader)?.paused) {
      button?.click();
      await waitFor(() => !!managerOf(reader)?.paused);
    }
    return !!managerOf(reader)?.paused;
  };
  const switchLayout = async (reader, layout) => {
    const frame = frameOf(reader), child = frame?.contentWindow ? Components.utils.waiveXrays(frame.contentWindow) : null;
    if (typeof child?.zttsSwitchLayout !== 'function') throw new Error('zttsSwitchLayout export missing');
    child.zttsSwitchLayout(layout);
    await waitFor(() => frame?.getAttribute('data-layout') === layout && !!frame?.contentDocument?.querySelector('.player'));
    await sleep(450);
    return pair(reader);
  };
  const clickMode = async (reader, expected) => {
    frameOf(reader)?.contentDocument?.querySelector('.mode')?.click();
    await waitFor(async () => (await diag(reader))?.row?.state?.automatic === expected);
    await sleep(250);
    return pair(reader);
  };
  const stateMode = slot => {
    const reader = readerOf(slot?.itemID), d = diag(reader), s = d?.state || d;
    return { itemID: slot?.itemID ?? null, tabID: reader?.tabID ?? null, automatic: s?.automatic ?? null, ui: ui(reader), diag: h?.diag(slot) || null };
  };
  if (!h) return JSON.stringify({ error: 'helpers missing' });
  const fixtures = state.fixtures || {};
  const rows = [], layouts = [];
  const oldName = 'extensions.zotero.zotero-tts.readAloud.autoScrollEnabled';
  const p = Services.prefs;
  const oldType = p.getPrefType(oldName), oldUser = p.prefHasUserValue(oldName);
  let oldValue = null;
  try { if (oldType === p.PREF_BOOL) oldValue = p.getBoolPref(oldName); else if (oldType === p.PREF_INT) oldValue = p.getIntPref(oldName); else if (oldType === p.PREF_STRING) oldValue = p.getStringPref(oldName); } catch (e) {}
  const restoreOld = () => {
    if (!oldUser) { if (p.prefHasUserValue(oldName)) p.clearUserPref(oldName); return; }
    if (oldType === p.PREF_BOOL) p.setBoolPref(oldName, !!oldValue);
    else if (oldType === p.PREF_INT) p.setIntPref(oldName, Number(oldValue));
    else if (oldType === p.PREF_STRING) p.setStringPref(oldName, String(oldValue));
  };
  try {
    for (const kind of ['pdf', 'epubScrolled', 'epubPaginated']) {
      const slot = fixtures[kind], reader = readerOf(slot?.itemID);
      if (!reader) { rows.push({ kind, error: 'reader missing' }); continue; }
      await openPlayer(reader); await pauseWithButton(reader);
      const first = await switchLayout(reader, 'A');
      const layoutRows = [{ layout: 'A', state: first }];
      for (const layout of ['top', 'B', 'A']) layoutRows.push({ layout, state: await switchLayout(reader, layout) });
      layouts.push({ kind, rows: layoutRows, duplicateFrames: reader._iframeWindow.document.querySelectorAll('#ztts-player-frame').length });
      const beforePause = await pair(reader);
      const play = frameOf(reader)?.contentDocument?.querySelector('.play');
      if (managerOf(reader)?.paused) { play?.click(); await waitFor(() => managerOf(reader)?.active && !managerOf(reader)?.paused); }
      const playing = await pair(reader);
      play?.click(); await waitFor(() => !!managerOf(reader)?.paused); const afterPause = await pair(reader);
      const pauseKeepsMode = beforePause.automatic === true && playing.automatic === true && afterPause.automatic === true;
      const explicitManual = await clickMode(reader, false);
      const index = kind === 'epubPaginated' ? 3 : 1;
      await h.setSegment(slot, index); await h.arrange(slot, 'visible'); await sleep(500);
      const laterManual = await pair(reader);
      const explicitAutomatic = await clickMode(reader, true);
      const recoveryPaused = explicitAutomatic.manager.paused;
      const oldBefore = { type: oldType, user: oldUser, value: oldValue };
      p.setBoolPref(oldName, false); await sleep(600);
      const oldFalse = await pair(reader);
      const oldAfter = { type: p.getPrefType(oldName), user: p.prefHasUserValue(oldName), value: p.getBoolPref(oldName) };
      restoreOld(); await sleep(250);
      rows.push({ kind, itemID: reader.itemID, tabID: reader.tabID, layouts: layoutRows.map(x => ({ layout: x.layout, automatic: x.state.automatic, modeText: x.state.ui.modeText, modeLabel: x.state.ui.modeLabel, modePressed: x.state.ui.modePressed, frame: x.state.ui.frameStyle, rootClass: x.state.ui.rootClass })), pause: { before: beforePause, playing, after: afterPause, pauseKeepsMode }, explicit: { manual: explicitManual, laterManual, automatic: explicitAutomatic, recoveryPaused }, oldFalse: { before: oldBefore, during: oldFalse, after: oldAfter, restored: { type: p.getPrefType(oldName), user: p.prefHasUserValue(oldName), value: p.prefHasUserValue(oldName) && oldType === p.PREF_BOOL ? p.getBoolPref(oldName) : null } } });
    }
    // Two disposable readers exercise reader ownership: choosing M in one
    // must leave the other at A, and must not create/use the retired global pref.
    const first = readerOf(fixtures.pdf?.itemID), second = readerOf(fixtures.epubScrolled?.itemID);
    if (first && second) {
      await switchLayout(first, 'A'); await switchLayout(second, 'A'); await pauseWithButton(first); await pauseWithButton(second);
      const firstManual = await clickMode(first, false); const secondAfterFirst = await pair(second);
      await h.setSegment(fixtures.epubScrolled, 2); await h.arrange(fixtures.epubScrolled, 'visible'); await sleep(450); const secondLater = await pair(second);
      const firstAfterSecond = await pair(first); const oldAfterFirst = { type: p.getPrefType(oldName), user: p.prefHasUserValue(oldName), value: p.prefHasUserValue(oldName) && p.getBoolPref(oldName) };
      const secondManual = await clickMode(second, false); const firstAfterSecondManual = await pair(first);
      const restoreFirst = await clickMode(first, true); const restoreSecond = await clickMode(second, true);
      rows.push({ isolation: { first: { itemID: first.itemID, tabID: first.tabID, manual: firstManual, afterSecondManual: firstAfterSecondManual, restored: restoreFirst }, second: { itemID: second.itemID, tabID: second.tabID, afterFirstManual: secondAfterFirst, later: secondLater, manual: secondManual, restored: restoreSecond }, oldPrefAfterChoices: oldAfterFirst, independent: firstManual.automatic === false && secondAfterFirst.automatic === true && secondLater.automatic === true && firstAfterSecondManual.automatic === false } });
      // A manually selected state is session-local. Closing the disposable
      // player and opening it again starts a fresh following session.
      await clickMode(first, false); const closeFrame = frameOf(first); iconOf(first)?.click(); await waitFor(() => !!closeFrame?.hidden && !managerOf(first)?.active); const closed = { ui: ui(first), manager: managerState(first) };
      iconOf(first)?.click(); await waitFor(() => !frameOf(first)?.hidden && managerOf(first)?.active && !!frameOf(first)?.contentDocument?.querySelector('.player')); await pauseWithButton(first); const reopened = await pair(first);
      rows.push({ reopen: { closed, reopened, startsAutomatic: reopened.automatic === true && reopened.ui.modeText === 'A' } });
    }
  } catch (e) { rows.push({ error: String(e), stack: e?.stack ? String(e.stack).split('\n').slice(0, 5) : null }); }
  restoreOld(); await sleep(250);
  const checks = [];
  for (const entry of layouts) for (const row of entry.rows) {
    const expectedText = row.state.automatic === true ? 'A' : 'M';
    checks.push({ kind: entry.kind, layout: row.layout, automaticMatches: row.state.automatic === (row.state.ui.modeText === 'A'), labelMatchesTitle: row.state.ui.modeLabel === row.state.ui.modeTitle && !!row.state.ui.modeLabel, pressedMatches: row.state.ui.modePressed === String(row.state.automatic), expectedText, actualText: row.state.ui.modeText });
  }
  for (const row of rows) if (row.kind) checks.push({ kind: row.kind, action: 'explicit manual', automatic: row.explicit.manual.automatic, modeText: row.explicit.manual.ui.modeText, labelMatchesTitle: row.explicit.manual.ui.modeLabel === row.explicit.manual.ui.modeTitle, pressed: row.explicit.manual.ui.modePressed, laterRemainsManual: row.explicit.laterManual.automatic === false, recoveryAutomatic: row.explicit.automatic.automatic === true, pausedAfterRecovery: row.explicit.recoveryPaused });
  return JSON.stringify({ layouts, rows, checks, oldPrefRestored: { type: p.getPrefType(oldName), user: p.prefHasUserValue(oldName), value: p.prefHasUserValue(oldName) && oldType === p.PREF_BOOL ? p.getBoolPref(oldName) : null } }, null, 1);
})()
