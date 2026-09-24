// Item 8 (en-US only -- zh-CN is a source read, never a live locale switch:
// driving doc §1 says switching Zotero's locale with the settings window
// open kills Zotero): the Zotero section's note names zotero.org for
// credits, and the favorites switch reads "Offer only favorite voices in
// the player".
// params: none. state: none.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let win = Services.wm.getMostRecentWindow('zotero:pref');
  if (win) { win.close(); for (let i = 0; i < 50 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(100); }
  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  for (let i = 0; i < 50; i++) { win = Services.wm.getMostRecentWindow('zotero:pref'); if (win) break; await sleep(100); }
  await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  for (let i = 0; i < 50; i++) { if (win.document.getElementById('ztts-provider-openai-official')) break; await sleep(100); }
  const doc = win.document;
  const zoteroNote = doc.querySelector('[data-l10n-id="ztts-zotero-note"]')?.textContent?.trim() ?? null;
  const favText = doc.querySelector('[data-l10n-id="ztts-favorites-only"]')?.textContent?.trim() ?? null;
  return JSON.stringify({
    zoteroNote,
    zoteroNoteMentionsZoteroOrg: !!zoteroNote && zoteroNote.includes('zotero.org'),
    favText,
    favTextMatches: favText === 'Offer only favorite voices in the player',
    locale: Zotero.locale,
  }, null, 1);
})()
