// Item 1.11, the diagnostic and its control. Opens the settings window
// fresh on the zotero-tts pane (closing one already open first, since a
// reinstalled pane keeps the old markup -- driving notes Sec1) and leaves
// it open for 04-item-1-11-dom.js and the teardown. Reads
// diagnostics.l10n().pane, then the control from the case text: save
// #ztts-bracket-pairs's aria-label, remove it, confirm blank names only
// that field with elements unchanged, restore the value verbatim, confirm
// blank is empty again.
(async () => {
  const out = { check: '03-item-1.11-pane' };

  const waitFor = async (fn, timeoutMs, stepMs = 100) => {
    const until = Date.now() + timeoutMs;
    let value = fn();
    while (!value && Date.now() < until) {
      await new Promise((r) => setTimeout(r, stepMs));
      value = fn();
    }
    return value ?? null;
  };

  out.hadOpenSettingsWindow = !!Services.wm.getMostRecentWindow('zotero:pref');
  if (out.hadOpenSettingsWindow) {
    Services.wm.getMostRecentWindow('zotero:pref').close();
    await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 5000);
  }

  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  const win = await waitFor(() => Services.wm.getMostRecentWindow('zotero:pref'), 10000, 200);
  if (!win) {
    out.error = 'the settings window never opened';
    return JSON.stringify(out);
  }
  await waitFor(() => win.Zotero_Preferences, 5000);
  await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  await waitFor(() => win.document.querySelector('.ztts-pane'), 5000);
  await waitFor(
    () => win.document.getElementById('ztts-enable-azure')?.getAttribute('label') && win.document.getElementById('ztts-about-build')?.textContent,
    5000,
  );
  out.paneFound = !!win.document.querySelector('.ztts-pane');
  // Left open on purpose for 04 and the teardown.

  const doc = win.document;
  out.zoteroLocale = Zotero.locale ?? null;
  const field = doc.getElementById('ztts-bracket-pairs');
  out.fieldFound = !!field;

  const l10nBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.l10n());
  out.paneBefore = l10nBefore.pane;

  const savedAriaLabel = field ? field.getAttribute('aria-label') : null;
  out.savedAriaLabel = savedAriaLabel;

  if (field && savedAriaLabel) {
    field.removeAttribute('aria-label');
    const l10nRemoved = JSON.parse(await Zotero.ZoteroTTS.diagnostics.l10n());
    out.paneAfterRemoval = l10nRemoved.pane;

    field.setAttribute('aria-label', savedAriaLabel);
    const l10nRestored = JSON.parse(await Zotero.ZoteroTTS.diagnostics.l10n());
    out.paneAfterRestore = l10nRestored.pane;
    out.ariaLabelRestoredExactly = field.getAttribute('aria-label') === savedAriaLabel;
  } else {
    out.controlSkippedReason = !field ? 'field not found' : 'field had no aria-label to remove';
  }

  return JSON.stringify(out);
})()
