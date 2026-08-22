import { describe, expect, it, vi } from 'vitest';
import { SynthesisError } from '../../src/core/providers/errors';
import type { TTSProvider } from '../../src/core/providers/types';
import { engineOptions, rankModelsForSpeech, testConnection } from '../../src/ui/prefs-pane';

describe('engineOptions', () => {
  it('is rendered from the registry rather than hard-coded', () => {
    expect(engineOptions()).toEqual([{ value: 'kokoro', label: 'Kokoro-FastAPI' }]);
  });
});

describe('rankModelsForSpeech', () => {
  it('puts speech-related models first, each group alphabetical', () => {
    expect(rankModelsForSpeech(['gpt-4o', 'whisper-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'kokoro', 'babbage'])).toEqual([
      'gpt-4o-mini-tts',
      'kokoro',
      'tts-1-hd',
      'babbage',
      'gpt-4o',
      'whisper-1',
    ]);
  });
});

describe('testConnection', () => {
  const provider = (listVoices: () => Promise<any>) =>
    ({ id: 'local', capabilities: { wordTimestamps: true }, listVoices, synthesize: vi.fn() }) as unknown as TTSProvider;
  const oneVoice = async () => [{ id: 'a', label: 'a', locale: 'en-US' }];

  it('reports how many voices were found on success', async () => {
    const result = await testConnection(provider(oneVoice));
    expect(result.ok).toBe(true);
    expect(result.message).toContain('1');
    expect(result.models).toBeUndefined();
  });

  it('surfaces a local server being down as its own message', async () => {
    const result = await testConnection(
      provider(async () => {
        throw new SynthesisError('local-server-down');
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not running/i);
  });

  it('surfaces a missing key as its own message', async () => {
    const result = await testConnection(
      provider(async () => {
        throw new SynthesisError('no-key');
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/key/i);
  });

  it('never throws, so the button cannot break the pane', async () => {
    const result = await testConnection(
      provider(async () => {
        throw new Error('something odd');
      }),
    );
    expect(result.ok).toBe(false);
    expect(typeof result.message).toBe('string');
  });

  it("runs the provider's probe before listing voices, and reports a rejected key", async () => {
    const checkConnection = vi.fn(async () => {
      throw new SynthesisError('auth', 'the server rejected the API key (401)');
    });
    const listVoices = vi.fn(oneVoice);
    const result = await testConnection({ ...provider(listVoices), checkConnection } as TTSProvider);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/rejected/i);
    expect(listVoices).not.toHaveBeenCalled();
  });

  it('counts the voices only after the probe passes', async () => {
    const checkConnection = vi.fn(async () => {});
    const result = await testConnection({ ...provider(oneVoice), checkConnection } as TTSProvider);
    expect(checkConnection).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, models: undefined, message: 'Connected. 1 voices available.' });
  });

  // The server's model list doubles as the probe and as the source of the
  // suggestions under the Model field
  it('uses the model list as the probe and says whether the chosen model is listed', async () => {
    const listModels = vi.fn(async () => ['tts-1', 'gpt-4o-mini-tts']);
    const checkConnection = vi.fn(async () => {});
    const p = { ...provider(oneVoice), listModels, checkConnection } as TTSProvider;

    const available = await testConnection(p, { model: 'gpt-4o-mini-tts' });
    expect(available.ok).toBe(true);
    expect(available.models).toEqual(['tts-1', 'gpt-4o-mini-tts']);
    expect(available.message).toBe('Connected. Model gpt-4o-mini-tts available. 1 voices available.');
    expect(checkConnection).not.toHaveBeenCalled();

    const missing = await testConnection(p, { model: 'kokoro' });
    expect(missing.ok).toBe(true);
    expect(missing.message).toMatch(/"kokoro" is not listed/);
  });

  it('does not judge the model when the server lists none', async () => {
    const p = { ...provider(oneVoice), listModels: async () => [] } as TTSProvider;
    const result = await testConnection(p, { model: 'anything' });
    expect(result.message).toBe('Connected. 1 voices available.');
  });

  it('reports a rejected key from the model list', async () => {
    const p = {
      ...provider(oneVoice),
      listModels: async () => {
        throw new SynthesisError('auth', 'rejected (401)');
      },
    } as TTSProvider;
    const result = await testConnection(p, { model: 'tts-1' });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/rejected/i);
  });

  it('reports a server that never answers instead of waiting forever', async () => {
    const result = await testConnection(provider(() => new Promise(() => {})), { timeoutMs: 20 });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/cannot connect/i);
    expect(result.message).toMatch(/0 s/);
  });
});
