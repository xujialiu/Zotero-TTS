return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, h = state.helpers, slots = state.fixtures;
  if (!h || !slots?.pdf || !slots?.epub) throw new Error('fixture helpers are missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const value = test(); if (value) return value; await sleep(60); } return test(); };
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  if (!host) throw new Error('Zotero main window is missing');
  try { host.windowState = 1; } catch (e) {}
  await sleep(250);
  try { host.focus?.(); } catch (e) {}
  const childOf = slot => h.child(slot), frameOf = slot => h.frame(slot), readerOf = slot => h.reader(slot), managerOf = slot => h.manager(slot);
  const frameLayouts = () => {
    const out = {};
    for (const kind of ['pdf', 'epub']) out[kind] = frameOf(slots[kind])?.getAttribute?.('data-layout') || null;
    return out;
  };
  const waitLayout = async expected => {
    const ok = await wait(() => { const frames = frameLayouts(); return frames.pdf === expected && frames.epub === expected && Services.prefs.getStringPref(layoutPref, '') === expected ? true : null; }, 8000);
    if (!ok) throw new Error('layout did not settle at ' + expected + ': ' + JSON.stringify({ pref: Services.prefs.getStringPref(layoutPref, ''), frames: frameLayouts() }));
    await sleep(140);
  };
  const ensureMounted = async slot => {
    h.select(slot);
    const frame = frameOf(slot), doc = h.doc(slot);
    if (!frame || !doc) throw new Error('fixture frame is missing for ' + slot.itemID);
    if (frame.hidden) {
      const toggle = doc.getElementById('ztts-player-toggle');
      if (!toggle) throw new Error('plugin player toggle is missing for ' + slot.itemID);
      toggle.click();
    }
    const mounted = await wait(() => frame.hidden === false && childOf(slot)?.document?.querySelector('.player') ? true : null, 9000);
    if (!mounted) throw new Error('plugin player did not mount for ' + slot.itemID);
    const active = await wait(() => managerOf(slot)?.active ? true : null, 10000);
    if (!active) throw new Error('Read Aloud manager did not activate for ' + slot.itemID);
    if (!managerOf(slot)?.paused) {
      h.internal(slot)?.toggleReadAloudPaused();
      const paused = await wait(() => managerOf(slot)?.paused ? true : null, 5000);
      if (!paused) throw new Error('fixture manager did not pause for ' + slot.itemID);
    }
    return slot;
  };
  const focusReader = async slot => {
    h.select(slot);
    try { readerOf(slot)?.focus?.(); } catch (e) {}
    try { readerOf(slot)?._iframeWindow?.focus?.(); } catch (e) {}
    try { host.focus?.(); } catch (e) {}
    await sleep(140);
    return host;
  };
  const focusPlayer = async slot => {
    h.select(slot);
    const child = childOf(slot), target = child?.document?.querySelector('.options-toggle') || child?.document?.body;
    try { target?.focus?.(); } catch (e) {}
    try { child?.focus?.(); } catch (e) {}
    try { host.focus?.(); } catch (e) {}
    await sleep(140);
    return host;
  };
  const trustedP = win => {
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    tip.beginInputTransactionForTests(win);
    const event = () => new win.KeyboardEvent('', { key: 'P', code: 'KeyP', keyCode: 80, bubbles: true, cancelable: true, shiftKey: true });
    try {
      const shiftDown = tip.keydown(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, shiftKey: true, bubbles: true, cancelable: true }));
      const keyDown = tip.keydown(event()), keyUp = tip.keyup(event());
      const shiftUp = tip.keyup(new win.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, bubbles: true, cancelable: true }));
      return { shiftDown, keyDown, keyUp, shiftUp };
    } finally { tip.endInputTransaction?.(); }
  };
  const rect = box => box ? { x: box.x, y: box.y, width: box.width, height: box.height, top: box.top, right: box.right, bottom: box.bottom, left: box.left } : null;
  const intersects = (a, b) => !!a && !!b && Math.min(a.right, b.right) > Math.max(a.left, b.left) + .01 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + .01;
  const controlOrder = doc => {
    const controls = doc?.querySelector('.controls'), order = [];
    if (!controls) return order;
    for (let i = 0; i < controls.children.length; i++) {
      const el = controls.children[i];
      if (el.getAttribute('data-adjust') === 'speed') order.push('speed');
      else if (el.classList.contains('mode')) order.push('mode');
      else if (el.getAttribute('data-adjust') === 'volume') order.push('volume');
      else if (el.classList.contains('status-button')) order.push('status');
      else if (el.classList.contains('layout-menu')) order.push('layout');
      else order.push(el.tagName.toLowerCase());
    }
    return order;
  };
  const childMeasure = (child, expectedVariant, outerFrame = null) => {
    const doc = child?.document, player = doc?.querySelector('.player'), controls = doc?.querySelector('.controls');
    if (!doc || !player || !controls) return { error: 'player controls are missing' };
    const playerBox = player.getBoundingClientRect(), speed = doc.querySelector('[data-adjust="speed"]'), mode = doc.querySelector('.mode'), volume = doc.querySelector('[data-adjust="volume"]'), status = doc.querySelector('.status-button');
    const speedBox = speed?.getBoundingClientRect(), modeBox = mode?.getBoundingClientRect(), volumeBox = volume?.getBoundingClientRect(), statusBox = status?.hidden ? null : status?.getBoundingClientRect();
    const modeCenter = modeBox ? (modeBox.left + modeBox.right) / 2 : null, panelCenter = (playerBox.left + playerBox.right) / 2;
    const visible = [];
    for (const el of player.querySelectorAll('*')) {
      if (el.hidden) continue;
      const style = child.getComputedStyle(el); if (style.display === 'none' || style.visibility === 'hidden') continue;
      const b = el.getBoundingClientRect(); if (b.width || b.height) visible.push(b);
    }
    let minTop = null, maxBottom = null, minLeft = null, maxRight = null;
    for (const b of visible) { minTop = minTop === null ? b.top : Math.min(minTop, b.top); maxBottom = maxBottom === null ? b.bottom : Math.max(maxBottom, b.bottom); minLeft = minLeft === null ? b.left : Math.min(minLeft, b.left); maxRight = maxRight === null ? b.right : Math.max(maxRight, b.right); }
    const fit = visible.length > 0 && minTop >= -1 && maxBottom <= playerBox.height + 1 && minLeft >= -1 && maxRight <= playerBox.width + 1;
    const order = controlOrder(doc), firstThree = order.slice(0, 3), overlaps = { speedStatus: intersects(speedBox, statusBox), modeStatus: intersects(modeBox, statusBox), volumeStatus: intersects(volumeBox, statusBox), speedMode: intersects(speedBox, modeBox), modeVolume: intersects(modeBox, volumeBox) };
    const frame = outerFrame || doc.defaultView?.frameElement, frameBox = frame?.getBoundingClientRect();
    return { variant: expectedVariant, className: player.className, frameHeight: frameBox?.height ?? null, playerHeight: playerBox.height, order, firstThree, speedLabel: speed?.querySelector('.adjust-value')?.textContent || null, modeLabel: mode?.textContent || null, volumeLabel: volume?.querySelector('.adjust-value')?.textContent || null, statusVisible: !!status && !status.hidden, statusLabel: status?.textContent || null, modeCenterDiff: expectedVariant === 'B' && modeCenter !== null ? Math.abs(modeCenter - panelCenter) : null, fit, overlaps };
  };
  const snapshot = (speed, volume, expanded, error = null, automatic = true) => ({ expanded, provider: 'fish', locale: 'en', voice: 'fish::test', speed, volume, automatic, playing: false, active: true, buffering: false, loading: false, error, providers: [{ value: 'fish', label: 'Fish Audio' }], locales: [{ value: 'en', label: 'English' }], voices: [{ value: 'fish::test', label: 'Test voice' }], favorites: [] });
  const stateSnap = (slot, label) => {
    const manager = managerOf(slot), controller = manager?._controller, child = childOf(slot), mode = child?.document?.querySelector('.mode');
    return { label, active: !!manager?.active, paused: !!manager?.paused, voice: manager?.selectedVoiceID || null, tier: manager?._selectedTier || null, speed: Number.isFinite(manager?.speed) ? Number(manager.speed) : null, position: Number.isFinite(controller?._position) ? Number(controller._position) : null, mode: mode?.textContent || null, layout: frameOf(slot)?.getAttribute('data-layout') || null };
  };
  const refs = slot => { const manager = managerOf(slot); return { manager, controller: manager?._controller, segment: manager?.activeSegment ?? manager?._activeSegment }; };
  const sameState = (before, after, beforeRefs, slot) => { const nowRefs = refs(slot); return { managerSame: beforeRefs.manager === nowRefs.manager, controllerSame: beforeRefs.controller === nowRefs.controller, segmentSame: beforeRefs.segment === nowRefs.segment, active: before.active === after.active, paused: before.paused === after.paused, voice: before.voice === after.voice, speed: before.speed === after.speed, position: before.position === after.position, pass: beforeRefs.manager === nowRefs.manager && beforeRefs.controller === nowRefs.controller && beforeRefs.segment === nowRefs.segment && before.active === after.active && before.paused === after.paused && before.voice === after.voice && before.speed === after.speed && before.position === after.position }; };
  const rows = [];
  let probe = null, probeWindow = null, resizeObserver = null, frameLoadListener = null;
  try {
    await ensureMounted(slots.pdf); await ensureMounted(slots.epub);
    // The controlled child below receives snapshots only; its commands are
    // captured locally and never reach a real manager or preference.
    const realSlot = slots.epub;
    h.select(realSlot);
    Zotero.ZoteroTTS.pluginPlayer.setLayout('B'); await waitLayout('B');
    const realChild = childOf(realSlot), realOptions = realChild?.document?.querySelector('.options-toggle');
    if (realOptions?.getAttribute('aria-expanded') !== 'true') { realOptions?.click(); await wait(() => realChild?.document?.querySelector('.options-toggle')?.getAttribute('aria-expanded') === 'true' ? true : null, 3000); }
    Zotero.ZoteroTTS.pluginPlayer.setLayout('top'); await waitLayout('top');
    // Let any mask from setup's B → top transition expire before the first
    // sampled top → A transition.
    await sleep(400);
    const realFrame = frameOf(realSlot), realReaderDoc = h.doc(realSlot), initialChildDoc = realFrame?.contentDocument, split = await wait(() => realReaderDoc?.querySelector('#split-view') || null, 4000);
    if (!realFrame || !initialChildDoc || !split) throw new Error('real fixture frame or split view is missing');
    const loadEvents = [], resizeEvents = [];
    frameLoadListener = () => loadEvents.push({ at: Date.now() });
    realFrame.addEventListener('load', frameLoadListener);
    resizeObserver = new host.ResizeObserver(() => { const b = realFrame.getBoundingClientRect(); resizeEvents.push({ at: Date.now(), width: b.width, height: b.height }); });
    resizeObserver.observe(realFrame);
    const splitRect = () => rect(realReaderDoc.querySelector('#split-view')?.getBoundingClientRect());
    const resizeTarget = () => {
      const masked = realReaderDoc.querySelector('[class~="mask-resizing"]'); if (masked) return masked;
      const marked = realReaderDoc.querySelector('[class~="has-resized-before"]'); if (marked) return marked;
      for (const candidate of realReaderDoc.querySelectorAll('iframe')) if (candidate !== realFrame && candidate.id !== 'ztts-player-frame') return candidate;
      return null;
    };
    const maskSample = () => {
      const target = resizeTarget(), classes = String(target?.className || '').split(/\s+/).filter(Boolean), style = target ? realReaderDoc.defaultView?.getComputedStyle(target) : null;
      return { className: classes, maskResizing: classes.includes('mask-resizing'), filter: style?.filter || null };
    };
    const sampleMask = async () => {
      const samples = [{ at: 'immediate', ...maskSample() }];
      await new Promise(resolve => realReaderDoc.defaultView.requestAnimationFrame(() => { samples.push({ at: 'rAF', ...maskSample() }); resolve(); }));
      await sleep(100); samples.push({ at: '100ms', ...maskSample() });
      await sleep(200); samples.push({ at: '300ms', ...maskSample() });
      return samples;
    };
    const realStage = (name, expected) => {
      const currentDoc = realFrame.contentDocument, currentPlayer = currentDoc?.querySelector('.player'), b = realFrame.getBoundingClientRect(), p = currentPlayer?.getBoundingClientRect();
      return { stage: name, expected, dataLayout: realFrame.getAttribute('data-layout'), frame: rect(b), content: rect(p), childDocumentSame: currentDoc === initialChildDoc, loadEvents: loadEvents.length, resizeEvents: resizeEvents.length, splitView: splitRect() };
    };
    const realBefore = stateSnap(realSlot, 'top-before'), realRefs = refs(realSlot), realTrace = [realStage('top-before', 'top')];
    const topToA = trustedP(await focusReader(realSlot)); const blurTopToA = await sampleMask(); await waitLayout('A'); const realA = realStage('top → A', 'A'), stateA = stateSnap(realSlot, 'A-after');
    const aToB = trustedP(await focusPlayer(realSlot)); const blurAToB = await sampleMask(); await waitLayout('B'); const realB = realStage('A → B', 'B'), stateB = stateSnap(realSlot, 'B-after'), bControls = childMeasure(childOf(realSlot), 'B', realFrame);
    const bToTop = trustedP(await focusReader(realSlot)); const blurBToTop = await sampleMask(); await waitLayout('top'); const realTop = realStage('B → top', 'top'), stateTop = stateSnap(realSlot, 'top-after');
    realTrace.push(realA, realB, realTop);
    const blur = { 'top → A': blurTopToA, 'A → B': blurAToB, 'B → top': blurBToTop };
    const blurSeen = name => blur[name].some(sample => sample.maskResizing && /blur\(/.test(String(sample.filter || '')));
    const blurSettled = name => blur[name][blur[name].length - 1]?.maskResizing === false;
    const g = realB.content, expectedB = g?.height === 202 && realB.frame?.height === 202;
    const realStates = { A: sameState(realBefore, stateA, realRefs, realSlot), B: sameState(realBefore, stateB, realRefs, realSlot), top: sameState(realBefore, stateTop, realRefs, realSlot) };
    if (topToA.keyDown !== 1 || aToB.keyDown !== 1 || bToTop.keyDown !== 1 || !expectedB || !realB.childDocumentSame || !realTop.childDocumentSame || !realA.childDocumentSame || realB.loadEvents !== 0 || realTop.loadEvents !== 0 || !realStates.A.pass || !realStates.B.pass || !realStates.top.pass || !bControls.fit || blurSeen('top → A') || !blurSeen('A → B') || !blurSeen('B → top') || !blurSettled('A → B') || !blurSettled('B → top')) throw new Error('real layout/reload/blur observation failed: ' + JSON.stringify({ topToA, aToB, bToTop, realTrace, blur, realStates, bControls }));
    rows.push({ check: 'real EPUB trusted top → A → B → top', expected: 'expanded floating frame/content 202px; same child document; no transition load; state retained; resize mask only on A→B/B→top and clears by 300ms', observed: { presses: { topToA, aToB, bToTop }, trace: realTrace, blurSamples: blur, states: realStates, controls: bControls, userBlurObservation: { source: 'brief/user report', topToA: false, aToB: true, bToTop: true, machineVerdict: 'computed mask/filter sampled; subjective blur not claimed' } }, status: 'PASS' });

    const resource = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()).resource;
    const hostDoc = h.doc(realSlot); probe = hostDoc.createElement('iframe'); probe.id = 'ztts-issue-124-am-probe'; probe.style.cssText = 'position:fixed;left:10px;top:100px;width:300px;height:34px;z-index:20000;border:0'; probe.src = String(resource).replace(/\?[^#]*$/, '?embedded=1&variant=A'); hostDoc.body.append(probe);
    const ready = await wait(() => Components.utils.waiveXrays(probe.contentWindow)?.zttsSetLayout ? true : null, 5000); if (!ready) throw new Error('isolated beta10 child did not load');
    probeWindow = Components.utils.waiveXrays(probe.contentWindow); const probeDoc = probe.contentDocument, commands = [], resizeNotifications = [];
    Components.utils.exportFunction((action, value) => commands.push({ action, value }), probeWindow, { defineAs: 'zttsCommand' });
    Components.utils.exportFunction(height => { resizeNotifications.push({ height, className: probe.contentDocument?.querySelector('.player')?.className || null }); probe.style.height = height + 'px'; }, probeWindow, { defineAs: 'zttsResizePreview' });
    const apply = async next => { Reflect.apply(probeWindow.zttsUpdate, probeWindow, [JSON.stringify(next)]); await sleep(60); };
    const allLayouts = [];
    for (const variant of ['top', 'A', 'B']) { Reflect.apply(probeWindow.zttsSetLayout, probeWindow, [variant]); await apply(snapshot(1.25, 40, true)); const measured = childMeasure(probeWindow, variant, probe); if (measured.firstThree.join(',') !== 'speed,mode,volume') throw new Error('control order mismatch in ' + variant + ': ' + JSON.stringify(measured)); allLayouts.push({ variant, order: measured.order, firstThree: measured.firstThree, speedLabel: measured.speedLabel, modeLabel: measured.modeLabel, volumeLabel: measured.volumeLabel }); }
    const controlledRows = [];
    for (const expanded of [true, false]) for (const speed of [.5, 1.25, 3]) for (const volume of [0, 40, 100]) for (const error of [null, 'synthetic error']) {
      Reflect.apply(probeWindow.zttsSetLayout, probeWindow, ['B']);
      await apply(snapshot(speed, volume, expanded, error));
      const measured = childMeasure(probeWindow, 'B', probe), expectedSpeed = Number(speed).toFixed(2) + '×', expectedVolume = volume + '%';
      const noOverlap = Object.values(measured.overlaps).every(value => value === false), expectedVisible = !!error;
      const pass = measured.firstThree.join(',') === 'speed,mode,volume' && measured.speedLabel === expectedSpeed && measured.modeLabel === 'A' && measured.volumeLabel === expectedVolume && measured.statusVisible === expectedVisible && measured.modeCenterDiff !== null && measured.modeCenterDiff <= 1 && measured.frameHeight === (expanded ? 202 : 108) && measured.playerHeight === (expanded ? 202 : 108) && measured.fit && noOverlap;
      const row = { expanded, speed, volume, error: !!error, expected: { speedLabel: expectedSpeed, volumeLabel: expectedVolume, frameHeight: expanded ? 202 : 108, modeCenterMaxDiff: 1, statusVisible: expectedVisible }, observed: measured, status: pass ? 'PASS' : 'FAIL' };
      controlledRows.push(row); if (!pass) throw new Error('controlled A/M geometry mismatch: ' + JSON.stringify(row));
    }
    await apply(snapshot(1.25, 40, true));
    commands.length = 0; const mode = probeDoc.querySelector('.mode'); mode.click(); await sleep(40); const modeM = commands.slice(); await apply(snapshot(1.25, 40, true, null, false)); commands.length = 0; mode.click(); await sleep(40); const modeA = commands.slice();
    if (modeM.length !== 1 || modeM[0].action !== 'automatic' || modeM[0].value !== false || modeA.length !== 1 || modeA[0].action !== 'automatic' || modeA[0].value !== true) throw new Error('mode command dispatch mismatch: ' + JSON.stringify({ modeM, modeA }));
    const speedButton = probeDoc.querySelector('[data-adjust="speed"]'); speedButton.click(); const speedPopover = await wait(() => probeDoc.querySelector('.popover') || null, 2500); if (!speedPopover) throw new Error('isolated speed menu did not open'); const speedInput = speedPopover.querySelector('input[type="range"]'); let speedPreset = null; const speedPresets = []; for (const button of speedPopover.querySelectorAll('.presets button')) { speedPresets.push(button.textContent); if (button.textContent === '1.50×') speedPreset = button; } if (!speedInput || speedInput.min !== '0.5' || speedInput.max !== '3' || speedInput.step !== '0.05' || !speedPreset) throw new Error('isolated speed menu shape mismatch: ' + JSON.stringify({ input: speedInput ? { min: speedInput.min, max: speedInput.max, step: speedInput.step, value: speedInput.value } : null, presets: speedPresets })); commands.length = 0; speedPreset.click(); await sleep(40); const speedCommand = commands.slice(); speedButton.click(); await wait(() => !probeDoc.querySelector('.popover') ? true : null, 2500);
    const volumeButton = probeDoc.querySelector('[data-adjust="volume"]'); volumeButton.click(); const volumePopover = await wait(() => probeDoc.querySelector('.popover') || null, 2500); if (!volumePopover) throw new Error('isolated volume menu did not open'); const volumeInput = volumePopover.querySelector('input[type="range"]'); let volumePreset = null; const volumePresets = []; for (const button of volumePopover.querySelectorAll('.presets button')) { volumePresets.push(button.textContent); if (button.textContent === '50%') volumePreset = button; } if (!volumeInput || volumeInput.min !== '0' || volumeInput.max !== '100' || volumeInput.step !== '1' || !volumePreset) throw new Error('isolated volume menu shape mismatch: ' + JSON.stringify({ input: volumeInput ? { min: volumeInput.min, max: volumeInput.max, step: volumeInput.step, value: volumeInput.value } : null, presets: volumePresets })); commands.length = 0; volumePreset.click(); await sleep(40); const volumeCommand = commands.slice(); volumeButton.click(); await wait(() => !probeDoc.querySelector('.popover') ? true : null, 2500);
    if (speedCommand.length !== 1 || speedCommand[0].action !== 'speed' || speedCommand[0].value !== 1.5 || volumeCommand.length !== 1 || volumeCommand[0].action !== 'volume' || volumeCommand[0].value !== 50) throw new Error('range command dispatch mismatch: ' + JSON.stringify({ speedCommand, volumeCommand }));
    rows.push({ check: 'isolated beta10 control order and floating center', expected: 'Speed, A/M, Volume in all layouts; B mode center within 1px for all values/status states; no overlap/clipping', observed: { allLayouts, controlledRows, statusCases: { hidden: controlledRows.filter(row => !row.error).length, visible: controlledRows.filter(row => row.error).length }, commands: { modeM, modeA, speedCommand, volumeCommand }, speedRange: { min: speedInput.min, max: speedInput.max, step: speedInput.step }, volumeRange: { min: volumeInput.min, max: volumeInput.max, step: volumeInput.step }, resizeNotifications }, status: 'PASS' });
    state.speedVerification = { beta10: rows };
    return JSON.stringify({ rows, finalLayout: Services.prefs.getStringPref(layoutPref, '') }, null, 1);
  } finally {
    try { resizeObserver?.disconnect(); } catch (e) {}
    try { if (frameLoadListener) frameOf(slots.epub)?.removeEventListener('load', frameLoadListener); } catch (e) {}
    try { probe?.remove(); } catch (e) {}
    try { Zotero.ZoteroTTS.pluginPlayer.setLayout('top'); } catch (e) {}
  }
})()
