// Item 4 (rewritten 2026-09-15 for issue #110's second run): a pick, and
// each provider's own memory. Drives the fixture's manager the way the
// popup's own dropdown does (selectTier/selectVoice), substituting System
// for Kokoro per the brief.
//
// Why the first run's "selectTier did not stick" was not a bug: on an
// ACTIVE manager (paused counts), voice-switch.ts (issue #108) wraps
// selectVoice/selectTier/setLanguage as a PREVIEW -- it runs the real
// method with _applyVoice/_persistCurrentVoice/_stateChanged suppressed,
// reads the resolved id, then restores manager's _voiceID/_lang/_region/
// _selectedTier/_persistedVoices/_pendingSetVoice to what they were before
// the call even ran (attach()'s `restore()` over `choiceFields`). So
// `selectedTier` reading back unchanged immediately -- and 600ms later --
// is the intended preview, not a revert-bug. The pick is queued as a
// `pending` handoff (begin()) that only lands once the native controller
// actually advances: a mid-word cut found while still paused
// (resumePrepared, needs per-word timestamps on BOTH the outgoing and
// incoming voice at the exact paused position -- armWord/pausedWordHandoff
// in core/voice-switch.ts) or, failing that, the next natural sentence
// transition (the outgoing controller's _speakInternal). Both paths
// require the manager to actually PLAY. Hence every pick below is:
// selectTier/selectVoice, a fresh notifyUserGestureActivation() +
// manager.play(), a poll of up to 15s for selectedTier/selectedVoiceID to
// reach the pick, then manager.pause() -- exactly the case's rewritten
// item 4. Confirmed live 2026-09-15 (clean run): steps 2-4 landed within
// 1.06s/0.88s/1.38s each, via a mix of word-boundary and sentence commits
// depending on whether a shared word alignment existed at the paused
// position -- both paths are normal, not a sign of trouble.
//
// STEP 5 DID NOT PASS in that same clean run: switching system -> a second
// system voice -> fish -> system landed back on the FIRST system voice
// (from step 2), not the second one explicitly picked in step 3 -- even
// though reader.readAloudVoices's tierVoices.system correctly held the
// second voice going into that call. The wrong landing then persisted
// over the correct pref value. This looks like a real gap in the
// per-provider memory the case describes, not a test-script issue -- see
// the kit README's Limits for the full trace and what was ruled out. Left
// as-is here (not "fixed" to expect the wrong outcome): a future run
// should watch step5Resume.landed / afterReselectSystem.selectedVoiceID
// for whether this has changed.
//
// System is an ordinary provider-tiers.ts tier here, not Zotero's own
// hidden Local/OS path: core/providers/system/index.ts republishes the
// same SAPI/OneCore voices as a ProviderTiers RemoteReadAloudVoice with
// real word-level timestamps (system-voices.ts's own comment), backed by
// RemoteReadAloudControllerBase (_getAudioData/_playAudioBuffer) --
// confirmed against the unpacked reader.js: BrowserReadAloudController
// (Zotero's native OS path, always hidden by system-voices.ts) has
// neither method nor _speakInternal, which would make voice-switch.ts's
// begin()/poll() throw and the pick silently fail forever; the plugin's
// System voices do not go through that class at all, so the prepared
// handoff applies to a System pick the same as to Fish/Kokoro.
//
// THE REAL ARRAY PITFALL (corrected 2026-09-15, second attempt): it is not
// about waiving `m`. `m.voices[i].id` read directly (index access from
// chrome) is reliable, waived or not -- confirmed live both ways. But
// `m.voices.map(v => v.id)` / `.every(...)` / `.filter(...)` / `.some(...)`
// with a CHROME callback silently corrupt every element, always answering
// the STRING "undefined" for `.map`, and a wrongly-computed boolean for
// `.every`/`.some` -- proven side by side on the SAME array at the SAME
// moment (a manual for-loop over the identical 339-entry fish list read
// every id correctly while `.map` on it returned "undefined" 339 times).
// This is MEMORY.md's documented pitfall for find/some/filter on a
// reader-realm array given a chrome callback, extended here to map/every
// too -- not a waiving problem, and not fixed by waiving harder. The first
// run's own diagnosis ("waive before reading array elements") was a
// misattribution: waiving is harmless but was not what any working read
// depended on. Every array read below walks by index through the toIds/
// toLabels/allStartWith/anyLabelMatches/firstOtherThan helpers, which take
// no callback into the reader realm.
//
// Probes the audio device (driving notes §3) before the first pick: up to
// ~2s of samples (not one pair at 500ms -- a fresh reader's first resume
// can be slower than a later one, confirmed live: a first attempt read
// suspended/0 unchanged at 500ms, a second attempt on the same reader
// reached running/0.632 by ~600ms), any consecutive advancing pair counts.
// Frozen for the full 2s reports item 4 NOT TESTABLE (machine) and returns
// WITHOUT throwing, so 05-08 still run.
//
// Each resumeAndPoll cycle also reads Zotero.ZoteroTTS.diagnostics.
// voiceSwitch() (sync, chrome-facing) for this reader's handoff `stage`/
// `wordDecision`/`last` -- mechanism-level evidence beyond selectedTier
// alone. If a poll times out, the script re-picks the manager's OWN
// current tier once at the very end (the wrapper's documented "re-pick
// cancels pending work" branch) so a stuck in-flight handoff cannot leak
// into 05/06/07's scripts; 08's reload would clear it anyway, but this
// keeps the state clean even if the reload is skipped.
//
// Sets sameForAllDocuments false for the duration (restored at the end)
// to keep this item's picks from reaching another open, reading tab.
// params: none (reads state.fixture). state: writes secondSystemVoiceID
// for the report only; nothing later depends on it.
(async () => {
  const out = { step: 'per-provider-memory' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const RAV = 'extensions.zotero.reader.readAloudVoices';
  const SAME = 'extensions.zotero.zotero-tts.readAloud.sameForAllDocuments';
  const tierVoicesSnapshot = () => {
    try { return JSON.parse(Services.prefs.getStringPref(RAV, '{}')).en.tierVoices || null; } catch (e) { return null; }
  };
  const tierVoicesKeys = () => { const tv = tierVoicesSnapshot(); return tv ? Object.keys(tv) : null; };

  // Reader-realm array helpers: index access only, never .map/.filter/
  // .every/.some/.find with a chrome callback (see the header comment).
  function toIds(list) { const a = []; for (let i = 0; i < list.length; i++) a.push(String(list[i].id)); return a; }
  function toLabels(list, cap) { const a = []; const n = cap ? Math.min(cap, list.length) : list.length; for (let i = 0; i < n; i++) a.push(list[i].label); return a; }
  function allStartWith(list, prefix) { if (list.length === 0) return false; for (let i = 0; i < list.length; i++) if (!String(list[i].id).startsWith(prefix)) return false; return true; }
  function anyLabelMatches(list, re) { for (let i = 0; i < list.length; i++) if (re.test(list[i].label)) return true; return false; }
  function firstOtherThan(list, excludeId) { for (let i = 0; i < list.length; i++) if (String(list[i].id) !== String(excludeId)) return list[i]; return null; }

  let sameBefore = true;
  let r = null;
  let m = null;
  try {
    const fixture = S.fixture;
    if (!fixture) throw new Error('state.fixture is missing -- run 02-open-fixture-item1.js first');
    const rs = Zotero.Reader._readers || [];
    r = rs.find((x) => x.itemID === fixture.itemID);
    if (!r) throw new Error('fixture reader not found for item ' + fixture.itemID);
    m = Components.utils.waiveXrays(r._internalReader._readAloudManager);
    out.pausedBefore = m.paused;
    out.selectedTierBefore = m.selectedTier;
    out.selectedVoiceIDBefore = m.selectedVoiceID ? String(m.selectedVoiceID) : null;

    sameBefore = Services.prefs.getBoolPref(SAME, true);
    Services.prefs.setBoolPref(SAME, false);

    const doc = r._iframeWindow && r._iframeWindow.document;
    const resumeGesture = () => { if (doc && typeof doc.notifyUserGestureActivation === 'function') doc.notifyUserGestureActivation(); };
    const readAudio = () => {
      const c = m._controller;
      if (!c || !c._audioContext) return { state: null, currentTime: null, noController: !c };
      return { state: c._audioContext.state, currentTime: c._audioContext.currentTime };
    };
    const readerIndex = rs.indexOf(r);
    const handoffFor = () => {
      try {
        const vs = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch());
        const entry = vs.readers.filter((x) => x.index === readerIndex)[0]; // vs.readers is a plain chrome array (JSON.parse'd), not reader-realm
        return entry ? entry.handoff : null;
      } catch (e) { return { handoffError: String(e) }; }
    };

    // --- Audio device probe, before any pick. ---
    resumeGesture();
    m.play();
    const probeSamples = [readAudio()];
    const probeStart = Date.now();
    while (Date.now() - probeStart < 2000) {
      await sleep(300);
      probeSamples.push(readAudio());
    }
    let pauseErr0 = null;
    try { m.pause(); } catch (e) { pauseErr0 = String(e); }
    const advancingPair = (() => {
      for (let i = 1; i < probeSamples.length; i++) {
        const a = probeSamples[i - 1], b = probeSamples[i];
        if (a.currentTime !== null && b.currentTime !== null && b.currentTime > a.currentTime) return { fromIndex: i - 1, toIndex: i, from: a, to: b };
      }
      return null;
    })();
    out.audioProbe = {
      first: probeSamples[0], last: probeSamples[probeSamples.length - 1], count: probeSamples.length,
      advancing: !!advancingPair, advancingPair,
      pausedAfter: m.paused, pauseErr0,
    };
    if (!out.audioProbe.advancing) {
      out.notTestable = 'the audio device did not advance within 2s of resuming on this machine (see audioProbe) -- item 4 NOT TESTABLE (machine); no pick attempted';
      Services.prefs.setBoolPref(SAME, sameBefore);
      out.sameForAllDocumentsRestored = Services.prefs.getBoolPref(SAME, true);
      return JSON.stringify(out);
    }

    // --- The resume/poll/pause helper every pick below uses. ---
    async function resumeAndPoll(matchFn, maxMs = 15000) {
      resumeGesture();
      m.play();
      const t0 = Date.now();
      const trace = [];
      let landed = false;
      while (Date.now() - t0 < maxMs) {
        const h = handoffFor();
        const entry = {
          t: Date.now() - t0,
          selectedTier: m.selectedTier,
          selectedVoiceID: m.selectedVoiceID ? String(m.selectedVoiceID) : null,
          stage: h ? h.stage : null,
          wordDecision: h ? h.wordDecision : null,
        };
        trace.push(entry);
        if (matchFn(entry)) { landed = true; break; }
        await sleep(200);
      }
      let pauseError = null;
      try { m.pause(); } catch (e) { pauseError = String(e); }
      const finalHandoff = handoffFor();
      return {
        landed, ms: Date.now() - t0,
        first: trace[0] || null, last: trace[trace.length - 1] || null, count: trace.length,
        pausedAfter: m.paused, pauseError,
        finalHandoffStage: finalHandoff ? finalHandoff.stage : null,
        finalHandoffLast: finalHandoff ? finalHandoff.last : null,
      };
    }

    // --- Step 2: selectTier('system'). ---
    m.selectTier('system');
    out.step2Resume = await resumeAndPoll((e) => e.selectedTier === 'system');
    out.afterSelectSystem = {
      selectedTier: m.selectedTier,
      voiceIDs: toIds(m.voices),
      allStartWithSystemNamespace: allStartWith(m.voices, 'system::'),
      voicesForLanguageIDs: toIds(m.voicesForLanguage),
      voicesForLanguageAllSystem: allStartWith(m.voicesForLanguage, 'system::'),
      selectedVoiceID: m.selectedVoiceID ? String(m.selectedVoiceID) : null,
    };
    out.selectTierStuck = out.step2Resume.landed && out.afterSelectSystem.selectedTier === 'system';
    out.tierVoicesKeysAfterSystem = tierVoicesKeys();
    out.tierVoicesLastKeyAfterSystem = (() => { const k = tierVoicesKeys(); return k ? k[k.length - 1] : null; })();
    out.tierVoicesSystemNamesResolvedVoice = (() => { const tv = tierVoicesSnapshot(); return tv ? tv.system === out.afterSelectSystem.selectedVoiceID : null; })();

    if (!out.selectTierStuck) {
      out.stoppedEarly = "selectTier('system') did not land within the 15s poll -- see step2Resume/afterSelectSystem; not attempting the second-voice pick against the wrong tier";
    } else {
      // --- Step 3: a second System voice. ---
      const second = firstOtherThan(m.voicesForLanguage, m.selectedVoiceID);
      if (!second) throw new Error('only one System voice is offered for this language -- cannot pick a second one');
      const secondSystemVoiceID = String(second.id);
      out.secondSystemVoiceID = secondSystemVoiceID;
      S.secondSystemVoiceID = secondSystemVoiceID;

      out.labelsSample = toLabels(m.voicesForLanguage, 6);
      out.labelsCarryProviderPrefix = anyLabelMatches(m.voicesForLanguage, /^(System-|Fish-cloud-)/);

      m.selectVoice(secondSystemVoiceID);
      out.step3Resume = await resumeAndPoll((e) => e.selectedVoiceID === secondSystemVoiceID);
      out.selectedVoiceIDAfterPickSecond = m.selectedVoiceID ? String(m.selectedVoiceID) : null;
      out.pickSecondMatches = out.step3Resume.landed && out.selectedVoiceIDAfterPickSecond === secondSystemVoiceID;

      if (!out.pickSecondMatches) {
        out.stoppedEarly = 'selectVoice(secondSystemVoiceID) did not land within the 15s poll -- see step3Resume; not attempting the Fish switch';
      } else {
        // --- Step 4: selectTier('fish'). ---
        m.selectTier('fish');
        out.step4Resume = await resumeAndPoll((e) => e.selectedTier === 'fish');
        out.afterSelectFish = {
          selectedTier: m.selectedTier,
          selectedVoiceID: m.selectedVoiceID ? String(m.selectedVoiceID) : null,
          voicesAllFishNamespace: allStartWith(m.voices, 'fish::'),
        };
        out.selectFishStuck = out.step4Resume.landed && out.afterSelectFish.selectedTier === 'fish';
        const tv4 = tierVoicesSnapshot();
        out.tierVoicesAfterFish = tv4;
        out.fishIsLastKey = tv4 ? Object.keys(tv4)[Object.keys(tv4).length - 1] === 'fish' : null;
        out.tierVoicesSystemMatchesSecond = tv4 ? tv4.system === secondSystemVoiceID : null;

        if (!out.selectFishStuck) {
          out.stoppedEarly = "selectTier('fish') did not land within the 15s poll -- see step4Resume/afterSelectFish; not attempting the reselect-system step";
        } else {
          // --- Step 5: back to System -- the per-provider memory. ---
          m.selectTier('system');
          out.step5Resume = await resumeAndPoll((e) => e.selectedTier === 'system' && e.selectedVoiceID === secondSystemVoiceID);
          out.afterReselectSystem = {
            selectedTier: m.selectedTier,
            selectedVoiceID: m.selectedVoiceID ? String(m.selectedVoiceID) : null,
          };
          out.secondVoiceReturned = out.step5Resume.landed && out.afterReselectSystem.selectedVoiceID === secondSystemVoiceID;
          const tv5 = tierVoicesSnapshot();
          out.tierVoicesAfterReselectSystem = tv5;
          out.tierVoicesEndsWithSystemAgain = tv5 ? Object.keys(tv5)[Object.keys(tv5).length - 1] === 'system' : null;

          // --- Step 6: labels + diagnostics.providerTiers(). ---
          out.labelsAllSample = toLabels(m.voicesForLanguage);
          out.labelsCarryProviderPrefixFinal = anyLabelMatches(m.voicesForLanguage, /^(System-|Fish-cloud-)/);
          try {
            const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
            const mine = pt.readers.filter((x) => x.title === fixture.title)[0]; // pt.readers: plain chrome array too
            out.providerTiersFinal = mine ? { selectedTier: mine.selectedTier, options: mine.options } : null;
          } catch (e) { out.providerTiersFinalError = String(e); }
        }
      }
    }

    // Defensive: flush a stuck pending handoff (a timed-out step above) so
    // 05/06/07 start clean. Re-picking the manager's OWN current tier hits
    // voice-switch.ts's "re-pick cancels pending work" branch instead of
    // starting a new preview.
    try {
      const beforeClear = handoffFor();
      if (beforeClear && beforeClear.pending) {
        m.selectTier(m.selectedTier);
        out.pendingClearedAfterRun = { before: beforeClear, after: handoffFor() };
      }
    } catch (e) { out.pendingClearError = String(e); }
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  try {
    Services.prefs.setBoolPref(SAME, sameBefore);
    out.sameForAllDocumentsRestored = Services.prefs.getBoolPref(SAME, true);
  } catch (e) {
    out.restoreError = String(e);
  }
  // Leave the manager paused, whatever happened.
  try { if (m && !m.paused) m.pause(); } catch (e) { out.finalPauseError = String(e); }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out);
})();
