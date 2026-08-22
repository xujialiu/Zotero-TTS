import { describe, expect, it } from 'vitest';
import { normalizeBaseURL } from '../../../src/core/providers/base-url';

describe('normalizeBaseURL', () => {
  it('leaves a plain origin alone', () => {
    expect(normalizeBaseURL('https://api.openai.com')).toBe('https://api.openai.com');
    expect(normalizeBaseURL('http://localhost:8880')).toBe('http://localhost:8880');
  });

  // The OpenAI SDK documents base_url="http://localhost:8880/v1"; the
  // plugin appends /v1/... itself, so that suffix must go
  it('drops the /v1 suffix the OpenAI SDK expects, with or without a trailing slash', () => {
    expect(normalizeBaseURL('http://localhost:8880/v1')).toBe('http://localhost:8880');
    expect(normalizeBaseURL('http://localhost:8880/v1/')).toBe('http://localhost:8880');
    expect(normalizeBaseURL('https://proxy.example.com/openai/V1')).toBe('https://proxy.example.com/openai');
  });

  it('drops trailing slashes and surrounding whitespace', () => {
    expect(normalizeBaseURL('https://api.openai.com/')).toBe('https://api.openai.com');
    expect(normalizeBaseURL('  https://api.openai.com//  ')).toBe('https://api.openai.com');
  });

  it('keeps a path that merely ends in v1 as part of a longer word', () => {
    expect(normalizeBaseURL('https://example.com/apiv1')).toBe('https://example.com/apiv1');
  });
});
