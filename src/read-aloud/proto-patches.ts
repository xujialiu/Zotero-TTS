/**
 * The undo log for the reader-side prototypes this plugin shadows —
 * highlight-style.ts, system-voices.ts, multilingual-first.ts and
 * memory-sync.ts each own one.
 *
 * Zotero gives every reader tab its own copy of the reader bundle, so the
 * classes, and with them the prototypes, are per tab: `attach(reader)`
 * patches again on every tab and records the patch so `dispose()` can undo
 * it at shutdown. A tab's prototype lives in the tab's compartment, which
 * is nuked when the tab closes — every entry of a closed tab is then a
 * dead object, and `proto[name] = original` throws
 * `TypeError: can't access dead object`. Caught, so nothing broke, but the
 * error console filled up on every plugin upgrade, reload and quit, which
 * is exactly when a real error most needs to be visible (issue #5).
 *
 * The liveness test is `Components.utils.isDeadWrapper`, injected as
 * `isDead`. Measured live (Zotero 10.0.2-beta.1 / Firefox 140) against a
 * nuked sandbox: it goes true the moment the compartment dies, while
 * `WeakRef.deref()` keeps handing back a dead wrapper until a GC actually
 * collects it — so a WeakRef would not have silenced anything. Identity
 * (`===`) is safe on a dead wrapper, which is why the dedup scan below can
 * compare against entries whose tab is long gone.
 *
 * `shadow()` compacts the log first, so it stays proportional to the tabs
 * that are *open* and a dead entry releases its captured original at the
 * next attach rather than at the next GC.
 */

export type AnyFn = (...args: any[]) => any;

export interface ProtoPatchDeps {
  /** Makes a sandbox function callable from the reader's compartment (Components.utils.exportFunction). Optional for tests. */
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  /** Components.utils.isDeadWrapper — true once the tab that owned the prototype is gone. Optional: without it nothing is ever dead, which is what the unit tests want. */
  isDead?(value: unknown): boolean;
  error(e: unknown): void;
}

export interface ProtoPatches {
  /** Replace `proto[name]` with `make(original)`, unless this log already holds that pair. */
  shadow(proto: any, name: string, make: (original: AnyFn) => AnyFn): void;
  /**
   * The same for a **getter**: `BrowserReadAloudVoice.label` is an accessor
   * (reader.js:39629), and a property that has only a getter ignores the
   * assignment `shadow` makes — restoring it by assignment would not work
   * either. So the accessor is replaced through its descriptor, and it is
   * that descriptor `restoreAll` puts back. Nothing happens, and nothing is
   * recorded, when `name` is not an accessor of `proto` itself.
   */
  shadowGetter(proto: any, name: string, make: (originalGet: AnyFn) => AnyFn): void;
  /** Whether this log already patched `proto` — any method of it, or `name` alone. */
  has(proto: unknown, name?: string): boolean;
  /** Put back every prototype whose tab is still open; drop the rest without a word. */
  restoreAll(): void;
  /** Entries held, and how many of them are still restorable. Reported by diagnostics. */
  counts(): { total: number; live: number };
}

export function createProtoPatches(deps: ProtoPatchDeps): ProtoPatches {
  // `undo` rather than the original itself: a method goes back by
  // assignment, an accessor only through its descriptor
  const entries: Array<{ proto: any; name: string; undo(): void }> = [];

  // A throw here means the check itself is missing or broken, not that the
  // tab is gone: fall back to "alive", which is the restore-and-log
  // behavior this log had before there was a check at all.
  const isDead = (proto: unknown): boolean => {
    try {
      return deps.isDead ? !!deps.isDead(proto) : false;
    } catch {
      return false;
    }
  };

  function prune(): void {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (isDead(entries[i].proto)) entries.splice(i, 1);
    }
  }

  function has(proto: unknown, name?: string): boolean {
    // Identity only: comparing a dead wrapper is safe, reading through it is not
    return entries.some((e) => e.proto === proto && (name === undefined || e.name === name));
  }

  const exported = (fn: AnyFn, proto: any): AnyFn => (deps.exportFunction ? deps.exportFunction(fn, proto) : fn);

  function shadow(proto: any, name: string, make: (original: AnyFn) => AnyFn): void {
    prune();
    if (has(proto, name)) return;
    const original = proto[name] as AnyFn;
    proto[name] = exported(make(original), proto);
    entries.push({
      proto,
      name,
      undo: () => {
        proto[name] = original;
      },
    });
  }

  function shadowGetter(proto: any, name: string, make: (originalGet: AnyFn) => AnyFn): void {
    prune();
    if (has(proto, name)) return;
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    const original = descriptor?.get;
    if (!descriptor || typeof original !== 'function') return;
    Object.defineProperty(proto, name, { ...descriptor, get: exported(make(original), proto) });
    entries.push({ proto, name, undo: () => Object.defineProperty(proto, name, descriptor) });
  }

  function restoreAll(): void {
    for (const { proto, undo } of [...entries].reverse()) {
      if (isDead(proto)) continue;
      try {
        undo();
      } catch (e) {
        deps.error(e);
      }
    }
    entries.length = 0;
  }

  function counts(): { total: number; live: number } {
    let live = 0;
    for (const entry of entries) if (!isDead(entry.proto)) live += 1;
    return { total: entries.length, live };
  }

  return { shadow, shadowGetter, has, restoreAll, counts };
}
