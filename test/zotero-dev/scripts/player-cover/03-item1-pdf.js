// Item 1 (PDF): the document area never changes size. Closed boxes of
// #split-view / #reader-ui .split-view, then open (icon) / close (icon) /
// open again / Shift+P through top -> A -> B -> top, checking both boxes
// stay equal to the closed ones in every state, the frame spans
// #split-view's width and sits at the right band, and #ztts-player-style
// holds no #split-view rule.
(async () => {
  const kind = 'pdf';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const state = Zotero.ZoteroTTSRun.state;
  const itemID = state.fixtures[kind].itemID;
  const host = Zotero.getMainWindow();
  let reader = null;
  for (const r of Zotero.Reader._readers || []) if (r.itemID === itemID) reader = r;
  if (!reader) throw new Error('reader not found for ' + kind);
  host.Zotero_Tabs.select(reader.tabID);
  await sleep(150);
  const doc = reader._iframeWindow.document;
  const ir = reader._internalReader;

  const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
  const boxesOf = () => ({ splitView: rectOf(doc.querySelector('#split-view')), reactSplitView: rectOf(doc.querySelector('#reader-ui .split-view')), toolbar: rectOf(doc.querySelector('.toolbar')) });
  const frameEl = () => doc.querySelector('#ztts-player-frame');
  const cssRulesOf = () => { const style = doc.querySelector('#ztts-player-style'); return style && style.sheet ? Array.from(style.sheet.cssRules).map((r) => r.cssText) : null; };
  const hasSplitViewRule = () => (cssRulesOf() || []).some((t) => /#split-view\b/.test(t));

  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const waitLayout = async (expected) => {
    const ok = await wait(() => frameEl()?.getAttribute('data-layout') === expected && Services.prefs.getStringPref(layoutPref, '') === expected ? true : null, 8000);
    if (!ok) throw new Error('layout did not settle at ' + expected + ': pref=' + Services.prefs.getStringPref(layoutPref, '') + ' frame=' + frameEl()?.getAttribute('data-layout'));
    await sleep(150);
  };
  const openPlayer = async () => {
    const toggle = doc.getElementById('ztts-player-toggle');
    if (!toggle) throw new Error('toggle missing');
    toggle.click();
    const active = await wait(() => ir._readAloudManager?.active ? true : null, 8000);
    if (!active) throw new Error('manager did not activate on open');
    const m = ir._readAloudManager;
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    await wait(() => m.paused ? true : null, 3000);
    const mounted = await wait(() => { const f = frameEl(); return f && !f.hidden && f.contentDocument?.querySelector('.player') ? true : null; }, 8000);
    if (!mounted) throw new Error('player did not mount on open');
    await sleep(150);
  };
  const closePlayer = async () => {
    const toggle = doc.getElementById('ztts-player-toggle');
    toggle.click();
    const closed = await wait(() => { const f = frameEl(); return (!f || f.hidden) && !ir._readAloudManager?.active ? true : null; }, 8000);
    if (!closed) throw new Error('player did not close');
    await sleep(150);
  };
  const trustedShiftP = (win) => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(win);
    const ev = () => new win.KeyboardEvent('', { key: 'P', code: 'KeyP', keyCode: 80, bubbles: true, cancelable: true, shiftKey: true });
    try {
      const shiftDown = tip.keydown(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true, bubbles: true, cancelable: true }));
      const keyDown = tip.keydown(ev()), keyUp = tip.keyup(ev());
      const shiftUp = tip.keyup(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, bubbles: true, cancelable: true }));
      return { shiftDown, keyDown, keyUp, shiftUp };
    } finally { tip.endInputTransaction?.(); }
  };
  const focusReader = async () => { try { reader.focus?.(); } catch (e) {} try { reader._iframeWindow?.focus?.(); } catch (e) {} try { host.focus?.(); } catch (e) {} await sleep(140); };
  const focusPlayer = async () => { const f = frameEl(); try { f?.contentDocument?.querySelector('.options-toggle')?.focus?.(); } catch (e) {} try { f?.contentWindow?.focus?.(); } catch (e) {} try { host.focus?.(); } catch (e) {} await sleep(140); };

  const trace = [];
  const record = async (label) => {
    const b = boxesOf();
    const frame = rectOf(frameEl());
    const layout = frameEl()?.getAttribute('data-layout') || null;
    const entry = { label, layout, splitView: b.splitView, reactSplitView: b.reactSplitView, toolbar: b.toolbar, frame, hasSplitViewRule: hasSplitViewRule(), cssRules: cssRulesOf() };
    trace.push(entry);
    return entry;
  };

  // 1. Closed reference.
  const closed = await record('closed-before');
  const toolbarBottom = closed.toolbar.bottom;
  const docBottom = closed.splitView.bottom;

  // 2. Open (top, default layout).
  await openPlayer();
  const open1 = await record('open-1 (top)');

  // 3. Close.
  await closePlayer();
  const closed2 = await record('closed-2');

  // 4. Open again.
  await openPlayer();
  const open2 = await record('open-2 (top)');

  // 5. Shift+P: top -> A (Bottom bar).
  await focusReader();
  const p1 = trustedShiftP(reader._iframeWindow);
  await waitLayout('A');
  const stateA = await record('shift+p -> A (bottom)');

  // 6. Shift+P: A -> B (Floating).
  await focusPlayer();
  const p2 = trustedShiftP(reader._iframeWindow);
  await waitLayout('B');
  const stateB = await record('shift+p -> B (floating)');

  // 7. Shift+P: B -> top.
  await focusReader();
  const p3 = trustedShiftP(reader._iframeWindow);
  await waitLayout('top');
  const stateTop = await record('shift+p -> top');

  const eqBox = (a, b) => !!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.bottom - b.bottom) < 0.5;
  const checks = {};
  for (const step of trace) {
    checks[step.label] = {
      splitViewEqualsClosed: eqBox(step.splitView, closed.splitView),
      reactSplitViewEqualsClosed: eqBox(step.reactSplitView, closed.reactSplitView),
      noSplitViewRule: !step.hasSplitViewRule,
    };
  }
  // Frame band checks for the docked bars only.
  const frameTop = open1.frame, frameA = stateA.frame, frameBottomBarTop = stateA.frame;
  checks['open-1 (top) frame band'] = frameTop ? { spansWidth: Math.abs(frameTop.width - closed.splitView.width) < 0.5, top: frameTop.top, expectedTop: toolbarBottom, topMatches: Math.abs(frameTop.top - toolbarBottom) < 0.5, bottom: frameTop.bottom, expectedBottom: toolbarBottom + 34, bottomMatches: Math.abs(frameTop.bottom - (toolbarBottom + 34)) < 0.5 } : null;
  checks['shift+p -> A (bottom) frame band'] = frameA ? { spansWidth: Math.abs(frameA.width - closed.splitView.width) < 0.5, bottom: frameA.bottom, expectedBottom: docBottom, bottomMatches: Math.abs(frameA.bottom - docBottom) < 0.5, top: frameA.top, expectedTop: docBottom - 34, topMatches: Math.abs(frameA.top - (docBottom - 34)) < 0.5 } : null;

  const allBoxesPass = trace.every((s) => checks[s.label].splitViewEqualsClosed && checks[s.label].reactSplitViewEqualsClosed && checks[s.label].noSplitViewRule);

  // Leave the player open, Top layout, paused -- items 2/3/5 reuse this state.
  Zotero.ZoteroTTSRun.state.item1PDF = { toolbarBottom, docBottom };

  return JSON.stringify({
    toolbarBottom, docBottom,
    keydownConsumed: { p1: p1.keyDown, p2: p2.keyDown, p3: p3.keyDown },
    trace, checks, allBoxesPass,
  }, null, 1);
})();
