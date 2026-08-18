import type { TTSProvider } from '../types';
import { kokoroAdapter } from './kokoro';

export type LocalEngineAdapter = {
  id: string;
  label: string;
  defaultBaseURL: string;
  capabilities: { wordTimestamps: boolean };
  create(baseURL: string, deps: { fetch: typeof fetch }): TTSProvider;
};

/**
 * 新增一个本地引擎 = 写一个适配器文件 + 在这里加一行。
 * 设置面板从这个数组渲染下拉，不写死任何引擎名。
 */
export const LOCAL_ENGINES: readonly LocalEngineAdapter[] = [kokoroAdapter];

export function getLocalEngine(id: string): LocalEngineAdapter | undefined {
  return LOCAL_ENGINES.find((e) => e.id === id);
}
