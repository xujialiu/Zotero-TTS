return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const transport = state.transport;
  if (!transport?.readers?.pdf || !transport?.readers?.epub) throw new Error('108 transport readers are missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const memoryName = 'extensions.zotero.zotero-tts.readAloud.memory';
  const voicesName = 'extensions.zotero.reader.readAloudVoices';
  const normalize = value => String(value || '').trim().replace(/\s+/g, ' ');
  const rawPref = name => {
    try { return Services.prefs.getStringPref(name, ''); } catch (e) { return null; }
  };
  const safeJSON = value => {
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return null; }
  };
  const managerState = entry => {
    const manager = entry.manager;
    const c = manager?._controller;
    const segment = Number.isFinite(c?._position) ? manager?._segments?.[c._position] : null;
    const context = c?._audioContext;
    const result = {
      active: !!manager?.active, paused: !!manager?.paused, selected: manager?.selectedVoiceID ?? null,
      tier: manager?._selectedTier ?? null, lang: manager?.lang ?? null, region: manager?.region ?? null,
      position: Number.isFinite(c?._position) ? c._position : null,
      currentIndex: Number.isFinite(c?._currentIndex) ? c._currentIndex : null,
      progress: Number.isFinite(c?._currentPlaybackTime) ? c._currentPlaybackTime : null,
      segmentText: segment ? String(segment.text ?? '') : null,
      sourcePlaying: !!c?._isPlaying, source: !!c?._sourceNode,
      controller: !!c, destroyed: !!c?._destroyed,
      audio: { state: context?.state ?? null, time: Number.isFinite(context?.currentTime) ? context.currentTime : null },
    };
    // Keep the cross-realm object available for identity checks without
    // serializing the entire native controller into the evidence JSON.
    Object.defineProperty(result, '_controller', { value: c, enumerable: false });
    return result;
  };
  const diagnostic = entry => {
    const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch());
    const index = (Zotero.Reader._readers || []).indexOf(entry.reader);
    return { all, fixture: all.readers?.[index] ?? null };
  };
  const targetVoice = (entry, id) => {
    const list = Components.utils.waiveXrays(entry.manager.allVoices) || [];
    for (let i = 0; i < (list?.length ?? 0); i++) if (String(list[i]?.id ?? '') === id) return list[i];
    return null;
  };
  const press = (entry, key, code, keyCode) => {
    const rw = entry.window;
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const ev = (value, valueCode, valueKeyCode, shiftKey = false) => new K('', {
      key: value, code: valueCode, keyCode: valueKeyCode, bubbles: true, cancelable: true, shiftKey,
    });
    tip.beginInputTransactionForTests(rw);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(key, code, keyCode, true)),
      tip.keyup(ev(key, code, keyCode, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  };
  const waitFor = async (predicate, limit = 60, interval = 80) => {
    for (let i = 0; i < limit; i++) {
      if (predicate()) return true;
      await sleep(interval);
    }
    return false;
  };
  const optionInfo = option => ({
    id: option?.id || null,
    value: option?.getAttribute?.('value') || null,
    voiceID: option?.getAttribute?.('data-voice-id') || null,
    label: option?.getAttribute?.('aria-label') || null,
    text: normalize(option?.textContent),
  });
  const popupOptions = popup => {
    const options = popup?.querySelectorAll?.('[role="option"]') || [];
    const rows = [];
    for (let i = 0; i < options.length; i++) rows.push({ element: options[i], info: optionInfo(options[i]) });
    return rows;
  };
  const popupButtons = popup => {
    const buttons = popup?.querySelectorAll?.('button') || [];
    const rows = [];
    for (let i = 0; i < buttons.length; i++) rows.push({
      element: buttons[i], aria: buttons[i].getAttribute?.('aria-label') || null,
      text: normalize(buttons[i].textContent), title: buttons[i].getAttribute?.('title') || null,
    });
    return rows;
  };
  const choosePopupOption = async (entry, control, matcher) => {
    const doc = entry.window?.document;
    const popup = doc?.querySelector?.('.read-aloud-popup');
    if (!popup) return { ok: false, reason: 'popup missing', buttons: [] };
    const buttons = popupButtons(popup);
    let trigger = null;
    for (let i = 0; i < buttons.length; i++) {
      if (buttons[i].aria === control) { trigger = buttons[i].element; break; }
    }
    for (let i = 0; i < buttons.length; i++) {
      if (trigger) break;
      const hay = `${buttons[i].aria || ''} ${buttons[i].text || ''} ${buttons[i].title || ''}`.toLowerCase();
      if (hay.includes(control.toLowerCase())) { trigger = buttons[i].element; break; }
    }
    if (!trigger) {
      const direct = popup.querySelector?.(`button[aria-label="${control}"]`);
      if (direct) trigger = direct;
    }
    if (!trigger) return { ok: false, reason: `control ${control} missing`, buttons };
    let clickError = null;
    try { trigger.click(); } catch (e) { clickError = String(e); }
    await sleep(120);
    const rows = popupOptions(popup);
    let picked = null;
    for (let i = 0; i < rows.length; i++) if (matcher(rows[i].info)) { picked = rows[i]; break; }
    if (!picked) return { ok: false, reason: 'target option missing', clickError, buttons, options: rows.map(row => row.info) };
    const rw = entry.window;
    let dispatchError = null;
    try {
      const EventCtor = rw.PointerEvent;
      if (typeof EventCtor !== 'function') throw new Error('PointerEvent is unavailable');
      picked.element.dispatchEvent(new EventCtor('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
    } catch (e) { dispatchError = String(e); }
    await sleep(160);
    return { ok: !clickError && !dispatchError, clickError, dispatchError, buttons, option: picked.info };
  };
  const instrumentControllerFactory = (voice, record) => {
    if (!voice || typeof voice.getController !== 'function') return () => {};
    const original = voice.getController;
    const descriptor = Object.getOwnPropertyDescriptor(voice, 'getController');
    const restoreOwn = (object, name, oldDescriptor) => {
      if (oldDescriptor) Object.defineProperty(object, name, oldDescriptor);
      else delete object[name];
    };
    voice.getController = function (...args) {
      const prepared = Reflect.apply(original, this, args);
      record.prepared = prepared;
      try {
        const c = Components.utils.waiveXrays(prepared);
        const play = c._playAudioBuffer;
        const playDescriptor = Object.getOwnPropertyDescriptor(c, '_playAudioBuffer');
        c._playAudioBuffer = function (...playArgs) {
          record.preparedPlays.push({ index: Number(c._position), offset: Number(playArgs[1]), at: Date.now() });
          return Reflect.apply(play, this, playArgs);
        };
        record.restorePrepared = () => restoreOwn(c, '_playAudioBuffer', playDescriptor);
      } catch (e) { record.patchErrors.push(`prepared controller: ${String(e)}`); }
      return prepared;
    };
    return () => restoreOwn(voice, 'getController', descriptor);
  };
  const instrumentOld = (old, record) => {
    if (!old || typeof old._playAudioBuffer !== 'function') return () => {};
    const c = Components.utils.waiveXrays(old);
    const original = c._playAudioBuffer;
    const descriptor = Object.getOwnPropertyDescriptor(c, '_playAudioBuffer');
    c._playAudioBuffer = function (...args) {
      record.oldPlays.push({ index: Number(c._position), offset: Number(args[1]), at: Date.now() });
      return Reflect.apply(original, this, args);
    };
    return () => {
      if (descriptor) Object.defineProperty(c, '_playAudioBuffer', descriptor);
      else delete c._playAudioBuffer;
    };
  };
  const persistedSummary = entry => {
    const m = Components.utils.waiveXrays(entry.manager);
    const value = safeJSON(m?._persistedVoices);
    if (!value || typeof value !== 'object') return null;
    return { voice: value.voice ?? null, region: value.region ?? null, speed: value.speed ?? null, tierVoices: value.tierVoices ?? null };
  };
  const otherState = (kind, currentKind) => {
    const other = transport.readers[kind];
    if (!other || kind === currentKind) return null;
    const s = managerState(other);
    return { selected: s.selected, tier: s.tier, lang: s.lang, region: s.region, position: s.position, controller: s.controller, _controller: s._controller };
  };
  const runOne = async (kind, actualPopup) => {
    const entry = transport.readers[kind];
    const manager = entry.manager;
    const mw = Components.utils.waiveXrays(manager);
    const out = { kind, status: 'FAIL', errors: [], controlsAttached: null };
    const index = (Zotero.Reader._readers || []).indexOf(entry.reader);
    const beforeDiagnostic = diagnostic(entry);
    out.controlsAttached = beforeDiagnostic.fixture?.handoff?.controlsAttached ?? null;
    out.initial = managerState(entry);
    if (!out.initial.active) throw new Error(`${kind} manager is not active`);
    // Start, then pause inside a known word so the prepared branch has a real
    // source position and a native timestamp to work from.
    if (manager.paused) {
      try { Zotero.getMainWindow?.().Zotero_Tabs?.select(entry.tabID); entry.reader.focus?.(); entry.window.focus?.(); } catch (e) {}
      out.startKey = press(entry, ' ', 'Space', 32);
      entry.window.document.notifyUserGestureActivation();
      if (manager.paused) manager.play();
      const oldContext = manager._controller?._audioContext;
      out.outputResume = oldContext?.state === 'suspended'
        ? await Promise.race([oldContext.resume().then(() => 'resumed'), sleep(2500).then(() => 'timeout')]) : oldContext?.state;
      const running = await waitFor(() => {
        const s = managerState(entry);
        return s.active && !s.paused && s.sourcePlaying && s.audio.state === 'running' && s.progress > 0.15;
      }, 60, 50);
      if (!running) {
        out.clock = { status: 'NOT TESTABLE', reason: 'fixture audio clock did not run', state: managerState(entry) };
        if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
      } else {
        out.clock = { status: 'PASS', state: managerState(entry) };
      }
      try { manager.pause(); } catch (e) { out.errors.push(`pause: ${String(e)}`); }
      await sleep(100);
    }
    const paused = managerState(entry);
    out.pausedWord = {
      position: paused.position, currentIndex: paused.currentIndex, progress: paused.progress,
      segmentText: paused.segmentText, selected: paused.selected, controller: paused.controller,
      timestamp: safeJSON(mw._controller?._currentTimestamps?.[0]) ?? null,
    };
    const originalVoice = String(paused.selected || 'native108-a');
    const targetID = 'native108-b';
    const target = targetVoice(entry, targetID);
    if (!target) throw new Error(`${kind} target ${targetID} is missing`);
    const record = { prepared: null, preparedPlays: [], oldPlays: [], patchErrors: [], restorePrepared: null };
    const restoreFactory = instrumentControllerFactory(target, record);
    const old = paused._controller;
    const restoreOld = instrumentOld(old, record);
    const beforeMemory = rawPref(memoryName);
    const beforeVoices = rawPref(voicesName);
    const otherBefore = otherState(kind === 'pdf' ? 'epub' : 'pdf', kind);
    transport.delayMs = 650;
    transport.delayVoiceID = targetID;
    const callStart = Date.now();
    let popupAction = null;
    if (actualPopup) {
      popupAction = await choosePopupOption(entry, 'Voice', info => info.voiceID === targetID || info.id === targetID || info.text.includes('Issue 108 Fixture B'));
      out.popupAction = popupAction;
      if (!popupAction.ok) {
        restoreFactory(); restoreOld();
        out.status = 'FAIL';
        out.errors.push(`actual popup voice selection failed: ${popupAction.reason || popupAction.dispatchError || popupAction.clickError}`);
        return out;
      }
    } else {
      try { manager.selectVoice(targetID); } catch (e) { out.errors.push(`selectVoice: ${String(e)}`); }
    }
    await sleep(150);
    const afterRequest = managerState(entry);
    const pendingDiagnostic = diagnostic(entry);
    out.selection = {
      route: actualPopup ? 'popup pointerup' : 'manager.selectVoice',
      original: { voice: originalVoice, controllerSame: afterRequest._controller === old },
      afterRequest: {
        state: afterRequest, handoff: pendingDiagnostic.fixture?.handoff ?? null,
        memoryUnchanged: rawPref(memoryName) === beforeMemory,
        voicesPrefUnchanged: rawPref(voicesName) === beforeVoices,
        otherReaderUnchanged: (() => {
          const now = otherState(kind === 'pdf' ? 'epub' : 'pdf', kind);
          return !!otherBefore && !!now && now.selected === otherBefore.selected && now._controller === otherBefore._controller
            && now.position === otherBefore.position;
        })(),
      },
    };
    const ready = await waitFor(() => {
      const d = diagnostic(entry).fixture?.handoff;
      return !!d && (d.audioReady?.length > 0 || d.stage === 'failed' || d.stage === 'cancelled');
    }, 50, 80);
    const atReadyState = managerState(entry);
    const atReadyDiagnostic = diagnostic(entry);
    out.selection.ready = {
      waitedMs: Date.now() - callStart, ready,
      state: atReadyState, handoff: atReadyDiagnostic.fixture?.handoff ?? null,
      oldControllerKept: atReadyState._controller === old,
      oldSourcePlaying: !!Components.utils.waiveXrays(old)?._isPlaying,
      targetControllerCaptured: !!record.prepared,
    };
    if (!ready || atReadyDiagnostic.fixture?.handoff?.stage === 'failed') {
      restoreFactory(); restoreOld();
      out.status = atReadyDiagnostic.fixture?.handoff?.stage === 'failed' ? 'FAIL' : 'NOT TESTABLE';
      out.errors.push('target audio did not become ready during paused preparation');
      return out;
    }
    try { entry.window.document.notifyUserGestureActivation(); manager.play(); } catch (e) { out.errors.push(`play: ${String(e)}`); }
    const committed = await waitFor(() => diagnostic(entry).fixture?.handoff?.stage === 'committed', 80, 80);
    const afterResume = managerState(entry);
    const finalDiagnostic = diagnostic(entry);
    out.resume = {
      committed, state: afterResume, handoff: finalDiagnostic.fixture?.handoff ?? null,
      targetVoice: afterResume.selected, targetTier: afterResume.tier, targetLang: afterResume.lang, targetRegion: afterResume.region,
      targetPreparedPlay: record.preparedPlays.map(row => ({ ...row, at: row.at - callStart })),
      oldVoicePlayBeforeAdoption: record.oldPlays.map(row => ({ ...row, at: row.at - callStart })),
      samePosition: afterResume.position === paused.position,
      sourcePositionRetained: entry.manager._activeSegment === (entry.manager._segments || [])[paused.position],
      memoryAfterChars: typeof rawPref(memoryName) === 'string' ? rawPref(memoryName).length : null,
      persistedAfter: persistedSummary(entry),
    };
    if (!committed) {
      out.clock = { ...(out.clock || {}), status: 'NOT TESTABLE', reason: 'prepared voice did not commit within bounded resume window' };
      out.errors.push('prepared voice did not commit within bounded resume window');
      if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
      await sleep(100);
    }
    // Exercise the attached language hook with a reader-realm options object.
    // The exact GB voice is already in the temporary per-language entry, so
    // native resolution proves the remembered locale path.
    const languageBefore = managerState(entry);
    const languageController = languageBefore._controller;
    const languageMemory = rawPref(memoryName);
    const languageVoices = rawPref(voicesName);
    const languageOther = otherState(kind === 'pdf' ? 'epub' : 'pdf', kind);
    let languageError = null;
    try {
      const options = Components.utils.cloneInto({ region: 'GB', persist: true }, entry.window);
      manager.setLanguage('en', options);
    } catch (e) { languageError = String(e); }
    await sleep(120);
    const languageImmediate = managerState(entry);
    const languageDiagnostic = diagnostic(entry);
    out.language = {
      error: languageError, before: languageBefore, immediate: languageImmediate,
      handoff: languageDiagnostic.fixture?.handoff ?? null,
      controllerSameUntilReady: languageImmediate._controller === languageController,
      memoryUnchanged: rawPref(memoryName) === languageMemory,
      voicesPrefUnchanged: rawPref(voicesName) === languageVoices,
      otherReaderUnchanged: (() => {
        const now = otherState(kind === 'pdf' ? 'epub' : 'pdf', kind);
        return !!languageOther && !!now && now.selected === languageOther.selected && now._controller === languageOther._controller;
      })(),
      rememberedEntryBefore: persistedSummary(entry),
    };
    const languageTerminal = await waitFor(() => {
      const d = diagnostic(entry).fixture?.handoff;
      return !d?.pending || d.stage === 'committed' || d.stage === 'failed' || d.stage === 'cancelled';
    }, 65, 80);
    const languageFinal = managerState(entry);
    const languageFinalDiag = diagnostic(entry);
    out.language.after = languageFinal;
    out.language.terminal = languageTerminal;
    out.language.handoffAfter = languageFinalDiag.fixture?.handoff ?? null;
    out.language.expected = { voice: 'native108-gb', region: 'GB', language: 'en' };

    // Exercise the attached tier hook; the preview must keep the current
    // controller and prefs until the prepared premium voice is ready.
    const tierBefore = managerState(entry);
    const tierController = tierBefore._controller;
    const tierMemory = rawPref(memoryName);
    const tierVoices = rawPref(voicesName);
    const tierOther = otherState(kind === 'pdf' ? 'epub' : 'pdf', kind);
    let tierError = null;
    try { manager.selectTier('premium'); } catch (e) { tierError = String(e); }
    await sleep(120);
    const tierImmediate = managerState(entry);
    const tierDiagnostic = diagnostic(entry);
    out.tier = {
      error: tierError, before: tierBefore, immediate: tierImmediate,
      handoff: tierDiagnostic.fixture?.handoff ?? null,
      controllerSameUntilReady: tierImmediate._controller === tierController,
      memoryUnchanged: rawPref(memoryName) === tierMemory,
      voicesPrefUnchanged: rawPref(voicesName) === tierVoices,
      otherReaderUnchanged: (() => {
        const now = otherState(kind === 'pdf' ? 'epub' : 'pdf', kind);
        return !!tierOther && !!now && now.selected === tierOther.selected && now._controller === tierOther._controller;
      })(),
    };
    const tierTerminal = await waitFor(() => {
      const d = diagnostic(entry).fixture?.handoff;
      return !d?.pending || d.stage === 'committed' || d.stage === 'failed' || d.stage === 'cancelled';
    }, 65, 80);
    const tierFinal = managerState(entry);
    const tierFinalDiag = diagnostic(entry);
    out.tier.after = tierFinal;
    out.tier.terminal = tierTerminal;
    out.tier.handoffAfter = tierFinalDiag.fixture?.handoff ?? null;
    out.tier.expected = { voice: 'native108-pgb', tier: 'premium' };

    // Record the actual mounted controls. Voice selection above is the live
    // popup action; this inventory makes the route auditable on both formats.
    const popup = entry.window?.document?.querySelector?.('.read-aloud-popup');
    out.popupControls = {
      mounted: !!popup,
      buttons: popupButtons(popup).map(({ element, ...row }) => row),
      options: popupOptions(popup).map(row => row.info),
    };
    restoreFactory();
    record.restorePrepared?.();
    restoreOld();
    transport.delayMs = 0; transport.delayVoiceID = null;
    out.instrumentation = { preparedCaptured: !!record.prepared, preparedPlays: record.preparedPlays, oldPlays: record.oldPlays, patchErrors: record.patchErrors };
    const machinePlaybackUnavailable = out.clock?.status === 'NOT TESTABLE';
    out.status = machinePlaybackUnavailable ? 'NOT TESTABLE' : out.controlsAttached === true
      && out.selection.original.controllerSame
      && out.selection.afterRequest.memoryUnchanged && out.selection.afterRequest.voicesPrefUnchanged
      && out.selection.ready.oldControllerKept && out.selection.ready.handoff?.audioReady?.length > 0
      && out.resume.committed && out.resume.handoff?.last?.kind === 'word'
      && out.resume.targetVoice === 'native108-b' && out.resume.samePosition
      && out.language.controllerSameUntilReady && out.language.memoryUnchanged && out.language.voicesPrefUnchanged
      && out.language.after?.region === 'GB'
      && out.tier.controllerSameUntilReady && out.tier.memoryUnchanged && out.tier.voicesPrefUnchanged
      && out.tier.after?.tier === 'premium'
      && out.tier.after?.selected === 'native108-pgb'
      ? 'PASS' : 'FAIL';
    return out;
  };
  const results = [];
  results.push(await runOne('pdf', true));
  results.push(await runOne('epub', false));
  state.parityResults = results;
  const failed = results.filter(row => row.status === 'FAIL');
  if (failed.length) throw new Error(`108 popup/language/tier parity failed: ${failed.map(row => row.kind).join(', ')}`);
  return JSON.stringify({ status: results.some(row => row.status === 'NOT TESTABLE') ? 'NOT TESTABLE' : 'PASS', results }, null, 1);
})()
