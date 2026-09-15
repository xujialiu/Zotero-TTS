// Item 1 (issue #111) and the section-order half of issue #112 (C1 of the
// verification brief, reused by cases/settings-pane.md's own kit as
// 01-heading-links.js): opens the settings window fresh, navigates to the
// plugin's pane (driving notes Sec1), and reads every groupbox's id in DOM
// order plus the Zotero section's own structure -- the h2 text, the note
// description + its ?, and the two hboxes (label/toggle/test/result) for
// zotero-standard and zotero-premium, with the toggle's painted label and
// the fields query (should find none: no inputs in these rows).
// Leaves the settings window OPEN for the scripts that follow (02+); only
// the kit's very last script (09) closes it.
// params: none. state: writes paneWin (nothing serializable -- later
// scripts re-fetch it) is not needed since Services.wm always finds it;
// nothing written to state.
(async () => {
  const out = { step: 'pane-structure' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    // Close a stale settings window first (driving notes Sec1): an
    // in-place install earlier in this run (before this script) means any
    // window opened before it would show the OLD pane.
    const stale = Services.wm.getMostRecentWindow('zotero:pref');
    if (stale) {
      stale.close();
      const t0 = Date.now();
      while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t0 < 10000) await sleep(200);
      out.staleClosed = !Services.wm.getMostRecentWindow('zotero:pref');
    } else {
      out.staleClosed = null;
    }

    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 15000) {
      win = Services.wm.getMostRecentWindow('zotero:pref');
      if (win && win.document.getElementById('ztts-provider-openai-official')) break;
      await sleep(200);
    }
    if (!win || !win.document.getElementById('ztts-provider-openai-official')) throw new Error('settings window/pane never appeared');
    out.openedMs = Date.now() - t1;

    // navigateToPane regardless of which pane just opened (driving notes).
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const doc = win.document;
    const t2 = Date.now();
    while (!doc.getElementById('ztts-zotero-section') && Date.now() - t2 < 8000) await sleep(150);
    out.zoteroSectionPresentMs = Date.now() - t2;

    const root = doc.querySelector('.ztts-pane');
    if (!root) throw new Error('.ztts-pane root not found');
    const groupboxes = Array.from(root.querySelectorAll(':scope > groupbox'));
    out.groupboxCount = groupboxes.length;
    out.groupboxIds = groupboxes.map((g) => g.id || null);
    out.noFishAudioId = !doc.getElementById('ztts-provider-fish-audio');
    out.noSubheadingH3 = root.querySelectorAll('h3.ztts-subheading').length;

    // The Zotero section's own structure (item 1).
    const section = doc.getElementById('ztts-zotero-section');
    const h2 = section ? section.querySelector('label > h2') : null;
    out.zoteroH2Text = h2 ? h2.textContent : null;
    out.zoteroH2HasLink = h2 ? !!h2.querySelector('label[is="zotero-text-link"]') : null;
    const note = section ? section.querySelector('description[data-l10n-id="ztts-zotero-note"]') : null;
    out.zoteroNotePresent = !!note;
    // The ? icon carries data-l10n-id="ztts-help-zotero" (the Fluent
    // message id), not id="ztts-help-zotero" -- getElementById would never
    // find it (found the hard way on this run's first pass).
    out.zoteroHelpPresent = !!(section && section.querySelector('label.ztts-help[data-l10n-id="ztts-help-zotero"]'));

    const rowInfo = (tierId) => {
      const row = doc.getElementById('ztts-provider-zotero-' + tierId);
      if (!row) return null;
      const label = row.querySelector('label.ztts-field-label');
      const toggle = doc.getElementById('ztts-enable-zotero-' + tierId);
      const test = doc.getElementById('ztts-test-zotero-' + tierId);
      const result = doc.getElementById('ztts-test-result-zotero-' + tierId);
      return {
        present: true,
        labelText: label ? label.textContent : null,
        toggleLabel: toggle ? toggle.getAttribute('label') : null,
        toggleDisabled: toggle ? !!toggle.disabled : null,
        testPresent: !!test,
        // XUL buttons render their `label` ATTRIBUTE, not textContent
        // (confirmed live: textContent was "" while label was "Test
        // connection" -- found the hard way on this run's first pass).
        testLabel: test ? test.getAttribute('label') : null,
        resultText: result ? result.textContent : null,
        fieldsFound: row.querySelectorAll('input, menulist, checkbox').length,
      };
    };
    out.standardRow = rowInfo('standard');
    out.premiumRow = rowInfo('premium');
    out.standardEnabledPref = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    out.premiumEnabledPref = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');

    out.windowOuterID = win.docShell && win.docShell.outerWindowID !== undefined ? win.docShell.outerWindowID : null;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
