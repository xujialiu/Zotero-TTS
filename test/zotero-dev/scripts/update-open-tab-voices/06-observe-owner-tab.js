// Observe-only (brief for issue #131, items 2/3): whether an owner's OWN
// reader -- never planted with a leftover by this kit, never played,
// paused or repositioned -- independently shows the same freeze on 1.14.3
// and is repaired on the fix build, as a passive side effect of the
// GLOBAL zotero-standard.enabled flip every item already performs (its
// own observer refreshes every reader whose player is open, not just the
// fixture's). This script flips that pref once itself, in EITHER
// direction, and never touches the owner reader beyond reading its
// diagnostics entry and its manager's own-property state -- no play,
// pause, click or position change. The caller restores the switch to its
// true baseline afterward regardless of the direction used here.
// params: ownerItemID (required -- never hard-coded). state: none.
(async () => {
  const p = Zotero.ZoteroTTSRun.params || {};
  const out = { step: 'observe-owner-tab', ownerItemID: p.ownerItemID };
  const PREF = 'extensions.zotero.zotero-tts.zotero-standard.enabled';
  const Ci = Components.interfaces;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 60000, step = 200) => {
    const end = Date.now() + ms;
    let v;
    while (Date.now() < end) { v = await test(); if (v) return v; await sleep(step); }
    return await test();
  };
  try {
    if (!p.ownerItemID) throw new Error('params.ownerItemID is required');
    const list = Zotero.Reader._readers || [];
    let reader = null, idx = -1;
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === p.ownerItemID) { reader = list[i]; idx = i; }
    if (!reader) throw new Error('owner reader not found for itemID ' + p.ownerItemID);
    const entryOf = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList())[idx];

    const m = Components.utils.waiveXrays(reader._internalReader._readAloudManager);
    out.before = { active: !!m.active, paused: !!m.paused, popupOpen: !!reader._internalReader?._state?.readAloudState?.popupOpen, hasOwnLoadVoices: Object.prototype.hasOwnProperty.call(m, 'loadVoices') };
    const before = await entryOf();
    out.entryBefore = before;

    const scriptStart = Date.now();
    let v = Services.prefs.getBoolPref(PREF, true);
    v = !v;
    Services.prefs.setBoolPref(PREF, v);
    out.flippedTo = v;
    const revisionBefore = before ? before.revision : 0;
    await waitFor(async () => {
      const e = await entryOf();
      return e && e.revision >= revisionBefore + 2 && e.loading === 0;
    });
    await sleep(150);
    const after = await entryOf();
    out.entryAfter = after;

    const arr = Services.console.getMessageArray() || [];
    const hits = [];
    for (let i = 0; i < arr.length; i++) {
      let se = null;
      try { se = arr[i].QueryInterface(Ci.nsIScriptError); } catch (e) { se = null; }
      const msg = (se && se.errorMessage) || arr[i].message || '';
      const ts = se ? se.timeStamp : null;
      if (/list is undefined/i.test(String(msg)) && typeof ts === 'number' && ts > scriptStart) hits.push({ timeStamp: ts, sourceName: se ? se.sourceName : null });
    }
    out.newErrors = hits;

    // Confirm nothing about the READING SESSION itself moved -- only the list.
    out.afterManager = { active: !!m.active, paused: !!m.paused, selectedVoiceID: m.selectedVoiceID ?? null };
    out.sessionUnchanged = out.afterManager.active === out.before.active && out.afterManager.paused === out.before.paused;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
