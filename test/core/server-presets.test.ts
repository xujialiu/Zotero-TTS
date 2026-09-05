import { describe, expect, it } from 'vitest';
import { addressHint, addressHintText, applyPreset, parsePresetValues, PRESETS, SERVER_PRESETS, serverPreset, switchPreset } from '../../src/core/server-presets';
import { DEFAULTS } from '../../src/core/settings';

const openai = (over: Partial<typeof DEFAULTS.openai>) => ({ ...DEFAULTS.openai, ...over });

describe('serverPreset', () => {
  it('is the stored choice when there is one', () => {
    expect(serverPreset(openai({ server: 'chatterbox', baseURL: 'https://api.openai.com' }))).toBe('chatterbox');
    expect(serverPreset(openai({ server: 'other', baseURL: 'https://api.openai.com' }))).toBe('other');
    expect(serverPreset(openai({ server: 'mimo', baseURL: 'https://api.xiaomimimo.com' }))).toBe('mimo');
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
    const text = JSON.stringify({ chatterbox: { baseURL: 'http://nas:8004', model: 7, speed: 'x' }, kokoro: { baseURL: 'http://x' }, openai: 'oops' });
    expect(parsePresetValues(text)).toEqual({ chatterbox: { baseURL: 'http://nas:8004' } });
  });

  it('reads the key, voices and headers filed for a server (issue #52)', () => {
    const stored = { chatterbox: { baseURL: 'http://nas:8004', model: 'tts-1', apiKey: '', voices: 'Emily.wav', headers: 'CF-Access-Client-Id: a' } };
    expect(parsePresetValues(JSON.stringify(stored))).toEqual(stored);
  });
});

