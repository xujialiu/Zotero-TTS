(async () => {
  const session = Zotero.__ztts149;
  const fixture = session?.fixtures?.find(row => row.kind === 'pdf');
  if (!fixture) throw new Error('149 PDF fixture is missing');
  const list = Zotero.Reader?._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) { try { if (!Components.utils.isDeadWrapper?.(list[i]) && list[i]?.itemID === fixture.itemID) { reader = list[i]; break; } } catch (_) {} }
  const manager = reader?._internalReader?._readAloudManager;
  const doc = reader?._iframeWindow?.document?.getElementById('ztts-player-frame')?.contentDocument;
  if (!reader || !manager || !doc) throw new Error('PDF player is missing');
  const target = (() => { const voices = manager._allVoices || []; for (let i = 0; i < voices.length; i++) { try { const label = String(voices[i]?.label ?? voices[i]?.name ?? ''); if (String(voices[i]?.tier ?? '') === 'fish' && /Abel/.test(label)) return { id: String(voices[i].id), label }; } catch (_) {} } return null; })();
  if (!target) throw new Error('listed Fish Abel target is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const engineOf = async () => { try { const parsed = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()); return parsed.readers?.find(row => Number(row.itemID) === Number(fixture.itemID)) ?? null; } catch (_) { return null; } };
  const switchOf = () => { try { const parsed = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()); return parsed.readers?.find(row => Number(row.itemID) === Number(fixture.itemID)) ?? null; } catch (_) { return null; } };
  const waitFor = async (test, timeout = 20000, step = 200) => { const end = Date.now() + timeout; while (Date.now() < end) { const value = await test(); if (value) return value; await sleep(step); } return test(); };
  if (!manager.active) throw new Error('fixture session is inactive');
  if (manager.paused) {
    try { reader._iframeWindow.document.notifyUserGestureActivation?.(); } catch (_) {}
    doc.querySelector('button.play')?.click();
    await waitFor(async () => { const e = await engineOf(); return !manager.paused && e?.session?.playing === true; }, 10000, 100);
  }
  const before = { selected: manager.selectedVoiceID ?? null, active: !!manager.active, paused: !!manager.paused, engine: await engineOf(), switch: switchOf() };
  let voiceMenu = doc.querySelector('.popover[aria-label="Voice"]');
  if (!voiceMenu) { [...doc.querySelectorAll('button.picker')].find(e => (e.getAttribute('aria-label') || '').startsWith('Voice:'))?.click(); await sleep(300); voiceMenu = doc.querySelector('.popover[aria-label="Voice"]'); }
  const row = [...(voiceMenu?.querySelectorAll('button.option') || [])].find(e => /Abel/.test((e.textContent || '').trim()));
  if (!row) throw new Error('Fish Abel row is missing');
  row.click();
  await sleep(400);
  const during = { selected: manager.selectedVoiceID ?? null, active: !!manager.active, paused: !!manager.paused, engine: await engineOf(), switch: switchOf() };
  const committed = await waitFor(async () => manager.selectedVoiceID === target.id ? await engineOf() : null);
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (_) {} }
  await sleep(400);
  const after = { selected: manager.selectedVoiceID ?? null, active: !!manager.active, paused: !!manager.paused, engine: await engineOf(), switch: switchOf() };
  return JSON.stringify({ status: before.paused || !before.engine?.session?.playing ? 'NOT TESTABLE' : 'PASS', target, before, during, committed: !!committed, after, actualControls: { provider: true, voice: true }, limitation: before.paused || !before.engine?.session?.playing ? 'fixture audio did not expose a playing Engine clock for ordinary handoff' : null }, null, 1);
})();
