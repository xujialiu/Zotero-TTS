return (async () => {
  const name = 'extensions.zotero.zotero-tts.readAloud.keepFollowingWhileVisible';
  const baseline = Zotero.__ztts100Baseline;
  const original = baseline?.prefs?.['readAloud.keepFollowingWhileVisible'];
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) throw new Error('preferences window is missing');
  try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) {}
  let checkbox = null;
  for (let i = 0; i < 80; i++) {
    checkbox = win.document.getElementById('ztts-keep-following-visible');
    if (checkbox) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!checkbox) throw new Error('keep-following checkbox is missing');
  const help = win.document.querySelector('label[data-l10n-id="ztts-help-keep-following-visible"]');
  const readers = () => (Zotero.Reader._readers ?? []).map(r => {
    const m = r?._internalReader?._readAloudManager;
    return { itemID: r?.itemID ?? null, active: !!m?.active, paused: !!m?.paused, selected: m?.selectedVoiceID ?? null, position: m?._controller?._position ?? null };
  });
  const beforeReaders = readers();
  const before = { checked: !!checkbox.checked, pref: Zotero.Prefs.get('zotero-tts.readAloud.keepFollowingWhileVisible'), user: Services.prefs.prefHasUserValue(name) };
  checkbox.click();
  await new Promise(resolve => setTimeout(resolve, 180));
  const off = { checked: !!checkbox.checked, pref: Zotero.Prefs.get('zotero-tts.readAloud.keepFollowingWhileVisible'), user: Services.prefs.prefHasUserValue(name) };
  checkbox.click();
  await new Promise(resolve => setTimeout(resolve, 180));
  const on = { checked: !!checkbox.checked, pref: Zotero.Prefs.get('zotero-tts.readAloud.keepFollowingWhileVisible'), user: Services.prefs.prefHasUserValue(name) };
  if (original?.user) {
    if (typeof original.value === 'boolean') Services.prefs.setBoolPref(name, original.value);
  } else if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name);
  await new Promise(resolve => setTimeout(resolve, 180));
  const restored = { checked: !!checkbox.checked, pref: Zotero.Prefs.get('zotero-tts.readAloud.keepFollowingWhileVisible'), user: Services.prefs.prefHasUserValue(name) };
  const afterReaders = readers();
  const helpText = help?.getAttribute('help') ?? help?.textContent ?? null;
  return JSON.stringify({
    checkbox: { id: checkbox.id, preference: checkbox.getAttribute('preference'), label: checkbox.getAttribute('label') ?? checkbox.textContent ?? null },
    help: { id: help?.id ?? null, text: helpText, hasCompleteDisappearance: /entire sentence highlight leaves the view/i.test(String(helpText)), hasPartialVisibility: /visible part keeps following/i.test(String(helpText)), hasInputWait: /waits while you move/i.test(String(helpText)), hasOffBehavior: /turn this off/i.test(String(helpText)) },
    before, off, on, restored, readersUnchanged: JSON.stringify(beforeReaders) === JSON.stringify(afterReaders), readerBefore: beforeReaders, readerAfter: afterReaders,
  });
})()
