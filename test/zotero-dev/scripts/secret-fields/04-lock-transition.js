// secret-fields item 4: the static half is already covered by
// 01-secrets-static.js's cross-check against the live .enabled prefs (fish
// is on in this profile, and its eye.disabled reads true there -- "a
// provider that is on keeps its secrets covered"). This script is the
// dynamic half: reveal local.headers while the Local (Kokoro) provider is
// off, then commit it on, and confirm the field comes back covered with
// the eye greyed (issue #19's "enabled means hidden", now paint()'s job --
// ui/provider-rows.ts -- rather than a free ride from Gecko's own
// password-field reveal button).
//
// It tries the cheap route the brief offered first -- writing
// local.enabled straight to true/back to false with Services.prefs, no
// button pressed -- and reports whether that alone moved the field. Only
// if it did not does it fall back to a real Enable click: local has no
// probeSynthesis (src/ui/prefs-pane.ts runConnectionCheck) and its
// baseURL here is a real, already-reachable Kokoro server, so the check is
// a free voice-list request, not a spend, and diagnostics.readingImpact
// confirmed before this kit existed that toggling local.enabled affects
// zero open reading sessions in this profile.
//
// Requires the settings window already open on the plugin's pane.
// params: none. state: none read; writes nothing durable -- local.enabled
// and the field's reveal state are both restored to what they were before
// this script ran, in every branch.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  if (!win) throw new Error('settings window is not open -- run 01-secrets-static.js first');
  const doc = win.document;
  const p = Services.prefs;
  const prefKey = 'extensions.zotero.zotero-tts.local.enabled';
  const originalEnabled = p.getBoolPref(prefKey, false);
  if (originalEnabled) throw new Error('local provider is already enabled in this profile -- pick a different target provider');

  const input = Array.from(doc.querySelectorAll('input.ztts-secret')).find(
    (el) => el.getAttribute('preference') === 'extensions.zotero.zotero-tts.local.headers',
  );
  if (!input) throw new Error('local.headers field not found');
  const eye = input.nextElementSibling;
  if (!eye || eye.getAttribute('class') !== 'ztts-reveal') throw new Error('eye not found for local.headers');
  if (eye.disabled) throw new Error('local.headers is already locked -- local must be off for this script');

  const secretsRow = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.secrets()).fields.find((f) => f.pref === 'local.headers');
  const out = { target: 'local.headers', originalEnabled };

  eye.click();
  out.afterReveal = secretsRow();
  if (out.afterReveal.revealed !== true) throw new Error('field did not reveal before the transition test: ' + JSON.stringify(out.afterReveal));

  // (a) The cheap route: a raw pref write, no button pressed.
  p.setBoolPref(prefKey, true);
  await sleep(200);
  out.afterRawEnable = secretsRow();
  p.setBoolPref(prefKey, false);
  await sleep(200);
  out.afterRawDisable = secretsRow();
  out.rawWriteAloneRelockedIt = out.afterRawEnable.revealed === false && !!out.afterRawEnable.eye && out.afterRawEnable.eye.disabled === true;

  let usedRealClick = false;
  if (!out.rawWriteAloneRelockedIt) {
    usedRealClick = true;
    const toggle = doc.getElementById('ztts-enable-local');
    const result = doc.getElementById('ztts-test-result-local');
    if (!toggle) throw new Error('ztts-enable-local button not found');
    if (toggle.disabled) throw new Error('Enable button for local is disabled/busy before this script clicked it');

    const trace = [{ t: 0, disabled: toggle.disabled, label: toggle.getAttribute('label'), message: result ? result.textContent : null }];
    const t0 = Date.now();
    toggle.click();
    while (!toggle.disabled && Date.now() - t0 < 2000) {
      await sleep(50);
      trace.push({ t: Date.now() - t0, disabled: toggle.disabled, label: toggle.getAttribute('label'), message: result ? result.textContent : null });
    }
    while (toggle.disabled && Date.now() - t0 < 15000) {
      await sleep(100);
      trace.push({ t: Date.now() - t0, disabled: toggle.disabled, label: toggle.getAttribute('label'), message: result ? result.textContent : null });
    }
    trace.push({ t: Date.now() - t0, disabled: toggle.disabled, label: toggle.getAttribute('label'), message: result ? result.textContent : null });
    out.enableTrace = { first: trace[0], last: trace[trace.length - 1], count: trace.length, ms: trace[trace.length - 1].t };
    out.enabledAfterRealClick = p.getBoolPref(prefKey, false);
    out.afterRealClick = secretsRow();

    if (p.getBoolPref(prefKey, false)) {
      const dTrace = [{ t: 0, disabled: toggle.disabled }];
      const t1 = Date.now();
      toggle.click();
      while (p.getBoolPref(prefKey, false) && Date.now() - t1 < 5000) {
        await sleep(100);
        dTrace.push({ t: Date.now() - t1, disabled: toggle.disabled, label: toggle.getAttribute('label') });
      }
      out.disableTrace = { first: dTrace[0], last: dTrace[dTrace.length - 1], count: dTrace.length };
    } else {
      out.enableCheckFailed = true;
      out.enableCheckMessage = result ? result.textContent : null;
    }
  }
  out.usedRealClick = usedRealClick;

  out.finalEnabled = p.getBoolPref(prefKey, false);
  out.finalEnabledRestored = out.finalEnabled === originalEnabled;
  if (!out.finalEnabledRestored) p.setBoolPref(prefKey, originalEnabled);

  const finalRow = secretsRow();
  if (finalRow.revealed) eye.click();
  out.finalFieldState = secretsRow();

  return JSON.stringify(out, null, 1);
})();
