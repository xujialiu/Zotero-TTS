// Item 1.11's read-only DOM checks, by a different code path than the
// diagnostic (defense in depth): the pane left open by
// 03-item-1-11-pane.js. Help icons' value/help, the favorites checkbox's
// bold run, the highlight preview's four spans, every provider/tier
// switch's Enable/Disable label, and the lines TypeScript writes (the
// voice browser's first column, its status line, the two About lines).
(async () => {
  const out = { check: '04-item-1.11-dom' };

  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) {
    out.error = 'no settings window open; run 03-item-1-11-pane.js first';
    return JSON.stringify(out);
  }
  const doc = win.document;
  const pane = doc.querySelector('.ztts-pane');
  if (!pane) {
    out.error = 'the zotero-tts pane is not the one showing';
    return JSON.stringify(out);
  }

  // The voice browser lists 2267 voices asynchronously; read the first
  // column only once the status line has left "Listing voices…" (driving
  // notes Sec1) -- 04's first run caught it mid-listing (firstColumn: []).
  {
    const until = Date.now() + 10000;
    while (Date.now() < until && (doc.getElementById('ztts-voices-status')?.textContent || '').includes('Listing voices')) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const helps = Array.from(pane.querySelectorAll('.ztts-help'));
  out.helpIconsTotal = helps.length;
  out.helpIconsBad = helps
    .map((el) => ({ id: el.getAttribute('data-l10n-id'), value: el.getAttribute('value'), help: el.getAttribute('help') }))
    .filter((r) => r.value !== '?' || !r.help);

  const bold = doc.querySelector('#ztts-favorites-only .checkbox-label b');
  out.favoritesBoldText = bold ? bold.textContent : null;
  const favoritesCheckbox = doc.getElementById('ztts-favorites-only');
  out.favoritesLabel = favoritesCheckbox ? favoritesCheckbox.getAttribute('label') : null;

  out.previewSentenceText = doc.getElementById('ztts-highlight-preview')?.textContent || null;
  out.previewWordBeforeText = doc.getElementById('ztts-highlight-preview-word-before')?.textContent || null;
  out.previewWordText = doc.getElementById('ztts-highlight-preview-word')?.textContent || null;
  out.previewWordAfterText = doc.getElementById('ztts-highlight-preview-word-after')?.textContent || null;

  const toggles = Array.from(pane.querySelectorAll('button[id^="ztts-enable-"]'));
  out.toggles = toggles.map((b) => ({ id: b.id, label: b.getAttribute('label') }));
  out.togglesBlankOrRaw = out.toggles.filter((t) => !t.label || t.label.startsWith('ztts-'));

  out.firstColumn = Array.from(doc.querySelectorAll('#ztts-voices-tiers > button')).map((b) => b.textContent);
  out.voicesStatus = doc.getElementById('ztts-voices-status')?.textContent || null;
  out.aboutBuild = doc.getElementById('ztts-about-build')?.textContent || null;
  out.aboutAuthor = doc.getElementById('ztts-about-author')?.textContent || null;

  return JSON.stringify(out);
})()
