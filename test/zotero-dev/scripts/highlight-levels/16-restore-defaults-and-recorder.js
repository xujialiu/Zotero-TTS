// Item 10 (Restore default colors, with Sentence off and a color changed)
// and 4.10's recorder row (the Word highlight on/off shortcut row: its
// position, its "?" tip, Clear/Restore, and a Shift+W collision).
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let win = Services.wm.getMostRecentWindow('zotero:pref');
  if (win) {
    win.close();
    const until = Date.now() + 5000;
    while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() < until) await sleep(100);
  }
  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  await sleep(400);
  win = Services.wm.getMostRecentWindow('zotero:pref');
  await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  const until2 = Date.now() + 5000;
  while (!win.document.getElementById('ztts-openai-server') && Date.now() < until2) await sleep(150);
  const d = win.document;
  const levels = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels());

  // --- Item 10 ---
  const sentenceCb = d.getElementById('ztts-highlight-sentence');
  const wordCb = d.getElementById('ztts-highlight-word');
  const setChecked = (cb, value) => {
    cb.checked = value;
    cb.dispatchEvent(new win.Event('command', { bubbles: true }));
  };
  setChecked(sentenceCb, false);
  const wordColorInput = d.getElementById('ztts-highlight-wordColor');
  wordColorInput.value = '#00ff00';
  wordColorInput.dispatchEvent(new win.Event('input', { bubbles: true }));
  wordColorInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  await sleep(150);
  const beforeRestore = {
    switches: levels().switches,
    wordColor: Zotero.Prefs.get('zotero-tts.highlight.wordColor'),
    sentenceChecked: sentenceCb.checked,
    sentenceDisabled: sentenceCb.hasAttribute('disabled'),
  };

  d.getElementById('ztts-highlight-defaults').dispatchEvent(new win.Event('command', { bubbles: true }));
  await sleep(200);
  const afterRestore = {
    prefs: {
      wordColor: Zotero.Prefs.get('zotero-tts.highlight.wordColor'),
      wordAlpha: Zotero.Prefs.get('zotero-tts.highlight.wordAlpha'),
      sentenceColor: Zotero.Prefs.get('zotero-tts.highlight.sentenceColor'),
      sentenceAlpha: Zotero.Prefs.get('zotero-tts.highlight.sentenceAlpha'),
      sentence: Zotero.Prefs.get('zotero-tts.highlight.sentence'),
      word: Zotero.Prefs.get('zotero-tts.highlight.word'),
    },
    sentenceChecked: sentenceCb.checked,
    wordChecked: wordCb.checked,
    sentenceDisabled: sentenceCb.hasAttribute('disabled'),
    wordDisabled: wordCb.hasAttribute('disabled'),
    previewWordStyle: d.getElementById('ztts-highlight-preview-word').getAttribute('style'),
    previewBeforeStyle: d.getElementById('ztts-highlight-preview-word-before').getAttribute('style'),
    zoteroPref: Zotero.Prefs.get('reader.readAloud.highlightGranularity'),
  };

  // --- 4.10 recorder row ---
  const rowLabel = d.querySelector('[data-l10n-id="ztts-key-word-highlight"]');
  const keyButton = d.getElementById('ztts-key-toggleWordHighlight');
  const clearButton = d.getElementById('ztts-key-clear-toggleWordHighlight');
  const helpIcon = d.querySelector('[data-l10n-id="ztts-help-key-word-highlight"]');
  // The row's place in the list: it sits somewhere after "Player options"
  // and before "Stop reading everywhere" (found live: two more rows -
  // previous/next voice, auto-scroll - sit between them; "sits between" is
  // list order, not direct adjacency). Recording buttons only, by their own
  // ids (excludes the "Clear" buttons, which also start with "ztts-key-").
  const recordButtonIds = Array.from(d.querySelectorAll('hbox > button[id^="ztts-key-"]:not([id^="ztts-key-clear-"])')).map((el) => el.id);
  const rowPosition = {
    order: recordButtonIds,
    optionsIndex: recordButtonIds.indexOf('ztts-key-toggleOptions'),
    wordHighlightIndex: recordButtonIds.indexOf('ztts-key-toggleWordHighlight'),
    stopIndex: recordButtonIds.indexOf('ztts-key-stopReading'),
    betweenConfirmed:
      recordButtonIds.indexOf('ztts-key-toggleOptions') < recordButtonIds.indexOf('ztts-key-toggleWordHighlight') &&
      recordButtonIds.indexOf('ztts-key-toggleWordHighlight') < recordButtonIds.indexOf('ztts-key-stopReading'),
  };

  const shortcutName = 'extensions.zotero.zotero-tts.shortcuts.toggleWordHighlight';
  const originalShortcut = { value: Services.prefs.getStringPref(shortcutName, 'Shift+W'), user: Services.prefs.prefHasUserValue(shortcutName) };
  const keyLabelBefore = keyButton.getAttribute('label');

  // Help tip
  helpIcon.scrollIntoView({ block: 'center' });
  const rect = helpIcon.getBoundingClientRect();
  const cx = Math.round(rect.left + rect.width / 2);
  const cy = Math.round(rect.top + rect.height / 2);
  const wu = win.windowUtils;
  win.focus();
  for (const [dx, dy] of [[-30, -30], [-15, -15], [-3, -3], [0, 0]]) {
    wu.sendMouseEvent('mousemove', cx + dx, cy + dy, 0, 0, 0, false, 0, 0, false, false);
    await sleep(120);
  }
  await sleep(250);
  const tip = d.getElementById('ztts-help-tip');
  const tipReport = { state: tip?.state ?? null, label: tip?.getAttribute('label') ?? null };
  wu.sendMouseEvent('mousemove', 400, 500, 0, 0, 0, false, 0, 0, false, false);
  await sleep(150);

  // Clear -> Not set, a trusted Shift+W in the reader is then not consumed
  clearButton.click();
  await sleep(150);
  const afterClear = { label: keyButton.getAttribute('label'), pref: Services.prefs.getStringPref(shortcutName, '<none>') };

  const fixtures = Zotero.ZoteroTTSRun.state.fixtures;
  const readerA = (Zotero.Reader._readers || []).find((r) => r.itemID === fixtures.a.itemID);
  const mainWin = Zotero.getMainWindow ? Zotero.getMainWindow() : Services.wm.getMostRecentWindow('navigator:browser');
  mainWin.Zotero_Tabs.select(readerA.tabID);
  readerA.focus?.();
  mainWin.focus();
  const tip2 = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const ev = (key, code, keyCode, shiftKey = false) => new mainWin.KeyboardEvent('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
  tip2.beginInputTransactionForTests(mainWin);
  const clearedPressRet = [tip2.keydown(ev('Shift', 'ShiftLeft', 16)), tip2.keydown(ev('W', 'KeyW', 87, true)), tip2.keyup(ev('W', 'KeyW', 87, true)), tip2.keyup(ev('Shift', 'ShiftLeft', 16))];
  if (typeof tip2.endInputTransaction === 'function') tip2.endInputTransaction();
  await sleep(150);
  const switchesAfterClearedPress = levels().switches;
  const highlightKeyDiag = JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightKey());

  // Restore default shortcuts (the button's DOM id, not its data-l10n-id
  // "ztts-restore-shortcuts" -- found live: ?.click() on the wrong,
  // nonexistent id silently did nothing)
  const restoreButton = d.getElementById('ztts-key-defaults');
  restoreButton?.click();
  await sleep(200);
  const afterRestoreShortcuts = { label: keyButton.getAttribute('label'), pref: Services.prefs.getStringPref(shortcutName, '<none>') };

  return JSON.stringify(
    {
      beforeRestore, afterRestore,
      rowLabel: !!rowLabel, keyLabelBefore, rowPosition, tipReport, originalShortcut,
      afterClear, clearedPressRet, switchesAfterClearedPress, highlightKeyDiagShortcut: highlightKeyDiag.shortcut,
      afterRestoreShortcuts,
    },
    null,
    1,
  );
})();
