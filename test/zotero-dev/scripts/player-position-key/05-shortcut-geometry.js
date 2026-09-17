return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, h = state.helpers, slots = state.fixtures;
  if (!h || !slots?.pdf || !slots?.epub) throw new Error('fixture helpers are missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const value = test(); if (value) return value; await sleep(60); } return test(); };
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  if (!host) throw new Error('Zotero main window is missing');
  try { host.windowState = 1; } catch (e) {}
  await sleep(250);
  try { host.focus?.(); } catch (e) {}
  await sleep(180);
  const readerOf = slot => h.reader(slot), managerOf = slot => h.manager(slot), frameOf = slot => h.frame(slot), childOf = slot => h.child(slot);
  const frameLayouts = () => {
    const out = {};
    for (const kind of ['pdf', 'epub']) out[kind] = frameOf(slots[kind])?.getAttribute?.('data-layout') || null;
    return out;
  };
  const pluginDiag = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
  const pluginRows = raw => {
    const out = {};
    for (const kind of ['pdf', 'epub']) { const index = h.index(slots[kind]); out[kind] = index >= 0 ? raw?.readers?.[index] || null : null; }
    return out;
  };
  const waitLayout = async expected => {
    const settled = await wait(() => {
      const frames = frameLayouts(), pref = Services.prefs.getStringPref(layoutPref, '');
      return frames.pdf === expected && frames.epub === expected && pref === expected ? true : null;
    }, 8000);
    if (!settled) throw new Error('layout did not settle at ' + expected + ': ' + JSON.stringify({ pref: Services.prefs.getStringPref(layoutPref, ''), frames: frameLayouts() }));
    await sleep(140);
  };
  const ensureMounted = async slot => {
    h.select(slot);
    const frame = frameOf(slot), doc = h.doc(slot);
    if (!frame || !doc) throw new Error('fixture frame is missing for ' + slot.itemID);
    if (frame.hidden) {
      const toggle = doc.getElementById('ztts-player-toggle');
      if (!toggle) throw new Error('plugin player toggle is missing for ' + slot.itemID);
      toggle.click();
    }
    const mounted = await wait(() => frame.hidden === false && childOf(slot)?.document?.querySelector('.player') ? true : null, 9000);
    if (!mounted) throw new Error('plugin player did not mount for ' + slot.itemID);
    const active = await wait(() => managerOf(slot)?.active ? true : null, 10000);
    if (!active) throw new Error('Read Aloud manager did not activate for ' + slot.itemID);
    if (!managerOf(slot)?.paused) {
      h.internal(slot)?.toggleReadAloudPaused();
      const paused = await wait(() => managerOf(slot)?.paused ? true : null, 5000);
      if (!paused) throw new Error('fixture manager did not pause for ' + slot.itemID);
    }
    return slot;
  };
  const selectAndFocusReader = async slot => {
    h.select(slot);
    try { readerOf(slot)?.focus?.(); } catch (e) {}
    try { readerOf(slot)?._iframeWindow?.focus?.(); } catch (e) {}
    try { host.focus?.(); } catch (e) {}
    await sleep(130);
    return host;
  };
  const selectAndFocusPlayer = async slot => {
    h.select(slot);
    const child = childOf(slot), target = child?.document?.querySelector('.options-toggle') || child?.document?.body;
    try { target?.focus?.(); } catch (e) {}
    try { child?.focus?.(); } catch (e) {}
    try { host.focus?.(); } catch (e) {}
    await sleep(130);
    return host;
  };
  const trustedP = win => {
    if (!win) throw new Error('key target window is missing');
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(win);
    const event = (key = 'P', code = 'KeyP', keyCode = 80, extra = {}) => new win.KeyboardEvent('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey: true, ...extra });
    try {
      const shiftDown = tip.keydown(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true, bubbles: true, cancelable: true }));
      const keyDown = tip.keydown(event());
      const keyUp = tip.keyup(event());
      const shiftUp = tip.keyup(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, bubbles: true, cancelable: true }));
      return { shiftDown, keyDown, keyUp, shiftUp };
    } finally { tip.endInputTransaction?.(); }
  };
  const refs = slot => {
    const manager = managerOf(slot), controller = manager?._controller;
    return { manager, controller, segment: manager?.activeSegment ?? manager?._activeSegment };
  };
  const frameMeasure = slot => {
    const frame = frameOf(slot), child = childOf(slot), doc = child?.document, player = doc?.querySelector('.player');
    if (!frame || !player) return { frame: null, player: null, layout: null, expanded: null, controls: null };
    const fr = frame.getBoundingClientRect(), pr = player.getBoundingClientRect(), bounds = [];
    for (const el of doc.querySelectorAll('.player *')) {
      if (el.hidden) continue;
      const css = child.getComputedStyle(el);
      if (css.display === 'none' || css.visibility === 'hidden') continue;
      const box = el.getBoundingClientRect();
      if (!(box.width || box.height)) continue;
      bounds.push({ top: box.top, bottom: box.bottom, left: box.left, right: box.right });
    }
    let minTop = null, maxBottom = null, minLeft = null, maxRight = null;
    for (const box of bounds) {
      minTop = minTop === null ? box.top : Math.min(minTop, box.top);
      maxBottom = maxBottom === null ? box.bottom : Math.max(maxBottom, box.bottom);
      minLeft = minLeft === null ? box.left : Math.min(minLeft, box.left);
      maxRight = maxRight === null ? box.right : Math.max(maxRight, box.right);
    }
    const overflow = bounds.length ? { top: minTop, bottom: maxBottom - fr.height, left: minLeft, right: maxRight - fr.width } : null;
    return {
      frame: { x: fr.x, y: fr.y, width: fr.width, height: fr.height, hidden: frame.hidden, styleHeight: frame.style.height },
      player: { x: pr.x, y: pr.y, width: pr.width, height: pr.height, className: player.className },
      layout: frame.getAttribute('data-layout'),
      expanded: doc.querySelector('.options-toggle')?.getAttribute('aria-expanded') === 'true',
      voiceChoicesVisible: doc.querySelector('.voice-group')?.hidden === false,
      controls: { count: bounds.length, overflow, fit: !!overflow && overflow.top >= -1 && overflow.bottom <= 1 && overflow.left >= -1 && overflow.right <= 1 },
    };
  };
  const snap = (slot, label) => {
    const manager = managerOf(slot), controller = manager?._controller, child = childOf(slot), mode = child?.document?.querySelector('.mode');
    return {
      label, itemID: slot.itemID, active: !!manager?.active, paused: !!manager?.paused,
      voice: manager?.selectedVoiceID || null, tier: manager?._selectedTier || manager?.selectedTier || null,
      speed: Number.isFinite(manager?.speed) ? Number(manager.speed) : null,
      position: Number.isFinite(controller?._position) ? Number(controller._position) : null,
      source: h.source(slot), mode: mode?.textContent || null, modePressed: mode?.getAttribute('aria-pressed') || null,
      layout: frameOf(slot)?.getAttribute('data-layout') || null, geometry: frameMeasure(slot),
    };
  };
  const compare = (before, after, beforeRefs, allowProgress = false) => {
    const position = allowProgress ? (after.position === before.position || (Number.isFinite(before.position) && Number.isFinite(after.position) && after.position >= before.position)) : after.position === before.position;
    return {
      managerSame: beforeRefs.manager === refs(slots[before.kind]).manager,
      controllerSame: beforeRefs.controller === refs(slots[before.kind]).controller,
      segmentSame: beforeRefs.segment === refs(slots[before.kind]).segment,
      active: after.active === before.active, paused: after.paused === before.paused,
      voice: after.voice === before.voice, tier: after.tier === before.tier, speed: after.speed === before.speed,
      position, source: JSON.stringify(after.source) === JSON.stringify(before.source),
      pass: beforeRefs.manager === refs(slots[before.kind]).manager && beforeRefs.controller === refs(slots[before.kind]).controller && beforeRefs.segment === refs(slots[before.kind]).segment && after.active === before.active && after.paused === before.paused && after.voice === before.voice && after.tier === before.tier && after.speed === before.speed && position && JSON.stringify(after.source) === JSON.stringify(before.source),
    };
  };
  const allSnaps = (label, focusKind) => {
    const out = {};
    for (const kind of ['pdf', 'epub']) { const value = snap(slots[kind], label + ':' + kind); value.kind = kind; out[kind] = value; }
    out.frames = frameLayouts(); out.focus = focusKind;
    return out;
  };
  const rows = [];
  try {
    await ensureMounted(slots.pdf); await ensureMounted(slots.epub);
    Zotero.ZoteroTTS.pluginPlayer.setLayout('top');
    await waitLayout('top');
    for (const kind of ['pdf', 'epub']) {
      const slot = slots[kind];
      h.select(slot);
      const manager = managerOf(slot), count = manager?._segments?.length || 0;
      if (count > 8) await h.setSegment(slot, Math.max(2, Math.min(count - 3, Math.floor(count / 2))));
      for (let cycle = 1; cycle <= 3; cycle++) {
        await waitLayout('top');
        const before = allSnaps('expanded-' + cycle + '-top-before', kind), beforeSlot = before[kind], beforeRefs = refs(slot);
        const readerPress = trustedP(await selectAndFocusReader(slot));
        await waitLayout('A');
        const afterA = allSnaps('expanded-' + cycle + '-A', kind), afterASlot = afterA[kind], aGeometry = frameMeasure(slot);
        const aState = compare({ ...beforeSlot, kind }, { ...afterASlot, kind }, beforeRefs);
        if (readerPress.keyDown !== 1 || afterA.frames.pdf !== 'A' || afterA.frames.epub !== 'A' || !aState.pass || aGeometry.frame.height !== 34) throw new Error('expanded top → A mismatch: ' + JSON.stringify({ kind, cycle, readerPress, before, afterA, aState }));
        const playerPress = trustedP(await selectAndFocusPlayer(slot));
        await waitLayout('B');
        const afterB = allSnaps('expanded-' + cycle + '-B', kind), afterBSlot = afterB[kind], bGeometry = frameMeasure(slot);
        const bState = compare({ ...beforeSlot, kind }, { ...afterBSlot, kind }, beforeRefs);
        if (playerPress.keyDown !== 1 || afterB.frames.pdf !== 'B' || afterB.frames.epub !== 'B' || !bState.pass || !bGeometry.frame || bGeometry.frame.height !== 202 || !bGeometry.player || bGeometry.player.height !== 202 || bGeometry.expanded !== true || !bGeometry.voiceChoicesVisible || !bGeometry.controls.fit) throw new Error('expanded A → B mismatch: ' + JSON.stringify({ kind, cycle, playerPress, before, afterA, afterB, bState }));
        const topPress = trustedP(await selectAndFocusReader(slot));
        await waitLayout('top');
        const afterTop = allSnaps('expanded-' + cycle + '-top-after', kind), afterTopSlot = afterTop[kind], topGeometry = frameMeasure(slot);
        const topState = compare({ ...beforeSlot, kind }, { ...afterTopSlot, kind }, beforeRefs);
        if (topPress.keyDown !== 1 || afterTop.frames.pdf !== 'top' || afterTop.frames.epub !== 'top' || !topState.pass || topGeometry.frame.height !== 34) throw new Error('expanded B → top mismatch: ' + JSON.stringify({ kind, cycle, topPress, before, afterTop, topState }));
        rows.push({ check: kind + ' expanded cycle ' + cycle + ' top → A → B → top', expected: '34 → 202 → 34 frame/content heights; state and all fixture layouts retained', observed: { readerPress, playerPress, topPress, frames: afterTop.frames, A: aGeometry, B: bGeometry, top: topGeometry, states: { A: aState, B: bState, top: topState }, before: beforeSlot, after: afterTopSlot }, status: 'PASS' });
      }
    }
    for (const kind of ['pdf', 'epub']) {
      const slot = slots[kind];
      Zotero.ZoteroTTS.pluginPlayer.setLayout('top'); await waitLayout('top');
      const toA = trustedP(await selectAndFocusReader(slot)); await waitLayout('A');
      const toB = trustedP(await selectAndFocusPlayer(slot)); await waitLayout('B');
      const child = childOf(slot), options = child?.document?.querySelector('.options-toggle');
      if (!options) throw new Error('Options button is missing in B for ' + kind);
      if (options.getAttribute('aria-expanded') !== 'true') { options.click(); await wait(() => child?.document?.querySelector('.options-toggle')?.getAttribute('aria-expanded') === 'true' && frameMeasure(slot).frame?.height === 202 ? true : null, 3000); }
      const expandedBefore = snap(slot, 'collapsed-path-expanded-before');
      options.click();
      const collapsedReady = await wait(() => { const g = frameMeasure(slot); return g.frame?.height === 108 && g.player?.height === 108 && g.expanded === false ? g : null; }, 4000);
      if (!collapsedReady) throw new Error('B did not collapse to 108 for ' + kind + ': ' + JSON.stringify(frameMeasure(slot)));
      const beforeRefs = refs(slot), before = snap(slot, 'collapsed-B-before-cycle');
      const bTop = trustedP(await selectAndFocusReader(slot)); await waitLayout('top');
      const top = frameMeasure(slot);
      const topA = trustedP(await selectAndFocusReader(slot)); await waitLayout('A');
      const a = frameMeasure(slot);
      const aB = trustedP(await selectAndFocusPlayer(slot)); await waitLayout('B');
      const after = snap(slot, 'collapsed-B-after-cycle'), b = frameMeasure(slot);
      const stateCheck = compare({ ...before, kind }, { ...after, kind }, beforeRefs);
      if (bTop.keyDown !== 1 || topA.keyDown !== 1 || aB.keyDown !== 1 || top.frame?.height !== 34 || a.frame?.height !== 34 || b.frame?.height !== 108 || b.player?.height !== 108 || b.expanded !== false || !b.controls.fit || !stateCheck.pass) throw new Error('collapsed cycle mismatch: ' + JSON.stringify({ kind, presses: { bTop, topA, aB }, expandedBefore, before, top, a, b, after, stateCheck }));
      rows.push({ check: kind + ' collapsed top → A → B → top cycle', expected: 'docked frames 34px; floating frame/content 108px; controls fit and reading state retained', observed: { presses: { bTop, topA, aB }, top, A: a, B: b, before, after, state: stateCheck }, status: 'PASS' });
      const reset = trustedP(await selectAndFocusReader(slot)); await waitLayout('top');
      if (reset.keyDown !== 1) throw new Error('collapsed B → top reset was not consumed for ' + kind);
    }
    const playingSlot = slots.epub;
    Zotero.ZoteroTTS.pluginPlayer.setLayout('top'); await waitLayout('top'); h.select(playingSlot);
    const playingManager = managerOf(playingSlot), playingController = playingManager?._controller, playingSegment = playingManager?.activeSegment ?? playingManager?._activeSegment;
    if (playingManager?.paused) { h.internal(playingSlot)?.toggleReadAloudPaused(); const started = await wait(() => managerOf(playingSlot)?.active && !managerOf(playingSlot)?.paused ? true : null, 5000); if (!started) throw new Error('EPUB fixture did not enter playing state'); }
    const playingBefore = snap(playingSlot, 'playing-top-before');
    const playingPress = trustedP(await selectAndFocusReader(playingSlot)); await waitLayout('A');
    const playingAfter = snap(playingSlot, 'playing-A-after'), playingState = { managerSame: playingManager === managerOf(playingSlot), controllerSame: playingController === managerOf(playingSlot)?._controller, segmentSame: playingSegment === (managerOf(playingSlot)?.activeSegment ?? managerOf(playingSlot)?._activeSegment), active: playingAfter.active, paused: playingAfter.paused, voice: playingAfter.voice === playingBefore.voice, speed: playingAfter.speed === playingBefore.speed, position: playingAfter.position === playingBefore.position || (Number.isFinite(playingBefore.position) && Number.isFinite(playingAfter.position) && playingAfter.position >= playingBefore.position), pass: playingManager === managerOf(playingSlot) && playingController === managerOf(playingSlot)?._controller && playingSegment === (managerOf(playingSlot)?.activeSegment ?? managerOf(playingSlot)?._activeSegment) && playingAfter.active && !playingAfter.paused && playingAfter.voice === playingBefore.voice && playingAfter.speed === playingBefore.speed && (playingAfter.position === playingBefore.position || (Number.isFinite(playingBefore.position) && Number.isFinite(playingAfter.position) && playingAfter.position >= playingBefore.position)) };
    if (playingPress.keyDown !== 1 || !playingState.pass) throw new Error('playing top → A mismatch: ' + JSON.stringify({ playingPress, playingBefore, playingAfter, playingState }));
    rows.push({ check: 'EPUB playing top → A', expected: 'active playing state, manager/controller, voice/speed and nondecreasing position retained', observed: { playingPress, before: playingBefore, after: playingAfter, state: playingState, audio: playingAfter.audio }, status: 'PASS' });
    if (!managerOf(playingSlot)?.paused) { h.internal(playingSlot)?.toggleReadAloudPaused(); await wait(() => managerOf(playingSlot)?.paused ? true : null, 5000); }
    Zotero.ZoteroTTS.pluginPlayer.setLayout('top'); await waitLayout('top');
    const raw = await pluginDiag(), players = pluginRows(raw);
    if (raw.layout !== 'top' || frameLayouts().pdf !== 'top' || frameLayouts().epub !== 'top') throw new Error('final top layout mismatch: ' + JSON.stringify({ raw, frames: frameLayouts() }));
    state.positionShortcut.geometry = rows;
    return JSON.stringify({ rows, final: { layout: raw.layout, frames: frameLayouts(), players: Object.fromEntries(Object.entries(players).map(([kind, row]) => [kind, row ? { open: row.open, expanded: row.expanded, layout: row.state?.layout, active: row.state?.active, paused: row.state?.paused, voice: row.state?.voice, speed: row.state?.speed, position: row.state?.position } : null])) } }, null, 1);
  } finally {
    try { Zotero.ZoteroTTS.pluginPlayer.setLayout('top'); } catch (e) {}
  }
})()
