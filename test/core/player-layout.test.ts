import { describe, expect, it } from 'vitest';
import { playerLayout, setPlayerLayout, PREF_PREFIX } from '../../src/core/settings';

describe('player layout default', () => {
  it.each(['A', 'B', 'top'])('preserves a saved %s selection', value => {
    expect(playerLayout({ get: () => value, set: () => {}, has: () => true })).toBe(value);
  });
  it('uses top for no choice even when Gecko retained the old A default', () => {
    expect(playerLayout({ get: () => 'A', set: () => {}, has: key => { expect(key).toBe(PREF_PREFIX + 'readAloud.playerLayout'); return false; } })).toBe('top');
  });
  it.each([undefined, null, 'invalid'])('uses top for missing/invalid values', value => {
    expect(playerLayout({ get: () => value, set: () => {} })).toBe('top');
  });
});


it('persists an explicit Bottom bar choice when Gecko retained the old A default', () => {
  let defaultValue = 'A';
  let userValue: unknown;
  const prefs = {
    get: () => userValue ?? defaultValue,
    has: () => userValue !== undefined,
    set: (_key: string, value: unknown) => { userValue = value === defaultValue ? undefined : value; },
    setDefault: (_key: string, value: string) => { defaultValue = value; },
  };
  expect(playerLayout(prefs)).toBe('top');
  setPlayerLayout(prefs, 'A');
  expect(playerLayout(prefs)).toBe('A');
  expect(prefs.has()).toBe(true);
  expect(defaultValue).toBe('top');
});
