// Item 8: Zotero's own Highlight current menulist is greyed while the
// plugin runs. A window opened on the Zotero-TTS pane first reads
// {found:false} until General is shown (MutationObserver route); forcing
// the pick through the binding writes the pref, which the pin snaps back.
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const levels = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels());

  // Fresh window, opened on the plugin's OWN pane first (not General)
  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  await sleep(400);
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  const until1 = Date.now() + 5000;
  while (!win.document.getElementById('ztts-openai-server') && Date.now() < until1) await sleep(150);
  const onTtsPane = levels().menu.windows.at(-1);

  // Zotero's own General pane id (found live: the richlistitem's value)
  await win.Zotero_Preferences.navigateToPane('zotero-prefpane-general');
  const until2 = Date.now() + 5000;
  while (!win.document.getElementById('read-aloud-highlight-granularity-menulist') && Date.now() < until2) await sleep(150);
  await sleep(150);
  const onGeneral = levels().menu.windows.at(-1);

  const menulist = win.document.getElementById('read-aloud-highlight-granularity-menulist');
  const menulistReport = { disabled: menulist.getAttribute('disabled'), tooltip: menulist.getAttribute('tooltiptext'), value: menulist.value };

  // Force the pick through the binding
  const snapBefore = levels().pin.snapped;
  menulist.value = 'sentence';
  menulist.dispatchEvent(new win.Event('command', { bubbles: true }));
  await sleep(150);
  const afterForce = { prefRightAfter: Zotero.Prefs.get('reader.readAloud.highlightGranularity'), menulistValue: menulist.value, pinSnapped: levels().pin.snapped, snappedIncreased: levels().pin.snapped === snapBefore + 1 };

  return JSON.stringify({ onTtsPane, onGeneral, menulistReport, afterForce }, null, 1);
})();
