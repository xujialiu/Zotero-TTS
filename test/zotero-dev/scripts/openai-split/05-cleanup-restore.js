// Final cleanup for this run: no fixture was ever opened (items 4/5's
// playback and enable/disable checks were blocked by the owner's own
// active reader "paper" -- see 04-guard-check-item4.js), and
// mimo.enabled/compatible.enabled were never changed (confirmed unchanged
// by 04). So the only state to restore is readAloud.volume (hasUserValue
// was false -- clear, not set) and webdav.autoUploadSettings (was true,
// restored LAST per the brief); reader.readAloudVoices and readAloud.memory
// are left exactly as the migration and the run left them -- the migrated
// voice ids are this profile's settings now, never reverted, and neither
// pref was touched beyond that. Closes the settings window and reports the
// error ring and Zotero.Debug.storing.
// params: none. state: reads nothing; writes nothing further.
(async () => {
  const out = { step: 'cleanup-restore' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    // readAloud.volume: originally NOT a user value (declared default 100) -- clear it.
    const volKey = 'extensions.zotero.zotero-tts.readAloud.volume';
    Services.prefs.clearUserPref(volKey);
    out.volumeAfter = { hasUserValue: Services.prefs.prefHasUserValue(volKey), value: Zotero.Prefs.get(volKey, true) };
    out.volumeRestored = out.volumeAfter.hasUserValue === false && out.volumeAfter.value === 100;

    // webdav.autoUploadSettings: last write of the run, back to true.
    const webdavKey = 'extensions.zotero.zotero-tts.webdav.autoUploadSettings';
    Services.prefs.setBoolPref(webdavKey, true);
    out.webdavAfter = { hasUserValue: Services.prefs.prefHasUserValue(webdavKey), value: Zotero.Prefs.get(webdavKey, true) };
    out.webdavRestored = out.webdavAfter.value === true;

    try {
      const w = Services.wm.getMostRecentWindow('zotero:pref');
      if (w) {
        w.close();
        const t = Date.now();
        while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t < 10000) await sleep(200);
      }
      out.settingsWindowClosed = !Services.wm.getMostRecentWindow('zotero:pref');
    } catch (e) { out.windowCloseError = String(e); }

    out.debugStoringNow = Zotero.Debug.storing; // was true before this run started; left as is.

    const readers = Zotero.Reader._readers || [];
    out.ownerTabStillReading = readers.map((r) => {
      const m = r._internalReader?._readAloudManager;
      return { itemID: r.itemID, active: !!(m && m.active), paused: m ? !!m.paused : null };
    });

    try {
      const errs = Zotero.getErrors(true) || [];
      out.errorsAfter = { count: errs.length, lastFive: errs.slice(-5).map(String) };
    } catch (e) { out.errorsAfterError = String(e); }
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
