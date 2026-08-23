import { describe, expect, it } from 'vitest';
import { applyPreset, PRESETS, SERVER_PRESETS, serverPreset } from '../../src/core/server-presets';
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
