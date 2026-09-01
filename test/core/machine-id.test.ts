import { describe, expect, it } from 'vitest';
import { machineId, MACHINE_ID_MAX_CHARS, MACHINE_ID_PREF, renameMachineId, sanitizeMachineId } from '../../src/core/machine-id';
import type { PrefsBackend } from '../../src/core/settings';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

describe('sanitizeMachineId', () => {
  it('keeps letters, digits, dot, dash and underscore', () => {
    expect(sanitizeMachineId('MacBook-Pro_2.local')).toBe('MacBook-Pro_2.local');
    expect(sanitizeMachineId('DESKTOP-4F2K9J')).toBe('DESKTOP-4F2K9J');
  });

  it('turns every run of anything else into one dash', () => {
    expect(sanitizeMachineId('office pc (3rd floor)')).toBe('office-pc-3rd-floor');
    expect(sanitizeMachineId('工作机 desk')).toBe('desk');
  });

  it('trims dashes and dots at the edges and caps the length', () => {
    expect(sanitizeMachineId('  .-machine-.  ')).toBe('machine');
    expect(sanitizeMachineId('x'.repeat(80))).toHaveLength(MACHINE_ID_MAX_CHARS);
  });

  it('is idempotent, so a stored id sanitizes to itself', () => {
    for (const raw of ['office pc', '工作机', 'a'.repeat(80), 'MacBook-Pro.local']) {
      const once = sanitizeMachineId(raw);
      expect(sanitizeMachineId(once)).toBe(once);
    }
  });

  it('comes out empty when nothing survives, for the caller to fall back', () => {
    expect(sanitizeMachineId('工作机')).toBe('');
    expect(sanitizeMachineId('---')).toBe('');
    expect(sanitizeMachineId('')).toBe('');
  });
});

describe('machineId', () => {
  it('persists the sanitized hostname on first use and returns it thereafter', () => {
    const prefs = fakePrefs();
    expect(machineId(prefs, () => 'MacBook Pro.local')).toBe('MacBook-Pro.local');
    expect(prefs.store[MACHINE_ID_PREF]).toBe('MacBook-Pro.local');
    // The hostname is not consulted again
    expect(machineId(prefs, () => 'other-host')).toBe('MacBook-Pro.local');
  });

  it('falls back to "computer" when the hostname yields nothing', () => {
    expect(machineId(fakePrefs(), () => '工作机')).toBe('computer');
    expect(
      machineId(fakePrefs(), () => {
        throw new Error('no dns');
      }),
    ).toBe('computer');
  });

  it('repairs a hand-edited stored value in place', () => {
    const prefs = fakePrefs({ [MACHINE_ID_PREF]: 'my machine!' });
    expect(machineId(prefs, () => 'ignored')).toBe('my-machine');
    expect(prefs.store[MACHINE_ID_PREF]).toBe('my-machine');
  });
});

describe('renameMachineId', () => {
  it('stores the sanitized new name', () => {
    const prefs = fakePrefs({ [MACHINE_ID_PREF]: 'DESKTOP-4F2K9J' });
    expect(renameMachineId(prefs, 'office pc', () => 'x')).toBe('office-pc');
    expect(prefs.store[MACHINE_ID_PREF]).toBe('office-pc');
  });

  it('keeps the current id when the new name sanitizes to nothing', () => {
    const prefs = fakePrefs({ [MACHINE_ID_PREF]: 'office-pc' });
    expect(renameMachineId(prefs, '   ', () => 'x')).toBe('office-pc');
    expect(prefs.store[MACHINE_ID_PREF]).toBe('office-pc');
  });
});
