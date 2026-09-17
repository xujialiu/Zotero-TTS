return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, h = state.helpers, slots = state.fixtures;
  if (!h || !slots?.pdf || !slots?.epub) throw new Error('fixture helpers are missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (test, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { const value = test(); if (value) return value; await sleep(100); } return test(); };
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  if (!host) throw new Error('Zotero main window is missing');
  const PT = Components.interfaces.nsIPrefBranch;
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const cyclePref = 'extensions.zotero.zotero-tts.shortcuts.cyclePlayerLayout';
  const speedUpPref = 'extensions.zotero.zotero-tts.shortcuts.speedUp';
  const speedDownPref = 'extensions.zotero.zotero-tts.shortcuts.speedDown';
  const memoryPref = 'extensions.zotero.zotero-tts.readAloud.memory';
  const voicesPref = 'extensions.zotero.reader.readAloudVoices';
  const readPref = name => {
    const type = Services.prefs.getPrefType(name), user = Services.prefs.prefHasUserValue(name);
    let value = null;
    if (type === PT.PREF_STRING) value = Services.prefs.getStringPref(name, '');
    else if (type === PT.PREF_BOOL) value = Services.prefs.getBoolPref(name, false);
    else if (type === PT.PREF_INT) value = Services.prefs.getIntPref(name, 0);
    return { type, user, value };
  };
  const beforePrefs = {};
  for (const name of [layoutPref, cyclePref, speedUpPref, speedDownPref, memoryPref, voicesPref]) beforePrefs[name] = readPref(name);
  const originalSelected = state.baseline?.selectedTabID || state.baseline?.readers?.[0]?.tabID || null;
  const originalHost = { windowState: host.windowState, outerWidth: host.outerWidth, outerHeight: host.outerHeight, screenX: host.screenX, screenY: host.screenY };
  const frame = slot => h.frame(slot), child = slot => h.child(slot), manager = slot => h.manager(slot);
  const frameLayouts = () => ({ pdf: frame(slots.pdf)?.getAttribute?.('data-layout') || null, epub: frame(slots.epub)?.getAttribute?.('data-layout') || null });
  const ensurePausedOpen = async slot => {
    h.select(slot);
    const f = frame(slot), button = h.doc(slot)?.getElementById('ztts-player-toggle');
    if (f?.hidden !== false) {
      if (!button) throw new Error('plugin player toggle is missing for ' + slot.itemID);
      button.click();
      const mounted = await wait(() => frame(slot)?.hidden === false && child(slot)?.document?.querySelector('.player') ? true : null, 10000);
      if (!mounted) throw new Error('plugin player did not open for ' + slot.itemID);
    }
    if (!manager(slot)?.active) {
      const active = await wait(() => manager(slot)?.active ? true : null, 10000);
      if (!active) throw new Error('manager did not activate for ' + slot.itemID);
    }
    if (!manager(slot)?.paused) {
      h.internal(slot)?.toggleReadAloudPaused();
      const paused = await wait(() => manager(slot)?.paused ? true : null, 5000);
      if (!paused) throw new Error('manager did not pause for ' + slot.itemID);
    }
  };
  const focusReader = async slot => { h.select(slot); const r = h.reader(slot); r?.focus?.(); r?._iframeWindow?.focus?.(); host.focus?.(); await sleep(140); return host; };
  const focusPlayer = async slot => { h.select(slot); const f = frame(slot), c = child(slot), target = c?.document?.querySelector('.options-toggle') || c?.document?.body; target?.focus?.(); f?.contentWindow?.focus?.(); host.focus?.(); await sleep(140); return host; };
  const key = (win, value, code, keyCode, repeat = false) => new win.KeyboardEvent('', { key: value, code, keyCode, shiftKey: true, repeat, bubbles: true, cancelable: true });
  const observedHeld = (win, value, code, keyCode, repeats = 2) => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const seen = [], listener = event => { if (event.code === code) seen.push({ key: event.key, code: event.code, repeat: !!event.repeat, defaultPrevented: !!event.defaultPrevented }); };
    win.addEventListener('keydown', listener, true);
    tip.beginInputTransactionForTests(win);
    try {
      const shiftDown = tip.keydown(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true, bubbles: true, cancelable: true }));
      const initial = tip.keydown(key(win, value, code, keyCode, false)), repeated = [];
      for (let i = 0; i < repeats; i++) repeated.push(tip.keydown(key(win, value, code, keyCode, true)));
      const keyUp = tip.keyup(key(win, value, code, keyCode, false));
      const shiftUp = tip.keyup(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, bubbles: true, cancelable: true }));
      return { shiftDown, initial, repeated, keyUp, shiftUp, seen };
    } finally { tip.endInputTransaction?.(); win.removeEventListener('keydown', listener, true); }
  };
  const observedSingle = (win, value, code, keyCode) => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const seen = [], listener = event => { if (event.code === code) seen.push({ key: event.key, code: event.code, repeat: !!event.repeat, defaultPrevented: !!event.defaultPrevented }); };
    win.addEventListener('keydown', listener, true); tip.beginInputTransactionForTests(win);
    try {
      const shiftDown = tip.keydown(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true, bubbles: true, cancelable: true }));
      const keyDown = tip.keydown(key(win, value, code, keyCode, false)), keyUp = tip.keyup(key(win, value, code, keyCode, false));
      const shiftUp = tip.keyup(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, bubbles: true, cancelable: true }));
      return { shiftDown, keyDown, keyUp, shiftUp, seen };
    } finally { tip.endInputTransaction?.(); win.removeEventListener('keydown', listener, true); }
  };
  const setSpeed = async (slot, value) => { const m = manager(slot); if (!m?.active) throw new Error('manager is not active'); m.setSpeed(value, false); await sleep(220); if (Number(m?.speed) !== value) throw new Error('unable to set speed to ' + value); };
  const rows = [];
  let completed = false;
  try {
    try { host.maximize?.(); host.focus?.(); } catch (e) {}
    await sleep(250);
    const slot = slots.pdf;
    await ensurePausedOpen(slot); await setSpeed(slot, 1);
    const beforeReader = { active: !!manager(slot)?.active, paused: !!manager(slot)?.paused, speed: Number(manager(slot)?.speed) };
    const readerHeld = observedHeld(await focusReader(slot), 'C', 'KeyC', 67); await sleep(380);
    const afterReader = { active: !!manager(slot)?.active, paused: !!manager(slot)?.paused, speed: Number(manager(slot)?.speed) };
    if (!beforeReader.active || !beforeReader.paused || !afterReader.active || !afterReader.paused || Math.abs(afterReader.speed - 1.15) > 0.000001 || readerHeld.seen.map(e => e.repeat).join(',') !== 'false,true,true') throw new Error('paused reader held C mismatch: ' + JSON.stringify({ beforeReader, readerHeld, afterReader }));
    rows.push({ check: 'paused held Shift+C from PDF reader focus', expected: 'paused remains true; observed key repeats false,true,true; speed 1 → 1.15', observed: { before: beforeReader, events: readerHeld, after: afterReader }, status: 'PASS' });

    await setSpeed(slot, 1);
    const beforePlayer = { active: !!manager(slot)?.active, paused: !!manager(slot)?.paused, speed: Number(manager(slot)?.speed) };
    const playerHeld = observedHeld(await focusPlayer(slot), 'X', 'KeyX', 88); await sleep(380);
    const afterPlayer = { active: !!manager(slot)?.active, paused: !!manager(slot)?.paused, speed: Number(manager(slot)?.speed) };
    if (!beforePlayer.active || !beforePlayer.paused || !afterPlayer.active || !afterPlayer.paused || Math.abs(afterPlayer.speed - 0.85) > 0.000001 || playerHeld.seen.map(e => e.repeat).join(',') !== 'false,true,true') throw new Error('paused player held X mismatch: ' + JSON.stringify({ beforePlayer, playerHeld, afterPlayer }));
    rows.push({ check: 'paused held Shift+X from PDF player control focus', expected: 'paused remains true; observed key repeats false,true,true; speed 1 → 0.85', observed: { before: beforePlayer, events: playerHeld, after: afterPlayer }, status: 'PASS' });

    await ensurePausedOpen(slot); await setSpeed(slot, 1);
    const originalCycle = Services.prefs.getStringPref(cyclePref, '');
    Zotero.ZoteroTTS.pluginPlayer.setLayout('top'); await wait(() => Services.prefs.getStringPref(layoutPref, '') === 'top' && frameLayouts().pdf === 'top' && frameLayouts().epub === 'top' ? true : null, 5000);
    Services.prefs.setStringPref(cyclePref, 'Shift+L'); await sleep(120);
    const oldP = observedSingle(await focusReader(slot), 'P', 'KeyP', 80); await sleep(250);
    const oldLayout = Services.prefs.getStringPref(layoutPref, ''), oldSeen = oldP.seen.map(e => e.repeat);
    if (oldP.keyDown !== 0 || oldLayout !== 'top' || oldSeen.join(',') !== 'false') throw new Error('old Shift+P acted while Shift+L was rebound: ' + JSON.stringify({ originalCycle, oldP, oldLayout, oldSeen }));
    const remapL = observedSingle(await focusReader(slot), 'L', 'KeyL', 76); await wait(() => Services.prefs.getStringPref(layoutPref, '') === 'A' && frameLayouts().pdf === 'A' && frameLayouts().epub === 'A' ? true : null, 5000);
    if (remapL.keyDown !== 1) throw new Error('active Shift+L did not cycle layout: ' + JSON.stringify({ remapL, layout: Services.prefs.getStringPref(layoutPref, '') }));
    rows.push({ check: 'old Shift+P falls through while Shift+L is active', expected: 'old key returns keyDown 0 and leaves top; Shift+L returns keyDown 1 and reaches A', observed: { activeBinding: 'Shift+L', oldP: { keyDown: oldP.keyDown, seen: oldP.seen, layout: oldLayout }, remapL: { keyDown: remapL.keyDown, seen: remapL.seen, layout: Services.prefs.getStringPref(layoutPref, ''), frames: frameLayouts() }, originalCycle }, status: 'PASS' });
    Services.prefs.setStringPref(cyclePref, originalCycle);
    completed = true;
  } finally {
    // This supplement owns its disposable fixtures and restores every pref it
    // touches, including the reader voice map before writing memory last.
    const ids = []; for (const kind of ['pdf', 'epub']) if (slots[kind]?.itemID) ids.push(slots[kind].itemID);
    for (const id of ids) for (const reader of Zotero.Reader?._readers || []) if (reader?.itemID === id) {
      try { reader._internalReader?.toggleReadAloudPopup(false); } catch (e) {}
      try { const pending = reader.close?.(); if (pending?.then) await pending; } catch (e) {}
    }
    for (let i = 0; i < 180; i++) { let present = false; for (const reader of Zotero.Reader?._readers || []) if (ids.includes(reader?.itemID)) present = true; if (!present) break; await sleep(50); }
    for (const id of ids) { try { const item = Zotero.Items.get(id); if (item) await item.eraseTx(); } catch (e) {} }
    const restore = (name, saved) => { if (!saved?.user) { if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name); } else if (saved.type === PT.PREF_STRING) Services.prefs.setStringPref(name, String(saved.value)); else if (saved.type === PT.PREF_BOOL) Services.prefs.setBoolPref(name, !!saved.value); else if (saved.type === PT.PREF_INT) Services.prefs.setIntPref(name, Number(saved.value)); };
    for (const name of [layoutPref, cyclePref, speedUpPref, speedDownPref]) restore(name, beforePrefs[name]);
    restore(voicesPref, beforePrefs[voicesPref]); restore(memoryPref, beforePrefs[memoryPref]);
    if (originalSelected) { try { Zotero_Tabs.select(originalSelected); } catch (e) {} }
    const settings = Services.wm.getMostRecentWindow('zotero:pref'); if (settings) settings.close();
    try { host.resizeTo?.(originalHost.outerWidth, originalHost.outerHeight); host.moveTo?.(originalHost.screenX, originalHost.screenY); } catch (e) {}
    await sleep(500); try { host.minimize?.(); } catch (e) {} for (let i = 0; i < 60 && host.windowState !== 2; i++) await sleep(50);
  }
  if (!completed) throw new Error('supplement did not complete');
  state.playerKeySupplement = { rows, scope: { format: 'PDF', readerFocus: true, playerControlFocus: true, pausedAsserted: true, observedRepeatListener: true } };
  return JSON.stringify({ rows, scope: state.playerKeySupplement.scope }, null, 1);
})()
