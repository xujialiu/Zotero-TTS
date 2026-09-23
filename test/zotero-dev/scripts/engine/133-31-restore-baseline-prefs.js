// Restores every pref 133-01 snapshotted to its exact baseline value and
// user-value state (clearUserPref where baseline had none, set where it
// had an explicit one), and last of all readAloud.memory itself, using the
// full value 133-01 now keeps in state (not just its length) -- write it
// yourself if a run reaches this script without having run the fixed
// 133-01 first (state.readAloudMemoryFullValue absent). Any additional
// pref this run itself changed beyond 133-01's list (this run added
// local.enabled/local.baseURL, already in 133-01's own list, and
// zotero-standard.enabled/zotero-premium.enabled, also already in it) is
// covered automatically since they are read back from S.baseline.
// params: none. state: reads baseline, readAloudMemoryFullValue (133-01);
// writes restoreBaseline.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  if (!S.baseline) throw new Error('no baseline in state -- run the baseline script first');
  const FULL = (k) => 'extensions.zotero.' + 'zotero-tts.' + k;
  const get = (k) => Zotero.Prefs.get('zotero-tts.' + k);
  const set = (k, v) => Zotero.Prefs.set('zotero-tts.' + k, v);
  const clear = (k) => { try { Services.prefs.clearUserPref(FULL(k)); } catch (e) {} };
  const hasUser = (k) => { try { return Services.prefs.prefHasUserValue(FULL(k)); } catch (e) { return null; } };

  const restored = {};
  for (const key of Object.keys(S.baseline)) {
    if (key === 'readAloud.memory') continue; // last, below
    const snap = S.baseline[key];
    if (!snap || typeof snap !== 'object' || !('value' in snap)) continue;
    if (snap.hasUser) set(key, snap.value);
    else clear(key);
    restored[key] = { value: get(key), hasUser: hasUser(key), matchesValue: get(key) === snap.value, matchesHasUser: hasUser(key) === snap.hasUser };
  }

  // readAloud.memory last, byte-identical when the full value was kept
  const memSnap = S.baseline['readAloud.memory'];
  const memRestore = { attempted: false };
  if (memSnap) {
    if (typeof S.readAloudMemoryFullValue === 'string') {
      if (memSnap.hasUser) set('readAloud.memory', S.readAloudMemoryFullValue);
      else clear('readAloud.memory');
      const now = get('readAloud.memory');
      memRestore.attempted = true;
      memRestore.byteIdentical = now === S.readAloudMemoryFullValue;
      memRestore.lengthNow = typeof now === 'string' ? now.length : now;
      memRestore.hasUserNow = hasUser('readAloud.memory');
    } else {
      memRestore.reason = 'only a length was captured at baseline (an older 133-01) -- cannot restore byte-identically; left as found';
      memRestore.baselineLength = memSnap.len;
      const now = get('readAloud.memory');
      memRestore.currentLength = typeof now === 'string' ? now.length : now;
      memRestore.currentHasUser = hasUser('readAloud.memory');
    }
  }

  const out = { restored, memory: memRestore };
  S.restoreBaseline = out;
  return JSON.stringify(out, null, 1);
})();
