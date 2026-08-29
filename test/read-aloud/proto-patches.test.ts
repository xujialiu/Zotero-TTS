import { describe, expect, it, vi } from 'vitest';
import { createProtoPatches, type ProtoPatchDeps } from '../../src/read-aloud/proto-patches';

/**
 * A reader tab's prototype and the tab's close. Once the compartment is
 * nuked its wrapper answers identity and `typeof` and throws on every read
 * and write — measured live against `Cu.nukeSandbox` (issue #5), and the
 * error text is the one the console filled up with.
 */
function readerProto() {
  const own: Record<string, unknown> = { m: function original() {} };
  let alive = true;
  const guard = () => {
    if (!alive) throw new TypeError("can't access dead object");
  };
  const proto = new Proxy(own, {
    get: (target, key) => {
      guard();
      return target[key as string];
    },
    set: (target, key, value) => {
      guard();
      target[key as string] = value;
      return true;
    },
  });
  return { proto: proto as any, own, close: () => (alive = false) };
}

function make(overrides: Partial<ProtoPatchDeps> = {}) {
  const error = vi.fn();
  const dead = new Set<unknown>();
  const patches = createProtoPatches({ error, isDead: (p) => dead.has(p), ...overrides });
  return { patches, error, dead };
}

const liveProto = () => ({ m: function original() {} }) as any;

describe('createProtoPatches', () => {
  it('shadows a method and puts the original back', () => {
    const { patches, error } = make();
    const proto = liveProto();
    const original = proto.m;

    patches.shadow(proto, 'm', (o) =>
      function wrapper(this: unknown, ...args: unknown[]) {
        return Reflect.apply(o, this, args);
      },
    );
    expect(proto.m).not.toBe(original);

    patches.restoreAll();
    expect(proto.m).toBe(original);
    expect(error).not.toHaveBeenCalled();
  });

  it('patches a (prototype, method) pair once, however often attach runs', () => {
    const { patches } = make();
    const proto = liveProto();
    const wrap = vi.fn((o: any) => o);

    patches.shadow(proto, 'm', wrap);
    patches.shadow(proto, 'm', wrap);
    patches.shadow(proto, 'm', wrap);

    expect(wrap).toHaveBeenCalledTimes(1);
    expect(patches.counts()).toEqual({ total: 1, live: 1 });
  });

  it('answers has() by prototype, and by prototype and name', () => {
    const { patches } = make();
    const proto = liveProto();
    patches.shadow(proto, 'm', (o) => o);

    expect(patches.has(proto)).toBe(true);
    expect(patches.has(proto, 'm')).toBe(true);
    expect(patches.has(proto, 'other')).toBe(false);
    expect(patches.has(liveProto())).toBe(false);
  });

  it("exports the wrapper into the reader's compartment when exportFunction is given", () => {
    const exported = function exportedWrapper() {};
    const exportFunction = vi.fn(() => exported);
    const { patches } = make({ exportFunction });
    const proto = liveProto();

    patches.shadow(proto, 'm', (o) => o);

    expect(exportFunction).toHaveBeenCalledTimes(1);
    expect(proto.m).toBe(exported);
  });

  it('restores the prototypes of open tabs and skips the closed ones in silence', () => {
    const { patches, error, dead } = make();
    const open = liveProto();
    const original = open.m;
    const closed = readerProto();

    patches.shadow(closed.proto, 'm', (o) => o);
    patches.shadow(open, 'm', (o) => o);
    closed.close();
    dead.add(closed.proto);

    patches.restoreAll();

    expect(open.m).toBe(original);
    // Nothing was assigned through the dead wrapper, so nothing threw and
    // nothing was logged — the console stays for real failures
    expect(error).not.toHaveBeenCalled();
    expect(patches.counts()).toEqual({ total: 0, live: 0 });
  });

  it('drops the entries of closed tabs at the next attach, so the log follows the open tabs', () => {
    const { patches, dead } = make();
    const first = readerProto();
    const second = liveProto();

    patches.shadow(first.proto, 'm', (o) => o);
    expect(patches.counts()).toEqual({ total: 1, live: 1 });

    first.close();
    dead.add(first.proto);
    expect(patches.counts()).toEqual({ total: 1, live: 0 });

    patches.shadow(second, 'm', (o) => o);
    expect(patches.counts()).toEqual({ total: 1, live: 1 });
  });

  it('still reports a failure that is not a closed tab', () => {
    const { patches, error } = make();
    const proto = liveProto();
    patches.shadow(proto, 'm', (o) => o);
    Object.freeze(proto);

    patches.restoreAll();

    expect(error).toHaveBeenCalledTimes(1);
  });

  it('restores when the liveness check itself is broken, as it did before there was one', () => {
    const { patches, error } = make({
      isDead: () => {
        throw new Error('no isDeadWrapper here');
      },
    });
    const proto = liveProto();
    const original = proto.m;
    patches.shadow(proto, 'm', () => function wrapper() {});

    patches.restoreAll();

    expect(proto.m).toBe(original);
    expect(error).not.toHaveBeenCalled();
  });

  it('treats every prototype as alive when no liveness check is injected', () => {
    const error = vi.fn();
    const patches = createProtoPatches({ error });
    const proto = liveProto();
    const original = proto.m;
    patches.shadow(proto, 'm', () => function wrapper() {});

    patches.restoreAll();

    expect(proto.m).toBe(original);
  });

  it('empties the log and is safe to run twice', () => {
    const { patches } = make();
    const proto = liveProto();
    patches.shadow(proto, 'm', (o) => o);

    patches.restoreAll();
    expect(patches.counts()).toEqual({ total: 0, live: 0 });
    expect(() => patches.restoreAll()).not.toThrow();
  });
});
