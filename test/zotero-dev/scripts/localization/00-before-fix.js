// issue #103, pre-fix reproduction. Run only while a build before
// 1.13.2-beta4 is installed: the pane's blank check ignored aria-label, so
// the bracket-pairs field -- whose only string is its aria-label -- showed
// up in diagnostics.l10n().pane.blank on an otherwise healthy pane. Opens
// the settings window on the plugin's pane, reads the diagnostic, closes
// the window, then turns the debug store on (recording its prior value) so
// the very next startup -- the fix's install -- logs the "own strings
// source" line 02-item-1-10.js looks for.
(async () => {
  const out = { check: '00-before-fix' };

  const waitFor = async (fn, timeoutMs, stepMs = 100) => {
    const until = Date.now() + timeoutMs;
    let value = fn();
    while (!value && Date.now() < until) {
      await new Promise((r) => setTimeout(r, stepMs));
      value = fn();
    }
    return value ?? null;
  };

  try {
    const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
    out.version = startup.version;
    out.startupFailed = startup.failed;
  } catch (e) {
    out.startupError = String(e);
  }

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

  try {
    const l10n = JSON.parse(await Zotero.ZoteroTTS.diagnostics.l10n());
    out.pane = l10n.pane;
  } catch (e) {
    out.l10nError = String(e);
  }

  win.close();
  await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 5000);
  out.settingsWindowClosedAfter = !Services.wm.getMostRecentWindow('zotero:pref');

  // Before the fix is installed, so the upgrade's own startup writes the
  // "own strings source" line; 90-teardown.js restores whatever this reads.
  out.debugStoringBefore = Zotero.Debug.storing;
  if (!Zotero.Debug.storing) Zotero.Debug.setStore(true);

  return JSON.stringify(out);
})()
