// Item 2 (issue #113): opens the settings pane fresh (driving notes Sec1),
// reads every groupbox id in DOM order, confirms the legacy menulist/groupbox
// are gone, and reads the three new sections' headings, field ids,
// placeholders and buttons against preferences.xhtml. Leaves the pane open
// for 03-test-connections-item3.js to reuse.
// params: none. state: writes nothing (paneWindowOpened for the record).
(async () => {
  const out = { step: 'pane-structure-item2' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const open = () => Services.wm.getMostRecentWindow('zotero:pref');
    if (open()) {
      open().close();
      const t = Date.now();
      while (open() && Date.now() - t < 10000) await sleep(200);
    }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      win = open();
      if (win && win.Zotero_Preferences) break;
      await sleep(200);
    }
    if (!win || !win.Zotero_Preferences) throw new Error('the settings window never opened');
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const doc = win.document;
    const t1 = Date.now();
    while (Date.now() - t1 < 20000 && !doc.getElementById('ztts-provider-openai-official')) await sleep(200);
    if (!doc.getElementById('ztts-provider-openai-official')) throw new Error('the pane never loaded');

    const groupboxes = Array.from(doc.querySelectorAll('groupbox'));
    out.groupboxCount = groupboxes.length;
    out.groupboxIds = groupboxes.map((g) => g.id || null);

    out.legacyServerMenulist = !!doc.getElementById('ztts-openai-server');
    out.legacyOpenaiGroupbox = !!doc.getElementById('ztts-provider-openai');

    function fieldInfo(id) {
      const el = doc.getElementById(id);
      if (!el) return null;
      return {
        exists: true,
        tag: el.tagName,
        type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
        list: el.getAttribute('list'),
        preference: el.getAttribute('preference'),
      };
    }
    function h2Text(groupboxId) {
      const g = doc.getElementById(groupboxId);
      if (!g) return null;
      const h2 = g.querySelector('h2');
      return h2 ? h2.textContent.trim() : null;
    }
    function linkHref(groupboxId) {
      const g = doc.getElementById(groupboxId);
      const link = g ? g.querySelector('h2 [is="zotero-text-link"], h2 a') : null;
      return link ? link.getAttribute('href') : null;
    }

    out.openaiOfficial = {
      groupboxPresent: !!doc.getElementById('ztts-provider-openai-official'),
      h2: h2Text('ztts-provider-openai-official'),
      h2LinkHref: linkHref('ztts-provider-openai-official'),
      apiKey: fieldInfo(doc.querySelector('#ztts-provider-openai-official input[preference$=".apiKey"]')?.id || '__none__'),
      apiKeyPref: doc.querySelector('#ztts-provider-openai-official input[type="password"]')?.getAttribute('preference') || null,
      modelList: fieldInfo('ztts-openai-official-models') ? true : !!doc.getElementById('ztts-openai-official-models'),
      voicesPlaceholderMessageId: doc.querySelector('#ztts-provider-openai-official input[data-l10n-id="ztts-voices-input-builtin"]') ? 'ztts-voices-input-builtin' : null,
      enableButton: !!doc.getElementById('ztts-enable-openai-official'),
      testButton: !!doc.getElementById('ztts-test-openai-official'),
      testResult: !!doc.getElementById('ztts-test-result-openai-official'),
    };

    out.compatible = {
      groupboxPresent: !!doc.getElementById('ztts-provider-compatible'),
      h2: h2Text('ztts-provider-compatible'),
      addressPlaceholder: doc.querySelector('#ztts-provider-compatible input[preference$=".baseURL"]')?.getAttribute('placeholder') || null,
      addressHelp: !!doc.getElementById('ztts-provider-compatible')?.querySelector('[data-l10n-id="ztts-help-compatible"]'),
      modelListId: !!doc.getElementById('ztts-compatible-models'),
      voicesPlaceholderMessageId: doc.querySelector('#ztts-provider-compatible input[data-l10n-id="ztts-voices-input-server"]') ? 'ztts-voices-input-server' : null,
      extraHeadersType: doc.querySelector('#ztts-provider-compatible input[preference$=".headers"]')?.getAttribute('type') || null,
      extraHeadersPlaceholder: doc.querySelector('#ztts-provider-compatible input[preference$=".headers"]')?.getAttribute('placeholder') || null,
      extraHeadersHelp: !!doc.getElementById('ztts-provider-compatible')?.querySelector('[data-l10n-id="ztts-help-extra-headers"]'),
      enableButton: !!doc.getElementById('ztts-enable-compatible'),
      testButton: !!doc.getElementById('ztts-test-compatible'),
      testResult: !!doc.getElementById('ztts-test-result-compatible'),
    };

    out.mimo = {
      groupboxPresent: !!doc.getElementById('ztts-provider-mimo'),
      h2: h2Text('ztts-provider-mimo'),
      h2LinkHref: linkHref('ztts-provider-mimo'),
      apiKeyHelp: !!doc.getElementById('ztts-provider-mimo')?.querySelector('[data-l10n-id="ztts-help-mimo"]'),
      modelListId: !!doc.getElementById('ztts-mimo-models'),
      enableButton: !!doc.getElementById('ztts-enable-mimo'),
      testButton: !!doc.getElementById('ztts-test-mimo'),
      testResult: !!doc.getElementById('ztts-test-result-mimo'),
    };

    // Order check: index of each groupbox id among the full list.
    const idx = (id) => out.groupboxIds.indexOf(id);
    out.orderIndices = {
      azure: idx('ztts-provider-azure'),
      cloudflare: idx('ztts-provider-cloudflare'),
      fish: idx('ztts-provider-fish'),
      fishspeech: idx('ztts-provider-fishspeech'),
      local: idx('ztts-provider-local'),
      openaiOfficial: idx('ztts-provider-openai-official'),
      compatible: idx('ztts-provider-compatible'),
      speechify: idx('ztts-provider-speechify'),
      system: idx('ztts-provider-system'),
      mimo: idx('ztts-provider-mimo'),
      zoteroSection: idx('ztts-zotero-section'),
    };
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
