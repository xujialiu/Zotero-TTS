return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const transport = state.transport;
  if (!transport?.readers?.pdf || !transport?.readers?.epub) throw new Error('108 transport readers are missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const voicesName = 'extensions.zotero.reader.readAloudVoices';
  const memoryName = 'extensions.zotero.zotero-tts.readAloud.memory';
  const normalize = value => String(value || '').trim().replace(/\s+/g, ' ');
  const stateOf = entry => {
    const manager = entry.manager, c = manager?._controller;
    const result = { active: !!manager?.active, paused: !!manager?.paused, selected: manager?.selectedVoiceID ?? null,
      tier: manager?._selectedTier ?? null, lang: manager?.lang ?? null, region: manager?.region ?? null,
      position: Number.isFinite(c?._position) ? c._position : null, currentIndex: Number.isFinite(c?._currentIndex) ? c._currentIndex : null,
      progress: Number.isFinite(c?._currentPlaybackTime) ? c._currentPlaybackTime : null,
      playing: !!c?._isPlaying, source: !!c?._sourceNode, controller: !!c, audio: { state: c?._audioContext?.state ?? null, time: c?._audioContext?.currentTime ?? null } };
    Object.defineProperty(result, '_controller', { value: c, enumerable: false });
    return result;
  };
  const diagnostic = entry => {
    const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch());
    const index = (Zotero.Reader._readers || []).indexOf(entry.reader);
    return { all, fixture: all.readers?.[index] ?? null };
  };
  const waitFor = async (predicate, count = 40, interval = 80) => {
    for (let i = 0; i < count; i++) { if (predicate()) return true; await sleep(interval); }
    return false;
  };
  const dialogText = entry => {
    const docs = [entry.window?.document, entry.reader?._window?.document, Zotero.getMainWindow?.()?.document];
    const found = [];
    for (const doc of docs) {
      for (const selector of ['#ztts-speed-toast', '#ztts-notice']) {
        const dialog = doc?.querySelector?.(selector);
        if (!dialog) continue;
        const divs = dialog.querySelectorAll?.('div') || [];
        const parts = [];
        for (let i = 0; i < divs.length; i++) { const text = normalize(divs[i].textContent); if (text) parts.push(text); }
        found.push(parts.length ? parts.join(' | ') : normalize(dialog.textContent));
      }
    }
    return found.find(text => /could not switch|previous voice is kept/i.test(text)) || found[0] || null;
  };
  const otherState = (kind, current) => {
    if (kind === current) return null;
    const e = transport.readers[kind], s = stateOf(e);
    return { selected: s.selected, tier: s.tier, lang: s.lang, region: s.region, position: s.position, _controller: s._controller };
  };
  const runOne = async kind => {
    const entry = transport.readers[kind], manager = entry.manager;
    const out = { kind, status: 'FAIL', errors: [], controlsAttached: diagnostic(entry).fixture?.handoff?.controlsAttached ?? null };
    if (!manager.active) throw new Error(`${kind} manager is not active`);
    if (!manager.paused) { try { manager.pause(); } catch (e) {} await sleep(100); }
    const old = stateOf(entry)._controller, originalVoice = manager.selectedVoiceID;
    const beforeMemory = (() => { try { return Services.prefs.getStringPref(memoryName); } catch (e) { return null; } })();
    const beforeVoices = (() => { try { return Services.prefs.getStringPref(voicesName); } catch (e) { return null; } })();
    const otherBefore = otherState(kind === 'pdf' ? 'epub' : 'pdf', kind);
    const sequence = [];
    transport.delayMs = 650;
    transport.delayVoiceID = 'native108-b';
    try { manager.selectVoice('native108-b'); } catch (e) { out.errors.push(`popup voice: ${String(e)}`); }
    await sleep(70);
    sequence.push({ action: 'popup voice', state: stateOf(entry), handoff: diagnostic(entry).fixture?.handoff ?? null });
    transport.delayVoiceID = 'native108-gb';
    try { manager.setLanguage('en', Components.utils.cloneInto({ region: 'GB', persist: true }, entry.window)); }
    catch (e) { out.errors.push(`popup locale: ${String(e)}`); }
    await sleep(70);
    sequence.push({ action: 'popup locale', state: stateOf(entry), handoff: diagnostic(entry).fixture?.handoff ?? null });
    transport.delayVoiceID = 'native108-p1';
    try { manager.selectTier('premium'); } catch (e) { out.errors.push(`popup mode: ${String(e)}`); }
    await sleep(70);
    sequence.push({ action: 'popup mode', state: stateOf(entry), handoff: diagnostic(entry).fixture?.handoff ?? null });
    transport.delayVoiceID = null;
    let shortcutError = null;
    try { JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(1, (Zotero.Reader._readers || []).indexOf(entry.reader))); }
    catch (e) { shortcutError = String(e); out.errors.push(`shortcut: ${shortcutError}`); }
    await sleep(70);
    sequence.push({ action: 'shortcut next', state: stateOf(entry), handoff: diagnostic(entry).fixture?.handoff ?? null });
    out.replacements = { sequence, shortcutError, latest: sequence[sequence.length - 1]?.handoff ?? null };
    const pausedBefore = stateOf(entry);
    try { manager.pause(); } catch (e) { out.errors.push(`pause while preparing: ${String(e)}`); }
    await sleep(120);
    const pausedDuring = stateOf(entry), pausedHandoff = diagnostic(entry).fixture?.handoff ?? null;
    out.pauseDuringPreparation = { before: pausedBefore, after: pausedDuring, handoff: pausedHandoff,
      pendingRetained: !!pausedHandoff?.pending, silent: !pausedDuring.playing };
    const repickBefore = stateOf(entry);
    let repickError = null;
    try { manager.selectVoice(originalVoice); } catch (e) { repickError = String(e); out.errors.push(`re-pick original: ${repickError}`); }
    await sleep(120);
    const repickAfter = stateOf(entry), repickHandoff = diagnostic(entry).fixture?.handoff ?? null;
    out.repickOriginal = { error: repickError, before: repickBefore, after: repickAfter, handoff: repickHandoff,
      cancelled: repickHandoff?.stage === 'cancelled' && !repickHandoff.pending,
      controllerKept: repickAfter._controller === old, memoryUnchanged: (() => { try { return Services.prefs.getStringPref(memoryName) === beforeMemory; } catch (e) { return false; } })(),
      voicesPrefUnchanged: (() => { try { return Services.prefs.getStringPref(voicesName) === beforeVoices; } catch (e) { return false; } })() };
    // Failure is a separate request after the cancellation. The old choice,
    // controller and paused state must survive a rejected target response.
    transport.delayMs = 0; transport.delayVoiceID = null; transport.failVoiceID = 'native108-b';
    const failureBefore = stateOf(entry);
    let failureCallError = null;
    try { manager.selectVoice('native108-b'); } catch (e) { failureCallError = String(e); out.errors.push(`failure select: ${failureCallError}`); }
    await waitFor(() => diagnostic(entry).fixture?.handoff?.stage === 'failed' || !diagnostic(entry).fixture?.handoff?.pending, 35, 80);
    const failureAfter = stateOf(entry), failureHandoff = diagnostic(entry).fixture?.handoff ?? null;
    out.failure = { callError: failureCallError, before: failureBefore, after: failureAfter, handoff: failureHandoff,
      selectedOriginal: failureAfter.selected === originalVoice, controllerKept: failureAfter._controller === old,
      paused: failureAfter.paused, notice: dialogText(entry), calls: transport.calls.filter(c => c.voiceID === 'native108-b').map(c => ({ kind: c.kind, text: c.text })) };
    transport.failVoiceID = null;
    out.otherReaderUnchanged = (() => {
      const now = otherState(kind === 'pdf' ? 'epub' : 'pdf', kind);
      return !!otherBefore && !!now && now.selected === otherBefore.selected && now._controller === otherBefore._controller && now.position === otherBefore.position;
    })();
    out.unsuspendedResume = { status: 'NOT TESTABLE', reason: 'target output resume requires the running native audio clock; the baseline native group supplied the running-clock handoff' };
    out.status = out.controlsAttached === true
      && sequence.length === 4
      && sequence[0].handoff?.pending === 'native108-b'
      && sequence[1].handoff?.pending === 'native108-gb'
      && sequence[2].handoff?.pending === 'native108-p1'
      && sequence[3].handoff?.pending === 'native108-b'
      && out.pauseDuringPreparation.pendingRetained && out.pauseDuringPreparation.silent
      && out.repickOriginal.cancelled && out.repickOriginal.controllerKept
      && out.failure.selectedOriginal && out.failure.controllerKept && out.failure.paused
      && out.otherReaderUnchanged ? 'PASS' : 'FAIL';
    return out;
  };
  const results = [await runOne('pdf'), await runOne('epub')];
  const failed = results.filter(row => row.status === 'FAIL');
  if (failed.length) throw new Error(`108 mixed selection/failure checks failed: ${failed.map(row => row.kind).join(', ')}`);
  return JSON.stringify({ status: results.some(row => row.status === 'NOT TESTABLE') ? 'NOT TESTABLE' : 'PASS', results }, null, 1);
})()
