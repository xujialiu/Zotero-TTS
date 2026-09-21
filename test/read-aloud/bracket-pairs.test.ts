import { createBackup, parseBackup } from '../../src/core/settings-backup';
import { DEFAULTS, loadSettings, PREF_PREFIX } from '../../src/core/settings';
import { describe, expect, it, vi } from 'vitest';
import { prepareSpeechText, restoreSpeechOffsets, validateBracketPairs } from '../../src/core/speech-text';
import { createTextSettings } from '../../src/read-aloud/text-settings';
import { createRemoteInterface } from '../../src/read-aloud/remote-interface';

describe('configurable bracket pairs', () => {
  it('backs up and restores the list while preserving existing opt-out', () => {
    const values = { [PREF_PREFIX + 'readAloud.stripAngleBrackets']: false,
      [PREF_PREFIX + 'readAloud.bracketPairs']: '() 【】' };
    const prefs = { get: (key: string) => values[key], set: () => {} };
    const backup = createBackup(prefs);
    const restored = parseBackup(JSON.stringify(backup));
    expect(restored.settings['readAloud.bracketPairs']).toBe('() 【】');
    expect(restored.settings['readAloud.stripAngleBrackets']).toBe(false);
    expect(loadSettings({ get: () => undefined, set: () => {} }).readAloud.bracketPairs).toBe('<> []');
    expect(DEFAULTS.readAloud.stripAngleBrackets).toBe(true);
  });
  it.each(['', '   ', '<', 'abc', 'aa', '**', '<> <>', 'a>', '<=>'])('rejects %j', value => {
    expect(validateBracketPairs(value).ok).toBe(false);
  });
  it.each(['<> []', '() 【】', '😀😁', ' <>   [] '])('accepts %j', value => {
    expect(validateBracketPairs(value).ok).toBe(true);
  });
  it.each([
    ['<Hello> [World]', '<> []', 'Hello World'],
    ['[Hello]', '<>', '[Hello]'],
    ['【Hello】 (World)!', '() 【】', 'Hello World!'],
    ['<[Hello]> [<World>]', '<> []', 'Hello World'],
    ['<Hello> and [World]', '<> []', 'Hello and World'],
    ['<Hello> [World', '<> []', 'Hello [World'],
    ['<[Hello>]', '<> []', 'Hello'],
    ['<a < b>', '<> []', 'a < b'],
    ['😀Hello😁 [World]', '😀😁 []', 'Hello World'],
  ])('prepares %s', (input, pairs, expected) => {
    expect(prepareSpeechText(input, true, pairs).text).toBe(expected);
    expect(prepareSpeechText(input, false, pairs).text).toBe(input);
  });
  it('restores UTF-16 positions across supplementary symbols', () => {
    const input = '😀Hello😁 [World]';
    const prepared = prepareSpeechText(input, true, '😀😁 []');
    expect(prepared.removed).toEqual([0, 1, 7, 8, 10, 16]);
    const times = [{ start: 0, end: 1, charStart: 0, charEnd: 5 }, { start: 1, end: 2, charStart: 6, charEnd: 11 }];
    expect(restoreSpeechOffsets(times, prepared.removed).map(t => input.slice(t.charStart, t.charEnd))).toEqual(['Hello', 'World']);
  });
  it('uses the configured list throughout asynchronous prefetch', async () => {
    let pairs = '【】';
    const cache = new Map();
    const synthesize = vi.fn(async () => ({ audio: new Blob(['audio']) }));
    const upcoming = vi.fn(() => ['【Following sentence】']);
    const remote = createRemoteInterface({
      listCatalog: async () => [], getProvider: () => ({ id: 'openai-official', synthesize } as any),
      getBracketPairs: () => pairs, cacheVersion: () => 'v1',
      cache: () => ({ match: async key => cache.get(key), put: async (key, value) => { cache.set(key, value); } }),
      getPrefetch: () => ({ enabled: true, count: 1 }), getUpcomingTexts: upcoming,
    });
    await remote.getAudio({ text: '【Hello】' }, { id: 'openai-official::alloy' });
    pairs = '<>';
    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(2));
    expect(upcoming).toHaveBeenCalledWith('【Hello】', 1);
    expect(synthesize).toHaveBeenLastCalledWith('Following sentence', expect.anything());
  });
  it('snapshots the list with the switch until reactivation', () => {
    let pairs = '<> []';
    class Manager { _active = false; activate() { this._active = true; } }
    const m = new Manager();
    const reader = { _internalReader: { _readAloudManager: m } };
    const settings = createTextSettings({ getEnabled: () => true, getPairs: () => pairs, error: e => { throw e; } });
    settings.attach(reader); m.activate(); pairs = '()';
    expect(settings.pairs(reader)).toBe('<> []');
    settings.attach(reader);
    expect(settings.pairs(reader)).toBe('<> []');
    m._active = false; m.activate();
    expect(settings.pairs(reader)).toBe('()');
    settings.dispose();
  });
  it.each(['openai-official::alloy', 'native'])('passes cleaned text and restores cached ranges for %s', async id => {
    const raw = { audio: new Blob(['audio']), timestamps: [{ start: 0, end: 1, charStart: 0, charEnd: 5 }] };
    const synthesize = vi.fn(async () => raw);
    const nativeAudio = vi.fn(async () => raw);
    const cache = new Map();
    const remote = createRemoteInterface({
      listCatalog: async () => [], getProvider: () => ({ id: 'openai-official', synthesize } as any),
      getBracketPairs: () => '【】', cacheVersion: () => 'v1',
      cache: () => ({ match: async key => cache.get(key), put: async (key, value) => { cache.set(key, value); } }),
      native: () => ({ getAudio: nativeAudio } as any),
    });
    const source = Object.freeze({ text: '【Hello】' });
    for (let i = 0; i < 2; i++) {
      const result = await remote.getAudio(source, { id });
      expect((result.timestamps as any[])?.[0]).toMatchObject({ charStart: 1, charEnd: 6 });
    }
    if (id === 'native') expect(nativeAudio).toHaveBeenCalledWith({ text: 'Hello' }, { id });
    else { expect(synthesize).toHaveBeenCalledWith('Hello', expect.anything()); expect(synthesize).toHaveBeenCalledTimes(1); }
    expect(raw.timestamps[0].charStart).toBe(0);
  });
});

