// Flips extensions.zotero.zotero-tts.zotero-standard.enabled off then on
// (a raw Services.prefs write, bypassing the settings pane) and, after each
// flip settles (the live-voice-list entry's revision advances and its
// loading count returns to 0), records: any NEW "list is undefined"
// console entry (timeStamp strictly after this script's own start, so a
// pre-existing or another run's entry is never counted), the entry's
// applied/loading/revision/asked/remote, and -- for item 2/3's own
// assertions -- whether the manager's own loadVoices differs from
// Object.getPrototypeOf(manager).loadVoices and whether that prototype
// method's source starts with "async loadVoices(". Used for items 1, 2
// and 3 alike (params.flips defaults to 2: one off, one on; item 4 passes
// flips:1). Never closes or reopens the tab. Reads the switch's CURRENT
// value fresh each call, so it is safe to run repeatedly without drifting
// its net parity, and never re-derives it from a stale snapshot.
// params: flips (default 2), label (a short tag for the result). state: reads fixture.
(async () => {
  const p = Zotero.ZoteroTTSRun.params || {};
  const S = Zotero.ZoteroTTSRun.state;
  const out = { step: 'flip-switch-and-check', label: p.label || null, flips: p.flips || 2 };
  const PREF = 'extensions.zotero.zotero-tts.zotero-standard.enabled';
  const Ci = Components.interfaces;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  // test may be sync or async; each call is awaited (a bare `if (v)` on an
  // un-awaited async test is always truthy -- the promise object itself --
  // and returns on the very first iteration without ever really waiting;
  // found live 2026-09-25 when item 2's first clean-up attempt still read
  // loading:1/2, "settled" in under 400ms).
  const waitFor = async (test, ms = 10000, step = 100) => {
    const end = Date.now() + ms;
    let v;
    while (Date.now() < end) { v = await test(); if (v) return v; await sleep(step); }
    return await test();
  };
  try {
    const list = Zotero.Reader._readers || [];
    let reader = null, readerIndex = -1;
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === S.fixture.id) { reader = list[i]; readerIndex = i; }
    if (!reader) throw new Error('fixture reader not found');
    const manager = Components.utils.waiveXrays(reader._internalReader._readAloudManager);
    const proto = Object.getPrototypeOf(manager);
    const protoLoadVoices = proto ? proto.loadVoices : null;
    out.prototypeLoadVoicesSource = typeof protoLoadVoices === 'function' ? String(protoLoadVoices).slice(0, 40) : null;
    out.prototypeLoadVoicesIsAsyncNative = /^async loadVoices\(/.test(out.prototypeLoadVoicesSource || '');
    out.ownLoadVoicesDiffersFromPrototype = manager.loadVoices !== protoLoadVoices;
    out.hasOwnLoadVoices = Object.prototype.hasOwnProperty.call(manager, 'loadVoices');
    out.hasOwnDeactivate = Object.prototype.hasOwnProperty.call(manager, 'deactivate');
    out.plantedLeftoverStillOwn = S.fakeLoadVoicesAsRead ? manager.loadVoices === S.fakeLoadVoicesAsRead : null;
    out.plantedLeftoverStillDeactivate = S.fakeLoadVoicesAsRead ? manager.deactivate === S.fakeLoadVoicesAsRead : null;

    const entryOf = async () => {
      const lvl = JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList());
      return lvl[readerIndex];
    };
    out.before = await entryOf();

    const findNewErrors = (sinceMs) => {
      const arr = Services.console.getMessageArray() || [];
      const hits = [];
      for (let i = 0; i < arr.length; i++) {
        let se = null;
        try { se = arr[i].QueryInterface(Ci.nsIScriptError); } catch (e) { se = null; }
        const msg = (se && se.errorMessage) || arr[i].message || '';
        const ts = se ? se.timeStamp : null;
        if (/list is undefined/i.test(String(msg)) && typeof ts === 'number' && ts > sinceMs) {
          hits.push({ timeStamp: ts, columnNumber: se ? se.columnNumber : null, sourceName: se ? se.sourceName : null, msg: String(msg).slice(0, 160) });
        }
      }
      return hits;
    };

    // Fish's real remote getVoices() can take well over 10s to answer;
    // load()'s own withTimeout ceiling is 45s (live-voice-list.ts). Each
    // round is given 60s to settle (loading back to 0) BEFORE the next
    // flip fires, so a slow round is never superseded by the next round's
    // own invalidate()+load() -- confirmed live 2026-09-25: a 10s ceiling
    // let round 2 fire while round 1's load() was still in flight, so
    // round 1's late, successful completion was silently discarded by the
    // revision-supersede guard (applied +1 for 2 flips, not +2, with 0
    // errors either way -- not a bug, but not a clean per-round reading).
    const rounds = [];
    let v = Services.prefs.getBoolPref(PREF, true);
    for (let i = 0; i < out.flips; i++) {
      const scriptRoundStart = Date.now();
      const before = await entryOf();
      const revisionBefore = before ? before.revision : 0;
      const appliedBefore = before ? before.applied : 0;
      v = !v;
      Services.prefs.setBoolPref(PREF, v);
      const trace = [];
      // >= +2, never just "> before": a single flip's observer bumps
      // revision twice (invalidate(), then load()'s own ++ at the start of
      // the debounced refresh()) -- ">" alone is satisfied by the brief
      // mid-transition instant between the two (revision +1, loading still
      // 0 because load() has not started yet), read live 2026-09-25 as a
      // false "settled" at t=40ms while the real load() started ~150ms
      // later. Waiting for both bumps is what actually means "this
      // round's own load() ran and finished".
      await waitFor(async () => {
        const e = await entryOf();
        trace.push({ t: Date.now() - scriptRoundStart, revision: e ? e.revision : null, loading: e ? e.loading : null, applied: e ? e.applied : null });
        return e && e.revision >= revisionBefore + 2 && e.loading === 0;
      }, 60000, 200);
      await sleep(150); // let the console/error ring catch up to the settled load()
      const after = await entryOf();
      const newErrors = findNewErrors(scriptRoundStart);
      const settled = !!after && after.loading === 0;
      const appliedIncreased = !!after && after.applied === appliedBefore + 1;
      rounds.push({ flipTo: v, valueNow: Services.prefs.getBoolPref(PREF, true), before, after, newErrors, settled, appliedIncreased, superseded: settled && !appliedIncreased && newErrors.length === 0, traceCount: trace.length, traceFirst: trace[0] || null, traceLast: trace[trace.length - 1] || null });
    }
    out.rounds = rounds;
    out.finalSwitchValue = Services.prefs.getBoolPref(PREF, true);

    const pp = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
    out.pluginPlayerReaderCount = pp.readers ? pp.readers.length : null;
    out.pluginPlayerRows = (pp.readers || []).map(r => ({ providers: r.state?.providers?.length ?? null, voices: r.state?.voices?.length ?? null, locale: r.state?.locale ?? null, error: r.state?.error ?? null }));
    // pluginPlayer() rows carry no itemID (ui/player.ts inspect()); the
    // fixture was attached last (insertion order), so its row is the last
    // one -- matching the identification method plugin-lifecycle's kit
    // already established.
    out.fixturePluginPlayerRow = out.pluginPlayerRows.length ? out.pluginPlayerRows[out.pluginPlayerRows.length - 1] : null;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
