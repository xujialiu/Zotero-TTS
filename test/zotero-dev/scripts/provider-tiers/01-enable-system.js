// Item 4/6/7 prep: enable the System voices provider for the run through the
// settings pane's own Enable button (ui/provider-rows.ts onToggle), which
// runs the connection check first and only then writes system.enabled. Falls
// back to a raw pref write, noted in the output, if the pane route fails.
// Closes the settings window it opened. Idempotent: does nothing but report
// if system.enabled is already true.
// params: none. state: reads nothing, writes nothing to state.
(async () => {
  const out = { step: 'enable-system' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const PREF = 'extensions.zotero.zotero-tts.system.enabled';
  let win = null;
  try {
    out.enabledBefore = Services.prefs.getBoolPref(PREF, false);
    if (out.enabledBefore) {
      out.skipped = 'already enabled';
      return JSON.stringify(out);
    }
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
    while (Date.now() - t1 < 20000 && !doc.getElementById('ztts-openai-server')) await sleep(200);
    out.paneLoaded = !!doc.getElementById('ztts-openai-server');
    if (!out.paneLoaded) throw new Error('the pane never loaded');

    const toggle = doc.getElementById('ztts-enable-system');
    const result = doc.getElementById('ztts-test-result-system');
    if (!toggle) throw new Error('no #ztts-enable-system in the pane');
    out.labelBefore = toggle.getAttribute('label');
    toggle.click();
    const trace = [];
    const t2 = Date.now();
    let settled = false;
    while (Date.now() - t2 < 25000) {
      const entry = {
        t: Date.now() - t2,
        label: toggle.getAttribute('label'),
        disabled: toggle.disabled,
        result: result ? result.textContent : null,
        pref: Services.prefs.getBoolPref(PREF, false),
      };
      trace.push(entry);
      if (!toggle.disabled && entry.label !== 'Checking…' && entry.result && entry.result !== 'Checking…') {
        settled = true;
        break;
      }
      await sleep(150);
    }
    out.trace = { first: trace[0], last: trace[trace.length - 1], count: trace.length };
    out.settled = settled;
    out.enabledAfter = Services.prefs.getBoolPref(PREF, false);
    out.finalLabel = toggle.getAttribute('label');
    out.finalResult = result ? result.textContent : null;
    if (!out.enabledAfter) {
      out.paneRouteFailed = true;
      Services.prefs.setBoolPref(PREF, true);
      out.enabledByRawPref = true;
      out.enabledAfter = Services.prefs.getBoolPref(PREF, false);
    }
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
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
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out);
})();
