// Item 2 (split view, PDF, Top bar): side by side both views' find bars sit
// at toolbarBottom+49 (the same margin as single-view, since our rule also
// names 'body.enable-vertical-split-view .split-view .secondary-view
// .find-popup'); stacked, the lower view's find bar sits 15px below its own
// top, no margin (the rule does not name '.enable-horizontal-split-view').
//
// Zotero's own secondary-view find popup would not open live here
// (ir._state.secondaryViewFindState.popupOpen stayed false after
// toggleFindPopup({primary:false,open:true}), no thrown error, even once
// the secondary PDF view's iframe was confirmed mounted and connected --
// a Zotero reader-internals quirk under bridge-driven split view, not
// reproduced for the primary view or outside split view). The primary
// view's REAL find-popup is measured directly; the secondary view's rule
// is measured with a synthetic '.find-popup'-classed probe element
// appended as a real child of the live '.secondary-view' node, which CSS
// matches identically to a real one -- validated against the primary
// view's own synthetic-vs-real agreement first.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const state = Zotero.ZoteroTTSRun.state;
  const itemID = state.fixtures.pdf.itemID;
  const host = Zotero.getMainWindow();
  let reader = null;
  for (const r of Zotero.Reader._readers || []) if (r.itemID === itemID) reader = r;
  if (!reader) throw new Error('pdf reader not found');
  host.Zotero_Tabs.select(reader.tabID);
  await sleep(150);
  const doc = reader._iframeWindow.document;
  const ir = reader._internalReader;
  const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';

  const closeAllFind = async () => {
    try { ir.toggleFindPopup({ primary: true, open: false }); } catch (e) {}
    try { ir.toggleFindPopup({ primary: false, open: false }); } catch (e) {}
    await wait(() => doc.querySelectorAll('.find-popup').length === 0 ? true : null, 3000);
  };
  const probe = (container) => {
    const el = doc.createElement('div');
    el.className = 'find-popup ztts-cover-probe';
    container.appendChild(el);
    const rect = rectOf(el);
    const marginTop = doc.defaultView.getComputedStyle(el).marginTop;
    el.remove();
    return { rect, marginTop, containerRect: rectOf(container) };
  };

  await closeAllFind();
  Zotero.ZoteroTTS.pluginPlayer.setLayout('top');
  await wait(() => Services.prefs.getStringPref(layoutPref, '') === 'top' ? true : null, 5000);
  await sleep(150);

  const toolbarBottom = rectOf(doc.querySelector('.toolbar')).bottom;

  // ---- Vertical (side by side) ----
  let vErr = null;
  try { ir.toggleVerticalSplit(true); } catch (e) { vErr = String(e); }
  await sleep(600);
  const bodyClassesVertical = doc.body.className;
  const primaryViewV = doc.querySelector('.split-view .primary-view');
  const secondaryViewV = doc.querySelector('.split-view .secondary-view');

  // Real primary find-popup, for a live baseline in split mode. Poll for a
  // NON-ZERO rect, not just the element's existence -- the first render
  // frame returns a real node at 0x0 before layout settles (2026-09-24).
  let realErr = null;
  try { ir.toggleFindPopup({ primary: true, open: true }); } catch (e) { realErr = String(e); }
  const realPrimaryPopup = await wait(() => { const p = Array.from(doc.querySelectorAll('.find-popup')).find((p) => p.closest('.primary-view')); const r = p?.getBoundingClientRect(); return r && r.bottom > r.top ? p : null; }, 4000);
  const realPrimaryRect = rectOf(realPrimaryPopup);
  await closeAllFind();

  // Secondary find popup through the real toggle (recorded, may not open --
  // see the note above), then the synthetic probe on both sides.
  let secondaryToggleErr = null;
  try { ir.toggleFindPopup({ primary: false, open: true }); } catch (e) { secondaryToggleErr = String(e); }
  const realSecondaryPopup = await wait(() => Array.from(doc.querySelectorAll('.find-popup')).find((p) => p.closest('.secondary-view')) || null, 3000);
  const secondaryFindStateAfterToggle = JSON.parse(JSON.stringify(ir._state.secondaryViewFindState || null));
  await closeAllFind();

  const probePrimaryV = probe(primaryViewV);
  const probeSecondaryV = probe(secondaryViewV);

  try { ir.disableSplitView(); } catch (e) {}
  await sleep(400);

  // ---- Horizontal (stacked) ----
  let hErr = null;
  try { ir.toggleHorizontalSplit(true); } catch (e) { hErr = String(e); }
  await sleep(600);
  const bodyClassesHorizontal = doc.body.className;
  const secondaryViewH = doc.querySelector('.split-view .secondary-view');
  const probeSecondaryH = probe(secondaryViewH);

  try { ir.disableSplitView(); } catch (e) {}
  await sleep(400);
  await closeAllFind();
  const bodyClassesAfter = doc.body.className;

  const near = (a, b, eps = 0.5) => Math.abs(a - b) < eps;
  const checks = {
    verticalEnabled: /enable-vertical-split-view/.test(bodyClassesVertical),
    realPrimaryOffsetMatches49: realPrimaryRect ? near(realPrimaryRect.top - toolbarBottom, 49) : null,
    // Synthetic vs real agreement on the PRIMARY side validates the method.
    syntheticPrimaryAgreesWithReal: realPrimaryRect ? near(probePrimaryV.rect.top - toolbarBottom, realPrimaryRect.top - toolbarBottom, 1) : null,
    syntheticPrimaryMargin34: probePrimaryV.marginTop === '34px',
    syntheticSecondaryMargin34: probeSecondaryV.marginTop === '34px',
    syntheticSecondaryOffsetMatches49: near(probeSecondaryV.rect.top - toolbarBottom, 49),
    horizontalEnabled: /enable-horizontal-split-view/.test(bodyClassesHorizontal),
    syntheticSecondaryHNoMargin: probeSecondaryH.marginTop === '0px' || probeSecondaryH.marginTop === '0px' || probeSecondaryH.marginTop === 'auto' || probeSecondaryH.marginTop === '0',
    syntheticSecondaryH15BelowOwnTop: near(probeSecondaryH.rect.top - probeSecondaryH.containerRect.top, 15),
    splitDisabledAfter: !/enable-(vertical|horizontal)-split-view/.test(bodyClassesAfter),
  };

  return JSON.stringify({
    vErr, hErr, realErr, secondaryToggleErr,
    toolbarBottom,
    bodyClassesVertical, bodyClassesHorizontal, bodyClassesAfter,
    realPrimaryRect,
    liveSecondaryFindPopupOpened: !!realSecondaryPopup,
    secondaryFindStateAfterToggle,
    probePrimaryV, probeSecondaryV, probeSecondaryH,
    checks,
  }, null, 1);
})();
