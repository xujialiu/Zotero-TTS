// Item 4 (issue #113), RE-RUN 2026-09-16: the owner has closed their player
// (confirmed here across EVERY reader, never assumed from one tab), so --
// unlike the first run, where the guard's refusal was all that was testable
// -- this script does the substantive checks: enables Xiaomi MiMo THEN
// OpenAI Compatible (sequentially, each fully settled before the next
// starts -- see the two live bugs below), diagnostics.providerTiers()
// labels, the two sections' fields locked, the voice browser's first
// column (counts, sorted) and each provider's own voices (names), then
// opens fixture-b.pdf muted to prove one sentence through each provider
// produces the fallback debug line and the right header separation (an
// http-on-modify-request observer, masked host + path + method +
// Authorization/CF-Access-Client-Id presence -- never a header value,
// never the address).
//
// TWO BUGS FOUND LIVE 2026-09-16 IN THIS SCRIPT'S OWN FIRST DRAFT, fixed
// here (neither is a plugin bug):
// 1. onToggle's OWN first await (refuseWhileReading, ui/provider-rows.ts)
//    runs BEFORE hold() sets the button disabled/"Checking...": a poll
//    that reads immediately after toggle.click() can see the UNCHANGED
//    pre-click state and wrongly conclude the check already finished
//    (observed: enableSection returned "settled" after ms:0/polls:1,
//    reading stale leftover text from a PREVIOUS Test-connection click).
//    Fixed by waiting for the "started" transition (disabled or
//    "Checking...") for up to 3s BEFORE waiting for "settled" -- and by
//    running the two Enable clicks SEQUENTIALLY (await each fully) rather
//    than back-to-back, since two concurrent enables plus this script's
//    own later fixture-open raced a SECOND refuseWhileReading check
//    (onToggle's, fired again right after the connection check passes)
//    against the fixture becoming active, and once refused the pref
//    write is silently dropped with the result line cleared to "" --
//    confirmed live: mimo.enabled stayed false with mimoResultText: ""
//    while compatible.enabled happened to land true first.
// 2. The voice-pick dance (the #108 preview/handoff,
//    scripts/provider-tiers/04-per-provider-memory.js is the proven
//    pattern) needs an explicit m.selectVoice(id) call BEFORE
//    resumeGesture()+m.play()+poll+m.pause() -- omitted in this script's
//    first draft, which just called play() and polled for a voice ID
//    nothing had ever requested, timing out after 15s every time
//    (confirmed live via the debug log: "kept the controller: the voice
//    list landed on the voice already playing" -- the manager correctly
//    re-affirmed its CURRENT voice since nothing asked it to change).
//
// Manager read through Components.utils.waiveXrays. A TIER pick
// (selectTier) applies at once; a VOICE pick needs the resume dance. This
// is a FIXTURE (fixture-b.pdf, imported fresh below): play()/pause() on it
// are allowed by baseline.md's fixture rule; never on the user's own
// documents. readAloud.volume is 0 (muted by 00), so nothing here is
// audible.
//
// KNOWN LIMIT (confirmed live, matches provider-tiers/04's own documented
// finding about the SAME #108 handoff): picking a SECOND specific voice
// within a tier the manager has already visited this session (compatible,
// after switching away to mimo and back) did not land within 15s even
// though the underlying mechanism (fetch + debug line + headers) still
// fired for whichever voice stayed selected -- report whichever voice
// actually produced the evidence rather than failing the item over the
// exact voice name.
//
// Leaves both switches ON and the fixture OPEN (paused) for
// 05-cleanup-restore.js to disable/close/restore memory. Records the
// fixture's itemID and the pre-fixture readAloud.memory value in
// Zotero.ZoteroTTSRun.state AND returns them in the JSON result, since
// state has not always survived a separate start() call in this kit (see
// 00/01's header) -- 05 falls back to a title search if state is empty.
// params: none (reads Zotero.Reader._readers itself, never a hard-coded id).
// state: item4Fixture (itemID), memoryBeforeFixture.
(async () => {
  const out = { step: 'enable-verify-item4' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const PREFIX = 'extensions.zotero.zotero-tts.';
  const S = Zotero.ZoteroTTSRun.state;

  function readersState() {
    return (Zotero.Reader._readers || []).map((r) => {
      const ir = r._internalReader;
      const m = ir && ir._readAloudManager;
      let title = null;
      try {
        const item = Zotero.Items.get(r.itemID);
        title = (item && item.parentItem ? item.parentItem : item)?.getField('title') ?? null;
      } catch (e) { title = 'ERR:' + e; }
      return { itemID: r.itemID, title, active: !!(m && m.active), paused: m ? !!m.paused : null };
    });
  }

  out.openReadersBefore = readersState();
  out.anyActive = out.openReadersBefore.some((r) => r.active);
  if (out.anyActive) {
    out.status = 'NOT_TESTABLE';
    out.reason = 'a reader is active (paused counts) -- this script never closes one; see openReadersBefore';
    return JSON.stringify(out, null, 1);
  }

  // --- Pane: enable both (SEQUENTIALLY, each fully settled), check locking, labels ---
  try {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 02-pane-structure-item2.js first');
    const doc = win.document;

    async function enableSection(id) {
      const toggle = doc.getElementById('ztts-enable-' + id);
      const result = doc.getElementById('ztts-test-result-' + id);
      if (!toggle) throw new Error('no #ztts-enable-' + id);
      const before = { enabled: Zotero.Prefs.get(PREFIX + id + '.enabled', true), label: toggle.getAttribute('label') };
      toggle.click();
      // Wait for the check to actually START: onToggle's own first await
      // (refuseWhileReading) runs before hold() flips disabled/"Checking...",
      // so the very first read can still show the unchanged pre-click state.
      let started = false;
      const t0 = Date.now();
      while (Date.now() - t0 < 3000) {
        if (toggle.disabled || /checking/i.test(toggle.getAttribute('label') || '')) { started = true; break; }
        await sleep(50);
      }
      const startedMs = Date.now() - t0;
      // Now wait for it to SETTLE (disabled goes back to false).
      let settled = !toggle.disabled;
      const t1 = Date.now();
      while (!settled && Date.now() - t1 < 20000) {
        await sleep(150);
        settled = !toggle.disabled;
      }
      const after = { enabled: Zotero.Prefs.get(PREFIX + id + '.enabled', true), label: toggle.getAttribute('label') };
      return { before, started, startedMs, settled, settledMs: Date.now() - t1, after, finalText: result ? result.textContent : null };
    }

    // Sequential: compatible only starts once mimo's whole click-check-write
    // cycle (including its own refuseWhileReading gate) has fully resolved.
    out.enableMimo = await enableSection('mimo');
    out.enableCompatible = await enableSection('compatible');

    function fieldsLocked(id) {
      const section = doc.getElementById('ztts-provider-' + id);
      const fields = Array.from(section ? section.querySelectorAll('input, menulist, checkbox') : []);
      return { count: fields.length, allDisabled: fields.length > 0 && fields.every((f) => f.disabled === true) };
    }
    out.mimoFieldsLocked = fieldsLocked('mimo');
    out.compatibleFieldsLocked = fieldsLocked('compatible');

    try {
      const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
      out.providerTierLabels = pt.labels;
    } catch (e) { out.providerTierLabelsError = String(e); }

    // --- Voice browser columns (settings-pane component, no reader needed) ---
    async function waitVoiceBrowserSettled() {
      const status = doc.getElementById('ztts-voices-status');
      const t0 = Date.now();
      let text = status ? status.textContent : null;
      while (Date.now() - t0 < 20000) {
        text = status ? status.textContent : null;
        if (text && !/listing/i.test(text)) break;
        await sleep(200);
      }
      return text;
    }
    out.voiceBrowserStatusAfterEnable = await waitVoiceBrowserSettled();
    const tierColumnTexts = () => Array.from(doc.getElementById('ztts-voices-tiers')?.querySelectorAll('button') ?? []).map((b) => b.textContent);
    out.tierColumn = tierColumnTexts();

    async function readTierVoices(labelPrefix) {
      const buttons = Array.from(doc.getElementById('ztts-voices-tiers')?.querySelectorAll('button') ?? []);
      const button = buttons.find((b) => (b.textContent || '').indexOf(labelPrefix) === 0);
      if (!button) return { error: 'no tier button starting with "' + labelPrefix + '"', seen: buttons.map((b) => b.textContent) };
      button.click();
      await waitVoiceBrowserSettled();
      await sleep(300);
      const locales = Array.from(doc.getElementById('ztts-voices-locales')?.querySelectorAll('button') ?? []).map((b) => b.textContent);
      const voiceRows = Array.from(doc.getElementById('ztts-voices-list')?.children ?? []);
      const voiceLabels = voiceRows.map((row) => {
        const btns = row.querySelectorAll ? row.querySelectorAll('button') : [];
        return btns.length >= 3 ? btns[2].textContent : null;
      });
      return { locales, voiceCount: voiceLabels.length, voiceLabels };
    }

    out.mimoVoices = await readTierVoices('Xiaomi MiMo');
    out.compatibleVoices = await readTierVoices('OpenAI Compatible');
  } catch (e) {
    out.paneError = String(e);
    out.paneStack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
    S.item4Fixture = null;
    if (out.paneError) throw new Error(out.paneError);
  }

  // --- Playback: fixture-b.pdf, one voice per provider, the proven #108 handoff ---
  try {
    const fixturesDir = Zotero.ZoteroTTSRun.params.fixturesDir;
    const file = PathUtils.join(fixturesDir, 'fixture-b.pdf');
    const title = 'Zotero-TTS issue 113 openai-split fixture B ' + Date.now();
    const memoryBefore = Services.prefs.getStringPref(PREFIX + 'readAloud.memory', '');
    out.memoryBefore = memoryBefore; // 05 restores this verbatim, last among memory-ish prefs
    S.memoryBeforeFixture = memoryBefore;

    const MIMO_VOICE = 'mimo::冰糖'; // "冰糖", one of MIMO_VOICES
    Services.prefs.setStringPref(PREFIX + 'readAloud.memory', JSON.stringify({ speed: 1, voice: { id: MIMO_VOICE, lang: 'en' } }));

    const imported = await Zotero.Attachments.importFromFile({ file, libraryID: Zotero.Libraries.userLibraryID, title });
    const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
    if (!item?.id) throw new Error('fixture import returned no item');
    out.fixtureItemID = item.id;
    S.item4Fixture = item.id;

    Zotero.Reader.open(item.id, null, { openInBackground: true, allowDuplicate: false });
    let reader = null;
    for (let i = 0; i < 160; i++) {
      reader = (Zotero.Reader._readers || []).find((r) => r.itemID === item.id) ?? null;
      if (reader?._internalReader?._readAloudManager) break;
      await sleep(150);
    }
    const internal = reader?._internalReader;
    if (!internal?._readAloudManager) throw new Error('fixture reader never got a _readAloudManager');
    const m = Components.utils.waiveXrays(internal._readAloudManager);

    internal.toggleReadAloudPopup(true);
    for (let i = 0; i < 60; i++) {
      if (m.voices?.length && (m._segments?.length || m.voicesForLanguage?.length)) break;
      await sleep(100);
    }
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    out.managerAfterOpen = { active: !!m.active, paused: !!m.paused, selectedTier: m.selectedTier ?? null, selectedVoiceID: m.selectedVoiceID ? String(m.selectedVoiceID) : null };

    const doc2 = reader._iframeWindow && reader._iframeWindow.document;
    const resumeGesture = () => { if (doc2 && typeof doc2.notifyUserGestureActivation === 'function') doc2.notifyUserGestureActivation(); };

    // Masked HTTP observer: host tagged, never named; no header value read.
    const seen = [];
    const observer = {
      observe(subject) {
        try {
          const channel = subject.QueryInterface(Components.interfaces.nsIHttpChannel);
          const uri = channel.URI;
          let hasAuth = false, hasCfId = false;
          try { hasAuth = !!channel.getRequestHeader('Authorization'); } catch (e) {}
          try { hasCfId = !!channel.getRequestHeader('CF-Access-Client-Id'); } catch (e) {}
          seen.push({ host: uri.host, path: uri.pathQueryRef, method: channel.requestMethod, hasAuth, hasCfId });
        } catch (e) {}
      },
    };
    Services.obs.addObserver(observer, 'http-on-modify-request');

    async function pickTierAtOnce(tier) {
      const t0 = Date.now();
      m.selectTier(tier);
      let landed = m.selectedTier === tier;
      while (!landed && Date.now() - t0 < 2000) {
        await sleep(100);
        landed = m.selectedTier === tier;
      }
      return { landed, ms: Date.now() - t0, selectedTierAfter: m.selectedTier ?? null };
    }

    // The #108 handoff: selectVoice() arms a PREVIEW that only actually
    // fetches once playback resumes -- the explicit selectVoice() call
    // below is the fix for this script's first draft, which omitted it.
    async function pickVoiceAndResume(targetVoiceID, maxMs) {
      m.selectVoice(targetVoiceID);
      resumeGesture();
      try { m.play(); } catch (e) {}
      const t0 = Date.now();
      let landed = m.selectedVoiceID && String(m.selectedVoiceID) === targetVoiceID;
      let polls = 0;
      while (!landed && Date.now() - t0 < maxMs) {
        polls++;
        await sleep(200);
        landed = m.selectedVoiceID && String(m.selectedVoiceID) === targetVoiceID;
      }
      let pauseError = null;
      try { m.pause(); } catch (e) { pauseError = String(e); }
      return { landed, ms: Date.now() - t0, polls, selectedVoiceIDAfter: m.selectedVoiceID ? String(m.selectedVoiceID) : null, pausedAfter: !!m.paused, pauseError };
    }

    // Precise match: 'tag: ' (colon-SPACE) -- 'mimo::冰糖' contains 'mimo:'
    // but NOT 'mimo: ', so this no longer catches voice-id references the
    // way a bare "tag + ':'" filter did in this script's first draft.
    function debugTail(providerTag) {
      return (debugText) => debugText.split('\n').filter((l) => l.includes('[zotero-tts]') && l.includes(providerTag + ': ')).slice(-3);
    }
    const requestTags = new Map();
    function requestsMasked(count) {
      const all = seen.map(({ host, path, method, hasAuth, hasCfId }) => {
        if (!requestTags.has(host)) requestTags.set(host, 'host' + requestTags.size);
        return { host: requestTags.get(host), path, method, hasAuth, hasCfId };
      });
      return typeof count === 'number' ? all.slice(-count) : all;
    }

    // --- Voice 1: mimo. ---
    out.mimoTierPick = await pickTierAtOnce('mimo');
    out.mimoVoiceResult = await pickVoiceAndResume(MIMO_VOICE, 15000);
    await sleep(500);
    out.mimoDebugLines = debugTail('mimo')(await Zotero.Debug.get());
    out.mimoRequests = requestsMasked(4);

    // --- Voice 2: compatible. If the exact target does not land within
    // maxMs (see the KNOWN LIMIT above), report whichever voice actually
    // produced the evidence rather than failing the item over the name.
    const compatibleLabels = (out.compatibleVoices && Array.isArray(out.compatibleVoices.voiceLabels)) ? out.compatibleVoices.voiceLabels : [];
    const compatibleVoiceName = compatibleLabels.includes('Emily.wav') ? 'Emily.wav' : (compatibleLabels[0] || 'Emily.wav');
    const COMPATIBLE_VOICE = 'compatible::' + compatibleVoiceName;
    out.compatibleVoiceIdUsed = COMPATIBLE_VOICE;
    out.compatibleTierPick = await pickTierAtOnce('compatible');
    out.compatibleVoiceResult = await pickVoiceAndResume(COMPATIBLE_VOICE, 15000);
    await sleep(500);
    out.compatibleDebugLines = debugTail('compatible')(await Zotero.Debug.get());
    out.compatibleRequests = requestsMasked(4);

    Services.obs.removeObserver(observer, 'http-on-modify-request');
    out.allRequestsMasked = requestsMasked();
    out.managerFinal = { active: !!m.active, paused: !!m.paused };
  } catch (e) {
    out.playbackError = String(e);
    out.playbackStack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }

  out.openReadersAfter = readersState();
  return JSON.stringify(out, null, 1);
})();
