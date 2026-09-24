// Issue #134, case section 5 item 1: no *Use plugin player* switch anywhere,
// diagnostics.pluginPlayer() has no `enabled` field, and a profile holding
// the retired pref `false` still gets the icon and the Player. This script
// only opens the pane, checks the DOM/diagnostics, and WRITES the pref
// false for 12's fresh fixture opens right after (and for 14's reinstall);
// it does not clear it -- 14 does, after the reinstall it also covers.
// params: none. state: writes usePluginPlayerBaseline for final restore.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const get = (suffix) => Zotero.Prefs.get('zotero-tts.' + suffix);
  const hasUser = (suffix) => Services.prefs.prefHasUserValue(prefix + suffix);
  const out = { step: 'item1-no-switch' };

  // Close any stale settings window (a reinstall/reload leaves the OLD pane behind), then reopen.
  let win = Services.wm.getMostRecentWindow('zotero:pref');
  if (win) { win.close(); for (let i = 0; i < 50 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await new Promise((r) => setTimeout(r, 100)); }
  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  for (let i = 0; i < 50; i++) { win = Services.wm.getMostRecentWindow('zotero:pref'); if (win) break; await new Promise((r) => setTimeout(r, 100)); }
  await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  for (let i = 0; i < 50; i++) { if (win.document.getElementById('ztts-provider-openai-official')) break; await new Promise((r) => setTimeout(r, 100)); }

  out.checkboxPresent = !!win.document.getElementById('ztts-player-enabled');
  out.groupboxLabelText = win.document.getElementById('ztts-player-settings')?.textContent?.trim()?.slice(0, 120) ?? null;
  // A broader sweep: no element anywhere in the pane mentions the retired id/checkbox.
  out.anyPlayerEnabledNode = !!win.document.querySelector('[id*="player-enabled" i], [id*="use-plugin-player" i]');

  const pp = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
  out.pluginPlayerHasEnabledKey = pp && Object.prototype.hasOwnProperty.call(pp, 'enabled');
  out.readersBeforeFixtures = (pp?.readers ?? []).map((r) => ({ hasEnabledKey: Object.prototype.hasOwnProperty.call(r, 'enabled'), open: r.open, failed: r.failed }));

  state.usePluginPlayerBaseline = { value: get('readAloud.usePluginPlayer'), user: hasUser('readAloud.usePluginPlayer') };
  Zotero.Prefs.set('zotero-tts.readAloud.usePluginPlayer', false);
  out.prefWrittenFalse = { value: get('readAloud.usePluginPlayer'), user: hasUser('readAloud.usePluginPlayer') };
  out.baselineForRestore = state.usePluginPlayerBaseline;

  // Left open on purpose: item 4's reinstall closes it (driving doc §1: a
  // reinstall keeps the OLD pane behind), items 6-8 reuse it.

  return JSON.stringify(out, null, 1);
})()
