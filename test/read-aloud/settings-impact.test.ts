import { describe, expect, it } from 'vitest';
import { affectedReading, createReadingImpact } from '../../src/read-aloud/settings-impact';
import { DEFAULTS } from '../../src/core/settings';
import { flattenSettings } from '../../src/core/settings-backup';

describe('settings changes during reading', () => {
  it('allows another provider to change but protects the provider used by a paused background tab', () => {
    const current = { 'azure.enabled': true, 'local.enabled': true };
    const sessions = [{ title: 'Background paper', voices: [{ id: 'azure::ava', provider: 'azure' }] }];
    expect(affectedReading(current, { 'local.enabled': false }, sessions)).toEqual([]);
    expect(affectedReading(current, { 'azure.enabled': false }, sessions)).toEqual(['Background paper']);
    expect(affectedReading(current, { 'azure.enabled': true }, sessions)).toEqual([]);
  });
  it('checks the complete favorites proposal against every playing and prepared voice', () => {
    const current = { 'readAloud.favoritesOnly': false, 'readAloud.favoriteVoices': '["azure::ava"]' };
    const sessions = [{ title: 'Paper', voices: [{ id: 'azure::ava', provider: 'azure' }, { id: 'local::bella', provider: 'local' }] }];
    expect(affectedReading(current, { 'readAloud.favoritesOnly': true }, sessions)).toEqual(['Paper']);
    expect(affectedReading(current, { 'readAloud.favoritesOnly': true, 'readAloud.favoriteVoices': '["azure::ava","local::bella"]' }, sessions)).toEqual([]);
    const filtered = { ...current, 'readAloud.favoritesOnly': true };
    expect(affectedReading(filtered, { 'readAloud.favoriteVoices': '[]' }, sessions)).toEqual(['Paper']);
    expect(affectedReading(filtered, { 'readAloud.favoritesOnly': false }, sessions)).toEqual([]);
    expect(affectedReading(current, { 'readAloud.favoriteVoices': '[]' }, sessions)).toEqual([]);
  });
  it('protects subsequent synthesis and playback settings in a restore, while allowing cosmetic settings', () => {
    const sessions = [{ title: 'Paper', voices: [{ id: 'azure::ava', provider: 'azure' }] }];
    expect(affectedReading({ 'azure.apiKey': 'old' }, { 'azure.apiKey': 'new' }, sessions)).toEqual(['Paper']);
    expect(affectedReading({ 'readAloud.volume': 50 }, { 'readAloud.volume': 70 }, sessions)).toEqual(['Paper']);
    expect(affectedReading({}, { 'highlight.wordColor': '#fff', 'shortcuts.stopReading': 'Shift+S' }, sessions)).toEqual([]);
  });
  it('reads both sides of a paused handoff, every tab, and a player still loading', () => {
    const values = flattenSettings(DEFAULTS);
    const readers = [
      { title: 'Paused', _internalReader: { _readAloudManager: { active: true, selectedVoiceID: 'azure::ava', _voice: { id: 'azure::ava' }, _allVoices: [] } } },
      { title: 'Loading', _internalReader: { _state: { readAloudState: { popupOpen: true } }, _readAloudManager: { active: false, _allVoices: [] } } },
    ];
    const impact = createReadingImpact({ values: () => values, readers: () => readers,
      pending: () => ['local::bella'], title: r => r.title });
    expect(impact.affectedTabs({ 'local.baseURL': 'https://new.example' })).toEqual(['Paused', 'Loading']);
    readers.pop();
    expect(impact.affectedTabs({ 'fish.enabled': true })).toEqual([]);
    expect(impact.affectedTabs({ 'azure.apiKey': 'changed' })).toEqual(['Paused']);
  });
});
