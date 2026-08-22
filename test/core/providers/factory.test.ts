import { describe, expect, it, vi } from 'vitest';
import { createProvider } from '../../../src/core/providers/factory';
import { SynthesisError } from '../../../src/core/providers/errors';
import { DEFAULTS } from '../../../src/core/settings';

const deps = {
  fetch: vi.fn() as unknown as typeof fetch,
  getWebSocket: vi.fn() as unknown as () => typeof WebSocket,
  newRequestId: () => 'r',
};

describe('createProvider', () => {
  it('builds the OpenAI provider', () => {
    const p = createProvider('openai', DEFAULTS, deps);
    expect(p.id).toBe('openai');
    expect(p.capabilities.wordTimestamps).toBe(false);
  });

  it('builds the Azure provider', () => {
    const p = createProvider('azure', DEFAULTS, deps);
    expect(p.id).toBe('azure');
    expect(p.capabilities.wordTimestamps).toBe(true);
  });

  it('builds the configured local engine', () => {
    const s = { ...DEFAULTS, local: { enabled: true, engine: 'kokoro', baseURL: 'http://h:1', voice: 'af_bella' } };
    const p = createProvider('local', s, deps);
    expect(p.id).toBe('local');
    expect(p.capabilities.wordTimestamps).toBe(true);
  });

  // The enabled flags decide what is published, not what can be built: a
  // voice Zotero remembers may belong to a provider switched off since
  it('builds a provider whether or not it is enabled', () => {
    expect(createProvider('azure', { ...DEFAULTS, azure: { ...DEFAULTS.azure, enabled: false } }, deps).id).toBe('azure');
  });

  it('throws a typed error when the configured local engine is not registered', () => {
    const s = { ...DEFAULTS, local: { enabled: true, engine: 'piper', baseURL: 'http://h:1', voice: 'x' } };
    expect(() => createProvider('local', s, deps)).toThrow(SynthesisError);
  });
});
