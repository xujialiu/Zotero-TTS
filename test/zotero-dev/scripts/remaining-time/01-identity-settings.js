(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state;
  const params = run.params;
  const prefs = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 12000, step = 120) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      let value = null;
      try { value = await test(); } catch (_) {}
      if (value) return value;
      await sleep(step);
    }
    try { return await test(); } catch (_) { return null; }
  };
  const out = { step: 'identity-settings' };
  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  out.startup = { version: startup.version, failed: startup.failed, allStepsOK: Array.isArray(startup.steps) && startup.steps.every(step => step.ok === true) };
  if (startup.version !== params.expectedVersion || startup.failed?.length || !out.startup.allStepsOK) throw new Error('startup diagnostic failed: ' + JSON.stringify(out.startup));

  // The add-on manager points at the exact XPI passed to the installer. The
  // caller separately checked the XPI SHA-256; this path match prevents a
  // same-version XPI from another worktree being mistaken for the subject.
  try {
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addon = await AddonManager.getAddonByID('zotero-tts@xujialiu.top');
    const sourceURI = String(addon?.sourceURI?.spec || addon?.sourceURI || '');
    out.identity = { version: addon?.version || null, active: !!addon?.isActive, sourcePathMatches: sourceURI === 'file://' + String(params.xpiPath || ''), xpiSHA256: params.xpiSHA256 || null };
    if (!out.identity.active || !out.identity.sourcePathMatches) throw new Error('installed add-on source does not match requested XPI');
  } catch (error) { throw new Error('installed add-on identity check failed: ' + String(error)); }

  // Verify both locale files without switching Zotero's live locale.
  const keyValues = async locale => {
    const text = await IOUtils.readUTF8(PathUtils.join(params.root, 'addon', 'locale', locale, 'zotero-tts.ftl'));
    const keys = ['ztts-remaining-time', 'ztts-help-remaining-time', 'ztts-time-estimating', 'ztts-time-unavailable', 'ztts-time-finished', 'ztts-time-document', 'ztts-time-selection', 'ztts-time-minutes', 'ztts-time-under-minute'];
    const found = {};
    for (const key of keys) {
      const line = text.split('\n').find(row => row.startsWith(key + ' ') || row.startsWith(key + ' =')) || '';
      found[key] = line.replace(/\s+/g, ' ').trim();
    }
    return { present: keys.filter(key => !found[key]).length === 0, values: found };
  };
  out.locales = { enUS: await keyValues('en-US'), zhCN: await keyValues('zh-CN') };
  if (!out.locales.enUS.present || !out.locales.zhCN.present) throw new Error('remaining-time locale keys missing');

  // Open and navigate the pane after reinstall; an old pane document must not
  // be reused. This stays in the minimized host and does not change locale.
  let prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  if (prefWin) { try { prefWin.close(); } catch (_) {} await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 4000); }
  const opened = Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  if (opened?.then) await opened;
  prefWin = await waitFor(() => Services.wm.getMostRecentWindow('zotero:pref'), 8000);
  if (!prefWin) throw new Error('settings window did not open');
  try { await prefWin.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (_) {}
  const checkbox = await waitFor(() => prefWin.document.querySelector('.ztts-pane [data-l10n-id="ztts-remaining-time"]'), 10000);
  if (!checkbox) throw new Error('remaining-time checkbox missing from pane');
  const prefKey = prefix + 'readAloud.remainingTime';
  out.settings = {
    checkboxPresent: true,
    checked: !!checkbox.checked,
    disabled: !!checkbox.disabled,
    userValue: prefs.prefHasUserValue(prefKey),
    prefValue: prefs.getBoolPref(prefKey),
    labelId: checkbox.getAttribute('data-l10n-id'),
    helpLabel: prefWin.document.querySelector('[data-l10n-id="ztts-help-remaining-time"]')?.getAttribute('help') || null,
  };
  try { prefWin.close(); } catch (_) {}
  await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 4000);
  if (!out.settings.checked || out.settings.disabled || out.settings.userValue || out.settings.prefValue !== true) throw new Error('remaining-time default-on checkbox failed: ' + JSON.stringify(out.settings));
  state.identitySettings = out;
  return JSON.stringify(out, null, 1);
})()
