// secret-fields item 1: opens the settings window fresh, navigates to the
// plugin's pane, and checks diagnostics.secrets() against every field's
// static expectation -- type "text" (never "password"), textSecurity
// "disc", revealed false, eye present with pressed "false", and
// eye.disabled matching the field's own provider's .enabled pref (webdav
// has no provider switch, so its eye is never disabled by this mechanism).
// Leaves the settings window OPEN for the scripts that follow.
// params: none. state: none written; standalone (registers its own field/
// provider mapping for the scripts after it via state.providerOf).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const open = () => Services.wm.getMostRecentWindow('zotero:pref');
  if (open()) {
    open().close();
    const t0 = Date.now();
    while (open() && Date.now() - t0 < 10000) await sleep(200);
  }
  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  let win = null;
  const t1 = Date.now();
  while (Date.now() - t1 < 20000) {
    win = open();
    if (win && win.document.getElementById('ztts-provider-openai-official')) break;
    await sleep(200);
  }
  if (!win) throw new Error('settings window never opened');
  await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  const doc = win.document;
  const t2 = Date.now();
  while (!doc.querySelector('.ztts-pane') && Date.now() - t2 < 8000) await sleep(150);

  const report = JSON.parse(Zotero.ZoteroTTS.diagnostics.secrets());
  const PROVIDER_OF = {
    'azure.apiKey': 'azure',
    'cloudflare.apiToken': 'cloudflare',
    'fish.apiKey': 'fish',
    'fishspeech.headers': 'fishspeech',
    'local.headers': 'local',
    'openai-official.apiKey': 'openai-official',
    'compatible.apiKey': 'compatible',
    'compatible.headers': 'compatible',
    'speechify.apiKey': 'speechify',
    'mimo.apiKey': 'mimo',
    'webdav.password': null,
  };
  const p = Services.prefs;
  const checks = report.fields.map((f) => {
    const providerId = PROVIDER_OF[f.pref];
    const providerOn = providerId ? p.getBoolPref('extensions.zotero.zotero-tts.' + providerId + '.enabled', false) : false;
    return {
      pref: f.pref,
      type: f.type,
      textSecurity: f.textSecurity,
      revealed: f.revealed,
      length: f.length,
      eyePresent: !!f.eye,
      eyePressed: f.eye ? f.eye.pressed : null,
      eyeDisabled: f.eye ? f.eye.disabled : null,
      providerId,
      providerOn,
      ok:
        f.type === 'text' &&
        f.textSecurity === 'disc' &&
        f.revealed === false &&
        !!f.eye &&
        f.eye.pressed === 'false' &&
        f.eye.disabled === providerOn,
    };
  });
  Zotero.ZoteroTTSRun.state.providerOf = PROVIDER_OF;
  return JSON.stringify(
    {
      pane: report.pane,
      fieldCount: report.fields.length,
      expectedPrefs: Object.keys(PROVIDER_OF),
      gotPrefs: report.fields.map((f) => f.pref),
      missingPrefs: Object.keys(PROVIDER_OF).filter((k) => !report.fields.some((f) => f.pref === k)),
      extraPrefs: report.fields.map((f) => f.pref).filter((k) => !(k in PROVIDER_OF)),
      checks,
      allOk: checks.every((c) => c.ok),
    },
    null,
    1,
  );
})();
