// Item 3: Shift+U while the SAME annotation popup (from item 2) is open.
// Expects the existing annotation's type to become 'underline' and no new
// annotation (reader.js addAnnotationFromReadAloudSegment: "if popup, just
// change the type"). Re-selects the fixture tab defensively.
// state: reads fixture/helpers/annotation1ID.
return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const h = state.helpers;
  const out = { step: '03-shift-u-popup-open' };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
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
    if (!state.annotation1ID) throw new Error('state.annotation1ID missing (02-shift-h-playing.js did not complete)');
    const item = Zotero.Items.get(state.fixture.itemID);
    const internal = h.internal();
    const win = Zotero.getMainWindow();
    if (win.Zotero_Tabs && state.fixture.tabID) win.Zotero_Tabs.select(state.fixture.tabID);
    win.focus();
    await sleep(100);

    out.before = {
      annotationsCount: item.getAnnotations().length,
      type: Zotero.Items.get(state.annotation1ID).annotationType,
      popupOpen: !!internal._state?.readAloudState?.annotationPopup,
      popupAnnotationID: internal._state?.readAloudState?.annotationPopup?.annotation?.id ?? null,
    };

    out.keydownReturn = pressShift(win, 'U', 'KeyU', 85);
    await sleep(400);

    const afterItem = Zotero.Items.get(state.annotation1ID);
    const popup = internal._state?.readAloudState?.annotationPopup ?? null;
    out.after = {
      annotationsCount: item.getAnnotations().length,
      type: afterItem.annotationType,
      text: afterItem.annotationText,
      popup: popup ? { annotationID: popup.annotation?.id ?? null } : null,
    };
    out.afterPress = { active: !!h.manager()?.active, paused: !!h.manager()?.paused };
    out.ok = true;
  } catch (e) {
    out.error = String(e);
    out.stack = e?.stack ? String(e.stack).split('\n').slice(0, 6).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error + (out.stack ? ' | ' + out.stack : ''));
  return JSON.stringify(out, null, 1);
})();
