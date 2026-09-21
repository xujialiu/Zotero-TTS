// Item 10 (issue #130): "Signed out, Enable is greyed." Opens the settings
// window fresh (driving notes Sec1) and navigates to the plugin's pane;
// self-heals both Zotero switches to ON first if either started off (this
// mini-run's own precondition, since it does not run the full kit's 00/01
// first). Disables Standard the item-3 way (a real click) -- the reading
// guard's affectedTabs() only refuses a change whose key prefix matches an
// ACTIVE session's own voice/provider (settings-impact.ts), so the owner's
// own open session elsewhere (checked live: tier "fish", not
// "zotero-standard"/"zotero-premium") is not affected; a #ztts-notice
// dialog appearing would mean that assumption was wrong, so this checks
// for one and reports it rather than assuming success. Then, in chrome
// scope, keeps Zotero.Sync.Data.Local.hasCredentials' own descriptor
// (asserts it is a plain function-valued data property first) and
// replaces the function with one returning false -- what
// Zotero.Sync.Runner.enabled reads (xpcom/sync/syncRunner.js: `_apiKey ||
// Zotero.Sync.Data.Local.hasCredentials()`) -- then fires the api-key
// notification Zotero sends once a login is saved or removed, awaited
// (Notifier.trigger is async). Reads both rows (disabled/label/result
// line), diagnostics.zoteroTiers(), and providerTiers() across EVERY open
// reader (whatever the owner has open, not just this pane) for "signedIn:
// false everywhere". Finally dispatches a raw 'command' event straight at
// the greyed Standard button (bypassing the disabled attribute a real
// click/keypress would respect) to prove onToggle's OWN blocked(id) guard
// refuses the action too, not only the UI.
// Leaves the settings window OPEN, hasCredentials REPLACED and the
// notification's effect in place for 11 to undo; Standard stays OFF
// (disabled) for 11's own Enable step.
// params: none. state: writes credentialsDescriptor (restored by 11),
// standardWasOffAtStart (diagnostic only).
(async () => {
  const out = { step: 'signed-out-greyed' };
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function rowState(doc, tier) {
    const btn = doc.getElementById('ztts-enable-zotero-' + tier);
    const test = doc.getElementById('ztts-test-zotero-' + tier);
    const result = doc.getElementById('ztts-test-result-zotero-' + tier);
    return { disabled: !!btn.disabled, label: btn.getAttribute('label'), testDisabled: !!test.disabled, resultText: result ? result.textContent : null };
  }
  async function clickAndWaitForPref(doc, tier, desired) {
    const toggle = doc.getElementById('ztts-enable-zotero-' + tier);
    toggle.click();
    const trace = [];
    const t0 = Date.now();
    let sawChecking = false;
    while (Date.now() - t0 < 20000) {
      const entry = { t: Date.now() - t0, label: toggle.getAttribute('label'), pref: Zotero.Prefs.get('zotero-tts.zotero-' + tier + '.enabled') };
      trace.push(entry);
      if (/checking/i.test(entry.label || '')) sawChecking = true;
      if (entry.pref === desired) break;
      if (sawChecking && entry.label && !/checking/i.test(entry.label)) break;
      await sleep(100);
    }
    return { trace, sawChecking, final: { label: toggle.getAttribute('label'), pref: Zotero.Prefs.get('zotero-tts.zotero-' + tier + '.enabled') } };
  }

  try {
    // --- Open the settings pane fresh. ---
    const stale = Services.wm.getMostRecentWindow('zotero:pref');
    if (stale) {
      stale.close();
      const t0 = Date.now();
      while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t0 < 10000) await sleep(200);
    }
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    let win = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 15000) {
      win = Services.wm.getMostRecentWindow('zotero:pref');
      if (win && win.document.getElementById('ztts-provider-openai-official')) break;
      await sleep(200);
    }
    if (!win) throw new Error('settings window never appeared');
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const doc = win.document;
    const t2 = Date.now();
    while (Date.now() - t2 < 10000 && !doc.getElementById('ztts-enable-zotero-standard')) await sleep(200);
    if (!doc.getElementById('ztts-enable-zotero-standard')) throw new Error('Zotero section never rendered');
    out.settingsWindowFound = true;

    // --- Self-heal: both switches ON at the start. ---
    out.standardPrefAtStart = Zotero.Prefs.get('zotero-tts.zotero-standard.enabled');
    out.premiumPrefAtStart = Zotero.Prefs.get('zotero-tts.zotero-premium.enabled');
    if (out.standardPrefAtStart !== true) {
      out.standardSelfHeal = await clickAndWaitForPref(doc, 'standard', true);
    }
    if (out.premiumPrefAtStart !== true) {
      out.premiumSelfHeal = await clickAndWaitForPref(doc, 'premium', true);
    }

    // --- Sanity: the owner's own open sessions do not use a Zotero tier (so the guard will not refuse). ---
    out.ownerSessionsTiers = (Zotero.Reader._readers || []).map((r) => {
      const m = r._internalReader && r._internalReader._readAloudManager;
      let tier = m && m._voice ? m._voice.tier : null;
      return { itemID: r.itemID, tier, active: !!(m && m.active) };
    });

    out.beforeDisable = { standard: rowState(doc, 'standard'), premium: rowState(doc, 'premium') };

    // --- Disable Standard, item 3's way. ---
    const disableResult = await clickAndWaitForPref(doc, 'standard', false);
    out.disableResult = disableResult;
    const noticeAfterDisable = doc.getElementById('ztts-notice');
    out.noticeDialogAppeared = !!noticeAfterDisable;
    if (disableResult.final.pref !== false) throw new Error('Standard did not go off -- the owner\'s session may have been affected; see ownerSessionsTiers/noticeDialogAppeared');

    out.afterDisable = { standard: rowState(doc, 'standard'), premium: rowState(doc, 'premium') };

    // --- Shadow hasCredentials, keep the original descriptor. ---
    const desc = Object.getOwnPropertyDescriptor(Zotero.Sync.Data.Local, 'hasCredentials');
    if (!desc || typeof desc.value !== 'function') throw new Error('Zotero.Sync.Data.Local.hasCredentials is not a plain function property: ' + JSON.stringify(desc));
    S.credentialsDescriptor = desc;
    out.credentialsDescriptorKept = { writable: desc.writable, enumerable: desc.enumerable, configurable: desc.configurable };
    Zotero.Sync.Data.Local.hasCredentials = () => false;
    out.syncRunnerEnabledAfterShadow = !!Zotero.Sync.Runner.enabled;

    await Zotero.Notifier.trigger('modify', 'api-key', []);
    // Settle: paint() is synchronous once notify() runs, but poll briefly in case of a microtask hop.
    const t3 = Date.now();
    while (Date.now() - t3 < 2000) {
      if (doc.getElementById('ztts-enable-zotero-standard').disabled === true) break;
      await sleep(50);
    }

    out.standardAfterSignOut = rowState(doc, 'standard');
    out.premiumAfterSignOut = rowState(doc, 'premium');

    const zt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.zoteroTiers());
    out.zoteroTiersSignedInFalse = zt.signedIn === false;
    out.checksBothFalseWithReason = zt.checks['zotero-standard'].ok === false && zt.checks['zotero-premium'].ok === false
      && zt.checks['zotero-standard'].message === out.standardAfterSignOut.resultText
      && zt.checks['zotero-premium'].message === out.premiumAfterSignOut.resultText;
    out.zoteroTiersChecks = zt.checks;

    const pt = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
    out.providerTiersSignedInEverywhere = pt.readers.map((r) => ({ title: r.title, signedIn: r.signedIn }));
    out.allReadersSignedInFalse = pt.readers.every((r) => r.signedIn === false);

    // --- A raw 'command' event at the greyed button: onToggle's own guard, not just the DOM disabled attribute. ---
    const standardBtn = doc.getElementById('ztts-enable-zotero-standard');
    const before = { pref: Zotero.Prefs.get('zotero-tts.zotero-standard.enabled'), label: standardBtn.getAttribute('label') };
    standardBtn.dispatchEvent(new win.Event('command', { bubbles: true, cancelable: true }));
    let sawCheckingOnCommand = false;
    const t4 = Date.now();
    while (Date.now() - t4 < 1500) {
      if (/checking/i.test(standardBtn.getAttribute('label') || '')) sawCheckingOnCommand = true;
      await sleep(100);
    }
    const after = { pref: Zotero.Prefs.get('zotero-tts.zotero-standard.enabled'), label: standardBtn.getAttribute('label') };
    out.commandEventOnGreyedButton = { before, after, sawCheckingOnCommand };
    out.commandEventWasNoOp = !sawCheckingOnCommand && after.pref === before.pref && after.pref === false;
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
