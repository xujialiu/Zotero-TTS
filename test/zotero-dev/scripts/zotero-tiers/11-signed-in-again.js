// Item 11 (issue #130): "Signed in again, at once." Reuses 10's settings
// window. Puts Zotero.Sync.Data.Local.hasCredentials back with the EXACT
// descriptor 10 kept (Object.defineProperty, not a plain assignment, so
// writable/enumerable/configurable are restored too), fires the api-key
// notification again (awaited), and checks Standard's Enable ungreys, both
// result lines clear, and every open reader's providerTiers().signedIn
// returns to true. Then enables Standard the item-5 way (a real click,
// polled the pref-based way -- the label-only race the zotero-tiers kit
// found live on 2026-09-15 is why this breaks on the PREF reaching true,
// not on "label is not Checking" alone) and checks the result line matches
// zoteroTiers()'s own message for the tier. Finally closes the settings
// window (this mini-run's own: items 10-11 did not run the kit's 00/09,
// so nothing else will close it) and reports the two switches' final pref
// values and the error ring.
// Leaves the settings window CLOSED, hasCredentials RESTORED, both Zotero
// switches back ON -- the run's own final state.
// params: none. state: reads credentialsDescriptor (10); writes nothing
// new.
(async () => {
  const out = { step: 'signed-in-again' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function rowState(doc, tier) {
    const btn = doc.getElementById('ztts-enable-zotero-' + tier);
    const test = doc.getElementById('ztts-test-zotero-' + tier);
    const result = doc.getElementById('ztts-test-result-zotero-' + tier);
    return { disabled: !!btn.disabled, label: btn.getAttribute('label'), testDisabled: !!test.disabled, resultText: result ? result.textContent : null };
  }

  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 10-signed-out-greyed.js first');
    const doc = win.document;
    if (!doc.getElementById('ztts-enable-zotero-standard')) throw new Error('Zotero section not found in the current pane');

    const desc = S.credentialsDescriptor;
    if (!desc) throw new Error('state.credentialsDescriptor is missing -- 10-signed-out-greyed.js did not complete');
    Object.defineProperty(Zotero.Sync.Data.Local, 'hasCredentials', desc);
    out.syncRunnerEnabledAfterRestore = !!Zotero.Sync.Runner.enabled;

    await Zotero.Notifier.trigger('modify', 'api-key', []);
    const t0 = Date.now();
    while (Date.now() - t0 < 2000) {
      if (doc.getElementById('ztts-enable-zotero-standard').disabled === false) break;
      await sleep(50);
    }

    out.standardAfterSignIn = rowState(doc, 'standard');
    out.premiumAfterSignIn = rowState(doc, 'premium');
    out.standardDisabledFalse = out.standardAfterSignIn.disabled === false;
    out.bothResultLinesEmpty = out.standardAfterSignIn.resultText === '' && out.premiumAfterSignIn.resultText === '';

    const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    out.providerTiersSignedInEverywhere = pt.readers.map((r) => ({ title: r.title, signedIn: r.signedIn }));
    out.allReadersSignedInTrue = pt.readers.every((r) => r.signedIn === true);

    // --- Enable Standard, item 5's way: poll on the PREF, not the label alone. ---
    const toggle = doc.getElementById('ztts-enable-zotero-standard');
    const result = doc.getElementById('ztts-test-result-zotero-standard');
    toggle.click();
    const trace = [];
    const t1 = Date.now();
    let sawChecking = false;
    while (Date.now() - t1 < 20000) {
      const entry = { t: Date.now() - t1, toggleLabel: toggle.getAttribute('label'), resultText: result ? result.textContent : null, pref: Zotero.Prefs.get('zotero-tts.zotero-standard.enabled') };
      trace.push(entry);
      if (/checking/i.test(entry.toggleLabel || '') || /checking/i.test(entry.resultText || '')) sawChecking = true;
      if (entry.pref === true) break;
      if (sawChecking && entry.toggleLabel && !/checking/i.test(entry.toggleLabel)) break;
      await sleep(100);
    }
    out.enableSawChecking = sawChecking;
    out.enableTraceFirst = trace[0] || null;
    out.enableTraceLast = trace[trace.length - 1] || null;
    out.enableTraceCount = trace.length;

    out.standardPrefAfterEnable = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    out.standardLabelAfterEnable = toggle.getAttribute('label');
    out.standardResultAfterEnable = result ? result.textContent : null;

    const zt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.zoteroTiers());
    out.expectedStandardMessage = zt.checks['zotero-standard'].message;
    out.standardResultMatchesExpected = out.standardResultAfterEnable === out.expectedStandardMessage;
    out.zoteroSwitchesFinal = zt.switches;

    if (out.standardPrefAfterEnable !== true) throw new Error('Standard did not come back on -- see enableTrace*');

    out.premiumPrefFinal = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  // Close the settings window regardless (this mini-run's own; nothing else will).
  try {
    const win2 = Services.wm.getMostRecentWindow('zotero:pref');
    if (win2) {
      win2.close();
      const t2 = Date.now();
      while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t2 < 10000) await sleep(200);
    }
    out.settingsWindowOpenAfter = !!Services.wm.getMostRecentWindow('zotero:pref');
  } catch (e) {
    out.settingsWindowCloseError = String(e);
  }
  try {
    const errs = Zotero.getErrors(true) || [];
    out.errorsAfter = { count: errs.length, lastFive: errs.slice(-5).map(String) };
  } catch (e) {
    out.errorsAfterError = String(e);
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
