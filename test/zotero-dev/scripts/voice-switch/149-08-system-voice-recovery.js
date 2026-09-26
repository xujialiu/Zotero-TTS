(async () => {
  const session = Zotero.__ztts149;
  const fixture = session?.fixtures?.find(row => row.kind === 'pdf');
  if (!fixture) throw new Error('149 PDF fixture is missing');
  const list = Zotero.Reader?._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) {
    try { if (!Components.utils.isDeadWrapper?.(list[i]) && list[i]?.itemID === fixture.itemID) { reader = list[i]; break; } } catch (_) {}
  }
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!reader || !internal || !manager) throw new Error('PDF fixture manager is missing');
  const frame = reader._iframeWindow?.document?.getElementById('ztts-player-frame');
  const doc = frame?.contentDocument;
  if (!doc) throw new Error('player frame is missing');
  const target = (() => {
    const voices = manager._allVoices || [];
    for (let i = 0; i < voices.length; i++) {
      try {
        if (String(voices[i]?.tier ?? '') === 'system' && String(voices[i]?.label ?? voices[i]?.name ?? '') === 'Albert') {
          return { id: String(voices[i].id), label: String(voices[i].label ?? voices[i].name ?? '') };
        }
      } catch (_) {}
    }
    return null;
  })();
  if (!target) throw new Error('listed System Albert is missing');
  const voiceMenu = doc.querySelector('.popover[aria-label="Voice"]');
  const option = [...(voiceMenu?.querySelectorAll('button.option') || [])].find(e => (e.textContent || '').trim() === 'Albert');
  if (!option) throw new Error('Albert voice row is missing from the open player menu');
  const calls = session.requestCalls149 || [];
  calls.length = 0;
  const engineOf = async () => {
    try {
      const parsed = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
      return parsed.readers?.find(row => Number(row.itemID) === Number(fixture.itemID)) ?? null;
    } catch (_) { return null; }
  };
  const switchOf = () => {
    try {
      const parsed = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch());
      return parsed.readers?.find(row => Number(row.itemID) === Number(fixture.itemID)) ?? null;
    } catch (_) { return null; }
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 10000, step = 100) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const value = await test(); if (value) return value; await sleep(step); }
    return test();
  };
  const before = { selected: manager.selectedVoiceID ?? null, active: !!manager.active, paused: !!manager.paused, controller: !!manager._controller, engine: await engineOf(), switch: switchOf() };
  option.click();
  const recovered = await waitFor(async () => {
    const engine = await engineOf();
    return manager.active && manager.paused && manager.selectedVoiceID === target.id && !!manager._controller && engine?.session?.ended === false && !!engine.controller?.ours ? { engine } : null;
  });
  const afterPick = { selected: manager.selectedVoiceID ?? null, active: !!manager.active, paused: !!manager.paused, controller: !!manager._controller, engine: recovered?.engine ?? await engineOf(), calls: calls.length, switch: switchOf(), picker: [...doc.querySelectorAll('button.picker')].map(e => ({ aria: e.getAttribute('aria-label'), text: (e.textContent || '').trim() })) };
  const noRequestBeforePlay = calls.length === 0;
  const playButton = doc.querySelector('button.play');
  if (!playButton) throw new Error('player Play button is missing');
  try { reader._iframeWindow.document.notifyUserGestureActivation?.(); } catch (_) {}
  playButton.click();
  const requested = await waitFor(() => calls.length > 0, 12000, 100);
  const callsAfterPlay = calls.slice();
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (_) {} }
  await sleep(500);
  const finalEngine = await engineOf();
  const afterPlay = { requested: !!requested, calls: callsAfterPlay.map(c => ({ kind: c.kind, voiceID: c.voiceID, textLength: c.text?.length ?? null })), active: !!manager.active, paused: !!manager.paused, selected: manager.selectedVoiceID ?? null, position: finalEngine?.session?.position ?? null, engine: finalEngine, switch: switchOf() };
  let docs = null;
  try {
    const parsed = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
    const records = parsed.records || {};
    docs = {
      defaultVoice: parsed.defaultVoice?.id ?? parsed.defaultVoice ?? null,
      records: Object.fromEntries(Object.entries(records).map(([k, v]) => [k, { voice: v?.voice?.id ?? v?.voice ?? null, manual: v?.manual ?? null }])),
      readers: (parsed.readers || []).filter(row => Number(row.itemID) === Number(fixture.itemID) || Number(row.itemID) === Number(session.fixtures.find(x => x.kind === 'epub')?.itemID)).map(row => ({ key: row.key, selected: row.selectedVoiceID ?? row.selected ?? null, active: row.active, paused: row.paused })),
    };
  } catch (e) { docs = { error: String(e) }; }
  return JSON.stringify({
    status: recovered ? 'PASS' : 'FAIL', target, before, afterPick, noRequestBeforePlay, afterPlay, documentVoices: docs,
    actualPlayerControl: { provider: [...doc.querySelectorAll('button.picker')].some(e => (e.getAttribute('aria-label') || '').includes('Provider: System')), voiceRow: true, play: true },
  }, null, 1);
})();
