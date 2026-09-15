// Item 4 (issue #111): "A hidden selection moves." Needs Standard back ON
// first (03 left it off) -- a plain Enable click, done here as SETUP and
// reported as such, not as one of item 5's own checks (item 5 does its own
// later Enable and is what actually verifies that transition's message and
// the voice-browser column). Then, with both on: opens the fixture fresh,
// picks the Standard tier (selectTier -- applies at once since beta5) and
// a voice under it distinct from the tier's own default resolve (the #108
// prepared handoff: resume/poll(<=15s)/pause, retried once on a timeout),
// pauses, closes the tab, disables Standard ("item 3's way" -- the same
// button), reopens fresh and reads providerTiers() for the moved
// selection. Leaves the tab CLOSED and Standard OFF at the end, for 05.
// params: fixtureItemID. state: reads bothOnLanguages/standardOffLanguages
// (03, for the report only); writes item4VoiceID + item4VoiceLabel for 05.
(async () => {
  const out = { step: 'hidden-selection-moves' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = Zotero.ZoteroTTSRun.params;

  function firstOtherThan(list, excludeId) {
    for (let i = 0; i < list.length; i++) if (String(list[i].id) !== String(excludeId)) return list[i];
    return null;
  }
  function toIds(list) { const a = []; for (let i = 0; i < list.length; i++) a.push(String(list[i].id)); return a; }

  async function openFixturePausedFresh(itemID) {
    const memoryVoice = (() => {
      try { return JSON.parse(Zotero.Prefs.get('zotero-tts.readAloud.memory') || '{}').voice; } catch (e) { return null; }
    })();
    const memoryVoiceID = memoryVoice && memoryVoice.id ? String(memoryVoice.id) : null;
    // A metered Zotero voice (no ::) is EXPECTED here once an earlier item
    // in this case has picked one -- this whole case is explicitly about
    // Zotero's voices (rulebook: "...unless the item is about Zotero's
    // voices", which A3-A7 are), so it is never refused; the pause-loop
    // below still catches the session within ~50ms of it opening. Found
    // the hard way: an earlier version of this guard threw here once item
    // 4 had picked a Standard voice, blocking every later reopen in this
    // kit even though playing it briefly, then pausing, is authorized.
    const memoryVoiceMetered = memoryVoiceID ? !memoryVoiceID.includes('::') : null;
    await Zotero.Reader.open(itemID);
    let r = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      r = null;
      const rs = Zotero.Reader._readers || [];
      for (let i = 0; i < rs.length; i++) if (rs[i].itemID === itemID) r = rs[i];
      if (r && r._internalReader && r._internalReader._readAloudManager) break;
      await sleep(300);
    }
    if (!r) throw new Error('reader never appeared for item ' + itemID);
    const mainWin = Zotero.getMainWindow();
    if (mainWin && mainWin.Zotero_Tabs && r.tabID) mainWin.Zotero_Tabs.select(r.tabID);
    const ir = r._internalReader;
    const m = Components.utils.waiveXrays(ir._readAloudManager);
    await ir.toggleReadAloudPopup(true);
    const t1 = Date.now();
    while (Date.now() - t1 < 60000) {
      if (m.active && !m.paused) { try { m.pause(); } catch (e) { /* ignore */ } }
      if (m.active && m.paused) break;
      await sleep(50);
    }
    // Settle: see 03-disable-standard.js's comment -- the catalog's async
    // fetch can still be running when the pause-loop above exits; poll
    // providerTiers() until options/tiers stop changing before returning.
    let settleTitle = null;
    try { settleTitle = Zotero.Items.get(itemID).getField('title'); } catch (e) { /* ignore */ }
    let settleLastKey = null;
    let settleStableSince = null;
    const tSettle = Date.now();
    while (Date.now() - tSettle < 6000) {
      let mine = null;
      try {
        const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
        mine = pt.readers.find((x) => x.title === settleTitle) || null;
      } catch (e) { /* try again */ }
      const key = JSON.stringify(mine ? { tiers: mine.tiers, options: mine.options } : null);
      if (key === settleLastKey) {
        if (settleStableSince !== null && Date.now() - settleStableSince >= 400) break;
        if (settleStableSince === null) settleStableSince = Date.now();
      } else {
        settleLastKey = key;
        settleStableSince = Date.now();
      }
      await sleep(250);
    }

    return { r, ir, m, win: mainWin, tabID: r.tabID, memoryVoiceID, memoryVoiceMetered };
  }
  async function closeFixtureTab(win, tabID) {
    if (win && win.Zotero_Tabs && tabID) win.Zotero_Tabs.close(tabID);
    const t0 = Date.now();
    while (Date.now() - t0 < 10000) {
      const rs = Zotero.Reader._readers || [];
      if (!rs.some((x) => x.tabID === tabID)) break;
      await sleep(150);
    }
  }

  let h = null;
  try {
    const itemID = P.fixtureItemID;
    if (!itemID) throw new Error('params.fixtureItemID is required');

    // --- Setup: re-enable Standard (03 left it off); not one of the 9
    // numbered checks -- item 5 verifies this transition properly later. ---
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 01-pane-structure.js first');
    const doc = win.document;
    out.setupPrefBefore = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    if (out.setupPrefBefore !== true) {
      const toggle = doc.getElementById('ztts-enable-zotero-standard');
      toggle.click();
      const t0 = Date.now();
      while (Date.now() - t0 < 20000) {
        if (Zotero.Prefs.get('zotero-tts.zotero-standard.enabled') === true) break;
        await sleep(200);
      }
      out.setupEnableMs = Date.now() - t0;
    }
    out.setupPrefAfter = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    if (out.setupPrefAfter !== true) throw new Error('setup: could not get Standard back on before item 4');

    // --- Both on: open the fixture, pick the Standard tier + a voice. ---
    h = await openFixturePausedFresh(itemID);
    out.selectedTierAtOpen = h.m.selectedTier;
    out.selectedVoiceAtOpen = h.m.selectedVoiceID ? String(h.m.selectedVoiceID) : null;

    const doc2 = h.r._iframeWindow && h.r._iframeWindow.document;
    const resumeGesture = () => { if (doc2 && typeof doc2.notifyUserGestureActivation === 'function') doc2.notifyUserGestureActivation(); };

    // Tier pick: at once since 1.12.10-beta5 (provider-tiers case, item 4).
    const tPick0 = Date.now();
    h.m.selectTier('standard');
    const tierTrace = [{ t: 0, selectedTier: h.m.selectedTier }];
    while (h.m.selectedTier !== 'standard' && Date.now() - tPick0 < 3000) {
      await sleep(100);
      tierTrace.push({ t: Date.now() - tPick0, selectedTier: h.m.selectedTier });
    }
    out.tierPick = { landedAtOnce: tierTrace.length === 1, ms: Date.now() - tPick0, last: tierTrace[tierTrace.length - 1] };
    if (h.m.selectedTier !== 'standard') throw new Error("selectTier('standard') did not land -- see tierPick");

    out.standardVoiceIDsSample = toIds(h.m.voicesForLanguage).slice(0, 5);
    const target = firstOtherThan(h.m.voicesForLanguage, h.m.selectedVoiceID);
    if (!target) throw new Error('only one Standard voice offered for this language -- cannot pick a distinct one');
    const targetVoiceID = String(target.id);
    out.targetVoiceID = targetVoiceID;
    out.targetVoiceLabel = target.label;

    // Audio probe (driving notes Sec3 / provider-tiers 04's pattern).
    resumeGesture();
    h.m.play();
    const probeSamples = [];
    const readAudio = () => {
      const c = h.m._controller;
      if (!c || !c._audioContext) return { state: null, currentTime: null, noController: !c };
      return { state: c._audioContext.state, currentTime: c._audioContext.currentTime };
    };
    const probeStart = Date.now();
    probeSamples.push(readAudio());
    while (Date.now() - probeStart < 2000) { await sleep(300); probeSamples.push(readAudio()); }
    try { h.m.pause(); } catch (e) { /* ignore */ }
    const advancing = (() => {
      for (let i = 1; i < probeSamples.length; i++) {
        const a = probeSamples[i - 1], b = probeSamples[i];
        if (a.currentTime !== null && b.currentTime !== null && b.currentTime > a.currentTime) return true;
      }
      return false;
    })();
    out.audioProbe = { first: probeSamples[0], last: probeSamples[probeSamples.length - 1], advancing };

    if (!advancing) {
      out.voicePickNotTestable = 'the audio device did not advance within 2s of resuming -- item 4 step "a voice under it" NOT TESTABLE (machine); the tier pick above still stands, no specific voice picked';
    } else {
      async function resumeAndPollVoice(targetID, maxMs) {
        resumeGesture();
        h.m.play();
        const t0 = Date.now();
        const trace = [];
        let landed = false;
        while (Date.now() - t0 < maxMs) {
          const entry = { t: Date.now() - t0, selectedVoiceID: h.m.selectedVoiceID ? String(h.m.selectedVoiceID) : null };
          trace.push(entry);
          if (entry.selectedVoiceID === targetID) { landed = true; break; }
          await sleep(200);
        }
        try { h.m.pause(); } catch (e) { /* ignore */ }
        return { landed, ms: Date.now() - t0, first: trace[0] || null, last: trace[trace.length - 1] || null, count: trace.length };
      }
      h.m.selectVoice(targetVoiceID);
      out.voicePick = await resumeAndPollVoice(targetVoiceID, 15000);
      if (!out.voicePick.landed) {
        out.voicePickRetryNote = 'first attempt did not land within 15s -- retrying once';
        h.m.selectVoice(targetVoiceID);
        out.voicePickRetry = await resumeAndPollVoice(targetVoiceID, 15000);
      }
      out.voicePickLanded = out.voicePick.landed || (out.voicePickRetry && out.voicePickRetry.landed);
      out.selectedVoiceIDAfterPick = h.m.selectedVoiceID ? String(h.m.selectedVoiceID) : null;
      if (out.voicePickLanded) {
        S.item4VoiceID = targetVoiceID;
        S.item4VoiceLabel = target.label;
        out.item4VoiceIDRecorded = targetVoiceID;
      }
    }

    // --- Close the tab, then Disable Standard ("item 3's way"). ---
    await closeFixtureTab(h.win, h.tabID);
    h = null;

    const toggle2 = doc.getElementById('ztts-enable-zotero-standard');
    const result2 = doc.getElementById('ztts-test-result-zotero-standard');
    toggle2.click();
    await sleep(300);
    out.prefAfterDisable = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    out.toggleLabelAfterDisable = toggle2.getAttribute('label');
    out.resultTextAfterDisable = result2 ? result2.textContent : null;

    // --- Reopen fresh: the moved selection. ---
    h = await openFixturePausedFresh(itemID);
    let fixtureTitle = null;
    try { fixtureTitle = Zotero.Items.get(itemID).getField('title'); } catch (e) { /* ignore */ }
    const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    const fixtureEntry = pt.readers.find((x) => x.title === fixtureTitle) || null;
    out.selectedTierAfterReopen = fixtureEntry ? fixtureEntry.selectedTier : null;
    out.selectedTierIsNotStandard = fixtureEntry ? fixtureEntry.selectedTier !== 'standard' : null;
    out.lastMove = fixtureEntry ? fixtureEntry.lastMove : null;
    out.voicesLengthAfterReopen = h.m.voices.length;
    out.selectedVoiceIDAfterReopen = h.m.selectedVoiceID ? String(h.m.selectedVoiceID) : null;

    await closeFixtureTab(h.win, h.tabID);
    h = null;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    // Best-effort: leave no dangling paused fixture tab if we threw mid-way.
    try { if (h) await closeFixtureTab(h.win, h.tabID); } catch (e2) { /* ignore */ }
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
