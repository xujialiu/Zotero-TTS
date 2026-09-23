// Item 2 (single view, PDF and EPUB): the find bar clears the Top bar.
// Top bar: .find-popup top = toolbarBottom+15+34, wholly below the frame's
// bottom, elementFromPoint into the search box answers the input. Bottom
// bar and Floating panel: .find-popup top = toolbarBottom+15 (Zotero's own
// place). Also folds in plugin-player.md's layout bullet: a layout-only
// change keeps the manager/controller, voice, speed, volume, pause state
// and active segment (both fixtures already have a paused session open
// from item 1, Top layout).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const state = Zotero.ZoteroTTSRun.state;
  const host = Zotero.getMainWindow();
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };

  const setLayout = async (layout) => {
    Zotero.ZoteroTTS.pluginPlayer.setLayout(layout);
    const ok = await wait(() => Services.prefs.getStringPref(layoutPref, '') === layout ? true : null, 5000);
    if (!ok) throw new Error('layout pref did not settle at ' + layout);
    await sleep(150);
  };

  const results = {};
  for (const kind of ['pdf', 'epub']) {
    const itemID = state.fixtures[kind].itemID;
    let reader = null;
    for (const r of Zotero.Reader._readers || []) if (r.itemID === itemID) reader = r;
    if (!reader) throw new Error('reader not found for ' + kind);
    host.Zotero_Tabs.select(reader.tabID);
    await sleep(150);
    const doc = reader._iframeWindow.document;
    const ir = reader._internalReader;
    const frameEl = () => doc.querySelector('#ztts-player-frame');
    const toolbarBottom = rectOf(doc.querySelector('.toolbar')).bottom;

    const m = ir._readAloudManager;
    const stateSnap = () => ({ managerRef: m, controllerRef: m?._controller, voice: m?.selectedVoiceID || null, speed: Number.isFinite(m?.speed) ? Number(m.speed) : null, paused: !!m?.paused, active: !!m?.active, segment: m?.activeSegment ?? m?._activeSegment ?? null });
    const volumePrefBefore = Zotero.Prefs.get('zotero-tts.readAloud.volume');

    const openFind = async () => {
      let err = null;
      try { ir.toggleFindPopup({ primary: true, open: true }); } catch (e) { err = String(e); }
      let popup = null;
      for (let i = 0; i < 30; i++) { popup = doc.querySelector('.find-popup'); if (popup) break; await sleep(50); }
      await sleep(150); // toggleFindPopup's own setTimeout(..., 100) focuses/selects the input
      return { err, popup };
    };
    const closeFind = async () => { try { ir.toggleFindPopup({ primary: true, open: false }); } catch (e) {} await wait(() => !doc.querySelector('.find-popup') ? true : null, 3000); };

    const measureFind = async (label) => {
      const { err, popup } = await openFind();
      const popupRect = rectOf(popup);
      const frameRect = rectOf(frameEl());
      const input = popup ? popup.querySelector('input') : null;
      const inputRect = rectOf(input);
      let hit = null;
      if (input && inputRect) {
        const el = doc.elementFromPoint(inputRect.left + 4, inputRect.top + inputRect.height / 2);
        hit = { id: el?.id || null, tag: el?.tagName || null, isInput: el === input, isPlayerFrame: el === frameEl() };
      }
      const whollyBelowFrame = !!(popupRect && frameRect) && popupRect.top >= frameRect.bottom - 0.5;
      await closeFind();
      return { label, err, found: !!popup, popupRect, frameRect, inputRect, hit, whollyBelowFrame, offsetFromToolbarBottom: popupRect ? popupRect.top - toolbarBottom : null };
    };

    const layoutTrace = [];
    const layouts = ['top', 'A', 'B'];
    for (const layout of layouts) {
      const before = stateSnap();
      await setLayout(layout);
      const after = stateSnap();
      const sameState = before.managerRef === after.managerRef && before.controllerRef === after.controllerRef && before.voice === after.voice && before.speed === after.speed && before.paused === after.paused && before.active === after.active && before.segment === after.segment;
      const find = await measureFind(layout);
      layoutTrace.push({ layout, sameState, before: { voice: before.voice, speed: before.speed, paused: before.paused, active: before.active }, after: { voice: after.voice, speed: after.speed, paused: after.paused, active: after.active }, find });
    }
    await setLayout('top'); // leave every reader in the Top bar layout for the next items

    results[kind] = {
      toolbarBottom,
      volumePrefUnchanged: Zotero.Prefs.get('zotero-tts.readAloud.volume') === volumePrefBefore,
      layoutTrace,
    };
  }

  const expected = { top: 49, ab: 15 }; // deltas from toolbarBottom: top bar +15+34, bottom bar/floating +15
  const checks = {};
  for (const kind of ['pdf', 'epub']) {
    const tb = results[kind].toolbarBottom;
    const byLayout = Object.fromEntries(results[kind].layoutTrace.map((t) => [t.layout, t]));
    checks[kind] = {
      allLayoutsSameState: results[kind].layoutTrace.every((t) => t.sameState),
      topOffsetMatches: Math.abs(byLayout.top.find.offsetFromToolbarBottom - expected.top) < 0.5,
      topWhollyBelowFrame: byLayout.top.find.whollyBelowFrame,
      topHitIsInput: !!byLayout.top.find.hit?.isInput && !byLayout.top.find.hit?.isPlayerFrame,
      bottomOffsetMatches: Math.abs(byLayout.A.find.offsetFromToolbarBottom - expected.ab) < 0.5,
      floatingOffsetMatches: Math.abs(byLayout.B.find.offsetFromToolbarBottom - expected.ab) < 0.5,
    };
  }

  return JSON.stringify({ results, checks }, null, 1);
})();
