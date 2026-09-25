// Item 4: Shift+U while paused, popup closed. Closes the annotation popup
// with Zotero's own dismissReadAloudAnnotationPopup() (reader.js, sibling of
// setReadAloudAnnotationType -- no cross-compartment object needed, unlike
// _updateReadAloudUIState), pauses, then advances the position TWO sentences
// with manager.skipAhead('sentence') so the segment getSegmentToAnnotate()
// resolves to is one item 2/3 never annotated -- this works even with a
// frozen/absent audio device (driving notes S3), which the progress-based
// "current vs previous" heuristic alone would not survive on this machine.
// Expects one more annotation, type 'underline'.
// state: reads fixture/helpers/annotation1ID/annotationIDs, writes
// annotation2ID.
return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const h = state.helpers;
  const out = { step: '04-shift-u-paused-new-segment' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (test, ms = 5000, step = 100) => {
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
    const item = Zotero.Items.get(state.fixture.itemID);
    const internal = h.internal();
    let manager = h.manager();
    const win = Zotero.getMainWindow();
    if (win.Zotero_Tabs && state.fixture.tabID) win.Zotero_Tabs.select(state.fixture.tabID);
    win.focus();

    internal.dismissReadAloudAnnotationPopup();
    await waitFor(() => !internal._state?.readAloudState?.annotationPopup, 3000);
    out.popupClosed = !internal._state?.readAloudState?.annotationPopup;

    if (!manager.paused) internal.toggleReadAloudPaused();
    await waitFor(() => h.manager()?.paused === true, 5000);
    manager = h.manager();
    out.paused = !!manager?.paused;

    const priorText = Zotero.Items.get(state.annotation1ID).annotationText;
    manager.skipAhead('sentence');
    await sleep(200);
    manager.skipAhead('sentence');
    await sleep(200);
    const expectedSegment = manager.getSegmentToAnnotate();
    out.expectedSegmentText = expectedSegment?.text ?? null;
    out.expectedMatchesPriorAnnotation = out.expectedSegmentText === priorText;

    const before = { annotationsCount: item.getAnnotations().length, popupOpen: !!internal._state?.readAloudState?.annotationPopup };
    out.before = before;

    out.keydownReturn = pressShift(win, 'U', 'KeyU', 85);

    const list = await waitFor(() => { const l = item.getAnnotations(); return l.length > before.annotationsCount ? l : null; }, 2000, 100) || item.getAnnotations();
    out.annotationsAfterCount = list.length;
    const created = list.find(a => !state.annotationIDs.includes(a.id)) || null;
    out.created = created ? { id: created.id, type: created.annotationType, text: created.annotationText } : null;
    if (created) state.annotationIDs.push(created.id);
    state.annotation2ID = created?.id ?? null;
    out.afterPress = { active: !!h.manager()?.active, paused: !!h.manager()?.paused };
    out.ok = true;
  } catch (e) {
    out.error = String(e);
    out.stack = e?.stack ? String(e.stack).split('\n').slice(0, 6).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error + (out.stack ? ' | ' + out.stack : ''));
  return JSON.stringify(out, null, 1);
})();
