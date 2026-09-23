/**
 * Mute before the first playback, and put the volume back afterwards
 * (.agents/zotero-tester.md, "Mute by default"). params.volume `mute` snapshots
 * `readAloud.volume` with its user-value state into state.volume and writes 0;
 * `restore` writes the snapshot back — clearing the pref when it had no user
 * value, so the profile reads exactly as the run found it.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const name = 'zotero-tts.readAloud.volume';
  const out = { mode: p.volume };
  const has = () => {
    try {
      return Zotero.Prefs.prefHasUserValue(name);
    } catch (e) {
      return 'n/a';
    }
  };
  if (p.volume === 'mute') {
    s.volume = { value: Zotero.Prefs.get(name), userValue: has() };
    out.before = s.volume;
    Zotero.Prefs.set(name, 0);
    out.now = Zotero.Prefs.get(name);
  } else {
    out.snapshot = s.volume || null;
    if (s.volume) {
      if (s.volume.userValue === true) Zotero.Prefs.set(name, s.volume.value);
      else Zotero.Prefs.clear(name);
    }
    out.now = Zotero.Prefs.get(name);
    out.userValueNow = has();
  }
  return JSON.stringify(out);
})()
