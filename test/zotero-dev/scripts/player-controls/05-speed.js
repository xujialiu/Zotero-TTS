return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, h = state.helpers, slots = state.fixtures;
  if (!h || !slots?.pdf) throw new Error('fixture helpers are missing');
  const slot = slots.pdf, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const speedPref = 'extensions.zotero.reader.readAloudVoices', memoryPref = 'extensions.zotero.zotero-tts.readAloud.memory';
  const readerOf = target => { for (const r of Zotero.Reader?._readers || []) if (r?.itemID === target?.itemID) return r; return null; };
  const reader = readerOf(slot); if (!reader) throw new Error('PDF fixture reader is missing');
  const manager = () => reader?._internalReader?._readAloudManager || null;
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  const stored = () => {
    let memory = null, voices = {};
    try { memory = JSON.parse(Services.prefs.getStringPref(memoryPref))?.speed ?? null; } catch (e) {}
    try {
      const map = JSON.parse(Services.prefs.getStringPref(speedPref));
      for (const key of Object.keys(map || {})) if (map[key] && typeof map[key] === 'object') voices[key] = map[key].speed ?? null;
    } catch (e) {}
    return { memory, voices };
  };
  const managers = () => {
    const rows = [];
    for (const r of Zotero.Reader?._readers || []) {
      const m = r?._internalReader?._readAloudManager;
      rows.push({ itemID: r?.itemID ?? null, tabID: r?.tabID ?? null, active: !!m?.active, paused: !!m?.paused, speed: m?.speed ?? null });
    }
    return rows;
  };
  const snap = label => {
    const m = manager(), outer = reader?._iframeWindow?.document, frame = h.frame(slot), child = h.child(slot), doc = child?.document;
    const range = doc?.querySelector('.popover input[type="range"]');
    const toast = outer?.getElementById('ztts-speed-toast');
    return {
      label, at: Date.now(), selected: globalThis.Zotero_Tabs?.selectedID ?? null, hostState: host?.windowState ?? null,
      manager: { active: !!m?.active, paused: !!m?.paused, speed: m?.speed ?? null, voice: m?.selectedVoiceID || null },
      range: range ? { min: range.min, max: range.max, step: range.step, value: range.value, label: range.parentElement?.textContent?.trim() || null } : null,
      toast: toast ? { text: toast.textContent || '', opacity: toast.style.opacity || '' } : null,
      frame: { hidden: frame?.hidden ?? null, ready: !!doc?.querySelector('.player') },
      stored: stored(), managers: managers(),
    };
  };
  const selectAndFocus = async () => {
    host.windowState = 1; await sleep(300); h.select(slot); reader.focus?.(); reader._iframeWindow?.focus?.(); host.focus?.(); await sleep(150);
  };
  const openPlayer = async () => {
    await selectAndFocus();
    const frame = h.frame(slot), doc = h.doc(slot), button = doc?.getElementById('ztts-player-toggle');
    if (!button) throw new Error('plugin player toggle is missing');
    if (frame?.hidden !== false) button.click();
    const ready = await h.wait(() => h.frame(slot)?.hidden === false && h.child(slot)?.document?.querySelector('.player') ? true : null, 8000);
    if (!ready) throw new Error('plugin player did not open');
    const active = await h.wait(() => manager()?.active ? true : null, 12000);
    if (!active) throw new Error('fixture manager did not activate');
    if (manager()?.active && !manager()?.paused) manager()?.pause?.();
    await h.wait(() => manager()?.paused ? true : null, 5000);
    return snap('player-open-paused');
  };
  const closePopover = async () => {
    const child = h.child(slot); if (child?.document?.querySelector('.popover')) {
      child.document.body.dispatchEvent(new child.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await h.wait(() => !h.child(slot)?.document?.querySelector('.popover') ? true : null, 2500);
    }
  };
  const openSpeed = async () => {
    const child = h.child(slot), button = child?.document?.querySelector('[data-adjust="speed"]');
    if (!button) throw new Error('plugin player speed button is missing');
    if (!child.document.querySelector('.popover input[type="range"]')) button.click();
    const range = await h.wait(() => h.child(slot)?.document?.querySelector('.popover input[type="range"]'), 2500);
    if (!range) throw new Error('plugin player speed slider did not open');
    return range;
  };
  const setPlayerSpeed = async value => {
    const range = await openSpeed(), win = range.ownerDocument.defaultView;
    range.value = String(value);
    range.dispatchEvent(new win.Event('input', { bubbles: true, cancelable: true }));
    const moved = await h.wait(() => Math.abs(Number(manager()?.speed) - Number(value)) < 0.000001 ? true : null, 5000);
    if (!moved) throw new Error('player speed did not apply ' + value + ': ' + JSON.stringify(snap('player-speed-timeout')));
    await sleep(250);
    return { requested: value, observed: snap('player-speed-' + value) };
  };
  const press = async key => {
    await selectAndFocus();
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const code = key === 'C' ? 67 : key === 'X' ? 88 : 90;
    tip.beginInputTransactionForTests(host);
    let shiftDown = 0, keyDown = 0, keyUp = 0, shiftUp = 0;
    try {
      shiftDown = tip.keydown(new host.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true, bubbles: true, cancelable: true }));
      keyDown = tip.keydown(new host.KeyboardEvent('', { key, code: 'Key' + key, keyCode: code, shiftKey: true, bubbles: true, cancelable: true }));
      keyUp = tip.keyup(new host.KeyboardEvent('', { key, code: 'Key' + key, keyCode: code, shiftKey: true, bubbles: true, cancelable: true }));
      shiftUp = tip.keyup(new host.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, bubbles: true, cancelable: true }));
    } finally { tip.endInputTransaction?.(); }
    await sleep(350);
    return { key, shiftDown, keyDown, keyUp, shiftUp, observed: snap('key-' + key) };
  };
  const allSpeeds = (value, result) => {
    if (Math.abs(Number(result.observed.manager.speed) - value) > 0.000001 || Math.abs(Number(result.observed.stored.memory) - value) > 0.000001) return false;
    for (const key of Object.keys(result.observed.stored.voices)) if (Math.abs(Number(result.observed.stored.voices[key]) - value) > 0.000001) return false;
    return true;
  };
  const playerOpen = await openPlayer();
  const playerRange = await openSpeed();
  const playerShape = { min: playerRange.min, max: playerRange.max, step: playerRange.step, value: playerRange.value };
  const player105 = await setPlayerSpeed(1.05); await closePopover();
  if (playerShape.min !== '0.5' || playerShape.max !== '3' || playerShape.step !== '0.05' || !allSpeeds(1.05, player105)) throw new Error('player speed step/value mismatch: ' + JSON.stringify({ playerShape, player105 }));
  await setPlayerSpeed(1); await closePopover();
  const keyStart = snap('keys-before'), c1 = await press('C'), c2 = await press('C'), x = await press('X'), z = await press('Z');
  const keyRows = [{ row: c1, expected: 1.05, toast: '1.05×' }, { row: c2, expected: 1.1, toast: '1.1×' }, { row: x, expected: 1.05, toast: '1.05×' }, { row: z, expected: 1, toast: '1.0×' }];
  for (const entry of keyRows) if (entry.row.keyDown !== 1 || !allSpeeds(entry.expected, entry.row) || entry.row.observed.toast?.text !== entry.toast) throw new Error('speed shortcut mismatch: ' + JSON.stringify({ keyStart, keyRows }));
  const nonGridSet = await setPlayerSpeed(1.25); await closePopover(); const nonGrid = await press('C');
  if (!allSpeeds(1.3, nonGrid) || nonGrid.observed.toast?.text !== '1.3×') throw new Error('remembered non-grid speed mismatch: ' + JSON.stringify({ nonGridSet, nonGrid }));
  const resetAfterNonGrid = await press('Z');
  const upperSet = await setPlayerSpeed(3); await closePopover(); const upper = await press('C');
  const lowerSet = await setPlayerSpeed(.5); await closePopover(); const lower = await press('X');
  if (!allSpeeds(3, upper) || !allSpeeds(.5, lower)) throw new Error('speed bounds mismatch: ' + JSON.stringify({ upperSet, upper, lowerSet, lower }));
  await press('Z');
  const oldSettings = Services.wm.getMostRecentWindow('zotero:pref'); if (oldSettings) { oldSettings.close(); for (let i = 0; i < 100 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(50); }
  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  let settings = null; for (let i = 0; i < 160 && !(settings = Services.wm.getMostRecentWindow('zotero:pref')); i++) await sleep(50);
  if (!settings) throw new Error('Settings window did not open');
  let navigationReady = false;
  for (let i = 0; i < 160; i++) {
    try { navigationReady = !!settings.Zotero_Preferences?.navigation; } catch (e) {}
    if (navigationReady) break;
    await sleep(50);
  }
  if (!navigationReady) throw new Error('Settings navigation did not initialize');
  await settings.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  let doc = null; for (let i = 0; i < 160; i++) { if (settings.document?.getElementById('ztts-voices-speed')) { doc = settings.document; break; } await sleep(50); }
  if (!doc) throw new Error('Settings speed slider did not load');
  const slider = doc.getElementById('ztts-voices-speed'), speedValue = doc.getElementById('ztts-voices-speed-value');
  const settingsBefore = { min: slider?.min, max: slider?.max, step: slider?.step, value: slider?.value, label: speedValue?.textContent?.trim() || null };
  slider.value = '2.55'; slider.dispatchEvent(new settings.Event('input', { bubbles: true, cancelable: true })); slider.dispatchEvent(new settings.Event('change', { bubbles: true, cancelable: true }));
  await sleep(650);
  const settingsAfter = { value: slider.value, label: speedValue?.textContent?.trim() || null, manager: manager()?.speed ?? null, stored: stored() };
  if (settingsBefore.min !== '0.5' || settingsBefore.max !== '3' || settingsBefore.step !== '0.05' || settingsAfter.value !== '2.55' || !String(settingsAfter.label).startsWith('2.55') || Math.abs(Number(settingsAfter.manager) - 2.55) > 0.000001) throw new Error('Settings speed mismatch: ' + JSON.stringify({ settingsBefore, settingsAfter }));
  settings.close(); for (let i = 0; i < 120 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(50);
  await selectAndFocus(); const finalReset = await press('Z');
  state.speedVerification = { playerOpen, playerShape, player105, keyStart, keys: { c1, c2, x, z }, nonGridSet, nonGrid, resetAfterNonGrid, bounds: { upperSet, upper, lowerSet, lower }, settings: { before: settingsBefore, after: settingsAfter }, finalReset };
  return JSON.stringify(state.speedVerification, null, 1);
})()
