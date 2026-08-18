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
    const p = createProvider({ ...DEFAULTS, provider: 'openai' }, deps);
    expect(p.id).toBe('openai');
    expect(p.capabilities.wordTimestamps).toBe(false);
  });

  it('builds the Azure provider', () => {
    const p = createProvider({ ...DEFAULTS, provider: 'azure' }, deps);
    expect(p.id).toBe('azure');
    expect(p.capabilities.wordTimestamps).toBe(true);
  });

  it('builds the configured local engine', () => {
    const s = { ...DEFAULTS, provider: 'local' as const, local: { engine: 'kokoro', baseURL: 'http://h:1', voice: 'af_bella' } };
    const p = createProvider(s, deps);
    expect(p.id).toBe('local');
    expect(p.capabilities.wordTimestamps).toBe(true);
  });

  it('throws a typed error when the configured local engine is not registered', () => {
    const s = { ...DEFAULTS, provider: 'local' as const, local: { engine: 'piper', baseURL: 'http://h:1', voice: 'x' } };
    expect(() => createProvider(s, deps)).toThrow(SynthesisError);
  });
});
