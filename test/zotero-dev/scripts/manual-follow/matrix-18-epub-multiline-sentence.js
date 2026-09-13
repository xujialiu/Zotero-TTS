return (async () => {
  const root = Zotero.__ztts100, reader = root?.epub?.reader;
  if (!reader) throw new Error('EPUB reader is missing');
  const internal = reader._internalReader, manager = internal?._readAloudManager, view = internal?._primaryView, rw = view?.iframeWindow, host = reader._iframeWindow;
  if (!manager || !view || !rw || !host) throw new Error('EPUB scrolled view is not ready');
  const pref = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode', original = { value: Services.prefs.getStringPref(pref, 'sentence'), user: Services.prefs.prefHasUserValue(pref) }, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const index = () => (Zotero.Reader._readers ?? []).indexOf(reader), diagnostic = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll())[index()] ?? null;
  const rangeRects = () => {
    const helper = Components.utils.waiveXrays(view._readAloud), state = Components.utils.waiveXrays(helper?.state), selector = helper?._resolveSegmentSelector(state), range = selector ? view.toDisplayedRange(selector) : null, out = [], list = range?.getClientRects?.();
    for (let i = 0; list && i < list.length; i++) { const b = list[i]; out.push({ index: i, screen: [b.left, b.top, b.right, b.bottom], document: [b.left + rw.scrollX, b.top + rw.scrollY, b.right + rw.scrollX, b.bottom + rw.scrollY], visible: b.right > 0 && b.bottom > 0 && b.left < rw.innerWidth && b.top < rw.innerHeight }); }
    return out;
  };
  const snap = phase => { const d = diagnostic(), rects = rangeRects(); return { phase, at: Date.now(), scrollX: rw.scrollX, scrollY: rw.scrollY, viewport: { scrollTop: rw.scrollY, scrollLeft: rw.scrollX, clientWidth: rw.innerWidth, clientHeight: rw.innerHeight, scrollWidth: rw.document.documentElement.scrollWidth, scrollHeight: rw.document.documentElement.scrollHeight }, rects, visibleFragments: rects.filter(r => r.visible).length, following: d?.following ?? null, interacting: d?.interacting ?? null, pending: d?.pending ?? null, reason: d?.reason ?? null, mode: d?.mode ?? null, flow: d?.flow ?? view.flowMode, last: d?.last ?? null }; };
  const trustedWheelThenMove = async (targetScrollY, label) => {
    const events = [], listener = e => events.push({ trusted: !!e.isTrusted, deltaX: e.deltaX, deltaY: e.deltaY, target: String(e.target?.localName ?? ''), defaultPreventedAtCapture: !!e.defaultPrevented });
    rw.document.addEventListener('wheel', listener, true);
    const before = snap(label + '-before');
    let wheelError = null;
    try { const frame = rw.frameElement.getBoundingClientRect(); host.windowUtils.sendWheelEvent(Math.round(frame.x + frame.width / 2), Math.round(frame.y + frame.height / 2), 0, 220, 0, 0, 0, 0, 0, 0); } catch (e) { wheelError = String(e); }
    const afterWheel = snap(label + '-after-trusted-wheel');
    rw.scrollTo(0, targetScrollY);
    const afterMove = snap(label + '-after-controlled-move');
    await sleep(80);
    const held = snap(label + '-80ms');
    await sleep(280);
    const settled = snap(label + '-360ms');
    rw.document.removeEventListener('wheel', listener, true);
    return { label, targetScrollY, wheelError, events, before, afterWheel, afterMove, held, settled, actualDelta: afterMove.scrollY - before.scrollY };
  };
  const explicitLock = async label => { let error = null; try { Components.utils.waiveXrays(view._readAloud).setPositionLocked(true); } catch (e) { error = String(e); } await sleep(350); return { label, error, after: snap(label + '-after') }; };
  Zotero_Tabs.select(reader.tabID); reader.focus?.(); host.focus?.();
  let output = null;
  try {
    Services.prefs.setStringPref(pref, 'sentence');
    rw.scrollTo(0, 0); await sleep(250);
    const setup = snap('setup');
    rw.scrollTo(0, 700); await sleep(220); const automaticOnly = snap('automatic-scroll-only'); await explicitLock('lock-after-automatic'); rw.scrollTo(0, 0); await sleep(180);
    const partial = await trustedWheelThenMove(180, 'partial'); const lockAfterPartial = await explicitLock('lock-after-partial'); rw.scrollTo(0, 0); await sleep(180);
    const complete = await trustedWheelThenMove(800, 'complete'); const lockAfterComplete = await explicitLock('lock-after-complete');
    output = { mode: 'sentence', setup, automaticOnly, partial, lockAfterPartial, complete, lockAfterComplete };
  } finally { try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {} try { rw.scrollTo(0, 0); } catch (e) {} if (original.user) Services.prefs.setStringPref(pref, original.value); else if (Services.prefs.prefHasUserValue(pref)) Services.prefs.clearUserPref(pref); await sleep(180); }
  return JSON.stringify({ output, restoredMode: { value: Services.prefs.getStringPref(pref, '<none>'), user: Services.prefs.prefHasUserValue(pref) }, final: snap('final') });
})()
