// Closes the settings window opened by 03-item-1-11-pane.js, restores the
// debug store to the value 00-before-fix.js read (passed through
// params.debugStoringBefore, since that script ran before the install and
// this one after -- Zotero.ZoteroTTSRun.state does not need to cross that
// boundary, only Zotero.Debug's own store does), and leaves the host window
// minimized -- the owner's standing exception, not a restore to whatever it
// was before this run.
(async () => {
  const out = { check: '90-teardown' };
  const params = Zotero.ZoteroTTSRun.params || {};
  const state = Zotero.ZoteroTTSRun.state || {};

  const win = Services.wm.getMostRecentWindow('zotero:pref');
  out.settingsWindowWasOpen = !!win;
  if (win) {
    win.close();
    const until = Date.now() + 5000;
    while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  out.settingsWindowClosed = !Services.wm.getMostRecentWindow('zotero:pref');

  out.debugStoringBefore = params.debugStoringBefore ?? null;
  out.debugStoringNow = Zotero.Debug.storing;
  if (params.debugStoringBefore === false && Zotero.Debug.storing) Zotero.Debug.setStore(false);
  out.debugStoringAfterRestore = Zotero.Debug.storing;

  out.hostSnapshot = state.hostSnapshot || null;
  const host = Zotero.getMainWindow();
  if (host.windowState !== 2) host.minimize();
  await new Promise((r) => setTimeout(r, 300));
  out.hostFinalState = host.windowState;

  try {
    const errors = Zotero.getErrors(true) || [];
    out.errorsAfter = { count: errors.length, lastThree: errors.slice(-3) };
  } catch (e) {
    out.errorsReadError = String(e);
  }

  return JSON.stringify(out);
})()
