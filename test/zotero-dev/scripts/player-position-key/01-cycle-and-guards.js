return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, h = state.helpers, slots = state.fixtures;
  if (!h || !slots?.pdf || !slots?.epub) throw new Error('fixture helpers are missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const enabledPref = 'extensions.zotero.zotero-tts.readAloud.usePluginPlayer';
  const shortcutNames = ['speedReset', 'speedDown', 'speedUp', 'volumeDown', 'volumeUp', 'previousSentence', 'nextSentence', 'previousParagraph', 'nextParagraph', 'startFromSelection', 'returnToSpoken', 'toggleOptions', 'cyclePlayerLayout', 'stopReading', 'toggleWordHighlight', 'toggleAutoScroll', 'previousVoice', 'nextVoice'];
  const shortcutPref = action => 'extensions.zotero.zotero-tts.shortcuts.' + action;
  const readPref = name => {
    const p = Services.prefs, type = p.getPrefType(name), branch = Components.interfaces.nsIPrefBranch;
    let value = null;
    if (type === branch.PREF_STRING) value = p.getStringPref(name, '');
    else if (type === branch.PREF_INT) value = p.getIntPref(name, 0);
    else if (type === branch.PREF_BOOL) value = p.getBoolPref(name, false);
    return { type, user: p.prefHasUserValue(name), present: type !== branch.PREF_INVALID, value };
  };
  if (!state.positionShortcut) {
    const prefs = {};
    for (const name of [layoutPref, enabledPref, ...shortcutNames.map(shortcutPref)]) prefs[name] = readPref(name);
    state.positionShortcut = { prefs, originalMemory: readPref('extensions.zotero.zotero-tts.readAloud.memory') };
  }
  if (!state.positionShortcut.fullSnapshot) {
    const names = [
      'extensions.zotero.zotero-tts.readAloud.volume',
      'extensions.zotero.zotero-tts.readAloud.memory',
      'extensions.zotero.zotero-tts.readAloud.favoriteVoices',
      'extensions.zotero.zotero-tts.readAloud.favoritesOnly',
      'extensions.zotero.zotero-tts.readAloud.usePluginPlayer',
      'extensions.zotero.zotero-tts.readAloud.playerLayout',
      'extensions.zotero.zotero-tts.readAloud.openExpanded',
      'extensions.zotero.zotero-tts.readAloud.globalSpeed',
      'extensions.zotero.zotero-tts.webdav.syncPositions',
      'extensions.zotero.zotero-tts.webdav.autoUploadSettings',
      'extensions.zotero.zotero-tts.webdav.syncSettings',
      'extensions.zotero.reader.readAloudVoices',
      ...shortcutNames.map(shortcutPref),
    ];
    state.positionShortcut.fullSnapshot = {};
    for (const name of names) state.positionShortcut.fullSnapshot[name] = readPref(name);
  }
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  if (!host) throw new Error('Zotero main window is missing');
  // Trusted input requires the host window to be foregrounded. The tester
  // restores the recorded minimized state in cleanup after these checks.
  try { host.windowState = 1; } catch (e) {}
  await sleep(300);
  try { host.focus?.(); } catch (e) {}
  await sleep(150);
  const readerOf = slot => h.reader(slot);
  const managerOf = slot => h.manager(slot);
  const frameOf = slot => h.frame(slot);
  const childOf = slot => h.child(slot);
  const frameLayouts = () => {
    const out = {};
    for (const kind of ['pdf', 'epub']) out[kind] = frameOf(slots[kind])?.getAttribute?.('data-layout') || null;
    return out;
  };
  const pluginDiag = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
  const pluginRow = (slot, raw) => {
    const index = h.index(slot);
    return index >= 0 ? raw?.readers?.[index] || null : null;
  };
  const snap = (slot, label) => {
    const m = managerOf(slot), c = m?._controller;
    return {
      label,
      itemID: slot.itemID,
      active: !!m?.active,
      paused: !!m?.paused,
      voice: m?.selectedVoiceID || null,
      tier: m?._selectedTier || m?.selectedTier || null,
      speed: Number.isFinite(m?.speed) ? Number(m.speed) : null,
      position: Number.isFinite(c?._position) ? Number(c._position) : null,
      source: h.source(slot),
      audio: c?._audioContext ? { state: c._audioContext.state, currentTime: Number(c._audioContext.currentTime) } : null,
      layout: frameOf(slot)?.getAttribute?.('data-layout') || null,
    };
  };
  const waitLayout = async expected => {
    const ok = await h.wait(() => {
      const layouts = frameLayouts();
      return layouts.pdf === expected && layouts.epub === expected && Services.prefs.getStringPref(layoutPref, '') === expected ? true : null;
    }, 7000);
    if (!ok) throw new Error('layout did not settle at ' + expected + ': ' + JSON.stringify({ pref: Services.prefs.getStringPref(layoutPref, ''), frames: frameLayouts() }));
    await sleep(120);
  };
  const waitPluginOpen = async (slot, expected) => {
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      const raw = await pluginDiag(), row = pluginRow(slot, raw);
      if (!!row?.open === expected) return row;
      await sleep(100);
    }
    const raw = await pluginDiag();
    throw new Error('plugin open state did not settle: ' + JSON.stringify({ itemID: slot.itemID, expected, row: pluginRow(slot, raw) }));
  };
  const ensurePausedOpen = async slot => {
    const r = readerOf(slot), ir = h.internal(slot);
    if (!r || !ir) throw new Error('reader/internal missing for ' + slot.itemID);
    h.select(slot);
    const frame = frameOf(slot), doc = h.doc(slot);
    if (frame?.hidden !== false) {
      const button = doc?.getElementById('ztts-player-toggle');
      if (!button) throw new Error('plugin player toggle is missing for ' + slot.itemID);
      button.click();
      const mounted = await h.wait(() => frameOf(slot)?.hidden === false && childOf(slot)?.document?.querySelector('.player') ? true : null, 8000);
      if (!mounted) throw new Error('plugin player did not open for ' + slot.itemID);
    }
    if (!managerOf(slot)?.active) {
      const active = await h.wait(() => managerOf(slot)?.active ? true : null, 10000);
      if (!active) throw new Error('manager did not activate for ' + slot.itemID);
    }
    if (!managerOf(slot)?.paused) {
      ir.toggleReadAloudPaused();
      const paused = await h.wait(() => managerOf(slot)?.paused ? true : null, 5000);
      if (!paused) throw new Error('manager did not pause for ' + slot.itemID);
    }
    const frameReady = await h.wait(() => frameOf(slot)?.contentWindow ? true : null, 5000);
    if (!frameReady) throw new Error('plugin frame did not mount for ' + slot.itemID);
    await waitPluginOpen(slot, true);
  };
  const focusReader = async slot => {
    h.select(slot);
    const r = readerOf(slot), rw = r?._iframeWindow;
    r?.focus?.(); rw?.focus?.();
    host.focus?.();
    await sleep(150);
    return host;
  };
  const focusPlayer = async slot => {
    h.select(slot);
    const frame = frameOf(slot), rw = frame?.contentWindow, doc = childOf(slot)?.document;
    const target = doc?.querySelector('.options-toggle') || doc?.body;
    target?.focus?.(); rw?.focus?.();
    host.focus?.();
    await sleep(150);
    return host;
  };
  const pEvent = (win, key = 'P', code = 'KeyP', keyCode = 80, extra = {}) => new win.KeyboardEvent('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey: true, ...extra });
  const trustedP = (win, extra = {}) => {
    if (!win) throw new Error('key target window is missing');
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const modifiers = [];
    if (extra.ctrlKey) modifiers.push({ key: 'Control', code: 'ControlLeft', keyCode: 17, prop: 'ctrlKey' });
    if (extra.altKey) modifiers.push({ key: 'Alt', code: 'AltLeft', keyCode: 18, prop: 'altKey' });
    if (extra.metaKey) modifiers.push({ key: 'Meta', code: 'MetaLeft', keyCode: 91, prop: 'metaKey' });
    tip.beginInputTransactionForTests(win);
    try {
      const flags = { ctrlKey: false, altKey: false, metaKey: false, shiftKey: false };
      const modifierDown = [];
      for (const modifier of modifiers) {
        flags[modifier.prop] = true;
        modifierDown.push(tip.keydown(new win.KeyboardEvent('', { key: modifier.key, code: modifier.code, keyCode: modifier.keyCode, ...flags, bubbles: true, cancelable: true })));
      }
      const shiftDown = tip.keydown(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, ...flags, shiftKey: true, bubbles: true, cancelable: true }));
      const keyDown = tip.keydown(pEvent(win, 'P', 'KeyP', 80, { ...flags, shiftKey: true, ...extra }));
      const keyUp = tip.keyup(pEvent(win, 'P', 'KeyP', 80, { ...flags, shiftKey: true, ...extra }));
      const shiftUp = tip.keyup(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, ...flags, bubbles: true, cancelable: true }));
      const modifierUp = [];
      for (let i = modifiers.length - 1; i >= 0; i--) {
        const modifier = modifiers[i];
        modifierUp.push(tip.keyup(new win.KeyboardEvent('', { key: modifier.key, code: modifier.code, keyCode: modifier.keyCode, ...flags, bubbles: true, cancelable: true })));
        flags[modifier.prop] = false;
      }
      return {
        modifierDown,
        shiftDown,
        keyDown,
        keyUp,
        shiftUp,
        modifierUp,
      };
    } finally { tip.endInputTransaction?.(); }
  };
  const heldP = win => {
    if (!win) throw new Error('held-key target window is missing');
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const event = repeat => pEvent(win, 'P', 'KeyP', 80, { repeat });
    tip.beginInputTransactionForTests(win);
    try {
      return {
        shiftDown: tip.keydown(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true, bubbles: true, cancelable: true })),
        initial: tip.keydown(event(false)),
        repeats: [tip.keydown(event(true)), tip.keydown(event(true))],
        keyUp: tip.keyup(event(false)),
        shiftUp: tip.keyup(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, bubbles: true, cancelable: true })),
      };
    } finally { tip.endInputTransaction?.(); }
  };
  const rows = [];
  for (const kind of ['pdf', 'epub']) await ensurePausedOpen(slots[kind]);
  await waitLayout('top');
  for (const kind of ['pdf', 'epub']) {
    const m = managerOf(slots[kind]), count = m?._segments?.length || 0;
    if (count > 8) await h.setSegment(slots[kind], Math.max(2, Math.min(count - 3, Math.floor(count / 2))));
  }
  const beforeTop = snap(slots.pdf, 'top-before-reader-focus');
  const pdfManager = managerOf(slots.pdf), pdfController = pdfManager?._controller, pdfSegment = pdfManager?.activeSegment;
  const readerPress = trustedP(await focusReader(slots.pdf));
  await waitLayout('A');
  const afterA = snap(slots.pdf, 'A-after-reader-focus');
  const rawA = await pluginDiag(), rowsA = { pdf: pluginRow(slots.pdf, rawA), epub: pluginRow(slots.epub, rawA) };
  if (readerPress.keyDown !== 1 || afterA.layout !== 'A' || rowsA.pdf?.open !== true || rowsA.epub?.open !== true || afterA.active !== beforeTop.active || afterA.paused !== beforeTop.paused || afterA.voice !== beforeTop.voice || afterA.speed !== beforeTop.speed || pdfManager !== managerOf(slots.pdf) || pdfController !== managerOf(slots.pdf)?._controller || pdfSegment !== managerOf(slots.pdf)?.activeSegment) throw new Error('reader-focus cycle mismatch: ' + JSON.stringify({ readerPress, beforeTop, afterA, rowsA, managerSame: pdfManager === managerOf(slots.pdf), controllerSame: pdfController === managerOf(slots.pdf)?._controller, segmentSame: pdfSegment === managerOf(slots.pdf)?.activeSegment }));
  rows.push({ check: 'top → A from reader view', expected: 'all open fixture players A; paused session retained', observed: { press: readerPress, before: beforeTop, after: afterA, plugin: rowsA, frames: frameLayouts(), managerSame: true, controllerSame: true, segmentSame: true }, status: 'PASS' });

  const beforeB = snap(slots.pdf, 'A-before-player-focus');
  const playerPress = trustedP(await focusPlayer(slots.pdf));
  await waitLayout('B');
  const afterB = snap(slots.pdf, 'B-after-player-focus');
  const rawB = await pluginDiag(), rowsB = { pdf: pluginRow(slots.pdf, rawB), epub: pluginRow(slots.epub, rawB) };
  if (playerPress.keyDown !== 1 || afterB.layout !== 'B' || rowsB.pdf?.open !== true || rowsB.epub?.open !== true || afterB.active !== beforeB.active || afterB.paused !== beforeB.paused || afterB.voice !== beforeB.voice || afterB.speed !== beforeB.speed || pdfManager !== managerOf(slots.pdf) || pdfController !== managerOf(slots.pdf)?._controller || pdfSegment !== managerOf(slots.pdf)?.activeSegment) throw new Error('player-focus cycle mismatch: ' + JSON.stringify({ playerPress, beforeB, afterB, rowsB, managerSame: pdfManager === managerOf(slots.pdf), controllerSame: pdfController === managerOf(slots.pdf)?._controller, segmentSame: pdfSegment === managerOf(slots.pdf)?.activeSegment }));
  rows.push({ check: 'A → B from player control focus', expected: 'all open fixture players B (floating); paused session retained', observed: { press: playerPress, before: beforeB, after: afterB, plugin: rowsB, frames: frameLayouts(), managerSame: true, controllerSame: true, segmentSame: true }, status: 'PASS' });

  const playingSlot = slots.epub;
  h.select(playingSlot);
  const playingManager = managerOf(playingSlot);
  const playingController = playingManager?._controller;
  if (playingManager?.paused) {
    h.internal(playingSlot)?.toggleReadAloudPaused();
    const playing = await h.wait(() => managerOf(playingSlot)?.active && !managerOf(playingSlot)?.paused ? true : null, 5000);
    if (!playing) throw new Error('fixture did not enter playing state');
  }
  const playingBefore = snap(playingSlot, 'B-before-playing-reader-focus');
  const audioBefore = playingBefore.audio;
  await sleep(550);
  const audioAfter = snap(playingSlot, 'B-playing-audio-probe');
  const naturalMoving = !!audioBefore && !!audioAfter.audio && (audioBefore.state !== 'suspended' && (audioAfter.audio.currentTime !== audioBefore.currentTime || audioAfter.position !== playingBefore.position));
  const playingPress = trustedP(await focusReader(playingSlot));
  await waitLayout('top');
  const playingAfter = snap(playingSlot, 'top-after-playing-reader-focus');
  if (playingPress.keyDown !== 1 || !playingAfter.active || playingAfter.paused || playingAfter.voice !== playingBefore.voice || playingAfter.speed !== playingBefore.speed || playingManager !== managerOf(playingSlot) || playingController !== managerOf(playingSlot)?._controller) throw new Error('playing cycle mismatch: ' + JSON.stringify({ playingPress, playingBefore, audioAfter, playingAfter, naturalMoving }));
  rows.push({ check: 'B → top while playing', expected: 'top; playing, voice/speed and controller retained', observed: { press: playingPress, before: playingBefore, audioAfter: audioAfter.audio, naturalMoving, after: playingAfter, frames: frameLayouts(), managerSame: true, controllerSame: true }, status: 'PASS' });
  if (!managerOf(playingSlot)?.paused) {
    h.internal(playingSlot)?.toggleReadAloudPaused();
    await h.wait(() => managerOf(playingSlot)?.paused ? true : null, 5000);
  }

  await h.select(slots.pdf);
  await waitLayout('top');
  const manualBefore = Services.prefs.getStringPref(layoutPref, '');
  Zotero.ZoteroTTS.pluginPlayer.setLayout('A');
  await waitLayout('A');
  const manualPress = trustedP(await focusReader(slots.pdf));
  await waitLayout('B');
  if (manualPress.keyDown !== 1) throw new Error('manual-layout starting point key was not consumed: ' + JSON.stringify(manualPress));
  rows.push({ check: 'manual choice then Shift+P', expected: 'manual A advances to B', observed: { before: manualBefore, manual: 'A', press: manualPress, after: Services.prefs.getStringPref(layoutPref, ''), frames: frameLayouts() }, status: 'PASS' });
  Zotero.ZoteroTTS.pluginPlayer.setLayout('top');
  await waitLayout('top');

  const guard = async (name, action, expectedPref = 'top') => {
    const before = Services.prefs.getStringPref(layoutPref, '');
    const out = await action();
    await sleep(250);
    const after = Services.prefs.getStringPref(layoutPref, '');
    if (after !== before || after !== expectedPref) throw new Error(name + ' changed layout: ' + JSON.stringify({ before, after, out }));
    rows.push({ check: name, expected: 'key falls through; layout preference unchanged', observed: { before, after, out, frames: frameLayouts() }, status: 'PASS' });
  };
  await ensurePausedOpen(slots.pdf);
  await guard('closed plugin player', async () => {
    const r = readerOf(slots.pdf), ir = h.internal(slots.pdf);
    ir.toggleReadAloudPopup(false);
    await h.wait(() => !managerOf(slots.pdf)?.active ? true : null, 5000);
    await waitPluginOpen(slots.pdf, false);
    const out = trustedP(await focusReader(slots.pdf));
    await ensurePausedOpen(slots.pdf);
    return { out, managerActiveAfterClose: false };
  });
  await guard('plugin player disabled', async () => {
    const beforeEnabled = Services.prefs.getBoolPref(enabledPref, true);
    Zotero.ZoteroTTS.pluginPlayer.setEnabled(false);
    await h.wait(() => Services.prefs.getBoolPref(enabledPref, true) === false ? true : null, 3000);
    const out = trustedP(await focusReader(slots.pdf));
    Zotero.ZoteroTTS.pluginPlayer.setEnabled(beforeEnabled);
    await h.wait(() => Services.prefs.getBoolPref(enabledPref, true) === beforeEnabled ? true : null, 3000);
    return { out, enabledDuring: false, enabledAfter: beforeEnabled };
  });
  await ensurePausedOpen(slots.pdf);
  await guard('no reader context', async () => {
    try { Zotero_Tabs.select('zotero-pane'); } catch (e) {}
    await sleep(180);
    host.focus?.();
    const out = trustedP(host);
    h.select(slots.pdf);
    return { out, selectedDuring: 'zotero-pane' };
  });
  const heldBefore = Services.prefs.getStringPref(layoutPref, '');
  const held = heldP(await focusReader(slots.pdf));
  await sleep(250);
  const heldAfter = Services.prefs.getStringPref(layoutPref, '');
  if (held.initial !== 1 || heldAfter !== 'A' || held.repeats.some(value => value !== 1)) throw new Error('held Shift+P repeated the action: ' + JSON.stringify({ heldBefore, held, heldAfter, frames: frameLayouts() }));
  rows.push({ check: 'held Shift+P / repeat events', expected: 'one top → A transition; repeat keydowns consumed without another transition', observed: { heldBefore, held, heldAfter, frames: frameLayouts() }, status: 'PASS' });
  Zotero.ZoteroTTS.pluginPlayer.setLayout('top');
  await waitLayout('top');
  const extra = await guard('extra modifier Ctrl+Shift+P', async () => ({ out: trustedP(await focusReader(slots.pdf), { ctrlKey: true }) }));
  const child = childOf(slots.pdf), childDoc = child?.document;
  if (!childDoc) throw new Error('plugin child document missing for editable check');
  const input = childDoc.createElement('input'); input.type = 'search'; input.setAttribute('aria-label', 'shortcut test'); childDoc.body.appendChild(input); input.focus(); child.focus?.();
  const editableOut = trustedP(child);
  const editableLayout = Services.prefs.getStringPref(layoutPref, '');
  input.remove();
  if (editableLayout !== 'top' || editableOut.keyDown === 1) throw new Error('editable target accepted Shift+P: ' + JSON.stringify({ editableOut, editableLayout }));
  rows.push({ check: 'editable/search input', expected: 'Shift+P ignored while text input is focused', observed: { target: 'input[type=search]', out: editableOut, layout: editableLayout }, status: 'PASS' });
  const consumedWin = frameOf(slots.pdf)?.contentWindow;
  const consumedEvent = new consumedWin.KeyboardEvent('keydown', { key: 'P', code: 'KeyP', keyCode: 80, shiftKey: true, bubbles: true, cancelable: true }); consumedEvent.preventDefault(); const consumedBefore = consumedEvent.defaultPrevented; childDoc.body.dispatchEvent(consumedEvent); await sleep(180);
  const consumedLayout = Services.prefs.getStringPref(layoutPref, '');
  if (consumedLayout !== 'top') throw new Error('already-consumed event changed layout: ' + JSON.stringify({ defaultPrevented: consumedEvent.defaultPrevented, consumedLayout }));
  rows.push({ check: 'already-consumed event', expected: 'defaultPrevented Shift+P does nothing', observed: { defaultPrevented: consumedBefore, layout: consumedLayout }, status: 'PASS' });
  state.positionShortcut.cycle = rows;
  return JSON.stringify({ rows, finalLayout: Services.prefs.getStringPref(layoutPref, ''), finalEnabled: Services.prefs.getBoolPref(enabledPref, true), shortcutsSnapshot: Object.keys(state.positionShortcut.prefs).length }, null, 1);
})()
