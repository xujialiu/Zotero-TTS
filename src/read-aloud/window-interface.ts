/**
 * The plugin's Read Aloud interface, wrapped for the reader window that
 * calls it.
 *
 * Zotero's own implementation wraps every return value in
 * `new targetWindow.Promise(...)` and `Cu.cloneInto`s it into the reader
 * iframe, because reading across scopes otherwise triggers a permission
 * error (comment at reader.js:1746). The plugin's interface returns a plain
 * Promise, so the same wrapping is added here.
 *
 * A result can land after the window is gone (issue #116). Zotero's
 * controller keeps up to three sentences of audio on the way
 * (`_prefetchFrom`: MAX_WINDOW 3, two requests at a time), nothing cancels
 * them when the popup closes or the tab does, and the browser element's
 * removal — a `setTimeout` after `Zotero_Tabs.close` — nukes the window.
 * Cloning into that window, or calling its `resolve`, throws `can't access
 * dead object`: two error-console lines per late result, for a result
 * nothing is waiting for. So a result whose window is dead is dropped —
 * not cloned, not resolved, not logged as an error — and counted, for
 * `diagnostics.patches().lateResults`. A failure that lands late is still
 * logged once, since it is real information about the provider, and then
 * dropped the same way.
 */
export interface WindowWrapperDeps {
  /** `Components.utils.cloneInto(value, target, { cloneFunctions: false })`. */
  cloneInto(value: unknown, target: unknown): unknown;
  /** `Components.utils.isDeadWrapper`. */
  isDead(value: unknown): boolean;
  error(e: unknown): void;
  debug?(message: string): void;
  /** Injected for the tests; `Date.now` otherwise. */
  now?(): number;
}

export interface LateResultsReport {
  /** Every result or failure dropped because its window was gone. */
  dropped: number;
  byMethod: Record<string, number>;
  /** The latest drops, oldest first, at most LATE_RESULTS_KEPT. */
  last: { method: string; at: string }[];
}

export interface WindowWrapper {
  /** The interface's methods, each answering with the window's own promise. */
  wrap(targetWindow: any, iface: object): unknown;
  report(): LateResultsReport;
}

/** How many of the latest drops the report keeps. */
export const LATE_RESULTS_KEPT = 10;

/**
 * One wrapper per plugin instance, shared by every reader: the report is
 * the instance's, since the reader a late result belonged to is gone by
 * the time it is counted.
 */
export function createWindowWrapper(deps: WindowWrapperDeps): WindowWrapper {
  let dropped = 0;
  const byMethod: Record<string, number> = {};
  const last: { method: string; at: string }[] = [];

  function drop(method: string, what: string): void {
    dropped++;
    byMethod[method] = (byMethod[method] ?? 0) + 1;
    last.push({ method, at: new Date(deps.now?.() ?? Date.now()).toISOString() });
    if (last.length > LATE_RESULTS_KEPT) last.splice(0, last.length - LATE_RESULTS_KEPT);
    deps.debug?.(`late ${what} dropped: ${method} answered after its reader window was gone`);
  }

  function wrap(targetWindow: any, iface: object): unknown {
    const wrapped: Record<string, unknown> = {};
    const methods = iface as Record<string, (...args: unknown[]) => Promise<unknown>>;
    for (const [name, fn] of Object.entries(methods)) {
      wrapped[name] = (...args: unknown[]) =>
        new targetWindow.Promise((resolve: (value: unknown) => void) => {
          fn(...args)
            .then((result) => {
              if (deps.isDead(targetWindow)) {
                drop(name, 'result');
                return;
              }
              resolve(deps.cloneInto(result, targetWindow));
            })
            .catch((e) => {
              deps.error(e);
              if (deps.isDead(targetWindow)) {
                drop(name, 'failure');
                return;
              }
              resolve(deps.cloneInto({ error: 'unknown' }, targetWindow));
            });
        });
    }
    return wrapped;
  }

  return {
    wrap,
    report: () => ({ dropped, byMethod: { ...byMethod }, last: [...last] }),
  };
}
