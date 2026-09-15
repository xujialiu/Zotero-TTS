// Item 6: a provider switched off between two opens, substituting System for
// Kokoro. Sets sameForAllDocuments false for this item only (restored to
// true at the end of this same script, not held to the final cleanup),
// closes the fixture's popup the rulebook's way
// (toggleReadAloudPopup(false), never a bare deactivate()), flips
// system.enabled off by a raw pref write (matching the case's own
// local.enabled precedent), reopens and pauses, checks the dropdown agrees,
// then switches System back on and reopens once more.
// params: none (reads state.fixture). state: none written for later scripts.
(async () => {
  const out = { step: 'provider-switch-between-opens' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SAME = 'extensions.zotero.zotero-tts.readAloud.sameForAllDocuments';
  const SYS = 'extensions.zotero.zotero-tts.system.enabled';

  async function reopenAndPause(ir, m) {
    await ir.toggleReadAloudPopup(true);
    const t0 = Date.now();
    let paused = false;
    while (Date.now() - t0 < 30000) {
      if (m.active && !m.paused) { try { m.pause(); } catch (e) { /* ignore */ } }
      if (m.active && m.paused) { paused = true; break; }
      await sleep(50);
    }
    return { active: m.active, paused, ms: Date.now() - t0 };
  }

  function readDropdownRows(win, doc) {
    const popup = doc.querySelector('.read-aloud-popup');
    if (!popup) return { error: 'no .read-aloud-popup' };
    const result = { expandedBefore: popup.classList.contains('expanded') };
    if (!result.expandedBefore) {
      const optionsButton = popup.querySelector('.row.buttons .group button.toolbar-button');
      if (optionsButton) optionsButton.click();
    }
    return { popup, result };
  }

  try {
    const fixture = S.fixture;
    if (!fixture) throw new Error('state.fixture is missing -- run 02-open-fixture-item1.js first');
    const rs = Zotero.Reader._readers || [];
    const r = rs.find((x) => x.itemID === fixture.itemID);
    if (!r) throw new Error('fixture reader not found for item ' + fixture.itemID);
    const ir = r._internalReader;
    const m = ir._readAloudManager;
    const win = r._iframeWindow;
    const doc = win && win.document;

    out.sameForAllDocumentsBefore = Services.prefs.getBoolPref(SAME, true);
    Services.prefs.setBoolPref(SAME, false);
    out.systemEnabledBefore = Services.prefs.getBoolPref(SYS, false);
    out.selectedTierBefore = m.selectedTier;

    await ir.toggleReadAloudPopup(false);
    out.closedActive = m.active;

    Services.prefs.setBoolPref(SYS, false);
    out.systemEnabledAfterOff = Services.prefs.getBoolPref(SYS, false);

    out.reopenWithoutSystem = await reopenAndPause(ir, m);
    await sleep(200);
    let pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    let mine = pt.readers.find((x) => x.title === fixture.title);
    out.diagnosticsWithoutSystem = mine || null;

    const dr = readDropdownRows(win, doc);
    if (dr.popup) {
      await sleep(200);
      const selects = dr.popup.querySelectorAll('.custom-select');
      out.dropdownWithoutSystem = selects.length
        ? Array.from(selects[0].querySelectorAll('.custom-select-trigger .label')).map((n) => n.textContent)[0] || null
        : null;
      const trigger = selects.length ? selects[0].querySelector('.custom-select-trigger') : null;
      if (trigger) {
        trigger.click();
        await sleep(200);
        const dropdown = selects[0].querySelector('.custom-select-dropdown');
        out.dropdownRowsWithoutSystem = dropdown
          ? Array.from(dropdown.querySelectorAll('.option')).map((el) => ({
              id: el.id,
              label: el.querySelector('.label') ? el.querySelector('.label').textContent : el.textContent,
              selected: el.classList.contains('selected'),
            }))
          : null;
        const overlay = selects[0].querySelector('.custom-select-overlay');
        if (overlay) overlay.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await sleep(150);
        if (selects[0].querySelector('.custom-select-dropdown')) trigger.click();
      }
    } else {
      out.dropdownWithoutSystemError = dr.error;
    }

    await ir.toggleReadAloudPopup(false);
    Services.prefs.setBoolPref(SYS, true);
    out.systemEnabledAfterOn = Services.prefs.getBoolPref(SYS, false);
    out.reopenWithSystem = await reopenAndPause(ir, m);
    // loadVoices() is fire-and-forget from _prepareReadAloud: active+paused
    // can settle from a cached tier (fish) before the freshly re-enabled
    // provider's catalog fetch resolves. Poll for 'system' to actually
    // land rather than reading once (2026-09-15: a single 200ms read
    // missed it -- retagged had no system key at all -- while it was
    // there half a second later).
    let sawSystem = false;
    const tPoll = Date.now();
    while (Date.now() - tPoll < 10000) {
      pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
      mine = pt.readers.find((x) => x.title === fixture.title);
      if (mine && mine.tiers.includes('system')) { sawSystem = true; break; }
      await sleep(250);
    }
    out.systemReappearedMs = sawSystem ? Date.now() - tPoll : null;
    out.diagnosticsWithSystem = mine || null;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  try {
    Services.prefs.setBoolPref(SAME, out.sameForAllDocumentsBefore !== undefined ? out.sameForAllDocumentsBefore : true);
    out.sameForAllDocumentsRestored = Services.prefs.getBoolPref(SAME, true);
  } catch (e) {
    out.restoreError = String(e);
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out);
})();
