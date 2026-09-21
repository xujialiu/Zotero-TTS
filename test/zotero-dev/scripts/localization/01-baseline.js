// Section 0's baseline, the parts this pane-only case touches: the errors
// ring's contents, the owner's reader tabs (read-only, never acted on), and
// the host window's state, minimized if it is not already (the settings
// window this case drives is a separate top-level window and renders
// regardless -- see the kit README's Limits).
(async () => {
  const out = { check: '01-baseline' };

  try {
    const errors = Zotero.getErrors(true) || [];
    out.errorsBefore = { count: errors.length, lastThree: errors.slice(-3) };
  } catch (e) {
    out.errorsReadError = String(e);
  }

  out.settingsWindowOpenBefore = !!Services.wm.getMostRecentWindow('zotero:pref');

  out.readers = (Zotero.Reader._readers || []).map((r) => {
    let active = null;
    let paused = null;
    try {
      const m = r._internalReader && r._internalReader._readAloudManager;
      if (m) {
        active = !!m.active;
        paused = !!m.paused;
      }
    } catch {
      // left null
    }
    let title = null;
    try {
      title = (r._item && r._item.getField && r._item.getField('title')) || r.title || null;
    } catch {
      // left null
    }
    return { title, active, paused };
  });

  const host = Zotero.getMainWindow();
  const hostSnapshot = {
    windowState: host.windowState,
    outerWidth: host.outerWidth,
    outerHeight: host.outerHeight,
    screenX: host.screenX,
    screenY: host.screenY,
  };
  Zotero.ZoteroTTSRun.state.hostSnapshot = hostSnapshot;
  out.hostBefore = hostSnapshot;
  if (host.windowState !== 2) host.minimize();
  await new Promise((r) => setTimeout(r, 300));
  out.hostStateAfterMinimize = host.windowState;

  return JSON.stringify(out);
})()
