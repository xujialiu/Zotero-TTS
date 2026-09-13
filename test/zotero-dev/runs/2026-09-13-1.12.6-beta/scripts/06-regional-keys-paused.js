return (async () => {
  const state = Zotero.__ztts97NativeState;
  const itemID = Zotero.__ztts97Fixture?.itemID;
  const reader = (Zotero.Reader._readers || []).find(r => r?.itemID === itemID);
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!state || !reader || !manager) throw new Error('fixture manager is missing');
  const rw = reader._iframeWindow;
  const mw = Components.utils.waiveXrays(manager);
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
  const voices = {};
  const all = manager.allVoices || [];
  for (let i = 0; i < all.length; i++) if (all[i]?.id) voices[all[i].id] = all[i];
  const menu = () => {
    const out = [];
    const a = manager.voicesForLanguage || [];
    for (let i = 0; i < a.length; i++) out.push({ index: i, id: a[i]?.id ?? null, label: a[i]?.label ?? null, language: a[i]?.language ?? null });
    return out;
  };
  const snapshot = () => ({
    selected: manager.selectedVoiceID ?? null,
    language: manager.lang ?? null,
    requestedRegion: mw._region ?? null,
    active: !!manager.active,
    paused: !!manager.paused,
    speed: manager.speed ?? null,
    calls: state.calls.length,
  });
  const out = { menu: menu(), initial: snapshot(), transitions: [], singleton: null, genericStaleRegion: null };
  const originalRegion = mw._region;
  const originalOwnMenu = Object.getOwnPropertyDescriptor(mw, 'voicesForLanguage');
  const beforeCalls = state.calls.length;
  try {
    reader.focus?.();
    rw.focus?.();
    if (manager.active && !manager.paused) manager.pause();
    if (manager.selectedVoiceID !== 'regional97-a') manager.selectVoice('regional97-a');
    await sleep(120);
    out.initial = snapshot();
    const actions = [
      ['next', '.', 'Period', 190, 'regional97-c'],
      ['next-wrap', '.', 'Period', 190, 'regional97-a'],
      ['previous-wrap', ',', 'Comma', 188, 'regional97-c'],
      ['previous', ',', 'Comma', 188, 'regional97-a'],
    ];
    for (const [action, key, code, keyCode, expected] of actions) {
      const before = snapshot();
      const keyResult = press(key, code, keyCode);
      await sleep(120);
      out.transitions.push({ action, before, key: keyResult, after: snapshot(), expected });
    }
    const singletonVoices = [voices['regional97-a'], voices['regional97-b'], voices['regional97-wild']].filter(Boolean);
    Object.defineProperty(mw, 'voicesForLanguage', { configurable: true, enumerable: true, writable: true, value: singletonVoices });
    if (manager.selectedVoiceID !== 'regional97-a') manager.selectVoice('regional97-a');
    await sleep(80);
    const singletonBefore = snapshot();
    const singletonKey = press('.', 'Period', 190);
    await sleep(120);
    out.singleton = { before: singletonBefore, key: singletonKey, after: snapshot(), menu: menu(), expected: 'regional97-a unchanged' };
    if (originalOwnMenu) Object.defineProperty(mw, 'voicesForLanguage', originalOwnMenu);
    else delete mw.voicesForLanguage;
    await sleep(80);
    if (manager.selectedVoiceID !== 'regional97-b') manager.selectVoice('regional97-b');
    mw._region = 'US';
    await sleep(120);
    const genericBefore = snapshot();
    const genericKey = press('.', 'Period', 190);
    await sleep(120);
    out.genericStaleRegion = { before: genericBefore, key: genericKey, after: snapshot(), menu: menu(), expected: 'regional97-wild (generic list behavior)' };
  } finally {
    if (originalOwnMenu) Object.defineProperty(mw, 'voicesForLanguage', originalOwnMenu);
    else delete mw.voicesForLanguage;
    mw._region = originalRegion;
    if (manager.selectedVoiceID !== 'regional97-a') {
      try { manager.selectVoice('regional97-a'); } catch (e) {}
    }
    await sleep(120);
    if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) {} }
  }
  const calls = state.calls.slice(beforeCalls);
  const paused = out.transitions.every(t => t.after.paused)
    && !!out.singleton?.after.paused && !!out.genericStaleRegion?.after.paused;
  const sequence = out.transitions.map(t => t.after.selected);
  return JSON.stringify({
    initial: out.initial,
    menu: out.menu,
    transitions: out.transitions,
    singleton: out.singleton,
    genericStaleRegion: out.genericStaleRegion,
    sequence,
    pausedThroughout: paused,
    speedPreserved: out.initial.speed === 1.25
      && out.transitions.every(t => t.after.speed === 1.25)
      && out.singleton.after.speed === 1.25 && out.genericStaleRegion.after.speed === 1.25,
    callsDuring: { total: calls.length, samples: calls.filter(c => c.kind === 'sample').length, segments: calls.filter(c => c.kind === 'segment').length },
    allCalls: state.calls.map(c => ({ kind: c.kind, voiceID: c.voiceID, text: c.text })),
    expected: {
      regionalSequence: ['regional97-c', 'regional97-a', 'regional97-c', 'regional97-a'],
      regionalMenu: ['regional97-a', 'regional97-c'],
      singleton: 'regional97-a unchanged',
      genericStaleRegion: 'regional97-wild (generic list behavior)',
      pausedThroughout: true,
      speed: 1.25,
      callsDuring: { samples: 0, segments: 0 },
    },
  }, null, 1);
})()
