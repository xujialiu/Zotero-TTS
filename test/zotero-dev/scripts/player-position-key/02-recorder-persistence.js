return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, h = state.helpers, slots = state.fixtures;
  if (!h || !slots?.pdf || !state.positionShortcut?.prefs) throw new Error('position shortcut state is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const shortcutPref = action => 'extensions.zotero.zotero-tts.shortcuts.' + action;
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  if (!host) throw new Error('Zotero main window is missing');
  const wait = async (test, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const value = test(); if (value) return value; await sleep(100); }
    return test();
  };
  const frameLayouts = () => ({ pdf: h.frame(slots.pdf)?.getAttribute?.('data-layout') || null, epub: h.frame(slots.epub)?.getAttribute?.('data-layout') || null });
  const waitLayout = async expected => {
    const ok = await wait(() => { const f = frameLayouts(); return f.pdf === expected && f.epub === expected && Services.prefs.getStringPref(layoutPref, '') === expected ? true : null; }, 7000);
    if (!ok) throw new Error('layout did not settle at ' + expected + ': ' + JSON.stringify({ pref: Services.prefs.getStringPref(layoutPref, ''), frames: frameLayouts() }));
    await sleep(120);
  };
  const trusted = (win, key, code, keyCode) => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = win.KeyboardEvent, ev = (k, c, n, shift = false) => new K('', { key: k, code: c, keyCode: n, shiftKey: shift, bubbles: true, cancelable: true });
    tip.beginInputTransactionForTests(win);
    try {
      return { shiftDown: tip.keydown(ev('Shift', 'ShiftLeft', 16, true)), keyDown: tip.keydown(ev(key, code, keyCode, true)), keyUp: tip.keyup(ev(key, code, keyCode, true)), shiftUp: tip.keyup(ev('Shift', 'ShiftLeft', 16)) };
    } finally { tip.endInputTransaction?.(); }
  };
  const closeSettings = async () => {
    const old = Services.wm.getMostRecentWindow('zotero:pref');
    if (!old) return;
    old.close();
    for (let i = 0; i < 120 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(50);
    if (Services.wm.getMostRecentWindow('zotero:pref')) throw new Error('Settings window did not close');
  };
  const openSettings = async () => {
    await closeSettings();
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win = null;
    for (let i = 0; i < 160 && !(win = Services.wm.getMostRecentWindow('zotero:pref')); i++) await sleep(50);
    if (!win) throw new Error('Settings window did not open');
    let navigation = false;
    for (let i = 0; i < 160; i++) { try { navigation = !!win.Zotero_Preferences?.navigation; } catch (e) {} if (navigation) break; await sleep(50); }
    if (!navigation) throw new Error('Settings navigation did not initialize');
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    let doc = null;
    for (let i = 0; i < 160; i++) { if (win.document?.getElementById('ztts-key-cyclePlayerLayout')) { doc = win.document; break; } await sleep(50); }
    if (!doc) throw new Error('plugin Settings pane did not load');
    return { win, doc };
  };
  const record = async (settings, action, key, code, keyCode) => {
    const button = settings.doc.getElementById('ztts-key-' + action);
    if (!button) throw new Error('shortcut button missing: ' + action);
    button.click();
    const recording = await wait(() => button.classList?.contains('ztts-recording') ? true : null, 1500);
    if (!recording) throw new Error('shortcut recorder did not start: ' + action);
    settings.win.focus?.(); await sleep(120);
    const input = trusted(settings.win, key, code, keyCode);
    const value = 'Shift+' + key;
    const written = await wait(() => Services.prefs.getStringPref(shortcutPref(action), '') === value ? true : null, 2500);
    if (!written) throw new Error('shortcut was not recorded: ' + JSON.stringify({ action, input, value: Services.prefs.getStringPref(shortcutPref(action), '') }));
    return { input, pref: Services.prefs.getStringPref(shortcutPref(action), ''), label: button.getAttribute('label') || button.label || null, message: settings.doc.getElementById('ztts-key-message')?.textContent || '' };
  };
  const rows = [];
  const settings = await openSettings();
  const layoutSelect = settings.doc.getElementById('ztts-player-layout'), layoutLabel = settings.doc.getElementById('ztts-player-layout-label');
  const keyButton = settings.doc.getElementById('ztts-key-cyclePlayerLayout'), keyLabel = settings.doc.querySelector('label[data-l10n-id="ztts-key-player-position"]');
  const help = keyButton?.parentElement?.querySelector('.ztts-help');
  const paneRow = keyLabel?.parentElement;
  const settingsInitial = { layout: layoutSelect?.value || null, layoutLabel: layoutLabel?.textContent?.trim() || null, shortcut: keyButton?.getAttribute('label') || keyButton?.label || null, rowLabel: keyLabel?.getAttribute('value') || keyLabel?.value || keyLabel?.textContent?.trim() || null, help: help?.getAttribute('help') || null };
  if (settingsInitial.layout !== Services.prefs.getStringPref(layoutPref, '') || settingsInitial.shortcut !== 'Shift+P' || settingsInitial.rowLabel !== 'Player position' || !settingsInitial.help) throw new Error('Settings player-position row mismatch: ' + JSON.stringify(settingsInitial));
  rows.push({ check: 'Settings label and help', expected: 'Player position row shows Shift+P and localized help; layout agrees with preference', observed: settingsInitial, status: 'PASS' });
  Zotero.ZoteroTTS.pluginPlayer.setLayout('B');
  await waitLayout('B');
  const settingsB = await wait(() => layoutSelect?.value === 'B' ? true : null, 3000);
  if (!settingsB || layoutLabel?.getAttribute('data-l10n-id') !== 'ztts-player-floating') throw new Error('Settings did not follow manual B choice: ' + JSON.stringify({ value: layoutSelect?.value, label: layoutLabel?.textContent, l10n: layoutLabel?.getAttribute('data-l10n-id'), frames: frameLayouts() }));
  rows.push({ check: 'Settings/manual layout agreement', expected: 'manual B updates Settings and both open frames', observed: { value: layoutSelect.value, label: layoutLabel.textContent?.trim() || null, l10n: layoutLabel.getAttribute('data-l10n-id'), frames: frameLayouts() }, status: 'PASS' });
  const remap = await record(settings, 'cyclePlayerLayout', 'L', 'KeyL', 76);
  rows.push({ check: 'record a new Player position key', expected: 'Shift+L is written and shown immediately', observed: remap, status: 'PASS' });
  await closeSettings();
  Zotero.ZoteroTTS.pluginPlayer.setLayout('top'); await waitLayout('top');
  h.select(slots.pdf); host.focus?.(); await sleep(150);
  const remapPress = trusted(host, 'L', 'KeyL', 76); await waitLayout('A');
  if (remapPress.keyDown !== 1) throw new Error('remapped Player position key was not consumed: ' + JSON.stringify(remapPress));
  rows.push({ check: 'remapped key works immediately', expected: 'Shift+L advances top → A without reinstall', observed: { press: remapPress, layout: Services.prefs.getStringPref(layoutPref, ''), frames: frameLayouts() }, status: 'PASS' });

  const conflictSettings = await openSettings();
  const speedBefore = Services.prefs.getStringPref(shortcutPref('speedUp'), '');
  const speedButton = conflictSettings.doc.getElementById('ztts-key-speedUp'); speedButton.click();
  const conflictRecording = await wait(() => speedButton.classList?.contains('ztts-recording') ? true : null, 1500);
  if (!conflictRecording) throw new Error('speed recorder did not start for conflict check');
  conflictSettings.win.focus?.(); await sleep(120); const conflictInput = trusted(conflictSettings.win, 'L', 'KeyL', 76);
  const conflictMessage = await wait(() => { const text = conflictSettings.doc.getElementById('ztts-key-message')?.textContent || ''; return text ? text : null; }, 2000);
  const conflictValue = Services.prefs.getStringPref(shortcutPref('speedUp'), '');
  if (!conflictMessage?.includes('Player position') || conflictValue !== speedBefore) throw new Error('conflict did not name Player position: ' + JSON.stringify({ conflictInput, message: conflictMessage, speedBefore, conflictValue }));
  rows.push({ check: 'shortcut conflict names Player position', expected: 'conflict message names Player position and leaves Faster binding unchanged', observed: { input: conflictInput, message: conflictMessage, speedBefore, speedAfter: conflictValue }, status: 'PASS' });
  const clear = conflictSettings.doc.getElementById('ztts-key-clear-cyclePlayerLayout'); clear.click();
  const cleared = await wait(() => Services.prefs.getStringPref(shortcutPref('cyclePlayerLayout'), '') === '' ? true : null, 2000);
  if (!cleared) throw new Error('Clear did not remove Player position binding');
  await closeSettings();
  Zotero.ZoteroTTS.pluginPlayer.setLayout('A'); await waitLayout('A');
  h.select(slots.pdf); host.focus?.(); await sleep(150);
  const oldPress = trusted(host, 'P', 'KeyP', 80), newPress = trusted(host, 'L', 'KeyL', 76); await sleep(300);
  if (oldPress.keyDown === 1 || newPress.keyDown === 1 || Services.prefs.getStringPref(layoutPref, '') !== 'A') throw new Error('cleared Player position binding still acted: ' + JSON.stringify({ oldPress, newPress, layout: Services.prefs.getStringPref(layoutPref, '') }));
  rows.push({ check: 'Clear disables Player position shortcut', expected: 'Shift+P and remapped Shift+L both fall through after Clear', observed: { oldPress, newPress, layout: Services.prefs.getStringPref(layoutPref, '') }, status: 'PASS' });
  const defaultsSettings = await openSettings();
  const defaultsButton = defaultsSettings.doc.getElementById('ztts-key-defaults'); defaultsButton.click();
  const restoredDefault = await wait(() => Services.prefs.getStringPref(shortcutPref('cyclePlayerLayout'), '') === 'Shift+P' ? true : null, 2500);
  const defaultBindings = {}; for (const action of Object.keys(state.positionShortcut.prefs).filter(name => name.includes('.shortcuts.'))) defaultBindings[action.slice(action.lastIndexOf('.') + 1)] = Services.prefs.getStringPref(action, '');
  if (!restoredDefault) throw new Error('Restore defaults did not restore Shift+P: ' + JSON.stringify({ defaultBindings }));
  rows.push({ check: 'Restore default shortcuts', expected: 'Player position returns to Shift+P and all rows refresh', observed: { cyclePlayerLayout: Services.prefs.getStringPref(shortcutPref('cyclePlayerLayout'), ''), label: defaultsSettings.doc.getElementById('ztts-key-cyclePlayerLayout')?.getAttribute('label') || null, bindingCount: Object.keys(defaultBindings).length }, status: 'PASS' });
  await closeSettings();

  Zotero.ZoteroTTS.pluginPlayer.setLayout('B'); await waitLayout('B');
  const pdf = h.reader(slots.pdf), ir = h.internal(slots.pdf);
  h.select(slots.pdf); ir?.toggleReadAloudPopup(false); await wait(() => !h.manager(slots.pdf)?.active ? true : null, 5000); await wait(() => h.frame(slots.pdf)?.hidden !== false ? true : null, 5000);
  const reopenButton = h.doc(slots.pdf)?.getElementById('ztts-player-toggle'); if (!reopenButton) throw new Error('player reopen button is missing');
  reopenButton.click();
  const reopened = await wait(() => h.frame(slots.pdf)?.hidden === false && h.child(slots.pdf)?.document?.querySelector('.player') && h.manager(slots.pdf)?.active ? true : null, 10000);
  if (!reopened) throw new Error('player did not reopen after manual B: ' + JSON.stringify({ hidden: h.frame(slots.pdf)?.hidden, active: !!h.manager(slots.pdf)?.active }));
  if (!h.manager(slots.pdf)?.paused) { ir.toggleReadAloudPaused(); await wait(() => h.manager(slots.pdf)?.paused ? true : null, 5000); }
  const reopenEvidence = { pref: Services.prefs.getStringPref(layoutPref, ''), user: Services.prefs.prefHasUserValue(layoutPref), frames: frameLayouts(), pdfHidden: h.frame(slots.pdf)?.hidden, pdfOpen: !!h.manager(slots.pdf)?.active, epubOpen: !!h.manager(slots.epub)?.active };
  if (reopenEvidence.pref !== 'B' || !reopenEvidence.user || reopenEvidence.frames.pdf !== 'B' || reopenEvidence.frames.epub !== 'B' || !reopenEvidence.pdfOpen || !reopenEvidence.epubOpen) throw new Error('manual B did not persist across close/reopen: ' + JSON.stringify(reopenEvidence));
  state.positionShortcut.persistence = { manual: 'B', user: reopenEvidence.user, reopen: reopenEvidence };
  rows.push({ check: 'manual layout persists across player close/reopen', expected: 'B and user value survive, both open players agree after reopen', observed: reopenEvidence, status: 'PASS' });
  return JSON.stringify({ rows, remapped: 'Shift+L', cleared: true, restoredDefault: Services.prefs.getStringPref(shortcutPref('cyclePlayerLayout'), ''), finalLayout: Services.prefs.getStringPref(layoutPref, '') }, null, 1);
})()
