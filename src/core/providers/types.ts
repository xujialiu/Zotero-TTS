export type ProviderId = 'openai' | 'azure' | 'local';

/**
 * 形状照抄 Zotero 原生（spec §2.2），使劫持模式可零转换透传。
 * start/end 单位为秒；charStart/charEnd 是段文本内的字符偏移。
 */
export type Timestamp = {
  start: number;
  end: number;
  charStart: number;
  charEnd: number;
};

export type SynthesisResult = {
  audio: Blob;
  /** 省略即表示该 provider 无词级时间戳，高亮自动退回句级。绝不插值估算。 */
  timestamps?: Timestamp[];
};

export type VoiceInfo = {
  /** provider 内的原始 id，不含 provider 前缀 */
  id: string;
  label: string;
  /** BCP-47 */
  locale: string;
};

export type SynthesisOptions = {
  voice: string;
  speed: number;
  signal: AbortSignal;
};

export interface TTSProvider {
  readonly id: ProviderId;
  readonly capabilities: { wordTimestamps: boolean };
  listVoices(): Promise<VoiceInfo[]>;
  synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult>;
}
