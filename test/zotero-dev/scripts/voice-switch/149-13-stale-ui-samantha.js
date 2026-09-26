(async () => {
  const session = Zotero.__ztts149;
  const fixture = session?.fixtures?.find(row => row.kind === 'pdf');
  if (!fixture) throw new Error('149 PDF fixture is missing');
  const list = Zotero.Reader?._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) { try { if (!Components.utils.isDeadWrapper?.(list[i]) && list[i]?.itemID === fixture.itemID) { reader = list[i]; break; } } catch (_) {} }
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  const doc = reader?._iframeWindow?.document?.getElementById('ztts-player-frame')?.contentDocument;
  if (!reader || !internal || !manager || !doc) throw new Error('PDF player is missing');
  const target = (() => { const voices = manager._allVoices || []; for (let i = 0; i < voices.length; i++) { try { const label = String(voices[i]?.label ?? voices[i]?.name ?? ''); if (String(voices[i]?.tier ?? '') === 'system' && /Samantha/.test(label)) return { id: String(voices[i].id), label }; } catch (_) {} } return null; })();
  if (!target) throw new Error('listed System Samantha target is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const engineOf = async () => { try { const parsed = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()); return parsed.readers?.find(row => Number(row.itemID) === Number(fixture.itemID)) ?? null; } catch (_) { return null; } };
  const switchOf = () => { try { const parsed = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()); return parsed.readers?.find(row => Number(row.itemID) === Number(fixture.itemID)) ?? null; } catch (_) { return null; } };
  const waitFor = async (test, timeout = 12000, step = 100) => { const end = Date.now() + timeout; while (Date.now() < end) { const value = await test(); if (value) return value; await sleep(step); } return test(); };
  const beforePosition = (await engineOf())?.session?.position ?? null;
  const oldVoice = manager.selectedVoiceID;
  try { const m = Components.utils.waiveXrays(manager); const result = m._destroyController?.call(m); if (result && typeof result.then === 'function') await result; } catch (e) { throw new Error('destroy failed: ' + String(e)); }
  await sleep(500);
  const m = Components.utils.waiveXrays(manager);
  m._voiceID = null;
  m._voice = null;
  m._selectedTier = 'system';
  m._paused = false;
  await sleep(200);
  const before = { oldVoice, selected: manager.selectedVoiceID ?? null, active: !!manager.active, paused: !!manager.paused, controller: !!manager._controller, engine: await engineOf(), switch: switchOf() };
  const calls = session.requestCalls149 || [];
  calls.length = 0;
  let menu = doc.querySelector('.popover[aria-label="Voice"]');
  if (!menu) { [...doc.querySelectorAll('button.picker')].find(e => (e.getAttribute('aria-label') || '').startsWith('Voice:'))?.click(); await sleep(300); menu = doc.querySelector('.popover[aria-label="Voice"]'); }
  const option = [...(menu?.querySelectorAll('button.option') || [])].find(e => /Samantha/.test((e.textContent || '').trim()));
  if (!option) throw new Error('System Samantha row is missing from player');
  option.click();
  const recovered = await waitFor(async () => { const e = await engineOf(); return manager.active && manager.paused && manager.selectedVoiceID === target.id && !!manager._controller && e?.session?.ended === false && !!e.controller?.ours ? e : null; });
  await sleep(700);
  const after = { selected: manager.selectedVoiceID ?? null, active: !!manager.active, paused: !!manager.paused, controller: !!manager._controller, position: (await engineOf())?.session?.position ?? null, ended: (await engineOf())?.session?.ended ?? null, requests: (await engineOf())?.session?.store?.requests ?? null, calls: calls.length, switch: switchOf() };
  return JSON.stringify({ status: recovered ? 'PASS' : 'FAIL', target, beforePosition, before, after, positionUnchanged: beforePosition === after.position, noRequestsBeforePlay: after.requests === 0 && after.calls === 0, actualPlayerControl: true }, null, 1);
})();