describe('brackets inside a sentence (#127)', () => {
  it.each([
    ['He cast [Fireball] at the wolf.', 'He cast Fireball at the wolf.'],
    ['[Level Up] You gained 100 exp.', 'Level Up You gained 100 exp.'],
    ['[Skill: [Fireball]] now', 'Skill: Fireball now'],
    ['as shown [12].', 'as shown 12.'],
    ['Say [ hello ] now', 'Say  hello  now'],
    ['You gained < 100 exp> today.', 'You gained  100 exp today.'],
    ['<Warning: HP < 10%>', 'Warning: HP < 10%'],
    ['<HP > 5>', 'HP > 5'],
    ['[x < 5 and y > 3]', 'x < 5 and y > 3'],
    ['他获得了<火球术>技能', '他获得了火球术技能'],
    ['[A <B] C>', 'A B C'],
    ['[A] B] C', 'A B] C'],
    ['[A [B] C', '[A B C'],
    ['List<String>', 'ListString'],
  ])('removes the pairs in %s', (input, expected) => {
    expect(prepareSpeechText(input, true).text).toBe(expected);
    expect(prepareSpeechText(input, false).text).toBe(input);
  });
  it.each([
    'If x < 5 and y > 3, stop.', 'aged < 65 years and BMI > 30', 'p<0.05 and BMI>30',
    'x <= 5 and y >= 3', 'A <- B -> C', 'A <-> B', 'You have < 2/50 HP > left.',
  ])('keeps < and > that read as math signs in %s', input => {
    expect(prepareSpeechText(input, true)).toEqual({ text: input, removed: [] });
  });
  it('applies a custom list inside a sentence', () => {
    expect(prepareSpeechText('He said (quietly) 【Hello】 now', true, '() 【】').text).toBe('He said quietly Hello now');
  });
  it('leaves a sentence with an opening symbol shared by two pairs as written', () => {
    expect(prepareSpeechText('He cast <Fireball> now', true, '<> <]')).toEqual({ text: 'He cast <Fireball> now', removed: [] });
  });
  it('returns ascending positions that map every word back across crossing groups', () => {
    const source = '[A <B] C>';
    const prepared = prepareSpeechText(source, true);
    expect(prepared).toEqual({ text: 'A B C', removed: [0, 3, 5, 8] });
    const times = [0, 2, 4].map(charStart => ({ start: 0, end: 1, charStart, charEnd: charStart + 1 }));
    expect(restoreSpeechOffsets(times, prepared.removed).map(t => source.slice(t.charStart, t.charEnd))).toEqual(['A', 'B', 'C']);
  });
  it.each(['openai-official::alloy', 'native'])('sends %s the bracketed words and maps them back', async id => {
    const original = 'He cast [Fireball] at the wolf.';
    const cleaned = 'He cast Fireball at the wolf.';
    const words = ['He', 'cast', 'Fireball', 'at', 'the', 'wolf'];
    let from = 0;
    const timestamps = words.map((word, i) => {
      const charStart = cleaned.indexOf(word, from);
      from = charStart + word.length;
      return { start: i, end: i + 0.5, charStart, charEnd: from };
    });
    const raw = { audio: new Blob(['audio']), timestamps };
    const synthesize = vi.fn(async () => raw);
    const nativeAudio = vi.fn(async () => raw);
    const cache = new Map();
    const remote = createRemoteInterface({
      listCatalog: async () => [], getProvider: () => ({ id: 'openai-official', synthesize } as any),
      getBracketPairs: () => '<> []', cacheVersion: () => 'v1',
      cache: () => ({ match: async key => cache.get(key), put: async (key, value) => { cache.set(key, value); } }),
      native: () => ({ getAudio: nativeAudio } as any),
    });
    const source = Object.freeze({ text: original });
    const result = await remote.getAudio(source, { id });
    expect((result.timestamps as any[]).map(t => original.slice(t.charStart, t.charEnd))).toEqual(words);
    if (id === 'native') expect(nativeAudio).toHaveBeenCalledWith({ text: cleaned }, { id });
    else expect(synthesize).toHaveBeenCalledWith(cleaned, expect.anything());
    expect(source.text).toBe(original);
  });
});
