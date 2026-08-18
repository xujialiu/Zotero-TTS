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
  /** 只在 probeZotero() 探测途中抛出时才有值；此时 env 里已经填好的字段仍
   *  按原样上报，抛出之后的字段保持 null。 */
  error?: string;
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
/** probeZotero() 的 catch 写入，供下一次 refreshReport() 落盘时带上。 */
let lastError: string | undefined;

/**
 * PDF 视图是 reader iframe 里的嵌套 iframe，它在 _getReadAloudRemoteInterface
 * 被调用的那一刻还没渲染出来，所以这一项只能事后从已打开的 reader 上查。
 *
 * 一个库里可能同时开着好几个 reader 标签（还可能混着 EPUB 等非 PDF 阅读器），
 * 第一个不一定是想问的那个，所以要扫描全部 reader：任意一个 frame 具备高亮
 * API 就算 true；至少摸到了一个 frame 但没有一个具备就算 false；一个 frame
 * 都摸不到则老实报 null —— 不能冒充"检查过"。不尝试判断 reader 类型，那需要
 * 一个尚未验证过的 API。
 */
function checkPdfFrame(): boolean | null {
  let inspected = false;
  for (const reader of Zotero.Reader._readers ?? []) {
    const pdfWin = reader?._iframeWindow?.document?.querySelector('iframe')?.contentWindow;
    if (!pdfWin) continue;
    inspected = true;
    if (typeof pdfWin.CSS?.highlights === 'object' && typeof pdfWin.Highlight === 'function') {
      return true;
    }
  }
  return inspected ? false : null;
}

/** 重新探一遍随时间变化的项，然后落盘。可从 Run JavaScript 手动调用。 */
export async function refreshReport(): Promise<ProbeReport> {
  env.highlightApiInPdfFrame = checkPdfFrame();
  const report = runProbe(env);
  if (lastError) report.error = lastError;
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
 * 整个函数体包一层 try/catch：探测代码问的就是没人验证过的真实环境，半路
 * 抛出是预期状况之一。抛出时也要把已经探到的部分连同错误信息落盘——写不出
 * 报告，人没法诊断；报告里全是 null 但带着 error，人至少能看懂发生了什么。
 *
 * 只在任务 2 期间存在，验证完随 src/probe.ts 一并删除。
 */
export async function probeZotero(): Promise<void> {
  try {
    reportPath = PathUtils.join(Zotero.DataDirectory.dir, 'zotero-tts-probe.json');

    env.segmenterInBootstrap = typeof (globalThis as any).Intl?.Segmenter === 'function';

    try {
      const win = Zotero.getMainWindow() ?? Services.wm.getMostRecentWindow(null);
      env.webSocketCtorObtained = typeof win?.WebSocket === 'function';
    } catch {
      // 保持 null（"没能成功探到"），不要设成 false（"探到了、不支持"）——
      // 这里的异常只说明我们不知道，不代表 WebSocket 真的不存在。runProbe
      // 里 null 和 false 同样算失败，这个区分只是让人看 JSON 时知道真相。
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
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    await refreshReport();
  }
}

export function stopProbe(): void {
  uninstall?.();
  uninstall = null;
}
