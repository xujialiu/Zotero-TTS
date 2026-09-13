return (async () => {
  const state = Zotero.__ztts95AutoplayProbe;
  if (!state?.itemID) throw new Error('autoplay setup is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const describe = context => context ? { state: context.state, time: context.currentTime, sampleRate: context.sampleRate } : null;
  const out = { itemID: state.itemID, readerReady: false, errors: [] };
  try {
    for (let i = 0; i < 60; i++) {
      state.reader = (Zotero.Reader._readers || []).find(r => r?.itemID === state.itemID) ?? null;
      if (state.reader?._iframeWindow?.document) break;
      await sleep(50);
    }
    if (!state.reader?._iframeWindow?.document) {
      out.status = 'PENDING: fixture reader window did not become ready within 3 seconds';
      return JSON.stringify(out, null, 1);
    }
    out.readerReady = true;
    state.window = state.reader._iframeWindow;
    const rw = state.window;
    try { state.reader._window?.Zotero_Tabs?.select(state.reader.tabID); } catch (e) {}
    try { state.reader.focus?.(); rw.focus?.(); } catch (e) {}
    const sync = { handlerRan: false, created: false, initial: null, resumeCalled: false, resumeSettled: false, resumeResult: null, error: null };
    state.listener = Components.utils.exportFunction(event => {
      if (event?.key !== 'F24') return;
      sync.handlerRan = true;
      sync.eventTrusted = !!event.isTrusted;
      sync.userActivation = { isActive: !!rw.navigator.userActivation?.isActive, hasBeenActive: !!rw.navigator.userActivation?.hasBeenActive };
      sync.documentHasFocus = !!rw.document.hasFocus?.();
      sync.visibilityState = rw.document.visibilityState ?? null;
      try {
        state.syncContext = new rw.AudioContext();
        sync.created = true;
        sync.initial = describe(state.syncContext);
        sync.resumeCalled = true;
        Promise.resolve(state.syncContext.resume()).then(() => { sync.resumeSettled = true; sync.resumeResult = 'resolved'; }).catch(e => { sync.resumeSettled = true; sync.resumeResult = 'rejected: ' + String(e); });
      } catch (e) { sync.error = String(e); }
    }, rw.document);
    rw.document.addEventListener('keydown', state.listener, true);
    const input = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const keyEvent = new K('', { key: 'F24', code: 'F24', keyCode: 135, bubbles: true, cancelable: true });
    input.beginInputTransactionForTests(rw);
    const keyResult = { keydown: input.keydown(keyEvent), keyup: input.keyup(keyEvent) };
    if (typeof input.endInputTransaction === 'function') input.endInputTransaction();
    rw.setTimeout(() => {
      try {
        state.delayedContext = new rw.AudioContext();
        out.delayedCreated = true;
        out.delayedUserActivation = { isActive: !!rw.navigator.userActivation?.isActive, hasBeenActive: !!rw.navigator.userActivation?.hasBeenActive };
        out.delayedInitial = describe(state.delayedContext);
        out.delayedResumeCalled = true;
        Promise.resolve(state.delayedContext.resume()).then(() => { out.delayedResumeSettled = true; out.delayedResumeResult = 'resolved'; }).catch(e => { out.delayedResumeSettled = true; out.delayedResumeResult = 'rejected: ' + String(e); });
      } catch (e) { out.delayedError = String(e); }
    }, 120);
    const samples = [];
    for (let i = 0; i < 16; i++) { samples.push({ ms: i * 100, sync: describe(state.syncContext), delayed: describe(state.delayedContext) }); await sleep(100); }
    out.keyResult = keyResult;
    out.sync = { ...sync, final: describe(state.syncContext) };
    out.delayed = { created: out.delayedCreated ?? false, userActivation: out.delayedUserActivation ?? null, initial: out.delayedInitial ?? null, resumeCalled: out.delayedResumeCalled ?? false, resumeSettled: out.delayedResumeSettled ?? false, resumeResult: out.delayedResumeResult ?? null, error: out.delayedError ?? null, final: describe(state.delayedContext) };
    out.samples = { first: samples[0] ?? null, last: samples.at(-1) ?? null, count: samples.length };
    out.syncClockAdvanced = Number(samples.at(-1)?.sync?.time) > Number(samples[0]?.sync?.time) + 0.05;
    out.delayedClockAdvanced = Number(samples.at(-1)?.delayed?.time) > Number(samples[0]?.delayed?.time) + 0.05;
    out.status = out.syncClockAdvanced && !out.delayedClockAdvanced ? 'PASS: synchronous trusted handler ran; delayed context was blocked' : out.syncClockAdvanced && out.delayedClockAdvanced ? 'PASS: both contexts ran; gesture was not the limiting factor' : 'NOT TESTABLE: both contexts blocked, so gesture and output/device blocking cannot be separated by this probe';
    state.probe = out;
    return JSON.stringify(out, null, 1);
  } catch (e) {
    out.errors.push(String(e));
    state.probe = out;
    return JSON.stringify(out, null, 1);
  }
})()