describe('switchPreset', () => {
  const blank = { apiKey: '', voices: '', headers: '' };
  const official = { baseURL: 'https://api.openai.com', model: 'gpt-4o-mini-tts', apiKey: 'sk-live', voices: '', headers: '' };
  const own = { baseURL: 'https://h200-chatterbox.example', model: 'tts-1', apiKey: '', voices: '', headers: 'CF-Access-Client-Id: a; CF-Access-Client-Secret: b' };

  it('stores the values of the preset being left, and fills a first visit with the defaults and nothing else', () => {
    const { remembered, values } = switchPreset({}, 'chatterbox', 'openai', own);
    expect(remembered).toEqual({ chatterbox: own });
    expect(values).toEqual({ ...blank, ...PRESETS.openai.defaults });
  });

  it('gives a revisited preset back what the user had there', () => {
    const away = switchPreset({}, 'chatterbox', 'openai', own);
    const back = switchPreset(away.remembered, 'openai', 'chatterbox', official);
    expect(back.values).toEqual(own);
    expect(back.remembered).toEqual({ chatterbox: own, openai: official });
  });

  it('"other" has no defaults: a first visit writes only the blanks, a revisit restores', () => {
    const groq = { baseURL: 'https://api.groq.com/openai', model: 'playai-tts', apiKey: 'gsk', voices: 'Fritz-PlayAI', headers: '' };
    expect(switchPreset({}, 'openai', 'other', official).values).toEqual(blank);
    const away = switchPreset({}, 'other', 'openai', groq);
    expect(switchPreset(away.remembered, 'openai', 'other', official).values).toEqual(groq);
  });

  it('re-picking the current preset changes nothing, even after an edit', () => {
    const edited = { ...official, baseURL: 'https://api.openai.com/v1', model: 'tts-1-hd', apiKey: 'sk-rotated' };
    const same = switchPreset({ openai: official }, 'openai', 'openai', edited);
    expect(same.values).toEqual(edited);
    expect(same.remembered).toEqual({ openai: edited });
  });

  it('stores every field whether or not the preset uses it, and fills a gap from the defaults or with a blank', () => {
    // Chatterbox ignores the model, but it is still what the user had, and comes back with the address
    const kept = { baseURL: 'http://nas:8004', model: 'kept', apiKey: 'unused-but-kept', voices: '', headers: '' };
    const { remembered } = switchPreset({}, 'chatterbox', 'other', kept);
    expect(remembered.chatterbox).toEqual(kept);
    // A damaged entry missing fields falls back to the preset's default for them, else to blank
    const partial = switchPreset({ openai: { baseURL: 'https://api.openai.com/v1' } }, 'other', 'openai', kept);
    expect(partial.values).toEqual({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini-tts', apiKey: '', voices: '', headers: '' });
  });

  // Issue #52: the key, voices and Extra headers were one set of fields
  // shared by every server, so a switch carried one server's credentials to
  // the next — a gateway token typed for Chatterbox went to Xiaomi with the
  // first MiMo probe. Each server keeps its own now.
  it("never carries one server's key, voices or headers to another", () => {
    const away = switchPreset({}, 'chatterbox', 'mimo', own);
    expect(away.values).toEqual({ ...blank, ...PRESETS.mimo.defaults });
    const mimo = { ...PRESETS.mimo.defaults, apiKey: 'sk-mimo', voices: '', headers: '' } as typeof own;
    const onward = switchPreset(away.remembered, 'mimo', 'other', mimo);
    expect(onward.values).toEqual(blank);
    const back = switchPreset(onward.remembered, 'other', 'chatterbox', { ...blank, baseURL: 'http://x', model: 'y' });
    expect(back.values).toEqual(own);
    expect(back.remembered.mimo).toEqual(mimo);
  });

  it('does not touch the memory it was given', () => {
    const remembered = { openai: official };
    switchPreset(remembered, 'openai', 'chatterbox', own);
    expect(remembered).toEqual({ openai: official });
  });
});

// Xiaomi MiMo (issue #50): an OpenAI-shaped server whose speech comes through
// the chat completions route, with no voice list to ask for.
describe('the Xiaomi MiMo preset', () => {
  const MIMO_VOICES = ['mimo_default', '冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'];
  const others = SERVER_PRESETS.filter((p) => p !== 'mimo');

  it('sits in the dropdown between the known servers and "other"', () => {
    expect(SERVER_PRESETS).toEqual(['openai', 'chatterbox', 'mimo', 'other']);
  });

  it('fills in the platform address and the TTS model, and takes no Extra headers, like OpenAI', () => {
    expect(PRESETS.mimo.label).toBe('Xiaomi MiMo');
    expect(PRESETS.mimo.defaults).toEqual({ baseURL: 'https://api.xiaomimimo.com', model: 'mimo-v2.5-tts' });
    // A fixed hosted endpoint with no gateway of the user's in front: a token
    // typed for another server must not travel with every request (issue #52)
    expect(PRESETS.mimo.uses).toEqual({ apiKey: true, baseURL: true, model: true, voices: true, headers: false });
    const mimo = openai({ server: 'mimo', apiKey: 'sk-mimo', voices: '冰糖', headers: 'CF-Access-Client-Id: x' });
    expect(applyPreset(mimo)).toEqual({ ...mimo, headers: '' });
  });

  it('synthesizes through the chat completions route, where every other preset uses the speech route', () => {
    expect(PRESETS.mimo.synthesis).toBe('chat');
    for (const id of others) expect(PRESETS[id].synthesis, id).toBe('speech');
  });

  it("carries the server's documented voices, since it publishes no list, and its own name for the player", () => {
    expect(PRESETS.mimo.voices).toEqual(MIMO_VOICES);
    expect(PRESETS.mimo.voiceName).toBe('MiMo');
    for (const id of others) {
      expect(PRESETS[id].voices, id).toBeUndefined();
      expect(PRESETS[id].voiceName, id).toBeUndefined();
    }
  });

  it('is remembered like the others', () => {
    const values = { baseURL: 'https://api.xiaomimimo.com', model: 'mimo-v2.5-tts' };
    expect(parsePresetValues(JSON.stringify({ mimo: values }))).toEqual({ mimo: values });
    const official = { baseURL: 'https://api.openai.com', model: 'gpt-4o-mini-tts', apiKey: 'sk-live', voices: '', headers: '' };
    expect(switchPreset({}, 'openai', 'mimo', official).values).toEqual({ apiKey: '', voices: '', headers: '', ...PRESETS.mimo.defaults });
  });
});

// Issue #54: a one-letter typo in a hosted preset's address is hard to
// notice, and the first probe sends the key to whoever owns the mistyped
// domain. The two hosted presets know their server's hostname.
describe('addressHint', () => {
  it('knows the hostname of the two hosted servers only', () => {
    expect(PRESETS.openai.host).toBe('api.openai.com');
    expect(PRESETS.mimo.host).toBe('api.xiaomimimo.com');
    expect(PRESETS.chatterbox.host).toBeUndefined();
    expect(PRESETS.other.host).toBeUndefined();
  });

  it("is silent for a preset without a fixed host, an address that does not parse, and the server's own address", () => {
    expect(addressHint({ server: 'chatterbox', baseURL: 'http://nas:8004' })).toBeNull();
    expect(addressHint({ server: 'other', baseURL: 'https://api.xiaomimim.com' })).toBeNull();
    expect(addressHint({ server: 'mimo', baseURL: 'https://api.xiaomimimo.com' })).toBeNull();
    expect(addressHint({ server: 'mimo', baseURL: ' https://API.xiaomimimo.com/v1/ ' })).toBeNull();
    expect(addressHint({ server: 'openai', baseURL: 'not a url' })).toBeNull();
    expect(addressHint({ server: 'openai', baseURL: '' })).toBeNull();
    // Settings saved before the dropdown: the preset is guessed from the address itself
    expect(addressHint({ server: '', baseURL: 'https://api.openai.com' })).toBeNull();
    expect(addressHint({ server: '', baseURL: 'https://api.openai.con' })).toBeNull();
  });

  it('calls an address within two edits of the host a typo', () => {
    expect(addressHint({ server: 'mimo', baseURL: 'https://api.xiaomimim.com' })).toEqual({ kind: 'typo', host: 'api.xiaomimim.com', known: 'api.xiaomimimo.com' });
    expect(addressHint({ server: 'openai', baseURL: 'https://api.openai.con/v1' })).toEqual({ kind: 'typo', host: 'api.openai.con', known: 'api.openai.com' });
    expect(addressHint({ server: 'mimo', baseURL: 'https://api.xiaomimimo.cm' })).toMatchObject({ kind: 'typo' });
    expect(addressHint({ server: 'mimo', baseURL: 'https://api.xiaomimmio.com' })).toMatchObject({ kind: 'typo' });
    expect(addressHint({ server: 'openai', baseURL: 'https://api.openai.com.' })).toMatchObject({ kind: 'typo' });
  });

  it('calls any other domain a different address, never a typo', () => {
    expect(addressHint({ server: 'openai', baseURL: 'https://api.chatanywhere.tech' })).toEqual({ kind: 'different', host: 'api.chatanywhere.tech', known: 'api.openai.com' });
    expect(addressHint({ server: 'mimo', baseURL: 'https://mimo.corp.example:8443/v1' })).toMatchObject({ kind: 'different', host: 'mimo.corp.example' });
    expect(addressHint({ server: 'openai', baseURL: 'https://my-resource.openai.azure.com' })).toMatchObject({ kind: 'different' });
  });

  it('words the hint as one sentence', () => {
    expect(addressHintText({ kind: 'typo', host: 'api.xiaomimim.com', known: 'api.xiaomimimo.com' })).toBe('api.xiaomimim.com looks like a typo of api.xiaomimimo.com.');
    expect(addressHintText({ kind: 'different', host: 'api.example.com', known: 'api.openai.com' })).toBe('api.example.com is not api.openai.com: a mirror or a proxy?');
  });
});
