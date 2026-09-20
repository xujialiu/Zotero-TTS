// secret-fields case, item 0 (baseline). No fixture, no fixture reader: the
// case is settings-pane-only. Snapshots the ten providers' .enabled (never
// a value), the owner's reader sessions (report only -- none of this case's
// providers affect the open fish:: session, confirmed live with
// diagnostics.readingImpact before this script existed), the host window's
// geometry, and turns the debug store on. Minimizes the host (main browser
// window only -- the settings window this case drives is a separate
// top-level window and is left to open normally). Runs diagnostics.startup()
// last and throws if any step failed.
// params: none. state: writes state.baseline for 90-teardown.js.
(async () => {
  const p = Services.prefs;
  const prefix = 'extensions.zotero.zotero-tts.';
  const ids = ['openai-official', 'mimo', 'compatible', 'azure', 'cloudflare', 'speechify', 'fish', 'fishspeech', 'local', 'system'];
  const enabled = {};
  for (const id of ids) enabled[id] = p.getBoolPref(prefix + id + '.enabled', false);

  const host = Services.wm.getMostRecentWindow('navigator:browser');
  const hostBefore = host
    ? {
        windowState: host.windowState,
        bounds: { x: host.screenX, y: host.screenY, width: host.outerWidth, height: host.outerHeight },
        selectedTabID: globalThis.Zotero_Tabs?.selectedID ?? null,
      }
    : null;
  if (host && host.windowState !== 2) {
    try {
      host.minimize();
    } catch (e) {
      // Recorded, not fatal: some of this case's checks do not need it minimized
      hostBefore.minimizeError = String(e);
    }
  }

  const debugStoring = !!Zotero.Debug?.storing;
  if (!debugStoring) {
    try {
      Zotero.Debug.setStore(true);
    } catch {
      // Left as it was; the run still reads zotero_read_errors at the end
    }
  }

  const readers = (Zotero.Reader._readers || []).map((r) => {
    const m = r?._internalReader?._readAloudManager;
    let title = null;
    try {
      const item = Zotero.Items.get(r.itemID);
      title = item?.parentItem?.getField?.('title') || item?.getField?.('title') || null;
    } catch {
      // Unnamed is still reported below
    }
    return { itemID: r.itemID, tabID: r.tabID, title, active: !!m?.active, paused: !!m?.paused, voice: m?.selectedVoiceID || null };
  });

  const settingsWindowOpen = !!Services.wm.getMostRecentWindow('zotero:pref');

  let startup = null;
  try {
    startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  } catch (e) {
    throw new Error('startup diagnostic threw: ' + String(e));
  }
  if (!startup || startup.failed?.length || startup.steps?.some((s) => !s.ok)) {
    throw new Error('startup diagnostic failed: ' + JSON.stringify(startup));
  }

  const run = Zotero.ZoteroTTSRun;
  run.state.baseline = { enabled, hostBefore, debugStoring, readers, settingsWindowOpen };

  return JSON.stringify(
    {
      status: 'PASS',
      version: startup.version,
      failed: startup.failed,
      enabled,
      hostBefore,
      hostMinimizedNow: host ? host.windowState === 2 : null,
      debugStoringWas: debugStoring,
      readers,
      settingsWindowOpen,
    },
    null,
    1,
  );
})();
