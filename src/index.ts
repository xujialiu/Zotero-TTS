import { getChromeWebSocket, newRequestId } from './core/providers/azure';
import { createProvider } from './core/providers/factory';
import type { ProviderId, SynthesisResult, VoiceInfo } from './core/providers/types';
import { createZoteroPrefs, loadSettings } from './core/settings';
import { installHijack } from './modes/hijack';
import { createRemoteInterface, type AudioCache, type RemoteInterface } from './modes/hijack/remote-interface';
import { onPaneLoad, registerPrefsPane } from './ui/prefs-pane';

export interface StartupParams {
  id: string;
  version: string;
  rootURI: string;
}

let uninstallHijack: (() => void) | null = null;
let pluginVersion = '0.0.0';

const prefs = createZoteroPrefs();

/** 缓存键含配置指纹，改了服务商或音色后旧音频自动失效。 */
function cacheVersion(): string {
  const s = loadSettings(prefs);
  return [pluginVersion, s.provider, s.openai.model, s.azure.region, s.local.engine, s.local.baseURL].join('|');
}

/**
 * `caches` 不在插件沙箱的全局白名单里（spec §2.10），从 reader 所在的
 * chrome 窗口取。取不到就不缓存 —— 少一层缓存不影响正确性。
 */
function makeCache(win: any): AudioCache | undefined {
  if (!win?.caches) return undefined;
  const opened = win.caches.open('zotero-tts');
  const urlFor = (key: string) => 'https://zotero-tts.invalid/audio?k=' + encodeURIComponent(key);

  return {
    async match(key) {
      try {
        const cache = await opened;
        const hit = await cache.match(urlFor(key));
        if (!hit) return null;
        const header = hit.headers.get('X-ZTTS-Timestamps');
        return {
          audio: await hit.blob(),
          timestamps: header ? JSON.parse(header) : undefined,
        } as SynthesisResult;
      } catch (e) {
        Zotero.logError(e);
        return null;
      }
    },
    async put(key, value) {
      try {
        const cache = await opened;
        const headers: Record<string, string> = {};
        if (value.timestamps) headers['X-ZTTS-Timestamps'] = JSON.stringify(value.timestamps);
        await cache.put(urlFor(key), new win.Response(value.audio, { headers }));
      } catch (e) {
        Zotero.logError(e);
      }
    },
  };
}

function providerDeps() {
  return { fetch, getWebSocket: getChromeWebSocket, newRequestId };
}

async function listCatalog(): Promise<{ provider: ProviderId; voices: VoiceInfo[] }[]> {
  const settings = loadSettings(prefs);
  const provider = createProvider(settings, providerDeps());
  return [{ provider: settings.provider, voices: await provider.listVoices() }];
}

function startHijack(): void {
  uninstallHijack?.();
  // makeInterface 在 Zotero 调用时才执行，targetWindow 是它传进来的
  // reader iframe window —— push 时它还不存在（见 Task 13）。
  uninstallHijack = installHijack(Zotero.Reader._readers, (reader: any, targetWindow: any) =>
    wrapForWindow(
      targetWindow,
      createRemoteInterface({
        listCatalog,
        // 必须尊重传入的 id：Zotero 会记住上次选的音色，用户在设置里换了
        // 服务商之后，残留的选择仍可能指向另一个 provider。
        getProvider: (id) => createProvider({ ...loadSettings(prefs), provider: id }, providerDeps()),
        getSpeed: () => loadSettings(prefs).speed,
        cacheVersion,
        cache: makeCache(reader._window),
        log: (e) => Zotero.logError(e),
        // AbortController is not on the sandbox whitelist (spec §2.10); take
        // it from the reader's chrome window, the same way WebSocket and
        // caches are obtained. Per call, never cached, so a closed window is
        // never retained.
        newAbortController: () => new reader._window.AbortController(),
      }),
    ),
  );
}

/**
 * Zotero 原生实现把每个返回值包成 `new targetWindow.Promise(...)` 并
 * `Cu.cloneInto` 到 reader iframe，否则跨作用域读取会触发权限错误
 * （reader.js:1746 的注释）。我们的接口是普通 Promise，在这里补上同样的包装。
 */
function wrapForWindow(targetWindow: any, iface: RemoteInterface): unknown {
  const Cu = Components.utils;
  const wrapped: Record<string, unknown> = {};
  // RemoteInterface 是具名 interface，没有索引签名，不能直接赋给
  // Record<string, ...>，所以这里显式转一次再遍历。
  const methods = iface as unknown as Record<string, (...args: any[]) => Promise<any>>;
  for (const [name, fn] of Object.entries(methods)) {
    wrapped[name] = (...args: any[]) =>
      new targetWindow.Promise((resolve: (v: unknown) => void) => {
        fn(...args)
          .then((result) => resolve(Cu.cloneInto(result, targetWindow, { cloneFunctions: false })))
          .catch((e) => {
            Zotero.logError(e);
            resolve(Cu.cloneInto({ error: 'unknown' }, targetWindow));
          });
      });
  }
  return wrapped;
}

async function startup({ id, version, rootURI }: StartupParams): Promise<void> {
  pluginVersion = version;
  await registerPrefsPane(rootURI, id);

  // 主动捕获：_readers 或其它我们伸手进去的 Zotero 内部一旦改名/挪动就会
  // 在这里抛出。不接住的话 startup() 会 reject 且没有任何提示 ——
  // 设置面板已经注册好、看着正常，朗读却悄无声息地不出音色。宁可劫持
  // 装不上，也要让插件的其余部分（至少是设置面板）照常可用。
  try {
    startHijack();
  } catch (e) {
    Zotero.logError(e);
    Zotero.debug('[zotero-tts] failed to install the Read Aloud hook');
  }
  Zotero.debug('[zotero-tts] started');
}

async function shutdown(): Promise<void> {
  uninstallHijack?.();
  uninstallHijack = null;
  Zotero.debug('[zotero-tts] stopped');
}

Zotero.ZoteroTTS = { startup, shutdown, prefsPane: { onPaneLoad } };
