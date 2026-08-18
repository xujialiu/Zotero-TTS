import { describe, expect, it } from 'vitest';
import { LOCAL_ENGINES, getLocalEngine } from '../../../../src/core/providers/local/registry';

describe('local engine registry', () => {
  it('registers Kokoro', () => {
    expect(LOCAL_ENGINES.map((e) => e.id)).toContain('kokoro');
  });

  it('looks an engine up by id', () => {
    expect(getLocalEngine('kokoro')?.label).toBe('Kokoro-FastAPI');
  });

  it('returns undefined for an unknown engine rather than throwing', () => {
    expect(getLocalEngine('piper')).toBeUndefined();
  });

  it('gives every engine a distinct id, so the settings dropdown cannot collide', () => {
    const ids = LOCAL_ENGINES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
