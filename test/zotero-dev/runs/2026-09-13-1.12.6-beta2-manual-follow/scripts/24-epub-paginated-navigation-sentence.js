return (async () => {
  const root = Zotero.__ztts100, reader = root?.epub?.reader;
  if (!reader) throw new Error('EPUB reader is missing');
  const internal = reader._internalReader, manager = internal?._readAloudManager, view = internal?._primaryView, rw = view?.iframeWindow;
  if (!manager || !view || !rw) throw new Error('EPUB paginated view is not ready');
  const pref = 'extensions.zotero.zotero-tts.readAloud.autoScrollMode', original = { value: Services.prefs.getStringPref(pref, 'sentence'), user: Services.prefs.prefHasUserValue(pref) }, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const index = () => (Zotero.Reader._readers ?? []).indexOf(reader), diagnostic = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll())[index()] ?? null;
  const rects = () => { const helper = Components.utils.waiveXrays(view._readAloud), state = Components.utils.waiveXrays(helper?.state), selector = helper?._resolveSegmentSelector(state), range = selector ? view.toDisplayedRange(selector) : null, list = range?.getClientRects?.(), out = []; for (let i = 0; list && i < list.length; i++) { const b = list[i]; out.push([b.left, b.top, b.right, b.bottom]); } return out; };
  const snap = phase => { const d = diagnostic(), boxes = rects(); return { phase, at: Date.now(), flow: view.flowMode, offset: view.flow?._offsetLeft ?? null, section: view.flow?._currentSectionIndex ?? null, position: manager?._controller?._position ?? null, scrollX: rw.scrollX, scrollY: rw.scrollY, rects: boxes, visibleFragments: boxes.filter(b => b[2] > 0 && b[3] > 0 && b[0] < rw.innerWidth && b[1] < rw.innerHeight).length, following: d?.following ?? null, interacting: d?.interacting ?? null, pending: d?.pending ?? null, reason: d?.reason ?? null, last: d?.last ?? null }; };
  const explicitLock = async label => { let error = null; try { Components.utils.waiveXrays(view._readAloud).setPositionLocked(true); } catch (e) { error = String(e); } await sleep(350); return { label, error, after: snap(label + '-after') }; };
  const pageNavigation = async () => {
    const before = snap('navigate-before');
    let callError = null, result = null;
    try { result = view.navigateToNextPage(); } catch (e) { callError = String(e); }
    const immediate = snap('navigate-immediate');
    let settled = null;
    if (result?.then) { try { settled = await Promise.race([Promise.resolve(result).then(() => 'resolved', e => 'rejected: ' + String(e)), sleep(1800).then(() => 'timeout')]); } catch (e) { settled = 'await-error: ' + String(e); } }
    await sleep(260);
    return { callError, returnedPromise: !!result?.then, settled, before, immediate, after: snap('navigate-after') };
  };
  const trustedPageDown = async () => {
    const seen = [], listener = e => seen.push({ key: String(e.key), trusted: !!e.isTrusted, target: String(e.target?.localName ?? ''), defaultPrevented: !!e.defaultPrevented });
    rw.document.addEventListener('keydown', listener, true);
    const before = snap('pagedown-before');
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor), K = rw.KeyboardEvent;
    tip.beginInputTransactionForTests(rw);
    const event = new K('', { key: 'PageDown', code: 'PageDown', keyCode: 34, bubbles: true, cancelable: true });
    const ret = [tip.keydown(event), tip.keyup(event)];
    const immediate = snap('pagedown-immediate');
    await sleep(120);
    const held = snap('pagedown-120ms');
    await sleep(300);
    const settled = snap('pagedown-420ms');
    rw.document.removeEventListener('keydown', listener, true);
    return { ret, seen, before, immediate, held, settled, offsetDelta: (settled.offset ?? 0) - (before.offset ?? 0) };
  };
  Zotero_Tabs.select(reader.tabID); reader.focus?.(); rw.focus?.();
  let output = null;
  try {
    Services.prefs.setStringPref(pref, 'sentence');
    try { await view.setFlowMode('paginated'); } catch (e) {}
    await sleep(700); try { manager.repositionTo(50); } catch (e) {} await sleep(650); try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {}
    const setup = snap('setup'); manager._stateChanged(); await sleep(250); const automaticStatePush = snap('automatic-state-push');
    const navigation = await pageNavigation();
    await explicitLock('lock-before-pagedown'); try { manager.repositionTo(50); } catch (e) {} await sleep(500); try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {}
    const pagedown = await trustedPageDown();
    const lockAfterPageDown = await explicitLock('lock-after-pagedown');
    output = { mode: 'sentence', setup, automaticStatePush, navigation, pagedown, lockAfterPageDown };
  } finally { try { if (manager.active && !manager.paused) manager.pause(); } catch (e) {} try { await view.setFlowMode('paginated'); } catch (e) {} await sleep(250); if (original.user) Services.prefs.setStringPref(pref, original.value); else if (Services.prefs.prefHasUserValue(pref)) Services.prefs.clearUserPref(pref); await sleep(180); }
  return JSON.stringify({ output, restoredMode: { value: Services.prefs.getStringPref(pref, '<none>'), user: Services.prefs.prefHasUserValue(pref) }, final: snap('final') });
})()
