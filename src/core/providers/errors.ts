export type SynthesisErrorKind =
  | 'no-key'
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
 * 收敛到 Zotero 原生 Read Aloud UI 认识的错误字符串
 * （syncAPIClient.js:715-733）。细节由调用方另行记日志 —— 这里
 * 必然丢失信息，因为原生 UI 的词汇表就这么大。
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
