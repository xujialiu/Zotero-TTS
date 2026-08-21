import { describe, expect, it } from 'vitest';
import { SynthesisError, toZoteroError } from '../../../src/core/providers/errors';

describe('SynthesisError', () => {
  it('marks transient failures as retriable', () => {
    expect(new SynthesisError('network').retriable).toBe(true);
    expect(new SynthesisError('rate-limit').retriable).toBe(true);
    expect(new SynthesisError('local-server-down').retriable).toBe(true);
  });

  it('marks configuration and data failures as not retriable', () => {
    expect(new SynthesisError('no-key').retriable).toBe(false);
    expect(new SynthesisError('decode-failed').retriable).toBe(false);
  });

  it('uses the kind as the message when none is given', () => {
    expect(new SynthesisError('no-key').message).toBe('no-key');
    expect(new SynthesisError('no-key', 'set an API key').message).toBe('set an API key');
  });
});

describe('toZoteroError', () => {
  // The native Zotero UI only recognizes these few strings (syncAPIClient.js:715-733)
  it('maps connectivity failures to network', () => {
    expect(toZoteroError(new SynthesisError('network'))).toBe('network');
    expect(toZoteroError(new SynthesisError('local-server-down'))).toBe('network');
  });

  it('maps limit failures to quota-exceeded', () => {
    expect(toZoteroError(new SynthesisError('quota'))).toBe('quota-exceeded');
    expect(toZoteroError(new SynthesisError('rate-limit'))).toBe('quota-exceeded');
  });

  it('maps anything else to unknown', () => {
    expect(toZoteroError(new SynthesisError('no-key'))).toBe('unknown');
    expect(toZoteroError(new Error('boom'))).toBe('unknown');
    expect(toZoteroError('not even an error')).toBe('unknown');
  });
});
