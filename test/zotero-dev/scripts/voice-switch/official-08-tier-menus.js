return (() => {
  const state = Zotero.__zttsOfficialFollowup, fixture = state && state.fixture, out = { status: 'FAIL', errors: [] };
  const reader = fixture && fixture.reader, manager = reader && reader._internalReader && reader._internalReader._readAloudManager;
  if (!state || !fixture || !manager) { out.status = 'NOT TESTABLE'; out.errors.push('fixture manager missing'); return JSON.stringify(out, null, 1); }
  const voiceRow = v => ({ id: String(v && v.id || ''), label: String(v && v.label || ''), language: String(v && v.language || ''), tier: String(v && v.tier || ''), credits: v && v.creditsPerMinute == null ? null : Number(v.creditsPerMinute) });
  const currentMenu = () => { const rows = [], source = manager.voicesForLanguage || []; for (let i = 0; i < source.length; i++) if (source[i] && source[i].id) rows.push(voiceRow(source[i])); return rows; };
  const allCounts = {}; const all = manager._allVoices || [];
  for (let i = 0; i < all.length; i++) { const tier = String(all[i] && all[i].tier || 'unknown'); allCounts[tier] = (allCounts[tier] || 0) + 1; }
  const collect = tier => {
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause-' + tier + ': ' + String(e)); }
    try { manager.selectTier(tier); } catch (e) { out.errors.push('select-' + tier + ': ' + String(e)); }
    try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause-after-' + tier + ': ' + String(e)); }
    const menu = currentMenu(), other = menu.filter(v => v.tier && v.tier !== tier);
    return { selectedTier: manager._selectedTier || null, selected: manager.selectedVoiceID || null, menuCount: menu.length, menuFirst: menu.slice(0, 4), menuLast: menu.slice(-2), menuTiers: [...new Set(menu.map(v => v.tier))], foreignTierRows: other.length, controllerPresent: !!manager._controller, paused: !!manager.paused };
  };
  const before = { tier: manager._selectedTier || null, selected: manager.selectedVoiceID || null, controller: manager._controller, position: manager._controller && manager._controller._position, paused: !!manager.paused };
  const standard = collect('standard');
  const afterStandard = { tier: manager._selectedTier || null, selected: manager.selectedVoiceID || null, controller: manager._controller, position: manager._controller && manager._controller._position, paused: !!manager.paused };
  const premium = collect('premium');
  const afterPremium = { tier: manager._selectedTier || null, selected: manager.selectedVoiceID || null, controller: manager._controller, position: manager._controller && manager._controller._position, paused: !!manager.paused };
  const manualTransitions = { standardToPremiumControllerRebuilt: !!(afterStandard.controller && afterPremium.controller && afterStandard.controller !== afterPremium.controller), beforeToStandardControllerRebuilt: !!(before.controller && afterStandard.controller && before.controller !== afterStandard.controller), positionBefore: before.position, positionAfterStandard: afterStandard.position, positionAfterPremium: afterPremium.position };
  const localAvailable = Number(allCounts.local || 0) > 0;
  state.crossTier = { status: out.errors.length ? 'PARTIAL' : (standard.menuCount > 0 && premium.menuCount > 0 ? 'PASS' : 'NOT TESTABLE'), allCounts, before: { tier: before.tier, selected: before.selected, position: before.position, paused: before.paused }, standard, premium, manualTransitions, localAvailable, shortcutEntry: 'The live voiceSwitcher candidate source is manager.voicesForLanguage; each captured menu contained only its selected Zotero tier.' };
  out.status = state.crossTier.status; out.allTierCounts = allCounts; out.before = state.crossTier.before; out.standard = standard; out.premium = premium; out.manualTransitions = manualTransitions; out.localAvailable = localAvailable; out.shortcutEntry = state.crossTier.shortcutEntry;
  return JSON.stringify(out, null, 1);
})()
