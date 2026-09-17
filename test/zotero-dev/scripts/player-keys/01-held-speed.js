return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, h = state.helpers, slots = state.fixtures;
  if (!h || !slots?.pdf || !slots?.epub) throw new Error('fixture helpers are missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (test, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { const value = test(); if (value) return value; await sleep(100); } return test(); };
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  if (!host) throw new Error('Zotero main window is missing');
  try { host.maximize?.(); host.focus?.(); } catch (e) {}
  await sleep(250);
  const speedUpPref = 'extensions.zotero.zotero-tts.shortcuts.speedUp', speedDownPref = 'extensions.zotero.zotero-tts.shortcuts.speedDown';
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const readMemory = () => { try { const value = JSON.parse(Services.prefs.getStringPref('extensions.zotero.zotero-tts.readAloud.memory')); return { speed: value?.speed ?? null, chars: Services.prefs.getStringPref('extensions.zotero.zotero-tts.readAloud.memory').length }; } catch (e) { return { speed: null, chars: 0 }; } };
  const frame = slot => h.frame(slot), child = slot => h.child(slot), manager = slot => h.manager(slot);
  const select = async slot => { h.select(slot); host.focus?.(); await sleep(150); };
  const focusReader = async slot => { await select(slot); const r = h.reader(slot); r?.focus?.(); r?._iframeWindow?.focus?.(); host.focus?.(); await sleep(120); return host; };
  const focusPlayer = async slot => { await select(slot); const c = child(slot), target = c?.document?.querySelector('.options-toggle') || c?.document?.body; target?.focus?.(); c?.focus?.(); host.focus?.(); await sleep(120); return host; };
  const keyEvent = (win, key, code, keyCode, repeat = false, shift = true) => new win.KeyboardEvent('', { key, code, keyCode, repeat, shiftKey: shift, bubbles: true, cancelable: true });
  // Send the initial key and repeated keydowns in one transaction, mirroring a
  // physical held key while recording the repeat flags and consumption.
  const heldNormal = (win, key, code, keyCode, repeats = 2) => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const ev = (repeat = false) => keyEvent(win, key, code, keyCode, repeat);
    tip.beginInputTransactionForTests(win);
    try {
      const shiftDown = tip.keydown(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true, bubbles: true, cancelable: true }));
      const initial = tip.keydown(ev(false)), repeated = [];
      for (let i = 0; i < repeats; i++) repeated.push(tip.keydown(ev(true)));
      const keyUp = tip.keyup(ev(false)), shiftUp = tip.keyup(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, bubbles: true, cancelable: true }));
      return { shiftDown, initial, repeated, keyUp, shiftUp, repeatFlags: [false, ...repeated.map(() => true)] };
    } finally { tip.endInputTransaction?.(); }
  };
  const speed = slot => Number(manager(slot)?.speed);
  const setSpeed = async (slot, value) => { const m = manager(slot); if (!m?.active) throw new Error('manager is not active'); m.setSpeed(value, false); await sleep(220); if (Math.abs(speed(slot) - value) > 0.000001) throw new Error('unable to set fixture speed to ' + value + ': ' + speed(slot)); };
  const instrument = slot => {
    const m = Components.utils.waiveXrays(manager(slot));
    const calls = [], original = m?.setSpeed;
    if (!m || typeof original !== 'function') throw new Error('setSpeed is unavailable');
    m.setSpeed = function (...args) { calls.push({ speed: Number(args[0]), persist: !!args[1] }); return Reflect.apply(original, this, args); };
    return { calls, restore: () => { try { m.setSpeed = original; } catch (e) {} } };
  };
  const rows = [];
  const slot = slots.pdf;
  await setSpeed(slot, 1);
  let hook = instrument(slot); const readerHeld = heldNormal(await focusReader(slot), 'C', 'KeyC', 67); await sleep(420); const readerSpeed = speed(slot); hook.restore();
  if (readerHeld.initial !== 1 || readerHeld.repeated.some(x => x !== 1) || Math.abs(readerSpeed - 1.15) > 0.000001 || readerHeld.repeatFlags.join(',') !== 'false,true,true') throw new Error('reader held Shift+C mismatch: ' + JSON.stringify({ readerHeld, readerSpeed }));
  rows.push({ check: 'held Shift+C from reader view', expected: '1 → 1.05 → 1.10 → 1.15 at repeat cadence', observed: { events: readerHeld, speed: readerSpeed, memory: readMemory() }, status: 'PASS' });
  await setSpeed(slot, 1);
  hook = instrument(slot); const playerHeld = heldNormal(await focusPlayer(slot), 'X', 'KeyX', 88); await sleep(420); const playerSpeed = speed(slot); hook.restore();
  if (playerHeld.initial !== 1 || playerHeld.repeated.some(x => x !== 1) || Math.abs(playerSpeed - 0.85) > 0.000001) throw new Error('player held Shift+X mismatch: ' + JSON.stringify({ playerHeld, playerSpeed }));
  rows.push({ check: 'held Shift+X from player control focus', expected: '1 → 0.95 → 0.90 → 0.85', observed: { events: playerHeld, speed: playerSpeed, memory: readMemory() }, status: 'PASS' });

  await setSpeed(slot, 1);
  if (manager(slot)?.paused) { h.internal(slot)?.toggleReadAloudPaused(); await wait(() => manager(slot)?.active && !manager(slot)?.paused ? true : null, 5000); }
  const playingBefore = { active: !!manager(slot)?.active, paused: !!manager(slot)?.paused, speed: speed(slot), position: manager(slot)?._controller?._position ?? null, audio: manager(slot)?._controller?._audioContext ? { state: manager(slot)._controller._audioContext.state, currentTime: manager(slot)._controller._audioContext.currentTime } : null };
  const playingHeld = heldNormal(await focusReader(slot), 'C', 'KeyC', 67); await sleep(420);
  const playingAfter = { active: !!manager(slot)?.active, paused: !!manager(slot)?.paused, speed: speed(slot), position: manager(slot)?._controller?._position ?? null, audio: manager(slot)?._controller?._audioContext ? { state: manager(slot)._controller._audioContext.state, currentTime: manager(slot)._controller._audioContext.currentTime } : null };
  if (playingHeld.initial !== 1 || playingHeld.repeated.some(x => x !== 1) || !playingAfter.active || playingAfter.paused || Math.abs(playingAfter.speed - 1.15) > 0.000001) throw new Error('playing held Shift+C mismatch: ' + JSON.stringify({ playingBefore, playingHeld, playingAfter }));
  rows.push({ check: 'held Shift+C while playing', expected: 'repeats step speed while active playback stays playing', observed: { before: playingBefore, events: playingHeld, after: playingAfter }, status: 'PASS' });
  h.internal(slot)?.toggleReadAloudPaused(); await wait(() => manager(slot)?.paused ? true : null, 5000);

  await setSpeed(slot, 3); hook = instrument(slot); const upper = heldNormal(await focusReader(slot), 'C', 'KeyC', 67); await sleep(350); const upperSpeed = speed(slot), upperCalls = hook.calls.slice(); hook.restore();
  await setSpeed(slot, 0.5); hook = instrument(slot); const lower = heldNormal(await focusPlayer(slot), 'X', 'KeyX', 88); await sleep(350); const lowerSpeed = speed(slot), lowerCalls = hook.calls.slice(); hook.restore();
  if (upper.initial !== 1 || upper.repeated.some(x => x !== 1) || upperSpeed !== 3 || upperCalls.length !== 0 || lower.initial !== 1 || lower.repeated.some(x => x !== 1) || lowerSpeed !== 0.5 || lowerCalls.length !== 0) throw new Error('held speed saturation mismatch: ' + JSON.stringify({ upper, upperSpeed, upperCalls, lower, lowerSpeed, lowerCalls }));
  rows.push({ check: 'held speed keys saturate without repeated setSpeed', expected: '3 and 0.5 remain fixed; no setSpeed call at either bound', observed: { upper: { events: upper, speed: upperSpeed, setSpeedCalls: upperCalls }, lower: { events: lower, speed: lowerSpeed, setSpeedCalls: lowerCalls } }, status: 'PASS' });

  await setSpeed(slot, 1.25);
  const originalUp = Services.prefs.getStringPref(speedUpPref, ''), originalDown = Services.prefs.getStringPref(speedDownPref, '');
  Services.prefs.setStringPref(speedUpPref, 'Shift+V'); Services.prefs.setStringPref(speedDownPref, 'Shift+B');
  await sleep(120);
  const oldUp = heldNormal(await focusReader(slot), 'C', 'KeyC', 67), oldDown = heldNormal(await focusPlayer(slot), 'X', 'KeyX', 88); await sleep(320); const afterOld = speed(slot);
  const reboundUp = heldNormal(await focusReader(slot), 'V', 'KeyV', 86); await sleep(320); const afterUp = speed(slot);
  const reboundDown = heldNormal(await focusPlayer(slot), 'B', 'KeyB', 66); await sleep(320); const afterDown = speed(slot);
  Services.prefs.setStringPref(speedUpPref, originalUp); Services.prefs.setStringPref(speedDownPref, originalDown);
  if (oldUp.initial !== 0 || oldDown.initial !== 0 || afterOld !== 1.25 || reboundUp.initial !== 1 || reboundUp.repeated.some(x => x !== 1) || Math.abs(afterUp - 1.4) > 0.000001 || reboundDown.initial !== 1 || reboundDown.repeated.some(x => x !== 1) || Math.abs(afterDown - 1.25) > 0.000001) throw new Error('rebound speed shortcuts mismatch: ' + JSON.stringify({ originalUp, originalDown, oldUp, oldDown, afterOld, reboundUp, afterUp, reboundDown, afterDown }));
  rows.push({ check: 'rebound Faster/Slower held keys', expected: 'old Shift+C/X fall through; rebound Shift+V/B repeat by 0.05', observed: { old: { up: oldUp, down: oldDown, speed: afterOld }, rebound: { up: reboundUp, speed: afterUp, down: reboundDown, speedAfterDown: afterDown }, restoredBindings: { speedUp: Services.prefs.getStringPref(speedUpPref, ''), speedDown: Services.prefs.getStringPref(speedDownPref, '') } }, status: 'PASS' });

  await setSpeed(slot, 1.25); hook = instrument(slot); const reset = heldNormal(await focusReader(slot), 'Z', 'KeyZ', 90); await sleep(350); const resetSpeed = speed(slot), resetCalls = hook.calls.slice(); hook.restore();
  if (reset.initial !== 1 || reset.repeated.some(x => x !== 1) || resetSpeed !== 1 || resetCalls.length !== 1) throw new Error('repeated speed reset acted more than once: ' + JSON.stringify({ reset, resetSpeed, resetCalls }));
  rows.push({ check: 'Shift+Z repeat is consumed once', expected: 'reset reaches 1.0 once; repeats do not call setSpeed', observed: { events: reset, speed: resetSpeed, setSpeedCalls: resetCalls }, status: 'PASS' });

  await setSpeed(slot, 1); const m = Components.utils.waiveXrays(manager(slot)), view = Components.utils.waiveXrays(h.view(slot));
  if (view) view._readAloudPositionLocked = false;
  const segmentCount = manager(slot)?._segments?.length || 0, seed = Math.max(2, Math.min(segmentCount - 3, Math.floor(segmentCount / 2))); if (segmentCount > seed + 3) await h.setSegment(slot, seed);
  const skipOriginal = m?.skipAhead, skipCalls = [];
  if (typeof skipOriginal !== 'function') throw new Error('skipAhead is unavailable');
  m.skipAhead = function (...args) { skipCalls.push(args[0]); return Reflect.apply(skipOriginal, this, args); };
  const skip = heldNormal(await focusReader(slot), 'ArrowRight', 'ArrowRight', 39); await sleep(450); const skipPosition = Number(manager(slot)?._controller?._position); m.skipAhead = skipOriginal;
  if (skip.initial !== 1 || skip.repeated.some(x => x !== 1) || skipCalls.length !== 1 || skipPosition <= seed) throw new Error('repeated next-sentence acted more than once: ' + JSON.stringify({ seed, skip, skipCalls, skipPosition }));
  rows.push({ check: 'Shift+ArrowRight repeat is consumed once', expected: 'one paragraph skip; repeats do not invoke skipAhead', observed: { seed, events: skip, skipCalls, position: skipPosition }, status: 'PASS' });

  await select(slot); const playerDoc = child(slot)?.document, options = playerDoc?.querySelector('.options-toggle'); if (!options) throw new Error('Options button is unavailable');
  const originalLayout = Services.prefs.getStringPref(layoutPref, 'top');
  Zotero.ZoteroTTS.pluginPlayer.setLayout('B');
  const layoutReady = await wait(() => frame(slot)?.getAttribute('data-layout') === 'B' && Services.prefs.getStringPref(layoutPref, '') === 'B' ? true : null, 5000);
  if (!layoutReady) throw new Error('floating layout did not settle for Options repeat check');
  if (options.getAttribute('aria-expanded') !== 'true') options.click(); await wait(() => options.getAttribute('aria-expanded') === 'true', 1200);
  const optionPref = 'extensions.zotero.zotero-tts.shortcuts.toggleOptions', optionOriginal = Services.prefs.getStringPref(optionPref, 'Shift+O');
  // Exercise the shipped Options binding even when this profile has a custom
  // user binding; the original value is restored before the script returns.
  Services.prefs.setStringPref(optionPref, 'Shift+O'); await sleep(120);
  const optionBinding = 'Shift+O', optionKey = 'O', optionCode = 'KeyO', optionCodePoint = 79;
  const optionBefore = child(slot)?.document?.querySelector('.options-toggle')?.getAttribute('aria-expanded') || null; const optionHeld = heldNormal(await focusPlayer(slot), optionKey, optionCode, optionCodePoint); await sleep(250); const optionAfter = child(slot)?.document?.querySelector('.options-toggle')?.getAttribute('aria-expanded') || null;
  if (optionHeld.initial !== 1 || optionHeld.repeated.some(x => x !== 1) || optionBefore === optionAfter) throw new Error('repeated Options key did not act once: ' + JSON.stringify({ optionBefore, optionHeld, optionAfter }));
  rows.push({ check: optionBinding + ' repeat is consumed once', expected: 'Options toggles once; repeat keydowns do not toggle it back', observed: { binding: optionBinding, before: optionBefore, events: optionHeld, after: optionAfter }, status: 'PASS' });
  Services.prefs.setStringPref(optionPref, optionOriginal); await sleep(120);
  Zotero.ZoteroTTS.pluginPlayer.setLayout(originalLayout); await wait(() => Services.prefs.getStringPref(layoutPref, '') === originalLayout && frame(slot)?.getAttribute('data-layout') === originalLayout ? true : null, 5000);

  await setSpeed(slot, 1.2); const input = playerDoc.createElement('input'); input.type = 'search'; input.value = ''; playerDoc.body.appendChild(input); input.focus(); child(slot)?.focus?.(); const inputHeld = heldNormal(child(slot), 'C', 'KeyC', 67); input.value = 'typed'; input.dispatchEvent(new playerDoc.defaultView.Event('input', { bubbles: true })); await sleep(300); const inputSpeed = speed(slot), inputValue = input.value; input.remove();
  if (inputHeld.initial !== 0 || inputHeld.repeated.some(x => x !== 0) || inputSpeed !== 1.2 || inputValue !== 'typed') throw new Error('search input accepted speed shortcut: ' + JSON.stringify({ inputHeld, inputSpeed, inputValue }));
  rows.push({ check: 'focused search input blocks speed shortcuts', expected: 'Shift+C repeats do not change speed while search input is focused', observed: { target: 'input[type=search]', events: inputHeld, speed: inputSpeed, typedValue: inputValue }, status: 'PASS' });
  state.playerKeys = { heldSpeed: rows, speedMemoryAfter: readMemory(), originalBindings: { speedUp: Services.prefs.getStringPref(speedUpPref, ''), speedDown: Services.prefs.getStringPref(speedDownPref, '') } };
  return JSON.stringify({ rows, finalSpeed: speed(slot), speedMemory: readMemory(), bindings: { speedUp: Services.prefs.getStringPref(speedUpPref, ''), speedDown: Services.prefs.getStringPref(speedDownPref, '') } }, null, 1);
})()
