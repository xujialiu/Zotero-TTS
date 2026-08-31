import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'addon', 'bootstrap.js'), 'utf8');

type Instance = {
  startup: ReturnType<typeof vi.fn>;
  shutdown: ReturnType<typeof vi.fn>;
  onMainWindowLoad: ReturnType<typeof vi.fn>;
  onMainWindowUnload: ReturnType<typeof vi.fn>;
};

type Bootstrap = {
  startup(params: unknown, reason?: unknown): Promise<void>;
  shutdown(params: unknown, reason?: unknown): Promise<void>;
  onMainWindowLoad(params: { window: unknown }): void;
  onMainWindowUnload(params: { window: unknown }): void;
};

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * The bootstrap evaluated the way Zotero's plugin sandbox evaluates it —
 * its two globals injected — with every loadSubScript minting a fresh
 * instance and assigning it to Zotero.ZoteroTTS, as the real bundle does
 * at module evaluation.
 */
function load() {
  const Zotero: Record<string, any> = { logError: vi.fn() };
  const instances: Instance[] = [];
  const events: string[] = [];
  const Services = {
    scriptloader: {
      loadSubScript: vi.fn(() => {
        const n = instances.length;
        const instance: Instance = {
          startup: vi.fn(async () => void events.push(`start ${n}`)),
          shutdown: vi.fn(async () => void events.push(`stop ${n}`)),
          onMainWindowLoad: vi.fn(),
          onMainWindowUnload: vi.fn(),
        };
        instances.push(instance);
        Zotero.ZoteroTTS = instance;
      }),
    },
  };
  const factory = new Function('Zotero', 'Services', `${source}\nreturn { startup, shutdown, onMainWindowLoad, onMainWindowUnload };`);
  const bootstrap = factory(Zotero, Services) as Bootstrap;
  return { Zotero, Services, instances, events, bootstrap };
}

const params = { id: 'zotero-tts@xujialiu.top', version: '1.10.1', rootURI: 'file:///plugin/' };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('addon/bootstrap.js', () => {
  it('loads the bundle and starts the instance; shutdown stops it and clears the global', async () => {
    const { Zotero, Services, instances, bootstrap } = load();
    await bootstrap.startup(params, 'ADDON_INSTALL');
    expect(Services.scriptloader.loadSubScript).toHaveBeenCalledWith('file:///plugin/content/zotero-tts.js');
    expect(instances[0].startup).toHaveBeenCalledWith(params);
    expect(Zotero.ZoteroTTS).toBe(instances[0]);

    await bootstrap.shutdown(params, 'ADDON_DISABLE');
    expect(instances[0].shutdown).toHaveBeenCalledTimes(1);
    // The reason travels: shutdown behaves differently for a disable (hand
    // the open tabs back to Zotero) than for an upgrade, where the successor
    // redelivers the interface itself (issue #38)
    expect(instances[0].shutdown).toHaveBeenCalledWith('ADDON_DISABLE');
    expect(Zotero.ZoteroTTS).toBeUndefined();
    expect(Zotero.ZoteroTTSPendingShutdown).toBeUndefined();
  });

  // Issue #28: Zotero runs a reload as a disable and an enable whose
  // listeners do not wait for each other, so the old instance's shutdown
  // was still pending when the new bundle took the global — and cleared it
  // when it finished, leaving an instance nobody could ever stop again
  it('holds a new startup until the pending shutdown settles, and leaves the new instance’s global alone', async () => {
    const { Zotero, Services, instances, events, bootstrap } = load();
    await bootstrap.startup(params);
    const old = instances[0];
    const stopping = deferred();
    old.shutdown.mockImplementation(async () => {
      await stopping.promise;
      events.push('stop 0');
    });

    const shutdownDone = bootstrap.shutdown(params, 'ADDON_DISABLE');
    const startupDone = bootstrap.startup(params, 'ADDON_ENABLE');
    await tick();
    // The old instance is still stopping: no second bundle yet, its global still standing
    expect(Services.scriptloader.loadSubScript).toHaveBeenCalledTimes(1);
    expect(Zotero.ZoteroTTS).toBe(old);
    expect(Zotero.ZoteroTTSPendingShutdown).toBeInstanceOf(Promise);

    stopping.resolve();
    await shutdownDone;
    await startupDone;
    expect(instances).toHaveLength(2);
    expect(events).toEqual(['start 0', 'stop 0', 'start 1']);
    expect(Zotero.ZoteroTTS).toBe(instances[1]);
    expect(Zotero.ZoteroTTSPendingShutdown).toBeUndefined();

    // And the new instance can be stopped in its turn
    await bootstrap.shutdown(params);
    expect(instances[1].shutdown).toHaveBeenCalledTimes(1);
    expect(Zotero.ZoteroTTS).toBeUndefined();
  });

  it('logs a shutdown that fails, clears the global anyway, and still lets the next startup run', async () => {
    const { Zotero, instances, bootstrap } = load();
    await bootstrap.startup(params);
    const failure = new Error('database locked');
    instances[0].shutdown.mockImplementation(async () => {
      throw failure;
    });
    await expect(bootstrap.shutdown(params)).resolves.toBeUndefined();
    expect(Zotero.logError).toHaveBeenCalledWith(failure);
    expect(Zotero.ZoteroTTS).toBeUndefined();
    expect(Zotero.ZoteroTTSPendingShutdown).toBeUndefined();

    await bootstrap.startup(params);
    expect(instances).toHaveLength(2);
    expect(instances[1].startup).toHaveBeenCalledTimes(1);
  });

  it('treats a shutdown with no instance as nothing to do', async () => {
    const { Zotero, bootstrap } = load();
    await expect(bootstrap.shutdown(params)).resolves.toBeUndefined();
    expect(Zotero.ZoteroTTS).toBeUndefined();
    expect(Zotero.ZoteroTTSPendingShutdown).toBeUndefined();
    expect(Zotero.logError).not.toHaveBeenCalled();
  });

  it('forwards the main-window hooks to the instance, and to nobody when there is none', async () => {
    const { instances, bootstrap } = load();
    const window = { name: 'main' };
    expect(() => bootstrap.onMainWindowLoad({ window })).not.toThrow();
    expect(() => bootstrap.onMainWindowUnload({ window })).not.toThrow();
    await bootstrap.startup(params);
    bootstrap.onMainWindowLoad({ window });
    bootstrap.onMainWindowUnload({ window });
    expect(instances[0].onMainWindowLoad).toHaveBeenCalledWith(window);
    expect(instances[0].onMainWindowUnload).toHaveBeenCalledWith(window);
  });
});
