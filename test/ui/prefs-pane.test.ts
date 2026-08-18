import { describe, expect, it, vi } from 'vitest';
import { SynthesisError } from '../../src/core/providers/errors';
import type { TTSProvider } from '../../src/core/providers/types';
import { engineOptions, highlightCapabilityLabel, testConnection } from '../../src/ui/prefs-pane';

describe('engineOptions', () => {
  it('is rendered from the registry rather than hard-coded', () => {
    expect(engineOptions()).toEqual([{ value: 'kokoro', label: 'Kokoro-FastAPI' }]);
  });
});

describe('highlightCapabilityLabel', () => {
  // 这是设置面板里"仅句级高亮 / 词级高亮"那行字的来源
  it('reports sentence for OpenAI and word for Azure', () => {
    expect(highlightCapabilityLabel('openai', 'kokoro')).toBe('sentence');
    expect(highlightCapabilityLabel('azure', 'kokoro')).toBe('word');
  });

  it('reports the capability of the selected local engine', () => {
    expect(highlightCapabilityLabel('local', 'kokoro')).toBe('word');
  });

  it('reports sentence when the local engine is unknown', () => {
    expect(highlightCapabilityLabel('local', 'piper')).toBe('sentence');
  });
});

describe('testConnection', () => {
  const provider = (listVoices: () => Promise<any>) =>
    ({ id: 'local', capabilities: { wordTimestamps: true }, listVoices, synthesize: vi.fn() }) as unknown as TTSProvider;

  it('reports how many voices were found on success', async () => {
    const result = await testConnection(provider(async () => [{ id: 'a', label: 'a', locale: 'en-US' }]));
    expect(result.ok).toBe(true);
    expect(result.message).toContain('1');
  });

  it('surfaces a local server being down as its own message', async () => {
    const result = await testConnection(
      provider(async () => {
        throw new SynthesisError('local-server-down');
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not running|未启动/i);
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
});
