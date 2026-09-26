import { describe, expect, it } from 'vitest';
import { createDocumentVoices, readDefaultVoice, writeDefaultVoice } from '../../src/core/document-voices';
import type { PrefsBackend } from '../../src/core/settings';
import { applyBackup, createBackup, parseBackup, serializeBackup } from '../../src/core/settings-backup';
import { mergeSharedSettings } from '../../src/core/settings-sync';

function prefs(): PrefsBackend {
  const values = new Map<string, unknown>();
  return { get: key => values.get(key), set: (key, value) => { values.set(key, value); },
    keys: prefix => [...values.keys()].filter(key => key.startsWith(prefix)) };
}

describe('document voices', () => {
  it('does not invent a default and can initialize after the owner chooses one', () => {
    const p = prefs();
    const documents = createDocumentVoices(p);
    expect(documents.open('user/ABCDEFGH')).toBeNull();
    writeDefaultVoice(p, { id: 'fish::a', lang: 'en' });
    expect(documents.open('user/ABCDEFGH')?.voice.id).toBe('fish::a');
    writeDefaultVoice(p, null);
    expect(documents.open('user/ABCDEFGH')?.voice.id).toBe('fish::a');
    expect(documents.open('user/BCDEFGHJ')).toBeNull();
  });
  it('converges on a tie and rejects malformed records without losing unrelated settings', () => {
    const key = 'documentVoices.user/ABCDEFGH';
    const a = JSON.stringify({ voice: { id: 'fish::a', lang: 'en' }, manual: true, ts: 100 });
    const b = JSON.stringify({ voice: { id: 'fish::b', lang: 'en' }, manual: true, ts: 100 });
    const left = mergeSharedSettings({ values: { [key]: a }, stamps: {}, machine: 'a' }, [{ key, value: b, ts: 100, by: 'b' }]);
    const right = mergeSharedSettings({ values: { [key]: b }, stamps: {}, machine: 'b' }, [{ key, value: a, ts: 100, by: 'a' }]);
    expect(left.items.find(item => item.key === key)?.value).toBe(b);
    expect(right.items.find(item => item.key === key)?.value).toBe(b);
    const parsed = parseBackup(JSON.stringify({ format: 'zotero-tts-settings', settings: {
      [key]: '{bad', 'documentVoices.__proto__': a, 'readAloud.volume': 80,
    } }));
    expect(parsed.settings).toEqual({ 'readAloud.volume': 80 });
    expect(parsed.ignored).toHaveLength(2);
  });
  it('backs up and restores both the default and independent document choices', () => {
    const source = prefs(), target = prefs();
    writeDefaultVoice(source, { id: 'fish::a', lang: 'en' });
    const documents = createDocumentVoices(source, () => 100);
    documents.open('user/ABCDEFGH');
    documents.choose('group-23/ABCDEFGH', { id: 'fish::b', lang: 'zh' });
    applyBackup(target, parseBackup(serializeBackup(createBackup(source))));
    expect(readDefaultVoice(target)).toEqual({ id: 'fish::a', lang: 'en' });
    expect(createDocumentVoices(target).get('user/ABCDEFGH')).toEqual(documents.get('user/ABCDEFGH'));
    expect(createDocumentVoices(target).get('group-23/ABCDEFGH')).toEqual(documents.get('group-23/ABCDEFGH'));
  });
  it('merges each document independently and never replaces a manual pick with a later inheritance', () => {
    const key = 'documentVoices.user/ABCDEFGH', other = 'documentVoices.user/BCDEFGHJ';
    const manual = JSON.stringify({ voice: { id: 'fish::a', lang: 'en' }, manual: true, ts: 100 });
    const inherited = JSON.stringify({ voice: { id: 'fish::b', lang: 'zh' }, manual: false, ts: 200 });
    const plan = mergeSharedSettings({ values: { [key]: manual }, stamps: {}, machine: 'a' }, [
      { key, value: inherited, ts: 200, by: 'b' }, { key: other, value: inherited, ts: 200, by: 'b' },
    ]);
    expect(plan.adopt.map(item => item.key)).toEqual([other]);
    expect(plan.items.find(item => item.key === key)?.value).toBe(manual);
    expect(plan.pushed).toContain(key);
    const newer = JSON.stringify({ voice: { id: 'fish::c', lang: 'mul' }, manual: true, ts: 300 });
    expect(mergeSharedSettings({ values: { [key]: manual }, stamps: {}, machine: 'a' }, [
      { key, value: newer, ts: 300, by: 'b' },
    ]).adopt[0]?.value).toBe(newer);
  });
  it('copies the default once per attachment and keeps later choices independent', () => {
    const p = prefs();
    const a = { id: 'fish::a', lang: 'en' };
    const b = { id: 'fish::b', lang: 'mul' };
    writeDefaultVoice(p, a);
    const voices = createDocumentVoices(p, () => 100);
    expect(voices.open('user/ABCDEFGH')?.voice).toEqual(a);
    writeDefaultVoice(p, b);
    expect(voices.open('user/ABCDEFGH')?.voice).toEqual(a);
    expect(voices.open('user/BCDEFGHJ')?.voice).toEqual(b);
    voices.choose('user/ABCDEFGH', b);
    expect(createDocumentVoices(p).open('user/ABCDEFGH')).toMatchObject({ voice: b, manual: true });
    expect(readDefaultVoice(p)).toEqual(b);
  });
});
