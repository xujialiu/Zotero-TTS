/**
 * `webdav.syncSettings` off for the run, on before any playback pref is
 * touched (the kit's own Limits: "autoUploadSettings: false does not keep
 * a test pref off the server" — the *shared settings* sync is gated by this
 * switch alone, and a reader-open pokes it too). params.syncSettings 'off'
 * snapshots the pref with its user-value state into state.syncSettings and
 * clears it to false; 'restore' writes the snapshot back, clearing the pref
 * when it had no user value, so the profile reads exactly as the run found
 * it. Mirrors 26-volume.js.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const name = 'zotero-tts.webdav.syncSettings';
  const out = { mode: p.syncSettings };
  const has = () => {
    try {
      return Zotero.Prefs.prefHasUserValue(name);
    } catch (e) {
      return 'n/a';
    }
  };
  if (p.syncSettings === 'off') {
    s.syncSettings = { value: Zotero.Prefs.get(name), userValue: has() };
    out.before = s.syncSettings;
    Zotero.Prefs.set(name, false);
    out.now = Zotero.Prefs.get(name);
  } else {
    out.snapshot = s.syncSettings || null;
    if (s.syncSettings) {
      if (s.syncSettings.userValue === true) Zotero.Prefs.set(name, s.syncSettings.value);
      else Zotero.Prefs.clear(name);
    }
    out.now = Zotero.Prefs.get(name);
    out.userValueNow = has();
  }
  return JSON.stringify(out);
})()
