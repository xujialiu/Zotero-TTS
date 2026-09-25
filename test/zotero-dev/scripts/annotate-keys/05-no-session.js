// Item 5: no session. Closes the whole Read Aloud player on OUR OWN fixture
// (opened by this kit, never the owner's) the sanctioned way --
// toggleReadAloudPopup(false), never a bare manager.deactivate() -- then a
// trusted Shift+H should fall through untouched (keydown() 0 from the
// plugin, no new annotation). Ends the foreground trusted-input phase begun
// in 02-shift-h-playing.js: reselects the original tab and re-minimizes the
// host (workflow's explicit "leave minimized" exception).
// state: reads fixture/helpers/originalSelectedTabID/annotationIDs.
return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const h = state.helpers;
  const out = { step: '05-no-session' };
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
    const win = Zotero.getMainWindow();
    if (win.Zotero_Tabs && state.fixture.tabID) win.Zotero_Tabs.select(state.fixture.tabID);
    win.focus();

    out.beforeClose = { active: !!h.manager()?.active, paused: h.manager() ? !!h.manager().paused : null };
    internal.toggleReadAloudPopup(false);
    await waitFor(() => h.manager()?.active === false, 5000);
    out.afterClose = { active: !!h.manager()?.active };

    const before = { annotationsCount: item.getAnnotations().length };
    out.keydownReturn = pressShift(win, 'H', 'KeyH', 72);
    await sleep(500);
    out.before = before;
    out.after = { annotationsCount: item.getAnnotations().length };

    // End of the foreground phase: original tab back, host left minimized.
    if (win.Zotero_Tabs && state.originalSelectedTabID) win.Zotero_Tabs.select(state.originalSelectedTabID);
    win.minimize();
    await sleep(200);
    out.windowReMinimized = win.windowState;
    out.ok = true;
  } catch (e) {
    out.error = String(e);
    out.stack = e?.stack ? String(e.stack).split('\n').slice(0, 6).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error + (out.stack ? ' | ' + out.stack : ''));
  return JSON.stringify(out, null, 1);
})();
