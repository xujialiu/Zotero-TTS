/**
 * Item 3's playback: a trusted Shift+Space in the fixture's selected tab, two
 * sentences, then pause — all in one script, because every bridge round trip
 * on a live session is billed audio. Doubles as the baseline's audio probe
 * (`_audioContext.state` and `currentTime` twice) and records the Xray view of
 * the manager, which is what the sandbox's capture reads.
 * Reads state.fixture; leaves state.spoken = the segments seen, in order.
 */
(async () => {
  const f = Zotero.ZoteroTTSRun.state.fixture;
  const out = { trace: [], spoken: [] };
  const waive = (v) => { try { return Components.utils.waiveXrays(v) ?? v; } catch { return v; } };
  const win = Zotero.getMainWindow();
  win.Zotero_Tabs.select(f.tabID);
  win.focus();
  await new Promise((r) => setTimeout(r, 400));
  const reader = Zotero.Reader._readers.find((x) => x.tabID === f.tabID);
  const managerOf = () => reader?._internalReader?._readAloudManager ?? null;
  out.beforeVolume = Zotero.Prefs.get('zotero-tts.readAloud.volume');
  out.managerBefore = (() => { const m = managerOf(); return m ? { active: m.active, paused: m.paused } : null; })();

  // Trusted Shift+Space (driving notes §6): sendKeyEvent is gone in Firefox 140
  const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  tip.beginInputTransactionForTests(win);
  const key = (k, code, keyCode, mods) => new win.KeyboardEvent('', { key: k, code, keyCode, shiftKey: !!(mods && mods.shift) });
  tip.keydown(key('Shift', 'ShiftLeft', win.KeyboardEvent.DOM_VK_SHIFT));
  out.consumed = tip.keydown(key(' ', 'Space', win.KeyboardEvent.DOM_VK_SPACE, { shift: true }));
  tip.keyup(key(' ', 'Space', win.KeyboardEvent.DOM_VK_SPACE, { shift: true }));
  tip.keyup(key('Shift', 'ShiftLeft', win.KeyboardEvent.DOM_VK_SHIFT));

  const started = Date.now();
  let audioSeen = null;
  let last = null;
  while (Date.now() - started < 45000) {
    const m = managerOf();
    if (m) {
      const w = waive(m);
      const seg = w.activeSegment ?? null;
      const xraySeg = (() => { try { return m.activeSegment ?? null; } catch (e) { return 'THREW'; } })();
      const text = seg && typeof seg.text === 'string' ? seg.text : null;
      if (text && text !== last) {
        last = text;
        out.spoken.push(text);
        out.trace.push(`${Date.now() - started} ms segment ${out.spoken.length}: ${text.slice(0, 60)}`);
      }
      if (audioSeen === null && m.active) {
        const c = waive(w._controller)?._audioContext ?? null;
        if (c) {
          const a = { state: c.state, t0: c.currentTime };
          await new Promise((r) => setTimeout(r, 500));
          a.t1 = c.currentTime;
          a.moving = a.t1 > a.t0;
          audioSeen = a;
          out.trace.push(`${Date.now() - started} ms audio ${JSON.stringify(a)}`);
        }
      }
      if (out.spoken.length === 1 && out.xrayView === undefined) {
        out.xrayView = {
          managerIsXray: (() => { try { return Components.utils.isXrayWrapper(m); } catch { return 'ERR'; } })(),
          activeSegmentThroughXray: xraySeg === null ? 'undefined/null' : (xraySeg === 'THREW' ? 'THREW' : 'object'),
          activeSegmentWaived: seg ? 'object' : 'null',
          voice: String(m.selectedVoiceID || ''),
        };
      }
      if (out.spoken.length >= 2 && !m.paused) {
        reader._internalReader.toggleReadAloudPaused(true);
        out.trace.push(`${Date.now() - started} ms paused after ${out.spoken.length} segments`);
        break;
      }
      if (!m.active && Date.now() - started > 20000) break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 600));
  const m = managerOf();
  out.managerAfter = m ? { active: m.active, paused: m.paused, voice: String(m.selectedVoiceID || '') } : null;
  out.audio = audioSeen;
  out.elapsedMs = Date.now() - started;
  const w = waive(m);
  const seg = w?.activeSegment ?? null;
  out.finalSegment = seg ? { text: seg.text, start: (() => { const s = seg.position?.start; const o = []; if (s) for (let i = 0; i < s.length; i++) o.push(s[i]); return o; })() } : null;
  Zotero.ZoteroTTSRun.state.spoken = out.spoken;
  Zotero.ZoteroTTSRun.state.finalSegment = out.finalSegment;
  return JSON.stringify(out);
})()
