// Item 1 (EPUB): same open/close/open/Shift+P sequence as the PDF script,
// plus the #124 blur probe -- sample every 50ms for 400ms after each open,
// close and Shift+P step; the view must never carry mask-resizing, and its
// computed filter must stay 'none'.
(async () => {
  const kind = 'epub';
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

  // #124's mask probe: the EPUB child iframe carrying 'mask-resizing' while
  // the document area is being relaid out, and its computed filter.
  const resizeTarget = () => {
    const masked = doc.querySelector('[class~="mask-resizing"]'); if (masked) return masked;
    const marked = doc.querySelector('[class~="has-resized-before"]'); if (marked) return marked;
    for (const c of doc.querySelectorAll('iframe')) if (c !== frameEl() && c.id !== 'ztts-player-frame') return c;
    return null;
  };
  const maskSample = () => {
    const target = resizeTarget();
    const classes = String(target?.className || '').split(/\s+/).filter(Boolean);
    const style = target ? doc.defaultView?.getComputedStyle(target) : null;
    return { maskResizing: classes.includes('mask-resizing'), filter: style?.filter || null };
  };
  const sampleMask = async (label) => {
    const samples = [];
    for (let t = 0; t <= 400; t += 50) { samples.push({ t, ...maskSample() }); if (t < 400) await sleep(50); }
    return { label, samples };
  };

  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const waitLayout = async (expected) => {
    const ok = await wait(() => frameEl()?.getAttribute('data-layout') === expected && Services.prefs.getStringPref(layoutPref, '') === expected ? true : null, 8000);
    if (!ok) throw new Error('layout did not settle at ' + expected);
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
  };
  const closePlayer = async () => {
    const toggle = doc.getElementById('ztts-player-toggle');
    toggle.click();
    const closed = await wait(() => { const f = frameEl(); return (!f || f.hidden) && !ir._readAloudManager?.active ? true : null; }, 8000);
    if (!closed) throw new Error('player did not close');
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
  const masks = [];
  const record = async (label) => {
    const b = boxesOf();
    const frame = rectOf(frameEl());
    const layout = frameEl()?.getAttribute('data-layout') || null;
    const entry = { label, layout, splitView: b.splitView, reactSplitView: b.reactSplitView, toolbar: b.toolbar, frame, hasSplitViewRule: hasSplitViewRule() };
    trace.push(entry);
    return entry;
  };

  const closed = await record('closed-before');
  const toolbarBottom = closed.toolbar.bottom;
  const docBottom = closed.splitView.bottom;

  await openPlayer();
  const open1 = await record('open-1 (top)');
  masks.push(await sampleMask('open-1'));

  await closePlayer();
  await record('closed-2');
  masks.push(await sampleMask('close-1'));

  await openPlayer();
  await record('open-2 (top)');
  masks.push(await sampleMask('open-2'));

  await focusReader();
  const p1 = trustedShiftP(reader._iframeWindow);
  await waitLayout('A');
  const stateA = await record('shift+p -> A (bottom)');
  masks.push(await sampleMask('top->A'));

  await focusPlayer();
  const p2 = trustedShiftP(reader._iframeWindow);
  await waitLayout('B');
  await record('shift+p -> B (floating)');
  masks.push(await sampleMask('A->B'));

  await focusReader();
  const p3 = trustedShiftP(reader._iframeWindow);
  await waitLayout('top');
  await record('shift+p -> top');
  masks.push(await sampleMask('B->top'));

  const eqBox = (a, b) => !!a && !!b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.bottom - b.bottom) < 0.5;
  const checks = {};
  for (const step of trace) {
    checks[step.label] = {
      splitViewEqualsClosed: eqBox(step.splitView, closed.splitView),
      reactSplitViewEqualsClosed: eqBox(step.reactSplitView, closed.reactSplitView),
      noSplitViewRule: !step.hasSplitViewRule,
    };
  }
  checks['open-1 (top) frame band'] = open1.frame ? { spansWidth: Math.abs(open1.frame.width - closed.splitView.width) < 0.5, top: open1.frame.top, expectedTop: toolbarBottom, topMatches: Math.abs(open1.frame.top - toolbarBottom) < 0.5, bottom: open1.frame.bottom, expectedBottom: toolbarBottom + 34, bottomMatches: Math.abs(open1.frame.bottom - (toolbarBottom + 34)) < 0.5 } : null;
  checks['shift+p -> A (bottom) frame band'] = stateA.frame ? { spansWidth: Math.abs(stateA.frame.width - closed.splitView.width) < 0.5, bottom: stateA.frame.bottom, expectedBottom: docBottom, bottomMatches: Math.abs(stateA.frame.bottom - docBottom) < 0.5, top: stateA.frame.top, expectedTop: docBottom - 34, topMatches: Math.abs(stateA.frame.top - (docBottom - 34)) < 0.5 } : null;

  const allBoxesPass = trace.every((s) => checks[s.label].splitViewEqualsClosed && checks[s.label].reactSplitViewEqualsClosed && checks[s.label].noSplitViewRule);
  const maskNeverSeen = masks.every((w) => w.samples.every((s) => s.maskResizing === false));
  // reader.css's OWN resting rule is 'blur(0px)' (never literally 'none'),
  // transitioning to 'blur(10px)' only while 'mask-resizing' is applied
  // (#124) -- the case's "stays none" means this resting value, so the
  // real assertion is that the blur radius never becomes visible (10px).
  const blurRadiusPx = (filter) => { const m = /blur\((-?[\d.]+)px\)/.exec(String(filter || '')); return m ? Number(m[1]) : filter && filter !== 'none' ? NaN : 0; };
  const filterNeverBlurred = masks.every((w) => w.samples.every((s) => blurRadiusPx(s.filter) === 0));

  Zotero.ZoteroTTSRun.state.item1EPUB = { toolbarBottom, docBottom };

  return JSON.stringify({
    toolbarBottom, docBottom,
    keydownConsumed: { p1: p1.keyDown, p2: p2.keyDown, p3: p3.keyDown },
    trace, checks, allBoxesPass,
    masks, maskNeverSeen, filterNeverBlurred,
  }, null, 1);
})();
