return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, h = state.helpers, slot = state.fixtures.pdf, p = Services.prefs;
  if (!h || !slot) throw new Error('fixture helpers are missing');
  const layoutKey = 'extensions.zotero.zotero-tts.readAloud.playerLayout', expandKey = 'extensions.zotero.zotero-tts.readAloud.openExpanded';
  const waitPlayer = async () => { const r = h.select(slot), doc = h.doc(slot); if (!r || !doc) throw new Error('selected PDF document is missing'); const toggle = doc.getElementById('ztts-player-toggle'); if (!toggle) throw new Error('plugin player toggle is missing'); let f = h.frame(slot); if (!f || f.hidden) { toggle.click(); } f = await h.wait(() => h.frame(slot)?.contentDocument?.querySelector('.player') && !h.frame(slot).hidden ? h.frame(slot) : null, 15000); if (!f) throw new Error('floating/player frame did not open'); await h.wait(() => h.manager(slot)?.active ? true : null, 12000); return f; };
  const closePlayer = async () => { const doc = h.doc(slot), toggle = doc?.getElementById('ztts-player-toggle'); if (toggle && !h.frame(slot)?.hidden) toggle.click(); await h.wait(() => h.frame(slot)?.hidden === true ? true : null, 8000); };
  const child = () => h.child(slot), frame = () => h.frame(slot), rect = el => { const r = el?.getBoundingClientRect?.(); return r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null; };
  const switchLayout = async layout => { const c = child(), menu = c?.document?.querySelector('.layout-menu'); if (!menu) throw new Error('layout menu missing for ' + layout); menu.click(); await h.wait(() => c.document.querySelector('.popover') ? true : null, 1500); const options = c.document.querySelectorAll('.layout-option'), index = ({ A: 0, top: 1, B: 2 })[layout]; if (!options[index]) throw new Error('layout option ' + layout + ' missing'); options[index].click(); await h.wait(() => frame()?.getAttribute('data-layout') === layout ? true : null, 8000); const ready = await h.wait(() => { const f = frame(), player = child()?.document?.querySelector('.player'); if (!f || !player) return null; const expected = layout === 'B' ? (player.classList.contains('collapsed') ? 108 : 202) : 34; return Math.abs((f.getBoundingClientRect?.().height || 0) - expected) <= 1 ? true : null; }, 6000); if (!ready) throw new Error('layout ' + layout + ' did not settle to its frame height: ' + JSON.stringify({ dataLayout: frame()?.getAttribute('data-layout'), player: child()?.document?.querySelector('.player')?.className, frameHeight: frame()?.getBoundingClientRect?.().height || null })); return { layout, pref: p.getStringPref(layoutKey), user: p.prefHasUserValue(layoutKey), frame: frame()?.getAttribute('data-layout') || null, frameHeight: frame()?.getBoundingClientRect?.().height || null }; };
  const range = async () => { const c = child(); const button = c.document.querySelector('[data-adjust="speed"]'); button.click(); const input = await h.wait(() => c.document.querySelector('.popover input[type="range"]'), 1500); if (!input) throw new Error('player speed range did not open'); return { c, input }; };
  const setExpandedPref = async value => { p.setBoolPref(expandKey, value); await h.sleep(350); };
  await waitPlayer();
  const defaultPrefs = p.getDefaultBranch(''), defaultBranch = (() => { try { return defaultPrefs.getStringPref(layoutKey); } catch (e) { return null; } })();
  // The first in-place upgrade observed Gecko's retained old default A. If this
  // process has already installed the candidate and its default is now top,
  // temporarily recreate that retained-default condition; the user flag is
  // still cleared and the default branch is restored before the script ends.
  let simulatedRetainedDefault = false;
  if (state.baseline?.prefs?.[layoutKey] && !state.baseline.prefs[layoutKey].user && p.prefHasUserValue(layoutKey)) p.clearUserPref(layoutKey);
  if (defaultBranch !== 'A' && !p.prefHasUserValue(layoutKey)) { defaultPrefs.setStringPref(layoutKey, 'A'); p.setStringPref(layoutKey, 'A'); p.clearUserPref(layoutKey); simulatedRetainedDefault = true; await h.sleep(250); }
  try {
  if (p.prefHasUserValue(layoutKey)) p.clearUserPref(layoutKey);
  await h.wait(() => frame()?.getAttribute('data-layout') === 'top' ? true : null, 5000);
  const missingDefault = { retainedDefault: defaultBranch, prefValue: p.getStringPref(layoutKey), prefHasUserValue: p.prefHasUserValue(layoutKey), actual: frame()?.getAttribute('data-layout') || null };
  if (missingDefault.actual !== 'top' || missingDefault.prefHasUserValue) throw new Error('missing layout user value did not select top: ' + JSON.stringify(missingDefault));
  const explicitA = await switchLayout('A');
  await closePlayer(); await waitPlayer();
  const reopenedA = { prefValue: p.getStringPref(layoutKey), prefHasUserValue: p.prefHasUserValue(layoutKey), actual: frame()?.getAttribute('data-layout') || null };
  if (reopenedA.prefValue !== 'A' || !reopenedA.prefHasUserValue || reopenedA.actual !== 'A') throw new Error('explicit A did not survive close/reopen: ' + JSON.stringify(reopenedA));
  await switchLayout('B');
  await setExpandedPref(false); await closePlayer(); await waitPlayer();
  const collapsed = child()?.document?.querySelector('.player');
  const collapsedRow = { expandedPref: p.getBoolPref(expandKey), aria: child()?.document?.querySelector('.options-toggle')?.getAttribute('aria-expanded'), class: collapsed?.className || null, frameHeight: rect(frame())?.height || null, voiceHidden: !!child()?.document?.querySelector('.voice-group')?.hidden };
  if (collapsedRow.aria !== 'false' || !collapsedRow.class.includes('collapsed') || Math.abs(collapsedRow.frameHeight - 108) > 1 || !collapsedRow.voiceHidden) throw new Error('collapsed opening mismatch: ' + JSON.stringify(collapsedRow));
  const option = child().document.querySelector('.options-toggle'); option.click(); await h.wait(() => child().document.querySelector('.options-toggle')?.getAttribute('aria-expanded') === 'true' ? true : null, 2000); await h.sleep(150);
  const expanded = { aria: child().document.querySelector('.options-toggle')?.getAttribute('aria-expanded'), frameHeight: rect(frame())?.height || null, voiceHidden: !!child().document.querySelector('.voice-group')?.hidden, skipCount: child().document.querySelectorAll('[data-navigate]').length, controls: child().document.querySelectorAll('.controls .adjust').length };
  if (expanded.aria !== 'true' || Math.abs(expanded.frameHeight - 202) > 1 || expanded.voiceHidden || expanded.skipCount !== 4 || expanded.controls < 3) throw new Error('expanded options mismatch: ' + JSON.stringify(expanded));
  const beforeLayoutExpanded = expanded.aria;
  await switchLayout('A'); await switchLayout('B');
  const afterLayoutExpanded = { aria: child().document.querySelector('.options-toggle')?.getAttribute('aria-expanded'), frameHeight: rect(frame())?.height || null };
  if (afterLayoutExpanded.aria !== beforeLayoutExpanded || Math.abs(afterLayoutExpanded.frameHeight - 202) > 1) throw new Error('layout switch lost session expansion: ' + JSON.stringify(afterLayoutExpanded));
  const readerWin = frame().contentWindow, tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  tip.beginInputTransactionForTests(readerWin); const shiftDown = tip.keydown(new readerWin.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, bubbles: true, cancelable: true })); const keyDown = tip.keydown(new readerWin.KeyboardEvent('', { key: 'o', code: 'KeyO', keyCode: 79, shiftKey: true, bubbles: true, cancelable: true })); const keyUp = tip.keyup(new readerWin.KeyboardEvent('', { key: 'o', code: 'KeyO', keyCode: 79, shiftKey: true, bubbles: true, cancelable: true })); const shiftUp = tip.keyup(new readerWin.KeyboardEvent('', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, bubbles: true, cancelable: true })); tip.endInputTransaction?.(); await h.sleep(300);
  const trustedOptions = { shiftDown, keyDown, keyUp, shiftUp, aria: child().document.querySelector('.options-toggle')?.getAttribute('aria-expanded'), frameHeight: rect(frame())?.height || null };
  if (trustedOptions.keyDown !== 1 || trustedOptions.aria !== 'false' || Math.abs(trustedOptions.frameHeight - 108) > 1) throw new Error('trusted Shift+O did not collapse floating options: ' + JSON.stringify(trustedOptions));
  await setExpandedPref(true); await closePlayer(); await waitPlayer(); const reopenedExpanded = { pref: p.getBoolPref(expandKey), aria: child().document.querySelector('.options-toggle')?.getAttribute('aria-expanded'), frameHeight: rect(frame())?.height || null };
  if (reopenedExpanded.aria !== 'true' || Math.abs(reopenedExpanded.frameHeight - 202) > 1) throw new Error('openExpanded=true did not initialize expanded opening: ' + JSON.stringify(reopenedExpanded));
  const c = child(), player = c.document.querySelector('.player'), opt = c.document.querySelector('.options-toggle'), layout = c.document.querySelector('.layout-menu');
  const nativePaths = { previousParagraph: 'M10 4.884 4.884 10 10 15.116 9.116 16l-6-6 6-6zm6 0L10.884 10 16 15.116l-.884.884-6-6 6-6z', previousSentence: 'M13 4.884 7.884 10 13 15.116l-.884.884-6-6 6-6z', nextSentence: 'm13.884 10-6 6L7 15.116 12.116 10 7 4.884 7.884 4z', nextParagraph: 'm10.884 10-6 6L4 15.116 9.116 10 4 4.884 4.884 4zm6 0-6 6-.884-.884L15.116 10 10 4.884 10.884 4z' };
  const iconPaths = {}; for (const action of Object.keys(nativePaths)) iconPaths[action] = c.document.querySelector('[data-navigate="' + action + '"] svg path')?.getAttribute('d') || null;
  const bUi = { player: rect(player), options: rect(opt), layout: rect(layout), optionsDisplay: c.getComputedStyle(opt).display, optionsTitle: opt?.title || null, optionsAria: opt?.getAttribute('aria-label') || null, layoutTitle: layout?.title || null, layoutAria: layout?.getAttribute('aria-label') || null, skipCount: c.document.querySelectorAll('[data-navigate]').length, skipPaths: iconPaths, rows: c.document.querySelectorAll('.voice-group .field').length };
  if (!bUi.player || !bUi.options || !bUi.layout || bUi.optionsDisplay === 'none' || bUi.options.left > bUi.layout.left || bUi.layout.right > bUi.player.right + 2 || bUi.optionsTitle !== 'Options' || bUi.optionsAria !== 'Options' || bUi.layoutTitle !== 'Layout' || bUi.layoutAria !== 'Layout' || bUi.skipCount !== 4 || Object.keys(nativePaths).some(k => iconPaths[k] !== nativePaths[k]) || bUi.rows !== 3) throw new Error('floating header/navigation geometry or native icon mismatch: ' + JSON.stringify(bUi));
  const bars = [];
  for (const layoutName of ['A', 'top']) { await switchLayout(layoutName); const bar = child(), playerNode = bar.document.querySelector('.player'), optionNode = bar.document.querySelector('.options-toggle'), identityNode = optionNode?.parentElement; bars.push({ layout: layoutName, player: rect(playerNode), optionsDisplay: bar.getComputedStyle(optionNode).display, identityDisplay: identityNode ? bar.getComputedStyle(identityNode).display : null, optionsRect: rect(optionNode), skipCount: bar.document.querySelectorAll('[data-navigate]').length, rows: bar.document.querySelectorAll('.voice-group .field').length }); if (bars[bars.length - 1].identityDisplay !== 'none' || bars[bars.length - 1].skipCount !== 0 || bars[bars.length - 1].rows !== 3) throw new Error('bar controls mismatch: ' + JSON.stringify(bars[bars.length - 1])); }
  await switchLayout('B');
  state.defaultsOptions = { missingDefault, simulatedRetainedDefault, explicitA, reopenedA, collapsed: collapsedRow, expanded, afterLayoutExpanded, trustedOptions, reopenedExpanded, bUi, bars };
  return JSON.stringify(state.defaultsOptions, null, 1);
  } finally {
    if (simulatedRetainedDefault) defaultPrefs.setStringPref(layoutKey, defaultBranch || 'top');
  }
})()
