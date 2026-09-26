(async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const prefs = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 30000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const closePrefs = async () => {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win?.close) win.close();
    await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 7000);
  };
  const openPane = async () => {
    await closePrefs();
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    const win = await waitFor(() => Services.wm.getMostRecentWindow('zotero:pref'), 7000);
    if (!win) throw new Error('settings window did not open');
    const preferences = await waitFor(() => win.Zotero_Preferences?.navigation ? win.Zotero_Preferences : null, 7000);
    if (!preferences) throw new Error('settings navigation did not initialize');
    if (preferences.navigateToPane) await preferences.navigateToPane('zotero-tts-pane');
    const doc = await waitFor(() => {
      const d = win.document;
      return d?.getElementById('ztts-provider-fish') ? d : null;
    }, 10000);
    if (!doc) throw new Error('Fish settings pane did not load');
    await waitFor(() => doc.getElementById('ztts-voices-status') && doc.getElementById('ztts-enable-fish'), 10000);
    return { win, doc };
  };
  const sourceNames = ['Official', 'Own', 'Manual'];
  const sourcePrefs = sourceNames.map(name => prefix + `fish.include${name}`);
  for (const name of sourcePrefs) prefs.setBoolPref(name, false);
  prefs.setBoolPref(prefix + 'fish.enabled', false);
  let pane;
  try {
    pane = await openPane();
    const { win, doc } = pane;
    const boxes = Object.fromEntries(sourceNames.map(name => [name.toLowerCase(), doc.getElementById(`ztts-fish-include-${name.toLowerCase()}`)]));
    const sourceUI = Object.fromEntries(sourceNames.map(name => [name.toLowerCase(), {
      checked: !!boxes[name.toLowerCase()]?.checked,
      disabled: !!boxes[name.toLowerCase()]?.disabled,
    }]));
    const toggle = doc.getElementById('ztts-enable-fish');
    const test = doc.getElementById('ztts-test-fish');
    const result = doc.getElementById('ztts-test-result-fish');
    if (!toggle || !test || !result) throw new Error('Fish test controls missing');
    const trace = [];
    const started = Date.now();
    test.click();
    while (Date.now() - started < 30000) {
      const text = String(result.textContent || '').trim();
      trace.push({ ms: Date.now() - started, text, testDisabled: !!test.disabled });
      if (!test.disabled && text && text !== 'Testing…' && text !== 'Testing...') break;
      await sleep(100);
    }
    const finalText = String(result.textContent || '').trim();
    const testingObserved = trace.some(entry => /^Testing(?:…|\.\.\.)$/i.test(entry.text));
    const browserRows = Array.from(doc.getElementById('ztts-voices-list')?.children || []).map(row => String(row.textContent || '').trim());
    const browserDefaultRows = browserRows.filter(text => /(^|\s)Default(\s|$)/.test(text));
    const diag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.fishVoices(true));
    const outcome = {
      sourceUI,
      diagnostics: { sources: diag.sources, count: diag.count, defaultIDs: (diag.ids || []).filter(id => id === 'mul/default') },
      test: { testingObserved, finalText, trace: { first: trace[0], last: trace[trace.length - 1], count: trace.length } },
      enable: null,
      browser: { rowCount: browserRows.length, defaultRows: browserDefaultRows },
      settingsClosed: false,
      windowState: win.windowState,
    };
    const expectedMessage = /Connected\.|voices available\.|Synthesis works\./i.test(finalText)
      && /0 voices available\./i.test(finalText)
      && /Synthesis works\./i.test(finalText);
    if (!sourceNames.every(name => sourceUI[name.toLowerCase()]?.checked === false)
      || diag.count !== 0 || diag.ids?.length !== 0
      || !expectedMessage || !testingObserved
      || outcome.browser.defaultRows.length) {
      throw new Error(`empty Fish source UI mismatch: ${JSON.stringify(outcome)}`);
    }
    const enableTrace = [];
    const enableStarted = Date.now();
    toggle.click();
    while (Date.now() - enableStarted < 30000) {
      const enableLine = String(result.textContent || '').trim();
      enableTrace.push({ ms: Date.now() - enableStarted, label: toggle.getAttribute('label'), line: enableLine, enabled: prefs.getBoolPref(prefix + 'fish.enabled'), disabled: !!toggle.disabled });
      if (!toggle.disabled && toggle.getAttribute('label') === 'Disable' && prefs.getBoolPref(prefix + 'fish.enabled')) break;
      await sleep(100);
    }
    const enabledLine = String(result.textContent || '').trim();
    const boxesWhileEnabled = Object.fromEntries(sourceNames.map(name => [name.toLowerCase(), {
      checked: !!boxes[name.toLowerCase()]?.checked,
      disabled: !!boxes[name.toLowerCase()]?.disabled,
    }]));
    await waitFor(() => String(doc.getElementById('ztts-voices-status')?.textContent || '').toLowerCase().includes('voice') || !doc.getElementById('ztts-voices-status'), 10000);
    const enabledRows = Array.from(doc.getElementById('ztts-voices-list')?.children || []).map(row => String(row.textContent || '').trim());
    const enabledDefaultRows = enabledRows.filter(text => /(^|\s)Default(\s|$)/.test(text));
    const enabledDiag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.fishVoices(true));
    const enablePass = toggle.getAttribute('label') === 'Disable'
      && prefs.getBoolPref(prefix + 'fish.enabled')
      && /Connected\. 0 voices available\. Synthesis works\./i.test(enabledLine)
      && sourceNames.every(name => boxesWhileEnabled[name.toLowerCase()]?.disabled === true)
      && enabledDiag.count === 0 && (enabledDiag.ids || []).length === 0 && enabledDefaultRows.length === 0;
    if (!enablePass) throw new Error(`empty Fish Enable mismatch: ${JSON.stringify({enableTrace: enableTrace.slice(0, 2).concat(enableTrace.slice(-2)), enabledLine, boxesWhileEnabled, enabledDiag: {sources: enabledDiag.sources, count: enabledDiag.count, ids: enabledDiag.ids?.slice(0, 3)}, enabledDefaultRows})}`);
    const disableTrace = [];
    const disableStarted = Date.now();
    toggle.click();
    while (Date.now() - disableStarted < 10000) {
      disableTrace.push({ ms: Date.now() - disableStarted, label: toggle.getAttribute('label'), enabled: prefs.getBoolPref(prefix + 'fish.enabled'), disabled: !!toggle.disabled });
      if (!toggle.disabled && toggle.getAttribute('label') === 'Enable' && !prefs.getBoolPref(prefix + 'fish.enabled')) break;
      await sleep(100);
    }
    outcome.enable = {
      label: toggle.getAttribute('label'), disabled: !!toggle.disabled,
      enabledProbe: { line: enabledLine, trace: { first: enableTrace[0], last: enableTrace[enableTrace.length - 1], count: enableTrace.length }, enabledRows: enabledRows.length, defaultRows: enabledDefaultRows, diagnostics: { sources: enabledDiag.sources, count: enabledDiag.count, defaultIDs: (enabledDiag.ids || []).filter(id => id === 'mul/default') } },
      boxesWhileEnabled,
      disableTrace: { first: disableTrace[0], last: disableTrace[disableTrace.length - 1], count: disableTrace.length },
      disabledAfterProbe: !prefs.getBoolPref(prefix + 'fish.enabled') && toggle.getAttribute('label') === 'Enable',
    };
    if (!outcome.enable.disabledAfterProbe) throw new Error(`Fish Disable cleanup mismatch: ${JSON.stringify(outcome.enable)}`);
    await closePrefs();
    outcome.settingsClosed = !Services.wm.getMostRecentWindow('zotero:pref');
    return JSON.stringify({ status: 'PASS', ...outcome }, null, 1);
  } finally {
    if (Services.wm.getMostRecentWindow('zotero:pref')) await closePrefs();
  }
})();
