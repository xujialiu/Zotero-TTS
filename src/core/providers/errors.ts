export type SynthesisErrorKind =
  | 'no-key'
  /** The server answered 401/403: the key is wrong, expired, or not authorised. */
  | 'auth'
  | 'network'
  | 'local-server-down'
  | 'rate-limit'
  | 'quota'
  | 'decode-failed'
  | 'unknown';

const RETRIABLE: ReadonlySet<SynthesisErrorKind> = new Set([
  'network',
  'rate-limit',
  'local-server-down',
]);

export class SynthesisError extends Error {
  readonly kind: SynthesisErrorKind;
  readonly retriable: boolean;

  constructor(kind: SynthesisErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'SynthesisError';
    this.kind = kind;
    this.retriable = RETRIABLE.has(kind);
  }
}

/**
 * Collapse down to the error strings the native Zotero Read Aloud UI
 * recognizes (syncAPIClient.js:715-733). Details are logged separately
 * by the caller — some information loss here is unavoidable, because
 * the native UI's vocabulary is only this large.
 */
export function toZoteroError(e: unknown): 'network' | 'quota-exceeded' | 'unknown' {
  if (!(e instanceof SynthesisError)) return 'unknown';
  switch (e.kind) {
    case 'network':
    case 'local-server-down':
      return 'network';
    case 'quota':
    case 'rate-limit':
      return 'quota-exceeded';
    default:
      return 'unknown';
  }
}
