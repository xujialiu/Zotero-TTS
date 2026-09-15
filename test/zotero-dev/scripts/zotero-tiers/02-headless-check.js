// Item 2 (issue #111): diagnostics.zoteroTiers() headless, then Test
// connection beside Standard clicked and polled (driving notes Sec2: click
// and poll in the SAME script) to see the "Testing..." transient and the
// final message land in ztts-test-result-zotero-standard, matching the
// diagnostic's own check message for that tier.
// Reuses the settings window 01 left open. params: none. state: none.
(async () => {
  const out = { step: 'headless-check' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const zt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.zoteroTiers());
    out.zoteroTiers = zt;

    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 01-pane-structure.js first');
    const doc = win.document;
    const button = doc.getElementById('ztts-test-zotero-standard');
    const result = doc.getElementById('ztts-test-result-zotero-standard');
    if (!button || !result) throw new Error('Test connection row for zotero-standard not found');

    out.before = result.textContent;
    button.click();
    const trace = [];
    const t0 = Date.now();
    let sawTesting = false;
    while (Date.now() - t0 < 20000) {
      const text = result.textContent;
      trace.push({ t: Date.now() - t0, text });
      if (text && /testing/i.test(text)) sawTesting = true;
      if (text && text === zt.checks['zotero-standard'].message) break;
      await sleep(100);
    }
    out.sawTesting = sawTesting;
    out.finalText = result.textContent;
    out.matchesDiagnosticMessage = out.finalText === zt.checks['zotero-standard'].message;
    out.traceFirst = trace[0] || null;
    out.traceLast = trace[trace.length - 1] || null;
    out.traceCount = trace.length;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
