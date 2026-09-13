return (async () => {
  const state = Zotero.__zttsOfficialFollowup, fixture = state && state.fixture, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const out = { status: 'FAIL', errors: [], tier: 'premium' };
  const reader = fixture && fixture.reader, manager = reader && reader._internalReader && reader._internalReader._readAloudManager;
  if (!state || !fixture || !manager) { out.status = 'NOT TESTABLE'; out.errors.push('fixture manager missing'); return JSON.stringify(out, null, 1); }
  try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause-before-tier: ' + String(e)); }
  try { manager.selectTier('premium'); } catch (e) { out.errors.push('select-tier: ' + String(e)); }
  await sleep(150);
  const rows = [], source = manager.voicesForLanguage || [];
  for (let i = 0; i < source.length; i++) { const v = source[i]; if (v && v.id) rows.push({ id: String(v.id), label: String(v.label || ''), language: String(v.language || ''), tier: String(v.tier || ''), credits: v.creditsPerMinute == null ? null : Number(v.creditsPerMinute) }); }
  if (rows.length < 2) { out.status = 'NOT TESTABLE'; out.errors.push('premium current-language pool has fewer than two voices'); out.pool = rows; return JSON.stringify(out, null, 1); }
  const sourceVoice = rows[0], targetVoice = rows[1];
  try { manager.selectVoice(sourceVoice.id); } catch (e) { out.errors.push('select-source: ' + String(e)); }
  let segmentIndex = 0, maxChars = -1;
  const segments = manager._segments || [];
  for (let i = 0; i < segments.length; i++) { const chars = String(segments[i] && segments[i].text || '').length; if (chars > maxChars) { maxChars = chars; segmentIndex = i; } }
  try { manager.repositionTo(segmentIndex); } catch (e) { out.errors.push('reposition: ' + String(e)); }
  try { if (manager.active && !manager.paused) manager.pause(); } catch (e) { out.errors.push('pause-after-select: ' + String(e)); }
  await sleep(100);
  state.spec = { tier: 'premium', direction: 1, source: sourceVoice, target: targetVoice, pool: rows.slice(0, 12), segmentIndex, segmentText: String(segments[segmentIndex] && segments[segmentIndex].text || '') };
  out.status = !out.errors.length && manager._selectedTier === 'premium' && manager.selectedVoiceID === sourceVoice.id ? 'PASS' : 'FAIL';
  out.selected = manager.selectedVoiceID || null; out.selectedTier = manager._selectedTier || null; out.poolCount = rows.length; out.source = sourceVoice; out.target = targetVoice; out.segment = { index: segmentIndex, chars: state.spec.segmentText.length, text: state.spec.segmentText };
  return JSON.stringify(out, null, 1);
})()
