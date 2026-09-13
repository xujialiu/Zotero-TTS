return (async () => {
  const root = 'C:\\Users\\xujia\\orca\\scratch\\zotero-tts-voice-handoff-2026-09-13\\official-followup\\';
  const state = Zotero.__zttsOfficialFollowup, base = state && state.baseline, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const out = { status: 'FAIL', errors: [], fixture: state && state.fixtureCleanup || null, restored: {}, final: {} };
  if (!base || !base.prefs) { out.errors.push('baseline missing'); return JSON.stringify(out, null, 1); }
  const prefix = 'extensions.zotero.zotero-tts.';
  const special = new Set(['readAloud.memory', 'reader.readAloudVoices', 'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings']);
  const restore = (name, entry) => {
    if (!entry) return;
    if (!entry.user) { if (Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name); return; }
    const value = entry.value;
    if (typeof value === 'boolean') Services.prefs.setBoolPref(name, value);
    else if (Number.isInteger(value)) Services.prefs.setIntPref(name, value);
    else if (typeof value === 'string') Services.prefs.setStringPref(name, value);
  };
  for (const [suffix, entry] of Object.entries(base.prefs)) if (!special.has(suffix)) restore(prefix + suffix, entry);
  restore('extensions.zotero.reader.readAloudVoices', base.prefs['reader.readAloudVoices']);
  restore(prefix + 'readAloud.memory', base.prefs['readAloud.memory']);
  await sleep(600);
  for (const suffix of ['webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings']) restore(prefix + suffix, base.prefs[suffix]);
  await sleep(600);
  if (!!Zotero.Debug.storing !== !!base.debugStoring) { try { Zotero.Debug.setStore(!!base.debugStoring); } catch (e) { out.errors.push('debug-store: ' + String(e)); } }
  try { if (base.main && base.main.selectedID) Zotero_Tabs.select(base.main.selectedID); } catch (e) { out.errors.push('tab: ' + String(e)); }
  const read = (suffix, secret) => {
    const name = suffix === 'reader.readAloudVoices' ? 'extensions.zotero.reader.readAloudVoices' : prefix + suffix;
    let value = null; try { value = Zotero.Prefs.get(name.replace(/^extensions\.zotero\./, '')); } catch (e) {}
    const entry = base.prefs[suffix];
    return secret ? { equalToBaseline: value === entry.value, chars: typeof value === 'string' ? value.length : null, user: Services.prefs.prefHasUserValue(name) } : { value, user: Services.prefs.prefHasUserValue(name) };
  };
  for (const [suffix] of Object.entries(base.prefs)) out.restored[suffix] = read(suffix, /apiKey|apiToken|headers|memory|presetValues|reader\.readAloudVoices/i.test(suffix));
  const readers = [], remaining = Zotero.Reader._readers || [];
  for (let i = 0; i < remaining.length; i++) {
    const reader = remaining[i], manager = reader && reader._internalReader && reader._internalReader._readAloudManager, controller = manager && manager._controller;
    let title = null; try { const item = Zotero.Items.get(reader.itemID), parent = item && item.parentItem || item; title = parent && parent.getField('title') || null; } catch (e) {}
    readers.push({ index: i, itemID: reader && reader.itemID || null, title, tabID: reader && reader.tabID || null, active: !!(manager && manager.active), paused: manager ? !!manager.paused : null, selected: manager && manager.selectedVoiceID || null, tier: manager && manager._selectedTier || null, position: controller && Number.isFinite(controller._position) ? controller._position : null, currentIndex: controller && Number.isFinite(controller._currentIndex) ? controller._currentIndex : null, audioState: controller && controller._audioContext && controller._audioContext.state || null });
  }
  let position = null; try { position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position()); } catch (e) { out.errors.push('position: ' + String(e)); }
  let debugText = ''; try { debugText = String(await Zotero.Debug.get()); } catch (e) { out.errors.push('debug-read: ' + String(e)); }
  const pluginLogLines = debugText.split(/\r?\n/).filter(line => /\[zotero-tts\]|zotero-tts\.js/i.test(line));
  const deadObjectLines = debugText.split(/\r?\n/).filter(line => /can't access dead object/i.test(line));
  const main = Zotero.getMainWindow && Zotero.getMainWindow(), restoredNativeStub = !!(base.nativeStub && base.nativeStub.proto && Object.prototype.hasOwnProperty.call(base.nativeStub.proto, '_getReadAloudRemoteInterface'));
  out.final = { readers, selectedTab: main && main.Zotero_Tabs && main.Zotero_Tabs.selectedID || null, selectedTabRestored: !!(main && main.Zotero_Tabs && main.Zotero_Tabs.selectedID === (base.main && base.main.selectedID)), nativeStubRestored: restoredNativeStub, settingsWindowOpen: !!Services.wm.getMostRecentWindow('zotero:pref'), debugStoring: !!Zotero.Debug.storing, position: { rows: position && position.database && position.database.rows || null, queued: position && position.store ? position.store.queued : null, lastError: position && position.store && position.store.lastError || null }, errorSummary: { debugLines: debugText ? debugText.split(/\r?\n/).length : 0, pluginLines: pluginLogLines.length, deadObjectLines: deadObjectLines.length } };
  const redactedPrefs = {};
  for (const [suffix, entry] of Object.entries(base.prefs)) { const secret = /apiKey|apiToken|headers|memory|presetValues|reader\.readAloudVoices/i.test(suffix); redactedPrefs[suffix] = secret ? { set: typeof entry.value === 'string' && entry.value.length > 0, chars: typeof entry.value === 'string' ? entry.value.length : null, user: entry.user } : { value: entry.value, user: entry.user }; }
  const results = (state.results || []).map(x => ({ status: x.status, tier: x.spec && x.spec.tier || null, source: x.source, expectedTarget: x.expectedTarget, actualTarget: x.actualTarget, segment: { index: x.segment && x.segment.index, chars: x.segment && x.segment.chars, oldDuration: x.segment && x.segment.oldDuration, speed: x.segment && x.segment.speed, oldTimings: x.segment && x.segment.oldTimings }, target: { duration: x.target && x.target.duration, timings: x.target && x.target.timings, controllerAtMs: x.target && x.target.controllerAtMs, readyAtMs: x.target && x.target.readyAtMs, requests: x.target && x.target.requests }, audioReady: x.audioReady, diagnostic: x.diagnostic, stopCalls: x.stopCalls, preparedPlays: x.preparedPlays, finalState: x.finalState, trace: x.trace, patchErrors: x.patchErrors }));
  const evidence = { build: { plugin: '1.12.6-beta', xpiSha256: 'DC53B8DBFEAB40E3D8DD218A5FDEEDB443E6D50B757CB6A07EB01DD70A7833F6', zotero: Zotero.version, platform: Services.appinfo.OS }, case: 'issue-95-official-standard-premium-followup', baseline: { readers: base.readers, main: base.main, nativeStub: !!base.nativeStub, debugStoring: base.debugStoring, prefs: redactedPrefs }, results, crossTier: state.crossTier || null, fixture: state.fixtureCleanup || null, restoration: { status: out.errors.length || !out.final.selectedTabRestored || !out.final.nativeStubRestored ? 'FAIL' : 'PASS', errors: out.errors, final: out.final, restored: out.restored } };
  const lines = [];
  lines.push('# Official Standard/Premium #95 handoff follow-up', '', `Build: Zotero-TTS ${evidence.build.plugin}; XPI SHA256 ${evidence.build.xpiSha256}; Zotero ${evidence.build.zotero} (${evidence.build.platform}).`, '', '| Case | Source -> target | Result | Ready/controller | Timing evidence |', '| --- | --- | --- | --- | --- |');
  for (const x of results) lines.push(`| ${x.tier || 'unknown'} same-tier shortcut | ${x.source && x.source.id || '?'} -> ${x.expectedTarget && x.expectedTarget.id || '?'} | ${x.status} | controller ${x.target && x.target.controllerAtMs} ms; ready ${x.target && x.target.readyAtMs} ms | old ${x.segment && x.segment.oldTimings}; new ${x.target && x.target.timings}; ${x.diagnostic && x.diagnostic.last && x.diagnostic.last.kind || 'none'} |`);
  const ct = state.crossTier, officialCt = ct && ct.officialOnly, localCt = ct && ct.withLocal; lines.push('', '| Cross-tier entrypoint | Observed | Result |', '| --- | --- | --- |');
  if (officialCt) lines.push(`| Standard/Premium live menus (official-only fixture) | standard ${officialCt.standard && officialCt.standard.menuCount}, premium ${officialCt.premium && officialCt.premium.menuCount}, foreign rows standard ${officialCt.standard && officialCt.standard.foreignTierRows}, premium ${officialCt.premium && officialCt.premium.foreignTierRows} | ${officialCt.status} |`, `| Manual Standard -> Premium | controller rebuilt ${officialCt.manualTransitions && officialCt.manualTransitions.standardToPremiumControllerRebuilt}; position ${officialCt.manualTransitions && officialCt.manualTransitions.positionBefore} -> ${officialCt.manualTransitions && officialCt.manualTransitions.positionAfterPremium} | manual native tier change, not #95 handoff |`);
  if (localCt) lines.push(`| Local/Standard/Premium menus (Kokoro enabled fixture) | local ${localCt.local && localCt.local.menuCount}, standard ${localCt.standard && localCt.standard.menuCount}, premium ${localCt.premium && localCt.premium.menuCount}; foreign rows ${localCt.local && localCt.local.foreignTierRows}/${localCt.standard && localCt.standard.foreignTierRows}/${localCt.premium && localCt.premium.foreignTierRows} | ${localCt.status} |`, `| Manual Premium -> Local -> Standard -> Premium | all controller rebuilds ${localCt.transitions && localCt.transitions.every(x => x.controllerRebuilt)}; positions retained ${localCt.transitions && localCt.transitions.map(x => x.positionBefore + '->' + x.positionAfter).join(', ')} | manual native tier changes, not #95 handoffs |`);
  lines.push('', `Fixture cleanup: reader closed=${evidence.fixture ? evidence.fixture.readerClosed : 'unknown'}, item erased=${evidence.fixture ? evidence.fixture.itemErased : 'unknown'}.`, `Restoration: ${evidence.restoration.status}; selected user tab restored=${out.final.selectedTabRestored}; position rows=${out.final.position.rows}; debug plugin lines=${out.final.errorSummary.pluginLines}; dead-object lines=${out.final.errorSummary.deadObjectLines}.`, '', 'Official Standard/Premium native tier operations are metered and were bounded to the two same-language voices per tier. AudioContext state is reported in evidence; auditory quality remains human-only.');
  try { await IOUtils.write(root + 'cleanup.json', new TextEncoder().encode(JSON.stringify(out, null, 2))); await IOUtils.write(root + 'evidence.json', new TextEncoder().encode(JSON.stringify(evidence, null, 2))); await IOUtils.write(root + 'report.md', new TextEncoder().encode(lines.join('\n'))); } catch (e) { out.errors.push('artifact-write: ' + String(e)); }
  try { delete Zotero.__zttsOfficialFollowup; } catch (e) { out.errors.push('delete-runtime: ' + String(e)); }
  out.status = out.errors.length || !out.final.selectedTabRestored || !out.final.nativeStubRestored ? 'FAIL' : 'PASS'; out.runtimeSnapshotPresent = !!Zotero.__zttsOfficialFollowup;
  return JSON.stringify(out, null, 1);
})()
