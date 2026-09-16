return (async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const p = Services.prefs;
  const modeName = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const keepName = 'extensions.zotero.zotero-tts.readAloud.keepFollowingWhileVisible';
  const read = name => {
    const type = p.getPrefType(name);
    const user = p.prefHasUserValue(name);
    let value = null;
    try {
      if (type === p.PREF_BOOL) value = p.getBoolPref(name);
      else if (type === p.PREF_STRING) value = p.getStringPref(name);
    } catch (e) {}
    return { type, user, value };
  };
  const restore = (name, saved) => {
    if (!saved?.user) { if (p.prefHasUserValue(name)) p.clearUserPref(name); return; }
    if (saved.type === p.PREF_BOOL) p.setBoolPref(name, !!saved.value);
    else if (saved.type === p.PREF_STRING) p.setStringPref(name, String(saved.value));
  };
  const original = { mode: read(modeName), keep: read(keepName) };
  let window = Services.wm.getMostRecentWindow('zotero:pref');
  let openError = null;
  if (!window) {
    try { Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top'); }
    catch (e) { openError = String(e); }
    for (let i = 0; i < 120 && !window; i++) { await sleep(50); window = Services.wm.getMostRecentWindow('zotero:pref'); }
  }
  if (!window) return JSON.stringify({ window: false, openError });
  let navigateError = null;
  try { await window.Zotero_Preferences.navigateToPane('zotero-tts-pane'); }
  catch (e) { navigateError = String(e); }
  let radio = null, keep = null;
  for (let i = 0; i < 100; i++) {
    radio = window.document.getElementById('ztts-auto-scroll-mode');
    keep = window.document.getElementById('ztts-keep-following-visible');
    if (radio && keep) break;
    await sleep(50);
  }
  if (!radio || !keep) return JSON.stringify({ window: true, navigateError, controls: false });
  const rowHelp = value => {
    const radioNode = radio.querySelector(`radio[value="${value}"]`);
    const row = radioNode?.parentElement;
    const help = row?.querySelector('.ztts-help');
    return { label: radioNode?.getAttribute('label') || radioNode?.label || null, help: help?.getAttribute('help') || null, helpText: String(help?.textContent || '').trim() || null };
  };
  const state = () => ({ mode: p.getStringPref(modeName, 'sentence'), modeUser: p.prefHasUserValue(modeName), keep: !!keep.checked, keepPref: p.getBoolPref(keepName, true), keepUser: p.prefHasUserValue(keepName) });
  const before = state();
  let clickError = null;
  const toggles = [];
  try {
    radio.querySelector('radio[value="outside"]')?.click(); await sleep(160); toggles.push(state());
    radio.querySelector('radio[value="sentence"]')?.click(); await sleep(160); toggles.push(state());
    keep.click(); await sleep(160); toggles.push(state());
    keep.click(); await sleep(160); toggles.push(state());
  } catch (e) { clickError = String(e); }
  const controls = {
    mode: ['sentence', 'outside'].map(value => ({ value, checked: !!radio.querySelector(`radio[value="${value}"]`)?.selected, help: rowHelp(value) })),
    keep: { checked: !!keep.checked, label: keep.getAttribute('label') || keep.label || null,
      help: keep.parentElement?.querySelector('.ztts-help')?.getAttribute('help') || null },
  };
  restore(modeName, original.mode); restore(keepName, original.keep); await sleep(160);
  let closeError = null;
  try { window.close(); } catch (e) { closeError = String(e); }
  for (let i = 0; i < 100 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(50);
  return JSON.stringify({ window: true, navigateError, controls, before, toggles, restored: state(), clickError, closeError, settingsClosed: !Services.wm.getMostRecentWindow('zotero:pref'), openError });
})()
