return (() => {
  const state = Zotero.__zttsOfficialFollowup, fixture = state && state.fixture, out = { status: 'FAIL', errors: [] };
  const reader = fixture && fixture.reader, manager = reader && reader._internalReader && reader._internalReader._readAloudManager;
  if (!state || !fixture || !manager) { out.status = 'NOT TESTABLE'; out.errors.push('fixture manager missing'); return JSON.stringify(out, null, 1); }
  const voiceRow = v => ({ id: String(v && v.id || ''), label: String(v && v.label || ''), language: String(v && v.language || ''), tier: String(v && v.tier || ''), credits: v && v.creditsPerMinute == null ? null : Number(v.creditsPerMinute) });
  const menu = () => { const rows = [], source = manager.voicesForLanguage || []; for (let i = 0; i < source.length; i++) if (source[i] && source[i].id) rows.push(voiceRow(source[i])); return rows; };
  const allCounts = {}; const all = manager._allVoices || [];
  for (let i = 0; i < all.length; i++) { const tier = String(all[i] && all[i].tier || 'unknown'); allCounts[tier] = (allCounts[tier] || 0) + 1; }
  const transitions = [], collect = tier => {
    const before = { tier: manager._selectedTier || null, selected: manager.selectedVoiceID || null, controller: manager._controller, position: manager._controller && manager._controller._position };
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause-' + tier + ': ' + String(e)); }
    try { manager.selectTier(tier); } catch (e) { out.errors.push('select-' + tier + ': ' + String(e)); }
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause-after-' + tier + ': ' + String(e)); }
    const rows = menu(), foreign = rows.filter(v => v.tier && v.tier !== tier), after = { tier: manager._selectedTier || null, selected: manager.selectedVoiceID || null, controller: manager._controller, position: manager._controller && manager._controller._position };
    transitions.push({ from: before.tier, to: after.tier, fromSelected: before.selected, toSelected: after.selected, controllerRebuilt: !!(before.controller && after.controller && before.controller !== after.controller), positionBefore: before.position, positionAfter: after.position });
    return { selectedTier: after.tier, selected: after.selected, menuCount: rows.length, menuFirst: rows.slice(0, 4), menuLast: rows.slice(-2), menuTiers: [...new Set(rows.map(v => v.tier))], foreignTierRows: foreign.length, controllerPresent: !!manager._controller, paused: !!manager.paused };
  };
  const local = collect('local'), standard = collect('standard'), premium = collect('premium'), localRows = local.menuFirst.concat(local.menuLast), localVoice = localRows.find(v => v.id.indexOf('local::') === 0) || null;
  const localState = { status: out.errors.length ? 'PARTIAL' : (local.menuCount > 0 && standard.menuCount > 0 && premium.menuCount > 0 ? 'PASS' : 'NOT TESTABLE'), allCounts, local, standard, premium, transitions, localVoice, shortcutEntry: 'The live voiceSwitcher candidate source is manager.voicesForLanguage; each captured tier menu was filtered to its current tier.' };
  state.crossTier = { officialOnly: state.crossTier || null, withLocal: localState };
  out.status = localState.status; out.allTierCounts = allCounts; out.local = local; out.standard = standard; out.premium = premium; out.transitions = transitions; out.localVoice = localVoice; out.shortcutEntry = localState.shortcutEntry;
  return JSON.stringify(out, null, 1);
})()
