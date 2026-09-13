return (async () => {
  const state = Zotero.__ztts95NativeState;
  const itemID = Zotero.__ztts95Fixture?.itemID;
  const reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
  const manager = reader?._internalReader?._readAloudManager;
  if (!state?.catalog || !reader || !manager) throw new Error('fixture catalog or manager is missing');
  const mw = Components.utils.waiveXrays(manager);
  const originalRegion = mw._region;
  const originalVoices = {};
  for (const id of ['native95-e', 'native95-f']) originalVoices[id] = state.catalog.voices[id];
  const originalLocales = state.catalog.locales;
  const list = () => {
    const a = manager.voicesForLanguage || [];
    const out = [];
    for (let i = 0; i < a.length; i++) out.push({ index: i, id: a[i]?.id ?? null, label: a[i]?.label ?? null });
    return out;
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const out = {};
  try {
    state.catalog.voices['native95-e'] = { label: 'Native Fixture E (GB)' };
    state.catalog.voices['native95-f'] = { label: 'Native Fixture F (AU)' };
    state.catalog.locales = {
      'en-US': ['native95-a', 'native95-b', 'native95-c', 'native95-d'],
      'en-GB': ['native95-e'],
      'en-AU': ['native95-f'],
    };
    mw._region = 'GB';
    await manager.loadVoices(true);
    await sleep(100);
    out.regionalGB = { region: manager.region ?? null, list: list(), selected: manager.selectedVoiceID ?? null };
    mw._region = 'AU';
    await manager.loadVoices(true);
    await sleep(100);
    out.regionalAU = { region: manager.region ?? null, list: list(), selected: manager.selectedVoiceID ?? null };
    mw._region = 'US';
    await manager.loadVoices(true);
    await sleep(100);
    out.us = { region: manager.region ?? null, list: list(), selected: manager.selectedVoiceID ?? null };
    out.favoritesOnly = {
      pref: Services.prefs.getBoolPref('extensions.zotero.zotero-tts.readAloud.favoritesOnly'),
      note: 'direct native transport fixture bypasses plugin favorites filtering; verify with the original composite in the full voice-browser pass',
    };
  } finally {
    state.catalog.voices['native95-e'] = originalVoices['native95-e'];
    state.catalog.voices['native95-f'] = originalVoices['native95-f'];
    state.catalog.locales = originalLocales;
    mw._region = originalRegion;
    await manager.loadVoices(true);
    await sleep(100);
  }
  out.restored = { region: manager.region ?? null, list: list(), selected: manager.selectedVoiceID ?? null };
  return JSON.stringify(out, null, 1);
})()
