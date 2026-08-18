/** null 表示"没探到"，与 false 一样算失败 —— 见 test。 */
export type ProbeEnv = {
  hookFiredBeforeInterfaceRead: boolean | null;
  segmenterInBootstrap: boolean | null;
  segmenterInReaderFrame: boolean | null;
  highlightApiInPdfFrame: boolean | null;
  webSocketCtorObtained: boolean | null;
};

export type ProbeReport = {
  ok: boolean;
  failures: string[];
  env: ProbeEnv;
};

export function runProbe(env: ProbeEnv): ProbeReport {
  const failures = (Object.keys(env) as (keyof ProbeEnv)[]).filter((k) => env[k] !== true);
  return { ok: failures.length === 0, failures, env };
}

declare const PathUtils: any;
declare const IOUtils: any;

const env: ProbeEnv = {
  hookFiredBeforeInterfaceRead: null,
  segmenterInBootstrap: null,
  segmenterInReaderFrame: null,
  highlightApiInPdfFrame: null,
  webSocketCtorObtained: null,
};

let reportPath = '';
let uninstall: (() => void) | null = null;

/**
 * PDF 视图是 reader iframe 里的嵌套 iframe，它在 _getReadAloudRemoteInterface
 * 被调用的那一刻还没渲染出来，所以这一项只能事后从已打开的 reader 上查。
 */
function checkPdfFrame(): boolean | null {
  for (const reader of Zotero.Reader._readers ?? []) {
    const pdfWin = reader?._iframeWindow?.document?.querySelector('iframe')?.contentWindow;
    if (!pdfWin) continue;
    return typeof pdfWin.CSS?.highlights === 'object' && typeof pdfWin.Highlight === 'function';
  }
  return null;
}

/** 重新探一遍随时间变化的项，然后落盘。可从 Run JavaScript 手动调用。 */
export async function refreshReport(): Promise<ProbeReport> {
  env.highlightApiInPdfFrame = checkPdfFrame();
  const report = runProbe(env);
  await IOUtils.writeJSON(reportPath, report);
  Zotero.debug('[zotero-tts] probe report written to ' + reportPath);
  return report;
}

/**
 * 在真实 Zotero 中执行探测。
 *
 * 钩子装上之后**不拆**，一直留到插件关闭 —— 只有这样才能观察到
 * "之后新开一篇 PDF 时，Zotero 是否真的读到了我们装上去的方法"。
 * 装完就拆的话，中间没有任何 reader 会被创建，这一项永远探不到。
 *
 * 只在任务 2 期间存在，验证完随 src/probe.ts 一并删除。
 */
export async function probeZotero(): Promise<void> {
  reportPath = PathUtils.join(Zotero.DataDirectory.dir, 'zotero-tts-probe.json');

  env.segmenterInBootstrap = typeof (globalThis as any).Intl?.Segmenter === 'function';

  try {
    const win = Zotero.getMainWindow() ?? Services.wm.getMostRecentWindow(null);
    env.webSocketCtorObtained = typeof win?.WebSocket === 'function';
  } catch {
    env.webSocketCtorObtained = false;
  }

  const readers = Zotero.Reader._readers;
  const origPush = readers.push;
  readers.push = function (this: any[], ...items: any[]): number {
    for (const reader of items) {
      // 签名与原生一致（reader.js:267 传入 this._iframeWindow）
      reader._getReadAloudRemoteInterface = function (targetWindow: any) {
        env.hookFiredBeforeInterfaceRead = true;
        env.segmenterInReaderFrame = typeof targetWindow?.Intl?.Segmenter === 'function';
        // 等 PDF 子 iframe 渲染出来再补写一次报告
        setTimeout(() => void refreshReport(), 3000);
        void refreshReport();
        return null; // null 是原生也会返回的值，Zotero 会走"无远程语音"分支
      };
    }
    return origPush.apply(this, items);
  };
  uninstall = () => {
    readers.push = origPush;
  };

  await refreshReport();
}

export function stopProbe(): void {
  uninstall?.();
  uninstall = null;
}
