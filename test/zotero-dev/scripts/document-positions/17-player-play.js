/**
 * Item 11: the player's play pulls first. Every play and pause goes through
 * `toggleReadAloudPaused` (notes/NOTES_2026-09-21.md, 18:12) — the player
 * button, the reader's Space key and the plugin's own togglePlayerPaused
 * alike, and the method the resume guard wraps — so the press is made there.
 * params.secondPressMs: a second press that many ms after the first, to show
 * it does nothing while the pull is still pending; null for one press only.
 * The pull can finish inside 600 ms, and a press on a session that is already
 * playing is an ordinary pause — so a second press has to land early to test
 * what it is meant to test (2026-09-21).
 * Reads state.fixture and state.crafted.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const f = Zotero.ZoteroTTSRun.state.fixture;
  const crafted = Zotero.ZoteroTTSRun.state.crafted;
  const out = { crafted: crafted ? { device: crafted.stamp.device, at: crafted.stamp.at, exact: crafted.anchor.exact } : null, trace: [] };
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  const lines = async () => String(await Zotero.Debug.get()).split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  const win = Zotero.getMainWindow();
  win.Zotero_Tabs.select(f.tabID);
  win.focus();
  await new Promise((r) => setTimeout(r, 400));
  const reader = Zotero.Reader._readers.find((x) => x.tabID === f.tabID);
  const m = () => reader?._internalReader?._readAloudManager ?? null;
  out.pausedSentence = (() => { const s = waive(m())?.activeSegment; return s ? s.text : null; })();
  out.before = { active: m()?.active ?? null, paused: m()?.paused ?? null };
  if (!out.before.active || !out.before.paused) return JSON.stringify(Object.assign(out, { abort: 'the fixture needs an active, paused session' }));

  // A toast left over from an earlier item stays in the DOM at opacity 0
  // (ui/speed-toast.ts), so what it said before the press is recorded here
  const toastNow = () => {
    try {
      const doc = reader?._iframeWindow?.document;
      const el = doc && doc.getElementById('ztts-speed-toast');
      return el ? { text: String(el.textContent || '').trim(), opacity: String(el.style.opacity) } : null;
    } catch (e) { return 'ERR ' + String(e); }
  };
  out.toastBefore = toastNow();

  const mark = (await lines()).length;
  const t0 = Date.now();
  reader._internalReader.toggleReadAloudPaused();
  out.trace.push('0 ms first press');
  if (typeof p.secondPressMs === 'number') {
    await new Promise((r) => setTimeout(r, p.secondPressMs));
    out.pausedAtSecondPress = m()?.paused ?? null;
    reader._internalReader.toggleReadAloudPaused();
    out.trace.push(`${Date.now() - t0} ms second press`);
  }

  let seg = null;
  let unpausedMs = null;
  while (Date.now() - t0 < 20000) {
    const mm = m();
    if (mm && unpausedMs === null && mm.paused === false) {
      unpausedMs = Date.now() - t0;
      out.trace.push(`${unpausedMs} ms paused went false`);
    }
    const s = waive(mm)?.activeSegment ?? null;
    if (s && typeof s.text === 'string' && s.text !== seg) {
      seg = s.text;
      out.trace.push(`${Date.now() - t0} ms segment: ${s.text.slice(0, 70)}`);
    }
    // The toast lives 900 ms (ui/speed-toast.ts) and then stays in the DOM at
    // opacity 0 with its old text, so it is only evidence while it is visible
    if (out.toastShown === undefined) {
      const t = toastNow();
      if (t && t.opacity === '1') {
        out.toastShown = Object.assign({ atMs: Date.now() - t0 }, t);
        out.trace.push(`${Date.now() - t0} ms toast shown: ${t.text.slice(0, 60)}`);
      }
    }
    if (seg && unpausedMs !== null && Date.now() - t0 > 5000) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  // The state a moment later: a second toggle would have put it back to paused
  await new Promise((r) => setTimeout(r, 1500));
  const mm = m();
  out.after = { active: mm?.active ?? null, paused: mm?.paused ?? null };
  out.unpausedMs = unpausedMs;
  out.segment = seg;
  out.newLines = (await lines()).slice(mark).filter((l) => l.indexOf('sync (resume)') !== -1 || l.indexOf('shared position') !== -1 || l.indexOf('resumed from') !== -1);
  out.resumeLineCount = out.newLines.filter((l) => l.indexOf('shared position sync (resume)') !== -1).length;
  out.resumedLineCount = out.newLines.filter((l) => l.indexOf('resumed from the shared position') !== -1).length;
  out.toastAfter = toastNow();
  if (mm && mm.active && !mm.paused) {
    reader._internalReader.toggleReadAloudPaused(true);
    out.pausedAtEnd = true;
  }
  return JSON.stringify(out);
})()
