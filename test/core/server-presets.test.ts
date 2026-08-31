import { describe, expect, it } from 'vitest';
import { applyPreset, parsePresetValues, PRESETS, SERVER_PRESETS, serverPreset, switchPreset } from '../../src/core/server-presets';
import { DEFAULTS } from '../../src/core/settings';

const openai = (over: Partial<typeof DEFAULTS.openai>) => ({ ...DEFAULTS.openai, ...over });

describe('serverPreset', () => {
  it('is the stored choice when there is one', () => {
    expect(serverPreset(openai({ server: 'chatterbox', baseURL: 'https://api.openai.com' }))).toBe('chatterbox');
    expect(serverPreset(openai({ server: 'other', baseURL: 'https://api.openai.com' }))).toBe('other');
  });

  it('guesses from the address for settings saved before there was a choice', () => {
    expect(serverPreset(openai({ server: '', baseURL: 'https://api.openai.com' }))).toBe('openai');
    expect(serverPreset(openai({ server: '', baseURL: 'https://api.openai.com/v1' }))).toBe('openai');
    expect(serverPreset(openai({ server: '', baseURL: 'http://localhost:8004' }))).toBe('other');
    expect(serverPreset(openai({ server: '', baseURL: 'not a url' }))).toBe('other');
    expect(serverPreset(openai({ server: 'garbage', baseURL: 'http://localhost:8880' }))).toBe('other');
  });

  it('reads the fresh-install defaults as OpenAI', () => {
    expect(serverPreset(DEFAULTS.openai)).toBe('openai');
  });
});

describe('PRESETS', () => {
  it('lists every preset with a label, and only disables what the server provably ignores', () => {
    for (const id of SERVER_PRESETS) {
      expect(PRESETS[id].id).toBe(id);
      expect(PRESETS[id].label).not.toBe('');
      expect(PRESETS[id].uses.baseURL).toBe(true);
    }
    // "Other" may be anything, so nothing is taken away
    expect(Object.values(PRESETS.other.uses).every(Boolean)).toBe(true);
    expect(PRESETS.other.defaults).toEqual({});
    expect(PRESETS.chatterbox.uses).toMatchObject({ apiKey: false, model: false, voices: false, headers: true });
    expect(PRESETS.openai.uses).toMatchObject({ apiKey: true, model: true, voices: true, headers: false });
  });
});

describe('applyPreset', () => {
  it('blanks the fields a preset does not use, so leftovers from another server are never sent', () => {
    const stale = openai({ server: 'chatterbox', baseURL: 'http://localhost:8004', apiKey: 'sk-old', voices: 'alloy,echo', headers: 'X: y', model: 'tts-1' });
    expect(applyPreset(stale)).toEqual({ ...stale, apiKey: '', voices: '' });
    const official = openai({ server: 'openai', apiKey: 'sk-live', headers: 'CF-Access-Client-Id: x' });
    expect(applyPreset(official)).toEqual({ ...official, headers: '' });
  });

  it('leaves everything alone for other servers', () => {
    const custom = openai({ server: 'other', baseURL: 'https://api.groq.com/openai', apiKey: 'gsk', voices: 'Fritz-PlayAI', headers: 'X: y' });
    expect(applyPreset(custom)).toEqual(custom);
  });
});

// What each server was last used with — the `openai.presetValues` pref, a
// JSON object keyed by preset (issue #34: switching away and back used to
// replace the user's address with the preset's default).
describe('parsePresetValues', () => {
  it('reads what was stored, and an empty memory from anything else', () => {
    const stored = { chatterbox: { baseURL: 'http://nas:8004', model: 'tts-1' } };
    expect(parsePresetValues(JSON.stringify(stored))).toEqual(stored);
    expect(parsePresetValues('')).toEqual({});
    expect(parsePresetValues('not json')).toEqual({});
    expect(parsePresetValues('[1, 2]')).toEqual({});
    expect(parsePresetValues('null')).toEqual({});
  });

  it('keeps only the known presets and their string fields', () => {
    const text = JSON.stringify({ chatterbox: { baseURL: 'http://nas:8004', model: 7, voices: 'x' }, kokoro: { baseURL: 'http://x' }, openai: 'oops' });
    expect(parsePresetValues(text)).toEqual({ chatterbox: { baseURL: 'http://nas:8004' } });
  });
});

describe('switchPreset', () => {
  const official = { baseURL: 'https://api.openai.com', model: 'gpt-4o-mini-tts' };
  const own = { baseURL: 'https://h200-chatterbox.example', model: 'tts-1' };

  it('stores the values of the preset being left, and fills a first visit with the defaults', () => {
    const { remembered, values } = switchPreset({}, 'chatterbox', 'openai', own);
    expect(remembered).toEqual({ chatterbox: own });
    expect(values).toEqual(PRESETS.openai.defaults);
  });

  it('gives a revisited preset back what the user had there', () => {
    const away = switchPreset({}, 'chatterbox', 'openai', own);
    const back = switchPreset(away.remembered, 'openai', 'chatterbox', official);
    expect(back.values).toEqual(own);
    expect(back.remembered).toEqual({ chatterbox: own, openai: official });
  });

  it('"other" has no defaults: a first visit writes nothing, a revisit restores', () => {
    const groq = { baseURL: 'https://api.groq.com/openai', model: 'playai-tts' };
    expect(switchPreset({}, 'openai', 'other', official).values).toEqual({});
    const away = switchPreset({}, 'other', 'openai', groq);
    expect(switchPreset(away.remembered, 'openai', 'other', official).values).toEqual(groq);
  });

  it('re-picking the current preset changes nothing, even after an edit', () => {
    const edited = { baseURL: 'https://api.openai.com/v1', model: 'tts-1-hd' };
    const same = switchPreset({ openai: official }, 'openai', 'openai', edited);
    expect(same.values).toEqual(edited);
    expect(same.remembered).toEqual({ openai: edited });
  });

  it('stores both fields whether or not the preset uses them, and fills a gap from the defaults', () => {
    // Chatterbox ignores the model, but it is still what the user had, and comes back with the address
    const { remembered } = switchPreset({}, 'chatterbox', 'other', { baseURL: 'http://nas:8004', model: 'kept' });
    expect(remembered.chatterbox).toEqual({ baseURL: 'http://nas:8004', model: 'kept' });
    // A damaged entry missing a field falls back to the preset's default for it
    const partial = switchPreset({ openai: { baseURL: 'https://api.openai.com/v1' } }, 'other', 'openai', { baseURL: 'http://x', model: 'y' });
    expect(partial.values).toEqual({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini-tts' });
  });

  it('does not touch the memory it was given', () => {
    const remembered = { openai: official };
    switchPreset(remembered, 'openai', 'chatterbox', own);
    expect(remembered).toEqual({ openai: official });
  });
});
