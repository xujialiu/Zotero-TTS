/**
 * Items 5 and 6: a trusted Shift+Space on the idle fixture, after a phone's
 * item was put in the file. Records the new [zotero-tts] lines in the order
 * they were written, the segment that started, and any toast, then pauses.
 * Reads state.fixture and state.crafted; params.expectToast for item 6.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const f = Zotero.ZoteroTTSRun.state.fixture;
  const crafted = Zotero.ZoteroTTSRun.state.crafted;
  const out = { crafted: crafted ? { device: crafted.stamp.device, at: crafted.stamp.at, locator: crafted.locator, exact: crafted.anchor.exact } : null, trace: [] };
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  const linesNow = async () => String(await Zotero.Debug.get()).split('\n').filter((l) => l.indexOf('[zotero-tts]') !== -1).map((l) => l.slice(l.indexOf('[zotero-tts]')));
  const before = (await linesNow()).length;
  const win = Zotero.getMainWindow();
  win.Zotero_Tabs.select(f.tabID);
  win.focus();
  await new Promise((r) => setTimeout(r, 400));
  const reader = Zotero.Reader._readers.find((x) => x.tabID === f.tabID);
  const m = () => reader?._internalReader?._readAloudManager ?? null;
  out.managerBefore = { active: m()?.active ?? null, paused: m()?.paused ?? null };

  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  tip.beginInputTransactionForTests(win);
  const key = (k, code, keyCode, shift) => new win.KeyboardEvent('', { key: k, code, keyCode, shiftKey: !!shift });
  tip.keydown(key('Shift', 'ShiftLeft', win.KeyboardEvent.DOM_VK_SHIFT));
  out.consumed = tip.keydown(key(' ', 'Space', win.KeyboardEvent.DOM_VK_SPACE, true));
  tip.keyup(key(' ', 'Space', win.KeyboardEvent.DOM_VK_SPACE, true));
  tip.keyup(key('Shift', 'ShiftLeft', win.KeyboardEvent.DOM_VK_SHIFT));

  const started = Date.now();
  let seg = null;
  let toast = null;
  while (Date.now() - started < 25000) {
    const mm = m();
    if (mm) {
      const w = waive(mm);
      const s = w.activeSegment ?? null;
      if (s && typeof s.text === 'string' && s.text !== seg) {
        seg = s.text;
        out.trace.push(`${Date.now() - started} ms segment: ${s.text.slice(0, 70)}`);
      }
    }
    if (toast === null) {
      // ui/speed-toast.ts: one #ztts-speed-toast div per document, left in the
      // DOM at opacity 0 after its 900 ms, so a poll can still read it
      for (const doc of [reader?._iframeWindow?.document, Zotero.getMainWindow().document]) {
        try {
          const el = doc && doc.getElementById('ztts-speed-toast');
          const text = el ? String(el.textContent || '').trim() : '';
          if (text) { toast = text; out.trace.push(`${Date.now() - started} ms toast (opacity ${el.style.opacity}): ${text}`); break; }
        } catch (e) { /* a dead reader document */ }
      }
    }
    if (seg && Date.now() - started > 6000) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  out.newLines = (await linesNow()).slice(before);
  out.toast = toast;
  out.segment = seg;
  const mm = m();
  out.managerAfter = { active: mm?.active ?? null, paused: mm?.paused ?? null };
  if (mm && mm.active && !mm.paused) {
    reader._internalReader.toggleReadAloudPaused(true);
    out.paused = true;
  }
  out.elapsedMs = Date.now() - started;
  return JSON.stringify(out);
})()
