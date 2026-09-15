// Item 2 (options populated once the Options panel renders) and item 3 (the
// dropdown's rows): reads the popup's `expanded` class first (never folds an
// already-open panel), opens it only if needed, reads providerTiers().options
// for the fixture reader, then opens the first `.custom-select` (the tier
// select -- always first in DOM order, before the language and voice
// selects) and reads its `.option` rows: id, label, selected. Closes with
// Escape, falling back to a second trigger click if Escape does not close it.
// params: none (reads state.fixture). state: reads fixture; writes nothing.
(async () => {
  const out = { step: 'dropdown-rows' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const fixture = S.fixture;
    if (!fixture) throw new Error('state.fixture is missing -- run 02-open-fixture-item1.js first');
    const rs = Zotero.Reader._readers || [];
    const r = rs.find((x) => x.itemID === fixture.itemID);
    if (!r) throw new Error('fixture reader not found for item ' + fixture.itemID);
    const win = r._iframeWindow;
    const doc = win && win.document;
    if (!doc) throw new Error('no _iframeWindow/document on the fixture reader');
    const popup = doc.querySelector('.read-aloud-popup');
    if (!popup) throw new Error('.read-aloud-popup not found -- was the popup opened?');

    out.expandedBefore = popup.classList.contains('expanded');
    if (!out.expandedBefore) {
      const optionsButton = popup.querySelector('.row.buttons .group button.toolbar-button');
      if (!optionsButton) throw new Error('the Options button was not found');
      optionsButton.click();
      const t0 = Date.now();
      while (!popup.classList.contains('expanded') && Date.now() - t0 < 3000) await sleep(50);
    }
    out.expandedAfter = popup.classList.contains('expanded');
    if (!out.expandedAfter) throw new Error('the Options panel never expanded');
    await sleep(150); // let the just-expanded TierSelect render through the wrapped createElement

    try {
      const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
      const mine = pt.readers.find((x) => x.title === fixture.title);
      out.optionsFromDiagnostics = mine ? mine.options : null;
      out.selectedTierFromDiagnostics = mine ? mine.selectedTier : null;
    } catch (e) { out.diagnosticsError = String(e); }

    const selects = popup.querySelectorAll('.custom-select');
    out.customSelectCount = selects.length;
    if (!selects.length) throw new Error('no .custom-select in the expanded popup');
    const tierSelect = selects[0];
    const trigger = tierSelect.querySelector('.custom-select-trigger');
    if (!trigger) throw new Error('the tier select has no trigger');
    out.triggerTextBeforeOpen = trigger.querySelector('.label') ? trigger.querySelector('.label').textContent : trigger.textContent;
    out.triggerAriaLabel = trigger.getAttribute('aria-label');

    trigger.click();
    const t1 = Date.now();
    let dropdown = null;
    while (Date.now() - t1 < 3000) {
      dropdown = tierSelect.querySelector('.custom-select-dropdown');
      if (dropdown) break;
      await sleep(50);
    }
    out.dropdownOpened = !!dropdown;
    if (!dropdown) throw new Error('the dropdown never opened');

    const rows = Array.from(dropdown.querySelectorAll('.option'));
    out.rows = rows.map((el) => ({
      id: el.id,
      label: el.querySelector('.label') ? el.querySelector('.label').textContent : el.textContent,
      selected: el.classList.contains('selected'),
      disabled: el.classList.contains('disabled'),
    }));

    const overlay = tierSelect.querySelector('.custom-select-overlay');
    if (overlay) overlay.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const t2 = Date.now();
    while (tierSelect.querySelector('.custom-select-dropdown') && Date.now() - t2 < 1500) await sleep(50);
    out.closedByEscape = !tierSelect.querySelector('.custom-select-dropdown');
    if (!out.closedByEscape) {
      trigger.click();
      const t3 = Date.now();
      while (tierSelect.querySelector('.custom-select-dropdown') && Date.now() - t3 < 1500) await sleep(50);
      out.closedByTriggerClickFallback = !tierSelect.querySelector('.custom-select-dropdown');
    }
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out);
})();
