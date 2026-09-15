// Item 7: the voice browser's first column. Opens Settings -> Zotero-TTS,
// reads #ztts-voices-tiers' children (name, count, selected -- selected is
// the inline style voice-browser-rows.ts's columnEntry sets, not a class),
// then diagnostics.defaultVoice() and diagnostics.languageColumn() from the
// sandbox. Also captures providerTiers()/patches() "before reload" for item
// 8, since the fixture reader is untouched by this script.
// params: none (reads state.fixture). state: writes patchesBeforeReload.
(async () => {
  const out = { step: 'voice-browser' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let win = null;
  try {
    const open = () => Services.wm.getMostRecentWindow('zotero:pref');
    out.hadOpenWindow = !!open();
    if (open()) {
      open().close();
      const t = Date.now();
      while (open() && Date.now() - t < 10000) await sleep(200);
    }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      win = open();
      if (win && win.Zotero_Preferences) break;
      await sleep(200);
    }
    if (!win || !win.Zotero_Preferences) throw new Error('the settings window never opened');
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const doc = win.document;
    const t1 = Date.now();
    while (Date.now() - t1 < 20000 && !doc.getElementById('ztts-provider-openai-official')) await sleep(200);
    out.paneLoaded = !!doc.getElementById('ztts-provider-openai-official');
    if (!out.paneLoaded) throw new Error('the pane never loaded');

    // The status line can read "Listing voices..." transiently
    const status = doc.querySelector('#ztts-voices-status, .ztts-voices-status');
    const t2 = Date.now();
    while (status && /listing/i.test(status.textContent || '') && Date.now() - t2 < 15000) await sleep(150);

    const column = doc.getElementById('ztts-voices-tiers');
    if (!column) throw new Error('#ztts-voices-tiers not found');
    out.tierRows = Array.from(column.children).map((el) => {
      const style = el.getAttribute('style') || '';
      return {
        text: el.textContent,
        selected: style.includes('SelectedItem'),
        empty: style.includes('opacity: 0.5'),
      };
    });
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  try {
    out.defaultVoice = JSON.parse(await Zotero.ZoteroTTS.diagnostics.defaultVoice());
  } catch (e) {
    out.defaultVoiceError = String(e);
  }
  try {
    const lc = JSON.parse(await Zotero.ZoteroTTS.diagnostics.languageColumn());
    out.languageColumn = { favoritesOnly: lc.favoritesOnly, zoteroError: lc.zoteroError, readers: lc.readers };
  } catch (e) {
    out.languageColumnError = String(e);
  }
  try {
    const w = Services.wm.getMostRecentWindow('zotero:pref');
    if (w) {
      w.close();
      const t = Date.now();
      while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t < 10000) await sleep(200);
    }
    out.windowClosed = !Services.wm.getMostRecentWindow('zotero:pref');
  } catch (e) {
    out.closeError = String(e);
  }
  try {
    out.patchesBeforeReload = JSON.parse(await Zotero.ZoteroTTS.diagnostics.patches()).providerTiers;
    S.patchesBeforeReload = out.patchesBeforeReload;
  } catch (e) {
    out.patchesBeforeReloadError = String(e);
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out);
})();
