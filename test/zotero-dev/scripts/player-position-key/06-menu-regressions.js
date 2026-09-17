return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, h = state.helpers, slots = state.fixtures;
  if (!h || !slots?.pdf || !slots?.epub) throw new Error('fixture helpers are missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const value = test(); if (value) return value; await sleep(60); } return test(); };
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const host = Services.wm.getMostRecentWindow('navigator:browser');
  if (!host) throw new Error('Zotero main window is missing');
  try { host.windowState = 1; } catch (e) {}
  await sleep(220);
  try { host.focus?.(); } catch (e) {}
  const childOf = slot => h.child(slot), frameOf = slot => h.frame(slot);
  const frameLayouts = () => {
    const out = {};
    for (const kind of ['pdf', 'epub']) out[kind] = frameOf(slots[kind])?.getAttribute?.('data-layout') || null;
    return out;
  };
  const waitLayout = async (expected, label = '') => {
    const ok = await wait(() => { const f = frameLayouts(); return f.pdf === expected && f.epub === expected && Services.prefs.getStringPref(layoutPref, '') === expected ? true : null; }, 8000);
    if (!ok) throw new Error('layout did not settle at ' + expected + (label ? ' (' + label + ')' : '') + ': ' + JSON.stringify({ pref: Services.prefs.getStringPref(layoutPref, ''), frames: frameLayouts() }));
    await sleep(150);
  };
  const select = async slot => { h.select(slot); try { host.focus?.(); } catch (e) {} await sleep(150); };
  const focusMenu = async slot => {
    const child = childOf(slot), target = child?.document?.querySelector('.popover input, .popover button') || child?.document?.querySelector('.options-toggle') || child?.document?.body;
    try { target?.focus?.(); } catch (e) {}
    try { child?.focus?.(); } catch (e) {}
    try { host.focus?.(); } catch (e) {}
    await sleep(150);
  };
  const focusShortcut = async slot => {
    const child = childOf(slot), target = child?.document?.querySelector('.options-toggle') || child?.document?.body;
    try { target?.focus?.(); } catch (e) {}
    try { child?.focus?.(); } catch (e) {}
    try { host.focus?.(); } catch (e) {}
    await sleep(150);
  };
  const geometry = slot => {
    const frame = frameOf(slot), child = childOf(slot), doc = child?.document, player = doc?.querySelector('.player');
    if (!frame || !child || !player) return { frame: null, player: null, popover: null, controls: null };
    const fr = frame.getBoundingClientRect(), pr = player.getBoundingClientRect(), popover = doc.querySelector('.popover');
    const visible = [];
    for (const el of doc.querySelectorAll('.player *')) {
      if (el.hidden) continue;
      const css = child.getComputedStyle(el); if (css.display === 'none' || css.visibility === 'hidden') continue;
      const b = el.getBoundingClientRect(); if (b.width || b.height) visible.push(b);
    }
    let minTop = null, maxBottom = null, minLeft = null, maxRight = null;
    for (const b of visible) { minTop = minTop === null ? b.top : Math.min(minTop, b.top); maxBottom = maxBottom === null ? b.bottom : Math.max(maxBottom, b.bottom); minLeft = minLeft === null ? b.left : Math.min(minLeft, b.left); maxRight = maxRight === null ? b.right : Math.max(maxRight, b.right); }
    const overflow = visible.length ? { top: minTop, bottom: maxBottom - fr.height, left: minLeft, right: maxRight - fr.width } : null;
    const pop = popover ? popover.getBoundingClientRect() : null;
    return { frame: { width: fr.width, height: fr.height, top: fr.top, left: fr.left, styleHeight: frame.style.height }, player: { width: pr.width, height: pr.height, className: player.className }, layout: frame.getAttribute('data-layout'), expanded: doc.querySelector('.options-toggle')?.getAttribute('aria-expanded') === 'true', popover: popover ? { className: popover.className, side: popover.dataset.side || null, top: pop.top, bottom: pop.bottom, left: pop.left, right: pop.right, height: pop.height } : null, controls: { overflow, fit: !!overflow && overflow.top >= -1 && overflow.bottom <= 1 && overflow.left >= -1 && overflow.right <= 1 } };
  };
  const diagRows = async () => {
    const raw = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()), out = {};
    for (const kind of ['pdf', 'epub']) { const i = h.index(slots[kind]), row = i >= 0 ? raw.readers?.[i] : null; out[kind] = row ? { open: row.open, expanded: row.expanded, menuInset: row.menuInset, actionError: row.actionError } : null; }
    return { layout: raw.layout, rows: out };
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
  const openPopover = async (slot, selector) => {
    const child = childOf(slot), button = child?.document?.querySelector(selector);
    if (!button) throw new Error('menu anchor missing: ' + selector + ' on ' + slot.itemID);
    button.click();
    const opened = await wait(() => child?.document?.querySelector('.popover') ? true : null, 4000);
    if (!opened) throw new Error('popover did not open: ' + selector + ' on ' + slot.itemID);
    await sleep(180);
    return child.document.querySelector('.popover');
  };
  const closePopover = async (slot, selector) => {
    const child = childOf(slot), button = child?.document?.querySelector(selector);
    if (!button) throw new Error('menu anchor missing for close: ' + selector);
    button.click();
    const closed = await wait(() => !child?.document?.querySelector('.popover') ? true : null, 4000);
    if (!closed) throw new Error('popover did not close: ' + selector + ' on ' + slot.itemID);
    await sleep(150);
  };
  const ensureExpanded = async slot => {
    const child = childOf(slot), button = child?.document?.querySelector('.options-toggle');
    if (!button) throw new Error('Options button missing on ' + slot.itemID);
    if (button.getAttribute('aria-expanded') !== 'true') { button.click(); const ok = await wait(() => button.getAttribute('aria-expanded') === 'true' && geometry(slot).frame?.height === 202 ? true : null, 4000); if (!ok) throw new Error('Options did not expand on ' + slot.itemID); }
  };
  const ensureCollapsed = async slot => {
    const child = childOf(slot), button = child?.document?.querySelector('.options-toggle');
    if (button?.getAttribute('aria-expanded') === 'true') { button.click(); const ok = await wait(() => button.getAttribute('aria-expanded') === 'false' && geometry(slot).frame?.height === 108 ? true : null, 4000); if (!ok) throw new Error('Options did not collapse on ' + slot.itemID); }
  };
  const rows = [];
  try {
    for (const kind of ['pdf', 'epub']) {
      const slot = slots[kind];
      await select(slot); Zotero.ZoteroTTS.pluginPlayer.setLayout('B'); await waitLayout('B'); await ensureExpanded(slot);
      const voicePopover = await openPopover(slot, '.picker[data-pick="voice"]');
      const voiceOpen = geometry(slot), voiceDiag = await diagRows();
      if (!voiceOpen.popover || voiceOpen.popover.height <= 0 || voiceOpen.popover.top < -1 || voiceOpen.popover.bottom > voiceOpen.frame.height + 1) throw new Error('voice menu escaped floating frame: ' + JSON.stringify({ kind, voiceOpen, voiceDiag }));
      await closePopover(slot, '.picker[data-pick="voice"]');
      const voiceClosed = geometry(slot), closedDiag = await diagRows();
      if (voiceClosed.popover || voiceClosed.frame.height !== 202 || voiceClosed.player.height !== 202 || !voiceClosed.controls.fit || closedDiag.rows[kind]?.menuInset !== 0) throw new Error('voice menu close left inset or clipping: ' + JSON.stringify({ kind, voiceClosed, closedDiag }));
      rows.push({ check: kind + ' voice menu open/close', expected: 'usable menu; close restores 202px panel/frame, controls fit, menuInset=0', observed: { open: voiceOpen, openDiag: voiceDiag, closed: voiceClosed, closedDiag }, status: 'PASS' });

      const voiceAgain = await openPopover(slot, '.picker[data-pick="voice"]');
      await focusShortcut(slot);
      const keyWhileVoiceOpen = trustedP(host);
      await waitLayout('top', kind + ' after voice-menu shortcut');
      const afterVoiceKey = geometry(slot), afterVoiceKeyDiag = await diagRows();
      if (keyWhileVoiceOpen.keyDown !== 1 || afterVoiceKey.popover || afterVoiceKey.frame.height !== 34 || afterVoiceKeyDiag.rows[kind]?.menuInset !== 0) throw new Error('Shift+P did not close voice menu and switch layout: ' + JSON.stringify({ kind, keyWhileVoiceOpen, voiceAgain: !!voiceAgain, afterVoiceKey, afterVoiceKeyDiag }));
      rows.push({ check: kind + ' Shift+P with voice menu open', expected: 'one consumed press switches B→top and dismisses menu with no inset', observed: { press: keyWhileVoiceOpen, after: afterVoiceKey, diag: afterVoiceKeyDiag }, status: 'PASS' });

      Zotero.ZoteroTTS.pluginPlayer.setLayout('B'); await waitLayout('B'); await ensureExpanded(slot);
      const layoutPopover = await openPopover(slot, '.layout-menu');
      const layoutOpen = geometry(slot), layoutOpenDiag = await diagRows();
      if (!layoutOpen.popover || layoutOpen.popover.height <= 0 || layoutOpen.popover.top < -1 || layoutOpen.popover.bottom > layoutOpen.frame.height + 1) throw new Error('layout menu escaped floating frame: ' + JSON.stringify({ kind, layoutOpen, layoutOpenDiag }));
      await focusMenu(slot);
      const keyWhileLayoutOpen = trustedP(host);
      await waitLayout('top', kind + ' after layout-menu shortcut');
      const afterLayoutKey = geometry(slot), afterLayoutKeyDiag = await diagRows();
      if (keyWhileLayoutOpen.keyDown !== 1 || afterLayoutKey.popover || afterLayoutKey.frame.height !== 34 || afterLayoutKeyDiag.rows[kind]?.menuInset !== 0) throw new Error('Shift+P did not close layout menu and switch layout: ' + JSON.stringify({ kind, keyWhileLayoutOpen, layoutOpen, afterLayoutKey, afterLayoutKeyDiag }));
      rows.push({ check: kind + ' Shift+P with layout menu open', expected: 'one consumed press switches B→top and dismisses menu with no inset', observed: { press: keyWhileLayoutOpen, before: layoutOpen, beforeDiag: layoutOpenDiag, after: afterLayoutKey, afterDiag: afterLayoutKeyDiag }, status: 'PASS' });

      Zotero.ZoteroTTS.pluginPlayer.setLayout('B'); await waitLayout('B'); await ensureExpanded(slot);
      const manualToA = await openPopover(slot, '.layout-menu');
      const optionA = childOf(slot)?.document?.querySelector('.layout-option:nth-of-type(1)');
      if (!optionA) throw new Error('manual A layout option missing on ' + kind);
      optionA.click();
      await waitLayout('A');
      const afterManualA = geometry(slot), afterManualADiag = await diagRows();
      if (manualToA && !afterManualA.popover && afterManualA.frame.height === 34 && afterManualA.player.height === 34 && afterManualADiag.rows[kind]?.menuInset !== 0) throw new Error('manual layout A left stale inset: ' + JSON.stringify({ kind, afterManualA, afterManualADiag }));
      if (afterManualA.popover || afterManualA.frame.height !== 34 || afterManualA.player.height !== 34) throw new Error('manual layout choice A did not settle: ' + JSON.stringify({ kind, afterManualA, afterManualADiag }));
      const manualAReopen = await openPopover(slot, '.layout-menu');
      const optionB = childOf(slot)?.document?.querySelector('.layout-option:nth-of-type(3)');
      if (!optionB) throw new Error('manual B layout option missing on ' + kind);
      optionB.click();
      await waitLayout('B');
      const afterManualB = geometry(slot), afterManualBDiag = await diagRows();
      if (!manualAReopen || afterManualB.popover || afterManualB.frame.height !== 202 || afterManualB.player.height !== 202 || afterManualB.expanded !== true || !afterManualB.controls.fit || afterManualBDiag.rows[kind]?.menuInset !== 0) throw new Error('manual layout choice B did not restore expanded panel: ' + JSON.stringify({ kind, afterManualB, afterManualBDiag }));
      rows.push({ check: kind + ' manual layout menu A then B', expected: 'menu choice switches B→A→B; menus close, 34/202 geometry restored, no inset', observed: { afterA: afterManualA, afterADiag: afterManualADiag, afterB: afterManualB, afterBDiag: afterManualBDiag }, status: 'PASS' });

      await ensureCollapsed(slot);
      const collapsed = geometry(slot), collapsedDiag = await diagRows();
      if (collapsed.frame.height !== 108 || collapsed.player.height !== 108 || collapsed.popover || !collapsed.controls.fit || collapsedDiag.rows[kind]?.menuInset !== 0) throw new Error('collapsed Options state did not restore 108px geometry: ' + JSON.stringify({ kind, collapsed, collapsedDiag }));
      await ensureExpanded(slot);
      const expanded = geometry(slot), expandedDiag = await diagRows();
      if (expanded.frame.height !== 202 || expanded.player.height !== 202 || expanded.popover || !expanded.controls.fit || expandedDiag.rows[kind]?.menuInset !== 0) throw new Error('expanded Options state did not restore 202px geometry: ' + JSON.stringify({ kind, expanded, expandedDiag }));
      rows.push({ check: kind + ' Options collapse/expand after menus', expected: 'collapsed 108px and expanded 202px, no clipping or leftover inset', observed: { collapsed, collapsedDiag, expanded, expandedDiag }, status: 'PASS' });
    }
    Zotero.ZoteroTTS.pluginPlayer.setLayout('top'); await waitLayout('top');
    const final = await diagRows();
    if (final.layout !== 'top' || frameLayouts().pdf !== 'top' || frameLayouts().epub !== 'top') throw new Error('final top layout mismatch: ' + JSON.stringify({ final, frames: frameLayouts() }));
    state.positionShortcut.menus = rows;
    return JSON.stringify({ rows, final: { frames: frameLayouts(), diag: final } }, null, 1);
  } finally {
    try { Zotero.ZoteroTTS.pluginPlayer.setLayout('top'); } catch (e) {}
  }
})()
