// Item 4 (rewritten 2026-09-15 for 1.12.10-beta5, third run of issue #110):
// a TIER (or language) pick on a paused player now applies AT ONCE --
// voice-switch.ts lets selectTier/setLanguage through to Zotero directly
// since beta5. On run 2 against beta3, every pick -- including tier picks --
// went through the #108 preview/pending mechanism and needed a
// play/poll/pause cycle to land; that is no longer how a tier pick behaves,
// and the case's item 4 was rewritten to match. Only a VOICE pick
// (selectVoice) is still the #108 prepared handoff: it runs as a preview and
// the switch lands only once playback resumes, so it alone needs the fresh
// notifyUserGestureActivation() + manager.play() + poll(<=15s) +
// manager.pause() dance.
//
// Sequence, per the case's rewritten item 4 and this profile's brief (System
// substitutes for Kokoro, Fish-cloud is the second tier):
//   1. selectTier('system')      -- at once, no resume
//   2. selectVoice(<2nd system>) -- the #108 handoff (resume/poll/pause)
//   3. selectTier('fish')        -- at once, no resume
//   4. selectTier('system')      -- at once; selectedVoiceID should equal
//      the 2nd system voice: the per-provider memory. This is exactly the
//      step that did NOT hold on beta3 (run 2, see the kit README's Limits)
//      when tier picks still went through the resume dance; beta4 added the
//      selectTier hook that refreshes _persistedVoices from the reader's
//      state before the pick reads it (Zotero itself refreshes that entry
//      only when a popup opens -- reader.js:82359, 84170-84176), and beta5
//      stopped queuing tier picks as a preview at all. Watch
//      step4PickSystemAgain / afterReselectSystem.selectedVoiceID for
//      whether the two fixes together hold this run.
//
// System is an ordinary provider-tiers.ts tier here, not Zotero's own hidden
// Local/OS path: core/providers/system/index.ts republishes the same
// SAPI/OneCore voices as a ProviderTiers RemoteReadAloudVoice with real
// word-level timestamps (system-voices.ts's own comment), backed by
// RemoteReadAloudControllerBase -- confirmed against the unpacked reader.js:
// BrowserReadAloudController (Zotero's native OS path, always hidden by
// system-voices.ts) has neither _getAudioData/_playAudioBuffer nor
// _speakInternal, which would make voice-switch.ts's begin()/poll() throw
// and the pick silently fail forever; the plugin's System voices do not go
// through that class at all, so the #108 handoff applies to a System voice
// pick the same as to Fish/Kokoro.
//
// ARRAY PITFALL (2026-09-15, confirmed twice): m.voices.map/.every/.filter/
// .some given a CHROME callback silently corrupt every element -- always the
// STRING "undefined" for .map, a wrong boolean for .every/.some -- proven
// side by side against a manual for-loop reading the identical array
// correctly at the same instant, waived or not. This is MEMORY/code.md's
// documented find/some/filter pitfall on a reader-realm array given a chrome
// callback, extended here to map/every too. Every array read below walks by
// index through toIds/toLabels/allStartWith/anyLabelMatches/firstOtherThan,
// which take no callback into the reader realm.
//
// Probes the audio device (driving notes §3) before the voice-pick step: up
// to ~2s of samples, any consecutive advancing pair counts. Frozen for the
// full 2s reports item 4 NOT TESTABLE (machine) and returns WITHOUT
// throwing, so 05-08 still run.
//
// STEP 2 TIMING (found 2026-09-15, run 3, live on this build, NOT fixed by
// retrying -- read this before trusting a FAIL here): the voice-pick handoff
// has two commit paths (armWord/pausedWordHandoff in core/voice-switch.ts,
// matching the original run-2 header note below) -- an instant mid-word cut
// when the outgoing and incoming voice share a word boundary at the exact
// paused position (`wordDecision: "shared-word-boundary"`, one clean
// occurrence took 759ms), or else a wait for the CURRENT sentence to finish
// naturally (`wordDecision: "paused-sentence-fallback"`, `stage` stays
// "preparing" and `pending` stays set the whole time -- this is a real wait,
// not a hang: Zotero.ZoteroTTS.diagnostics.voiceSwitch() read live during
// the wait shows `audioReady` progressing). On this run the reader had
// drifted through several minutes of accumulated play/pause cycles by the
// time step 2 ran (`audioProbe.first.currentTime` past 120s), so whatever
// sentence it was paused inside apparently did not finish within either a
// 15s poll OR a 15s retry straight after (30s cumulative, twice, both ending
// on `paused-sentence-fallback`) -- only the one earlier attempt at a
// DIFFERENT paused position landed instantly. So: a 15s poll (with or
// without the retry below) is not long enough to deterministically verify
// this step regardless of pause position; the retry is kept because it is
// harmless and occasionally lands on a shared-word-boundary case, not
// because it reliably clears a sentence-fallback wait. Report a timeout here
// with the wordDecision/pending evidence, not as a silent hang.
//
// Sets sameForAllDocuments false for the duration (restored at the end) to
// keep this item's picks from reaching another open, reading tab.
// params: none (reads state.fixture). state: writes secondSystemVoiceID for
// the report only; nothing later depends on it.
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
    for (let i = 0; i < rs.length; i++) if (rs[i].itemID === fixture.itemID) r = rs[i];
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

    // --- Audio device probe, before the voice-pick step. ---
    resumeGesture();
    m.play();
    const probeSamples = [readAudio()];
    const probeStart = Date.now();
    while (Date.now() - probeStart < 2000) {
      await sleep(300);
      probeSamples.push(readAudio());
    }
    try { m.pause(); } catch (e) { /* ignore */ }
    const advancingPair = (() => {
      for (let i = 1; i < probeSamples.length; i++) {
        const a = probeSamples[i - 1], b = probeSamples[i];
        if (a.currentTime !== null && b.currentTime !== null && b.currentTime > a.currentTime) return { fromIndex: i - 1, toIndex: i, from: a, to: b };
      }
      return null;
    })();
    out.audioProbe = {
      first: probeSamples[0], last: probeSamples[probeSamples.length - 1], count: probeSamples.length,
      advancing: !!advancingPair, advancingPair, pausedAfter: m.paused,
    };
    if (!out.audioProbe.advancing) {
      out.notTestable = 'the audio device did not advance within 2s of resuming on this machine (see audioProbe) -- item 4 NOT TESTABLE (machine); no pick attempted';
      Services.prefs.setBoolPref(SAME, sameBefore);
      out.sameForAllDocumentsRestored = Services.prefs.getBoolPref(SAME, true);
      return JSON.stringify(out);
    }

    // --- A TIER (or language) pick: applies at once since 1.12.10-beta5, no
    // resume needed. Still poll briefly (<=2s) in case "the lists follow"
    // lags the call by a tick, and report whether it landed on the very
    // first read (landedAtOnce) or needed extra polls.
    async function pickTierAtOnce(tier) {
      const t0 = Date.now();
      m.selectTier(tier);
      const trace = [{ t: 0, selectedTier: m.selectedTier }];
      while (m.selectedTier !== tier && Date.now() - t0 < 2000) {
        await sleep(100);
        trace.push({ t: Date.now() - t0, selectedTier: m.selectedTier });
      }
      return { landedAtOnce: trace.length === 1 && trace[0].selectedTier === tier, ms: Date.now() - t0, first: trace[0], last: trace[trace.length - 1], count: trace.length };
    }

    // --- A VOICE pick is still the #108 prepared handoff: play, poll up to
    // 15s, pause.
    async function resumeAndPollVoice(targetVoiceID, maxMs = 15000) {
      resumeGesture();
      m.play();
      const t0 = Date.now();
      const trace = [];
      let landed = false;
      while (Date.now() - t0 < maxMs) {
        const h = handoffFor();
        const entry = {
          t: Date.now() - t0,
          selectedVoiceID: m.selectedVoiceID ? String(m.selectedVoiceID) : null,
          stage: h ? h.stage : null,
          wordDecision: h ? h.wordDecision : null,
        };
        trace.push(entry);
        if (entry.selectedVoiceID === targetVoiceID) { landed = true; break; }
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

    // --- Step 1: selectTier('system'), at once. ---
    out.step1PickSystem = await pickTierAtOnce('system');
    out.afterSelectSystem = {
      selectedTier: m.selectedTier,
      voiceIDs: toIds(m.voices),
      allStartWithSystemNamespace: allStartWith(m.voices, 'system::'),
      voicesForLanguageAllSystem: allStartWith(m.voicesForLanguage, 'system::'),
      selectedVoiceID: m.selectedVoiceID ? String(m.selectedVoiceID) : null,
    };
    out.tierVoicesLastKeyAfterSystem = (() => { const k = tierVoicesKeys(); return k ? k[k.length - 1] : null; })();
    out.tierVoicesSystemNamesResolvedVoice = (() => { const tv = tierVoicesSnapshot(); return tv ? tv.system === out.afterSelectSystem.selectedVoiceID : null; })();

    if (m.selectedTier !== 'system') {
      out.stoppedEarly = "selectTier('system') did not read back 'system' within 2s -- see step1PickSystem/afterSelectSystem; not attempting the rest";
    } else {
      const second = firstOtherThan(m.voicesForLanguage, m.selectedVoiceID);
      if (!second) throw new Error('only one System voice is offered for this language -- cannot pick a second one');
      const secondSystemVoiceID = String(second.id);
      out.secondSystemVoiceID = secondSystemVoiceID;
      S.secondSystemVoiceID = secondSystemVoiceID;
      out.labelsSample = toLabels(m.voicesForLanguage, 6);
      out.labelsCarryProviderPrefix = anyLabelMatches(m.voicesForLanguage, /^(System-|Fish-cloud-)/);

      // --- Step 2: selectVoice(secondSystemVoiceID) -- the #108 handoff. ---
      // The very FIRST resume right after a tier switch can stall in
      // "preparing" for the whole 15s poll (observed 2026-09-15, run 3: the
      // stage never advanced, pending stayed set) -- a second attempt
      // straight after typically lands within ~1s via a shared-word-
      // boundary commit, once the tier's own controller has actually
      // started playing once. Re-picking the SAME target is safe
      // (voice-switch.ts's "re-pick cancels pending work" branch), so retry
      // once before giving up, recording both attempts.
      m.selectVoice(secondSystemVoiceID);
      out.step2ResumeVoice = await resumeAndPollVoice(secondSystemVoiceID);
      if (!out.step2ResumeVoice.landed) {
        out.step2RetryNote = 'first attempt did not land within 15s -- retrying once (see the kit README Limits)';
        m.selectVoice(secondSystemVoiceID);
        out.step2ResumeVoiceRetry = await resumeAndPollVoice(secondSystemVoiceID);
      }
      out.selectedVoiceIDAfterPickSecond = m.selectedVoiceID ? String(m.selectedVoiceID) : null;
      out.pickSecondMatches = (out.step2ResumeVoice.landed || (out.step2ResumeVoiceRetry && out.step2ResumeVoiceRetry.landed)) && out.selectedVoiceIDAfterPickSecond === secondSystemVoiceID;

      if (!out.pickSecondMatches) {
        out.stoppedEarly = 'selectVoice(secondSystemVoiceID) did not land within the 15s poll -- see step2ResumeVoice; not attempting the Fish switch';
      } else {
        // --- Step 3: selectTier('fish'), at once. ---
        out.step3PickFish = await pickTierAtOnce('fish');
        out.afterSelectFish = {
          selectedTier: m.selectedTier,
          selectedVoiceID: m.selectedVoiceID ? String(m.selectedVoiceID) : null,
          voicesAllFishNamespace: allStartWith(m.voices, 'fish::'),
        };
        const tv3 = tierVoicesSnapshot();
        out.tierVoicesAfterFish = tv3;
        out.fishIsLastKey = tv3 ? Object.keys(tv3)[Object.keys(tv3).length - 1] === 'fish' : null;
        out.tierVoicesSystemMatchesSecond = tv3 ? tv3.system === secondSystemVoiceID : null;

        if (m.selectedTier !== 'fish') {
          out.stoppedEarly = "selectTier('fish') did not read back 'fish' within 2s -- see step3PickFish/afterSelectFish; not attempting the reselect-system step";
        } else {
          // --- Step 4: selectTier('system') again, at once -- the
          // per-provider memory. ---
          out.step4PickSystemAgain = await pickTierAtOnce('system');
          out.afterReselectSystem = {
            selectedTier: m.selectedTier,
            selectedVoiceID: m.selectedVoiceID ? String(m.selectedVoiceID) : null,
          };
          out.secondVoiceReturned = out.afterReselectSystem.selectedTier === 'system' && out.afterReselectSystem.selectedVoiceID === secondSystemVoiceID;
          const tv4 = tierVoicesSnapshot();
          out.tierVoicesAfterReselectSystem = tv4;
          out.tierVoicesEndsWithSystemAgain = tv4 ? Object.keys(tv4)[Object.keys(tv4).length - 1] === 'system' : null;

          out.labelsAllSample = toLabels(m.voicesForLanguage);
          out.labelsCarryProviderPrefixFinal = anyLabelMatches(m.voicesForLanguage, /^(System-|Fish-cloud-)/);

          try {
            const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
            const mine = pt.readers.filter((x) => x.title === fixture.title)[0]; // pt.readers: plain chrome array too
            out.providerTiersFinal = mine ? { selectedTier: mine.selectedTier, options: mine.options, tierMemoryHook: mine.tierMemoryHook } : null;
          } catch (e) { out.providerTiersFinalError = String(e); }

          try {
            const log = await Zotero.Debug.get();
            const lines = String(log).split('\n').filter((l) => l.includes('provider tiers'));
            out.debugLinesMemoryHook = lines.filter((l) => l.includes("each entry's own memory follows the reader's state"));
            out.debugLinesSample = lines.slice(-6);
          } catch (e) { out.debugLinesError = String(e); }
        }
      }
    }

    // Defensive: flush a stuck pending handoff (a timed-out voice pick
    // above) so 05/06/07 start clean. Re-picking the manager's OWN current
    // tier hits voice-switch.ts's "re-pick cancels pending work" branch
    // instead of starting a new preview.
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
