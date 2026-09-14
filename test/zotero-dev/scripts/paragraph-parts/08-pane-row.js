// Item 5: the row in Settings → Zotero-TTS. Opens the window, navigates to the
// pane, reads the row's position, label, binding and checked state, opens its ?
// with a mouseenter (help-tips.ts opens the tooltip on mouseenter, not click)
// and closes the window again. An open settings window keeps the OLD pane after
// a reinstall, so this always closes one it finds first.
// params: expectedLabel, expectedHelp (the en-US strings the .ftl carries).
(async () => {
  const out = { step: 'pane-row' };
  const P = Zotero.ZoteroTTSRun.params;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let win = null;
  try {
    const open = () => Services.wm.getMostRecentWindow('zotero:pref');
    out.hadOpenWindow = !!open();
    if (open()) {
      open().close();
      const t = Date.now();
      while (open() && Date.now() - t < 10000) await sleep(200);
    }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) { win = open(); if (win && win.Zotero_Preferences) break; await sleep(200); }
    if (!win || !win.Zotero_Preferences) throw new Error('the settings window never opened');
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const doc = win.document;
    const t1 = Date.now();
    while (Date.now() - t1 < 20000 && !doc.getElementById('ztts-openai-server')) await sleep(200);
    out.paneLoaded = !!doc.getElementById('ztts-openai-server');

    const PREF = 'extensions.zotero.zotero-tts.readAloud.joinSplitSentences';
    const cb = doc.querySelector('checkbox[preference="' + PREF + '"]');
    out.found = !!cb;
    if (!cb) throw new Error('no checkbox bound to ' + PREF + ' in the pane');
    out.l10nId = cb.getAttribute('data-l10n-id');
    out.label = cb.getAttribute('label');
    out.labelMatches = P.expectedLabel === undefined ? null : out.label === P.expectedLabel;
    out.prefAttr = cb.getAttribute('preference');
    out.checked = cb.checked;
    out.prefValue = Zotero.Prefs.get('zotero-tts.readAloud.joinSplitSentences');

    const row = cb.parentElement;
    const prev = row.previousElementSibling;
    const prevCb = prev ? prev.querySelector('checkbox') : null;
    out.previousRow = prevCb ? { l10nId: prevCb.getAttribute('data-l10n-id'), label: prevCb.getAttribute('label'), pref: prevCb.getAttribute('preference') } : (prev ? { tag: prev.tagName } : null);
    const next = row.nextElementSibling;
    const nextCb = next ? next.querySelector('checkbox') : null;
    out.nextRow = nextCb ? { l10nId: nextCb.getAttribute('data-l10n-id'), id: nextCb.id || null } : (next ? { tag: next.tagName } : null);

    let gb = row;
    while (gb && gb.tagName !== 'groupbox' && gb.parentElement) gb = gb.parentElement;
    out.group = gb && gb.tagName === 'groupbox' ? { id: gb.id || null, headingL10nId: gb.firstElementChild ? gb.firstElementChild.getAttribute('data-l10n-id') : null, headingText: gb.firstElementChild ? String(gb.firstElementChild.textContent || gb.firstElementChild.getAttribute('label') || '').trim().slice(0, 60) : null } : null;

    const help = row.querySelector('label.ztts-help');
    out.helpL10nId = help ? help.getAttribute('data-l10n-id') : null;
    out.helpIcon = help ? help.getAttribute('value') : null;
    out.helpText = help ? help.getAttribute('help') : null;
    out.helpMatches = P.expectedHelp === undefined ? null : out.helpText === P.expectedHelp;
    const tip = doc.getElementById('ztts-help-tip');
    out.tipExists = !!tip;
    if (help && tip) {
      const r = help.getBoundingClientRect();
      help.dispatchEvent(new win.MouseEvent('mouseenter', { bubbles: false, screenX: Math.round(win.screenX + r.left + 4), screenY: Math.round(win.screenY + r.top + 4) }));
      await sleep(400);
      out.tipLabel = tip.getAttribute('label');
      out.tipState = tip.state;
      out.tipLabelMatchesHelp = out.tipLabel === out.helpText;
      help.dispatchEvent(new win.MouseEvent('mouseleave', { bubbles: false }));
      await sleep(300);
      out.tipStateAfter = tip.state;
    }
  } catch (e) { out.error = String(e); out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 3).join(' | ') : null; }
  try {
    const w = Services.wm.getMostRecentWindow('zotero:pref');
    if (w) { w.close(); const t = Date.now(); while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t < 10000) await sleep(200); }
    out.windowClosed = !Services.wm.getMostRecentWindow('zotero:pref');
  } catch (e) { out.closeError = String(e); }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out);
})()
