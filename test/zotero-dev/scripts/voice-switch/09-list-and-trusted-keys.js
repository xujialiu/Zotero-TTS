return (async () => {
  const state = Zotero.__ztts95NativeState;
  const itemID = Zotero.__ztts95Fixture?.itemID;
  const reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!state || !reader || !manager) throw new Error('fixture manager is missing');
  const rw = reader._iframeWindow;
  const readerIndex = (Zotero.Reader._readers || []).indexOf(reader);
  const names = {
    previous: 'extensions.zotero.zotero-tts.shortcuts.previousVoice',
    next: 'extensions.zotero.zotero-tts.shortcuts.nextVoice',
  };
  const originalNext = {
    value: Services.prefs.getStringPref(names.next, ''),
    user: Services.prefs.prefHasUserValue(names.next),
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const press = (key, code, keyCode, repeat = false) => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const ev = (value, valueCode, valueKeyCode, shiftKey = false) => new K('', {
      key: value, code: valueCode, keyCode: valueKeyCode, bubbles: true, cancelable: true, shiftKey, repeat,
    });
    tip.beginInputTransactionForTests(rw);
    const ret = [
      tip.keydown(ev('Shift', 'ShiftLeft', 16)),
      tip.keydown(ev(key, code, keyCode, true)),
      tip.keyup(ev(key, code, keyCode, true)),
      tip.keyup(ev('Shift', 'ShiftLeft', 16)),
    ];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  };
  const menuSnapshot = () => {
    const menu = manager.voicesForLanguage || [];
    const rows = [];
    for (let i = 0; i < menu.length; i++) rows.push({ index: i, id: menu[i]?.id ?? null, label: menu[i]?.label ?? null });
    return rows;
  };
  const stateSnapshot = () => ({
    selected: manager.selectedVoiceID ?? null,
    active: !!manager.active,
    paused: !!manager.paused,
    calls: state.calls.length,
  });
  const out = { readerIndex, menu: menuSnapshot(), region: manager.region ?? null, language: manager.lang ?? null, transitions: [], pausedNoSample: null };
  let input = null;
  try {
    // The handoff test leaves the fixture paused on the replacement voice.
    const initialCalls = state.calls.length;
    out.initial = stateSnapshot();
    out.transitions.push({ action: 'previous', before: stateSnapshot(), key: press(',', 'Comma', 188), });
    await sleep(180);
    out.transitions[out.transitions.length - 1].after = stateSnapshot();
    out.transitions.push({ action: 'previous-wrap', before: stateSnapshot(), key: press(',', 'Comma', 188), });
    await sleep(180);
    out.transitions[out.transitions.length - 1].after = stateSnapshot();
    out.transitions.push({ action: 'next-wrap', before: stateSnapshot(), key: press('.', 'Period', 190), });
    await sleep(180);
    out.transitions[out.transitions.length - 1].after = stateSnapshot();

    const mw = Components.utils.waiveXrays(manager);
    const allBefore = mw._allVoices;
    const selectedBefore = mw._voiceID;
    const voiceBefore = mw._voice;
    mw._allVoices = allBefore.length ? [allBefore[0]] : [];
    mw._voiceID = allBefore[0]?.id ?? null;
    mw._voice = allBefore[0] ?? null;
    const oneBefore = stateSnapshot();
    const oneKey = press('.', 'Period', 190);
    await sleep(150);
    const oneAfter = stateSnapshot();
    const oneListLength = manager.voicesForLanguage?.length ?? null;
    mw._allVoices = allBefore;
    mw._voiceID = selectedBefore;
    mw._voice = voiceBefore;
    out.oneVoice = { before: oneBefore, key: oneKey, after: oneAfter, listLength: oneListLength };

    const repeatBefore = stateSnapshot();
    const repeatKey = press('.', 'Period', 190);
    await sleep(150);
    const repeatAfterFirst = stateSnapshot();
    const repeatKey2 = press('.', 'Period', 190, true);
    await sleep(150);
    const repeatAfter = stateSnapshot();
    out.repeat = { before: repeatBefore, first: { key: repeatKey, after: repeatAfterFirst }, repeated: { key: repeatKey2, after: repeatAfter } };

    input = rw.document.createElement('input');
    input.type = 'text';
    input.id = 'ztts95-temporary-editable';
    (rw.document.body || rw.document.documentElement).appendChild(input);
    input.focus();
    const editableBefore = stateSnapshot();
    const editableKey = press('.', 'Period', 190);
    await sleep(150);
    out.editable = { before: editableBefore, key: editableKey, after: stateSnapshot() };
    if (input.parentNode) input.parentNode.removeChild(input);
    reader.focus?.();
    rw.focus?.();

    Services.prefs.setStringPref(names.next, 'Shift+F9');
    await sleep(100);
    const reboundBefore = stateSnapshot();
    const reboundKey = press('F9', 'F9', 120);
    await sleep(180);
    out.rebound = { before: reboundBefore, key: reboundKey, after: stateSnapshot(), pref: Services.prefs.getStringPref(names.next, '') };
    Services.prefs.setStringPref(names.next, '');
    await sleep(100);
    const clearedBefore = stateSnapshot();
    const clearedKey = press('F9', 'F9', 120);
    await sleep(180);
    out.cleared = { before: clearedBefore, key: clearedKey, after: stateSnapshot(), pref: Services.prefs.getStringPref(names.next, '') };
    const samples = state.calls.slice(initialCalls).filter(c => c.kind === 'sample');
    out.pausedNoSample = {
      initialCalls,
      sampleCalls: samples.length,
      pausedThroughout: out.transitions.every(t => t.after?.paused) && out.oneVoice.after.paused && out.repeat.repeated.after.paused && out.editable.after.paused && out.rebound.after.paused && out.cleared.after.paused,
    };
  } finally {
    if (input?.parentNode) input.parentNode.removeChild(input);
    if (originalNext.user) Services.prefs.setStringPref(names.next, originalNext.value);
    else if (Services.prefs.prefHasUserValue(names.next)) Services.prefs.clearUserPref(names.next);
    await sleep(250);
    out.restored = { next: { value: Services.prefs.getStringPref(names.next, ''), user: Services.prefs.prefHasUserValue(names.next) } };
  }
  return JSON.stringify(out, null, 1);
})()
