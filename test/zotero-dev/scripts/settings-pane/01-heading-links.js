// Issue #112 (the settings pane's Fish split, site links in every heading,
// alphabetical sections) -- not yet a numbered item of this case (settings-
// pane.md covers 1.2/1.4 only); this script is what the C1-C4 checks of the
// zotero-tiers/#111 verification brief actually ran. Opens the pane fresh,
// then:
//  C1 groupbox ids in DOM order (16 named + unnamed ones after);
//  C2 every heading with a site link: h2 textContent, the nested
//     label.zotero-text-link's href/tag/is, and confirms OpenAI/
//     System/Zotero (no link) carry none;
//  C3 for the Azure heading: computed font-size/font-weight of the link vs
//     the h2 itself, and the h2's own bounding rect (one line, no wrap);
//  C4 the two Fish sections' own fields and enabled-state locking.
// Two screenshots (top of the pane, and the Zotero section) are taken by
// the tester separately with zotero_screenshot, not from this script.
// params: none. state: none written; standalone.
(async () => {
  const out = { step: 'heading-links' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let win = null;
  try {
    const open = () => Services.wm.getMostRecentWindow('zotero:pref');
    if (open()) {
      open().close();
      const t = Date.now();
      while (open() && Date.now() - t < 10000) await sleep(200);
    }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      win = open();
      if (win && win.document.getElementById('ztts-openai-server')) break;
      await sleep(200);
    }
    if (!win) throw new Error('settings window never opened');
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const doc = win.document;
    const t1 = Date.now();
    while (!doc.getElementById('ztts-zotero-section') && Date.now() - t1 < 8000) await sleep(150);

    // --- C1: groupbox order. ---
    const root = doc.querySelector('.ztts-pane');
    const groupboxes = Array.from(root.querySelectorAll(':scope > groupbox'));
    out.groupboxCount = groupboxes.length;
    out.groupboxIds = groupboxes.map((g) => g.id || null);
    out.noFishAudioId = !doc.getElementById('ztts-provider-fish-audio');
    out.noSubheadingH3 = root.querySelectorAll('h3.ztts-subheading').length;

    // --- C2: headings with a site link, and the ones without. ---
    const HOSTS = {
      azure: 'portal.azure.com',
      cloudflare: 'dash.cloudflare.com',
      fish: 'fish.audio',
      fishspeech: 'github.com/fishaudio/fish-speech',
      local: 'github.com/remsky/Kokoro-FastAPI',
      speechify: 'platform.speechify.ai',
    };
    out.linkedHeadings = {};
    for (const [id, host] of Object.entries(HOSTS)) {
      const section = doc.getElementById(id === 'local' ? 'ztts-provider-local' : 'ztts-provider-' + id);
      const h2 = section ? section.querySelector('label > h2') : null;
      const link = h2 ? h2.querySelector('label.zotero-text-link') : null;
      out.linkedHeadings[id] = {
        present: !!section,
        h2Text: h2 ? h2.textContent : null,
        linkPresent: !!link,
        linkHref: link ? link.getAttribute('href') : null,
        linkIs: link ? link.getAttribute('is') : null,
        linkTag: link ? link.tagName : null,
        expectedHref: 'https://' + host,
        hrefMatches: link ? link.getAttribute('href') === 'https://' + host : null,
      };
    }
    out.localHeadingId = 'ztts-local-heading';
    out.localHeadingRenderedAtLoad = doc.getElementById('ztts-local-heading') ? doc.getElementById('ztts-local-heading').textContent : null;

    const NO_LINK = { openai: 'ztts-provider-openai', system: 'ztts-provider-system', zotero: 'ztts-zotero-section' };
    out.unlinkedHeadings = {};
    for (const [id, sectionId] of Object.entries(NO_LINK)) {
      const section = doc.getElementById(sectionId);
      const h2 = section ? section.querySelector('label > h2') : null;
      out.unlinkedHeadings[id] = { h2Text: h2 ? h2.textContent : null, hasLink: h2 ? !!h2.querySelector('label.zotero-text-link') : null };
    }

    // --- C3: the look, by mechanism, for the Azure heading. ---
    const azureH2 = doc.getElementById('ztts-provider-azure').querySelector('label > h2');
    const azureLink = azureH2.querySelector('label.zotero-text-link');
    const h2Style = win.getComputedStyle(azureH2);
    const linkStyle = win.getComputedStyle(azureLink);
    const rect = azureH2.getBoundingClientRect();
    out.azureLook = {
      h2FontSize: h2Style.fontSize,
      linkFontSize: linkStyle.fontSize,
      fontSizeMatches: h2Style.fontSize === linkStyle.fontSize,
      h2FontWeight: h2Style.fontWeight,
      linkFontWeight: linkStyle.fontWeight,
      fontWeightMatches: h2Style.fontWeight === linkStyle.fontWeight,
      h2RectHeight: rect.height,
      h2ScrollHeight: azureH2.scrollHeight,
      h2ClientHeight: azureH2.clientHeight,
      oneLine: azureH2.scrollHeight <= azureH2.clientHeight + 1,
    };

    // --- C4: the two Fish sections, their own fields, and locking. ---
    const FIELDS_SELECTOR = 'input, menulist, checkbox';
    const fishSection = doc.getElementById('ztts-provider-fish');
    const fishSpeechSection = doc.getElementById('ztts-provider-fishspeech');
    out.fishEnabledPref = Zotero.Prefs.get('zotero-tts.fish.enabled');
    out.fishSpeechEnabledPref = Zotero.Prefs.get('zotero-tts.fishspeech.enabled');
    out.fishElements = {
      apiKeyPresent: !!fishSection.querySelector('input[type="password"]'),
      freeOnlyPresent: !!fishSection.querySelector('checkbox[data-l10n-id="ztts-fish-free-only"]'),
      modelIdsPresent: !!doc.getElementById('ztts-fish-model-ids'),
      sourcesPresent: !!doc.getElementById('ztts-fish-sources'),
      includeOfficialPresent: !!doc.getElementById('ztts-fish-include-official'),
      includeOwnPresent: !!doc.getElementById('ztts-fish-include-own'),
      includeManualPresent: !!doc.getElementById('ztts-fish-include-manual'),
      enablePresent: !!doc.getElementById('ztts-enable-fish'),
      testPresent: !!doc.getElementById('ztts-test-fish'),
      resultPresent: !!doc.getElementById('ztts-test-result-fish'),
      fieldsCount: fishSection.querySelectorAll(FIELDS_SELECTOR).length,
      fieldsDisabled: Array.from(fishSection.querySelectorAll(FIELDS_SELECTOR)).map((f) => f.disabled),
      allFieldsDisabled: Array.from(fishSection.querySelectorAll(FIELDS_SELECTOR)).every((f) => f.disabled === true),
    };
    out.fishSpeechElements = {
      addressPresent: !!fishSpeechSection.querySelector('input[type="text"]'),
      headersPresent: !!fishSpeechSection.querySelector('input[type="password"]'),
      enablePresent: !!doc.getElementById('ztts-enable-fishspeech'),
      testPresent: !!doc.getElementById('ztts-test-fishspeech'),
      resultPresent: !!doc.getElementById('ztts-test-result-fishspeech'),
      fieldsCount: fishSpeechSection.querySelectorAll(FIELDS_SELECTOR).length,
      fieldsDisabled: Array.from(fishSpeechSection.querySelectorAll(FIELDS_SELECTOR)).map((f) => f.disabled),
      allFieldsEnabled: Array.from(fishSpeechSection.querySelectorAll(FIELDS_SELECTOR)).every((f) => f.disabled === false),
    };
    out.matchesFishEnabledExpectation = out.fishEnabledPref === true && out.fishElements.allFieldsDisabled === true;
    out.matchesFishSpeechDisabledExpectation = out.fishSpeechEnabledPref === false && out.fishSpeechElements.allFieldsEnabled === true;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  // Leaves the settings window OPEN for the tester's own screenshots.
  return JSON.stringify(out, null, 1);
})();
