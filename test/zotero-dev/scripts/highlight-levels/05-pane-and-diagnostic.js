// Item 1 (the Highlight section's structure and a fresh pane) and item 2
// (the highlightLevels() diagnostic shape, now with three real readers:
// fixture A paused-playing, the EPUB paused, fixture B truly idle).
return (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // A settings window from before this run's install keeps the old pane;
  // close it and open a fresh one on zotero-tts-pane (driving doc §1)
  let win = Services.wm.getMostRecentWindow('zotero:pref');
  if (win) {
    win.close();
    const until = Date.now() + 5000;
    while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() < until) await sleep(100);
  }
  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  await sleep(400);
  win = Services.wm.getMostRecentWindow('zotero:pref');
  await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  const until2 = Date.now() + 5000;
  while (!win.document.getElementById('ztts-openai-server') && Date.now() < until2) await sleep(150);
  const d = win.document;

  const ids = [
    'ztts-highlight-sentence', 'ztts-highlight-word',
    'ztts-highlight-sentenceColor', 'ztts-highlight-sentenceAlpha',
    'ztts-highlight-wordColor', 'ztts-highlight-wordAlpha',
    'ztts-help-highlight-switches',
    'ztts-highlight-preview', 'ztts-highlight-preview-word-before', 'ztts-highlight-preview-word', 'ztts-highlight-preview-word-after',
    'ztts-highlight-defaults',
  ];
  const els = {};
  for (const id of ids) {
    const el = d.getElementById(id);
    els[id] = el ? { tag: el.tagName, checked: el.checked ?? null, disabled: el.hasAttribute('disabled'), label: el.getAttribute('label'), value: el.value ?? null } : null;
  }
  const noSentenceUnderWordId = !d.querySelector('[id*="sentenceUnderWord"]');
  const noOldPreviewSentence = !d.getElementById('ztts-highlight-preview-sentence');

  // Order: Sentence row before Word row, both inside the Highlight groupbox,
  // right after the auto-scroll rows
  const highlightBox = d.getElementById('ztts-highlight-sentence')?.closest('groupbox');
  const rowOrder = highlightBox ? Array.from(highlightBox.querySelectorAll('checkbox')).map((c) => c.id) : [];

  const fullName = (rel) => 'extensions.zotero.' + rel;
  const prefSnap = (rel) => ({ value: Zotero.Prefs.get(rel), hasUserValue: Services.prefs.prefHasUserValue(fullName(rel)) });
  const prefs1 = {
    sentence: prefSnap('zotero-tts.highlight.sentence'),
    word: prefSnap('zotero-tts.highlight.word'),
    sentenceUnderWord: prefSnap('zotero-tts.highlight.sentenceUnderWord'),
  };

  // The help tip: hover per driving doc §4
  const icon = d.getElementById('ztts-help-highlight-switches');
  let tipReport = null;
  if (icon) {
    icon.scrollIntoView({ block: 'center' });
    const rect = icon.getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top + rect.height / 2);
    const wu = win.windowUtils;
    win.focus();
    for (const [dx, dy] of [[-30, -30], [-15, -15], [-3, -3], [0, 0]]) {
      wu.sendMouseEvent('mousemove', cx + dx, cy + dy, 0, 0, 0, false, 0, 0, false, false);
      await sleep(120);
    }
    await sleep(300);
    const tip = d.getElementById('ztts-help-tip');
    tipReport = { state: tip?.state ?? null, label: tip?.getAttribute('label') ?? null };
    // Leave the pointer on a blank spot, not (5,5) -- that is the nav list
    wu.sendMouseEvent('mousemove', 400, 500, 0, 0, 0, false, 0, 0, false, false);
    await sleep(150);
  }

  // Item 2: the diagnostic shape with three real readers open
  const levels = JSON.parse(Zotero.ZoteroTTS.diagnostics.highlightLevels());
  const zoteroPref = Zotero.Prefs.get('reader.readAloud.highlightGranularity');
  const startup = JSON.parse(Zotero.ZoteroTTS.diagnostics.startup());
  const stepIndex = startup.steps.findIndex((s) => s.name === 'highlight levels');
  const nextStep = startup.steps[stepIndex + 1]?.name ?? null;

  return JSON.stringify(
    {
      els,
      noSentenceUnderWordId,
      noOldPreviewSentence,
      rowOrder,
      prefs1,
      tipReport,
      levels,
      zoteroPref,
      startupStep: { name: startup.steps[stepIndex]?.name, ok: startup.steps[stepIndex]?.ok, nextStep },
    },
    null,
    1,
  );
})();
