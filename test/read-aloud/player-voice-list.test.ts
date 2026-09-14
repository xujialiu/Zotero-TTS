import { describe, expect, it, vi } from 'vitest';
import { createPlayerVoiceList } from '../../src/read-aloud/player-voice-list';
import { createVoiceSwitcher } from '../../src/read-aloud/voice-switch';

function fixture() {
  const voices = [
    { id: 'us-a', language: 'en-US' }, { id: 'adrian', language: 'en' },
    { id: 'wild', language: '*' }, { id: 'us-b', language: 'en-US' },
    { id: 'gb', language: 'en-GB' },
  ];
  class Manager {
    active = true; paused = true; selectedVoiceID = 'us-a'; region: string | null = 'US';
    allVoices = voices; applied: string | null = null;
    get voicesForLanguage() {
      const current = this.allVoices.find(v => v.id === this.selectedVoiceID);
      const region = current?.language.split('-')[1] ?? this.region;
      // Native compatibility admits generic English and wildcard voices.
      return Object.assign(this.allVoices.filter(v => !region || !v.language.includes('-') || v.language === `en-${region}`),
        { filter: () => [], find: () => undefined });
    }
    selectVoice(id: string) {
      this.selectedVoiceID = id;
      // Native _applyVoice checks the getter after changing the selected ID.
      this.applied = this.voicesForLanguage.some(v => v.id === id) ? id : null;
    }
  }
  const manager = new Manager();
  const reader = { _internalReader: { _readAloudManager: manager } };
  const error = vi.fn();
  const list = createPlayerVoiceList({ error });
  list.attach(reader);
  const ids = () => Array.from(manager.voicesForLanguage, v => v.id);
  return { manager, reader, list, ids, voices, error, Manager };
}

describe('one player voice list', () => {
  it('offers only US voices to the popup and cycles the same list both ways', () => {
    const f = fixture();
    expect(f.ids()).toEqual(['us-a', 'us-b']);
    const switcher = createVoiceSwitcher({ notice: vi.fn(), error: f.error });
    for (const direction of [1, -1] as const) {
      switcher.step(f.reader, direction);
      expect(f.manager.selectedVoiceID).toBe('us-b');
      expect(f.manager.applied).toBe('us-b');
      switcher.step(f.reader, direction);
      expect(f.manager.selectedVoiceID).toBe('us-a');
    }
    expect(f.voices).toHaveLength(5);
    switcher.dispose(); f.list.dispose();
  });
  it('uses the selected region and keeps a singleton regional menu', () => {
    const f = fixture();
    f.manager.selectedVoiceID = 'gb';
    expect(f.ids()).toEqual(['gb']);
    f.list.dispose();
  });
  it('preserves generic selection and native application with stale US region', () => {
    const f = fixture();
    f.manager.selectVoice('adrian');
    expect(f.manager.applied).toBe('adrian');
    expect(f.ids()).toEqual(['us-a', 'adrian', 'wild', 'us-b']);
    f.manager.selectVoice('wild');
    expect(f.manager.applied).toBe('wild');
    expect(f.ids()).toContain('adrian');
    f.list.dispose();
  });
  it('keeps a generic fallback usable when the regional voice disappears', () => {
    const f = fixture();
    f.manager.allVoices = f.voices.filter(v => !v.language.includes('-'));
    f.manager.selectVoice('adrian');
    expect(f.manager.applied).toBe('adrian');
    expect(f.ids()).toEqual(['adrian', 'wild']);
    f.list.dispose();
  });
  it('preserves native results without a selected voice and restores the accessor', () => {
    const f = fixture();
    f.manager.selectedVoiceID = '';
    expect(f.ids()).toEqual(['us-a', 'adrian', 'wild', 'us-b']);
    f.manager.selectedVoiceID = 'us-a';
    f.list.attach(f.reader);
    expect(f.list.inspect(f.reader)?.patched).toBe(true);
    f.list.dispose();
    expect(f.ids()).toContain('adrian');
    expect(f.error).not.toHaveBeenCalled();
  });
});
