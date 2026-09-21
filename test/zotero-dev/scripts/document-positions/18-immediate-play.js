/**
 * Item 12: a play that has nothing to pull for is immediate. params.mode is
 * `sync-off` (the switch off) or `pdf` (the switch on, on an attachment with
 * no Document Id). The switch is read before it is changed and put back in the
 * finally of this same script. params.target (`pdf` | `fixture`) chooses the
 * document independently of the mode, so the switch-off half can run on the
 * run's PDF: `pullBeforePlay` tests the switch (index.ts:1465) before it looks
 * for a Document Id, so the switch branch is the one that answers, and playing
 * an EPUB would move a position the file is holding for another device.
 * Reads state.fixture / state.pdf.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const out = { mode: p.mode, trace: [] };
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  const lines = async () => String(await Zotero.Debug.get()).split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  const target = (p.target ? p.target === 'pdf' : p.mode === 'pdf') ? s.pdf : s.fixture;
  out.target = p.target || (p.mode === 'pdf' ? 'pdf' : 'fixture');
  const switchBefore = Zotero.Prefs.get('zotero-tts.webdav.syncPositions');
  out.switchBefore = switchBefore;
  try {
    if (p.mode === 'sync-off') {
      Zotero.Prefs.set('zotero-tts.webdav.syncPositions', false);
      out.switchDuring = Zotero.Prefs.get('zotero-tts.webdav.syncPositions');
    } else {
      out.switchDuring = switchBefore;
    }
    const win = Zotero.getMainWindow();
    win.Zotero_Tabs.select(target.tabID);
    win.focus();
    await new Promise((r) => setTimeout(r, 400));
    const reader = Zotero.Reader._readers.find((x) => x.tabID === target.tabID);
    const m = () => reader?._internalReader?._readAloudManager ?? null;

    // A session to pause: a trusted Shift+Space when the reader is idle
    if (!m()?.active) {
      const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
      tip.beginInputTransactionForTests(win);
      const key = (k, code, keyCode, shift) => new win.KeyboardEvent('', { key: k, code, keyCode, shiftKey: !!shift });
      tip.keydown(key('Shift', 'ShiftLeft', win.KeyboardEvent.DOM_VK_SHIFT));
      tip.keydown(key(' ', 'Space', win.KeyboardEvent.DOM_VK_SPACE, true));
      tip.keyup(key(' ', 'Space', win.KeyboardEvent.DOM_VK_SPACE, true));
      tip.keyup(key('Shift', 'ShiftLeft', win.KeyboardEvent.DOM_VK_SHIFT));
      const waitStart = Date.now();
      while (Date.now() - waitStart < 20000) {
        const s2 = waive(m())?.activeSegment ?? null;
        if (s2 && typeof s2.text === 'string') break;
        await new Promise((r) => setTimeout(r, 250));
      }
      out.startedIn = Date.now() - waitStart;
    }
    // Zotero's credits are the user's: an id without `::` is one of Zotero's
    // own metered voices, and the session stops there (baseline.md)
    out.voice = String(m()?.selectedVoiceID || '');
    if (out.voice && out.voice.indexOf('::') === -1) {
      if (m() && !m().paused) reader._internalReader.toggleReadAloudPaused(true);
      out.abort = 'a metered Zotero voice was selected; paused at once';
      return JSON.stringify(out);
    }
    await new Promise((r) => setTimeout(r, 1200));
    if (m() && !m().paused) reader._internalReader.toggleReadAloudPaused(true);
    await new Promise((r) => setTimeout(r, 800));
    out.pausedSentence = (() => { const x = waive(m())?.activeSegment; return x ? x.text : null; })();
    out.before = { active: m()?.active ?? null, paused: m()?.paused ?? null };

    const mark = (await lines()).length;
    const t0 = Date.now();
    reader._internalReader.toggleReadAloudPaused();
    let unpausedMs = null;
    while (Date.now() - t0 < 6000) {
      if (m() && m().paused === false) { unpausedMs = Date.now() - t0; break; }
      await new Promise((r) => setTimeout(r, 20));
    }
    out.unpausedMs = unpausedMs;
    await new Promise((r) => setTimeout(r, 2500));
    const after = (await lines()).slice(mark);
    out.resumeLines = after.filter((l) => l.indexOf('sync (resume)') !== -1 || l.indexOf('resumed from') !== -1);
    out.sharedResumeLines = after.filter((l) => l.indexOf('shared position sync (resume)') !== -1).length;
    out.segment = (() => { const x = waive(m())?.activeSegment; return x ? x.text : null; })();
    out.continuedFromPausedSentence = out.segment === out.pausedSentence;
    out.after = { active: m()?.active ?? null, paused: m()?.paused ?? null };
    if (m() && m().active && !m().paused) reader._internalReader.toggleReadAloudPaused(true);
  } finally {
    Zotero.Prefs.set('zotero-tts.webdav.syncPositions', switchBefore);
    out.switchRestored = Zotero.Prefs.get('zotero-tts.webdav.syncPositions');
  }
  return JSON.stringify(out);
})()
