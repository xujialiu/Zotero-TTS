// Item 2: Shift+H while playing. Restores/focuses the host window and
// selects the fixture tab (start of the foreground trusted-input phase that
// runs through item 5), starts Read Aloud playing (memory already names a
// listed voice, checked in 01/by the workflow rule), captures
// getSegmentToAnnotate() just before a trusted Shift+H, and checks the new
// annotation, the popup and that playback keeps going.
// params: none beyond shared. state: reads fixture/helpers, writes
// windowBoundsOriginal, annotation1ID, annotationIDs.
return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const h = state.helpers;
  const out = { step: '02-shift-h-playing' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (test, ms = 7000, step = 100) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = test(); if (v) return v; await sleep(step); }
    return test();
  };
  const pressShift = (win, key, code, keyCode) => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const kev = (k, c, kc, shift) => new win.KeyboardEvent('', { key: k, code: c, keyCode: kc, shiftKey: shift, bubbles: true, cancelable: true });
    tip.beginInputTransactionForTests(win);
    let ret;
    try {
      tip.keydown(kev('Shift', 'ShiftLeft', 16, true));
      ret = tip.keydown(kev(key, code, keyCode, true));
      tip.keyup(kev(key, code, keyCode, true));
      tip.keyup(kev('Shift', 'ShiftLeft', 16, false));
    } finally { tip.endInputTransaction?.(); }
    return ret;
  };
  try {
    if (!h?.reader()) throw new Error('fixture reader is missing (01-fixture-and-defaults.js did not complete)');
    const item = Zotero.Items.get(state.fixture.itemID);
    const win = Zotero.getMainWindow();

    out.windowStateBeforeRestore = win.windowState;
    win.restore();
    await sleep(250);
    win.focus();
    out.windowBoundsRestored = { windowState: win.windowState, outerWidth: win.outerWidth, outerHeight: win.outerHeight, screenX: win.screenX, screenY: win.screenY };

    if (win.Zotero_Tabs && state.fixture.tabID) win.Zotero_Tabs.select(state.fixture.tabID);
    const reader = h.reader();
    reader.focus?.();
    reader._iframeWindow?.focus?.();
    win.focus();
    await sleep(150);

    const internal = h.internal();
    internal.toggleReadAloudPopup(true);
    await waitFor(() => !!h.manager()?.active, 7000);
    await waitFor(() => h.manager()?.paused === false, 5000);
    await sleep(400);

    const manager = h.manager();
    const beforePress = { active: !!manager?.active, paused: !!manager?.paused, annotationsCount: item.getAnnotations().length, selectedVoiceID: manager?.selectedVoiceID ?? null };
    const expectedSegment = manager.getSegmentToAnnotate();
    out.beforePress = beforePress;
    out.expectedSegmentText = expectedSegment?.text ?? null;

    out.keydownReturn = pressShift(win, 'H', 'KeyH', 72);

    const list = await waitFor(() => { const l = item.getAnnotations(); return l.length > beforePress.annotationsCount ? l : null; }, 2000, 100) || item.getAnnotations();
    out.annotationsAfterCount = list.length;
    const created = list.find(a => !state.annotationIDs.includes(a.id)) || null;
    out.created = created ? { id: created.id, type: created.annotationType, text: created.annotationText } : null;
    if (created) state.annotationIDs.push(created.id);
    state.annotation1ID = created?.id ?? null;

    const popup = internal._state?.readAloudState?.annotationPopup ?? null;
    out.popup = popup ? { annotationID: popup.annotation?.id ?? null } : null;
    out.afterPress = { active: !!h.manager()?.active, paused: !!h.manager()?.paused };
    out.ok = true;
  } catch (e) {
    out.error = String(e);
    out.stack = e?.stack ? String(e.stack).split('\n').slice(0, 6).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error + (out.stack ? ' | ' + out.stack : ''));
  return JSON.stringify(out, null, 1);
})();
