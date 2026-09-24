// Item 5: Tools -> Plugins, disable Zotero-TTS -- no #ztts-player-style,
// #ztts-player-toggle or #ztts-player-frame in any open reader; Zotero's
// headphone button shows and opens Zotero's own player. Enable it again --
// the Player is back in every reader. Samples the fixture PDF and EPUB
// readers' DOM every 100ms for up to 40s while the TESTER calls
// zotero_plugin_reload (disable -> enable) concurrently, same event loop.
// params: none. state: reads fixtures.pdf/epub.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'item5-disable-enable' };
  const safeItemID = (r) => { try { return r.itemID; } catch (e) { return 'DEAD'; } };

  const win = Zotero.getMainWindow();
  const pdfReader = (Zotero.Reader._readers || []).find((r) => safeItemID(r) === state.fixtures.pdf.id);
  const epubReader = (Zotero.Reader._readers || []).find((r) => safeItemID(r) === state.fixtures.epub.id);
  if (!pdfReader || !epubReader) throw new Error('fixture PDF/EPUB readers not found');

  const snapshot = (reader) => {
    try {
      const doc = reader._iframeWindow.document;
      const nativeBtn = doc.getElementById('read-aloud');
      return {
        style: !!doc.getElementById('ztts-player-style'),
        toggle: !!doc.getElementById('ztts-player-toggle'),
        frame: !!doc.getElementById('ztts-player-frame'),
        nativeButtonDisplay: nativeBtn ? doc.defaultView.getComputedStyle(nativeBtn).display : 'ABSENT',
      };
    } catch (e) { return { error: String(e).slice(0, 60) }; }
  };

  out.beforeAny = { pdf: snapshot(pdfReader), epub: snapshot(epubReader) };
  state.item5ReadyAt = Date.now();

  const trace = [];
  const t0 = Date.now();
  let sawDisabled = false, sawReenabled = false, disabledAtMs = null, reenabledAtMs = null;
  while (Date.now() - t0 < 40000) {
    const pdf = snapshot(pdfReader);
    const epub = snapshot(epubReader);
    const disabledNow = !pdf.style && !pdf.toggle && !pdf.frame && !epub.style && !epub.toggle && !epub.frame;
    const enabledNow = pdf.style && pdf.toggle && pdf.frame && epub.style && epub.toggle && epub.frame;
    if (disabledNow && !sawDisabled) { sawDisabled = true; disabledAtMs = Date.now() - t0; }
    if (sawDisabled && enabledNow && !sawReenabled) { sawReenabled = true; reenabledAtMs = Date.now() - t0; }
    trace.push({ t: Date.now() - t0, pdf, epub });
    if (sawReenabled && Date.now() - t0 - reenabledAtMs > 1500) break;
    await sleep(150);
  }
  out.sawDisabled = sawDisabled;
  out.disabledAtMs = disabledAtMs;
  out.sawReenabled = sawReenabled;
  out.reenabledAtMs = reenabledAtMs;
  out.sampleCount = trace.length;
  out.disabledSample = sawDisabled ? trace.find((s) => s.t >= disabledAtMs) : null;
  out.reenabledSample = sawReenabled ? trace.find((s) => s.t >= reenabledAtMs) : null;
  out.finalSample = trace[trace.length - 1] ?? null;

  win.minimize();
  return JSON.stringify(out, null, 1);
})()
