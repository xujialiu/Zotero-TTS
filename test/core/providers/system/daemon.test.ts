import { describe, expect, it, vi } from 'vitest';
import { createDaemon, MAX_STARTS, type DaemonProcess } from '../../../../src/core/providers/system/daemon';
import { decodeFrameBody, decodeFrameLength, type SystemResponse } from '../../../../src/core/providers/system/protocol';

/**
 * A helper process on two byte queues. `read(length)` resolves only once
 * that many bytes are there, exactly as Subprocess's pipe does, so the
 * framing in protocol.ts is exercised for real rather than mocked away.
 */
function fakeProcess() {
  let out: number[] = [];
  const waiting: { length: number; resolve(bytes: Uint8Array): void; reject(e: unknown): void }[] = [];
  const written: unknown[] = [];
  let closed: Error | null = null;
  let killed = 0;

  const pump = () => {
    while (waiting.length && out.length >= waiting[0].length) {
      const next = waiting.shift()!;
      next.resolve(new Uint8Array(out.splice(0, next.length)));
    }
    if (closed) for (const w of waiting.splice(0)) w.reject(closed);
  };

  const process: DaemonProcess = {
    write: async (bytes) => {
      const length = decodeFrameLength(bytes.slice(0, 4));
      written.push(JSON.parse(new TextDecoder().decode(bytes.slice(4, 4 + length))));
    },
    read: (length) =>
      new Promise<Uint8Array>((resolve, reject) => {
        waiting.push({ length, resolve, reject });
        pump();
      }),
    kill: () => {
      killed += 1;
      closed = new Error('killed');
      pump();
    },
  };

  return {
    process,
    written,
    killed: () => killed,
    /** Queue one reply, framed the way the helper frames it. */
    reply(response: SystemResponse | Record<string, unknown>) {
      const body = new TextEncoder().encode(JSON.stringify(response));
      const head = new Uint8Array(4);
      new DataView(head.buffer).setUint32(0, body.length, true);
      out = [...out, ...head, ...body];
      pump();
    },
    /** Half a header, to prove a partial read is not mistaken for a message. */
    raw(bytes: number[]) {
      out = [...out, ...bytes];
      pump();
    },
    die() {
      closed = new Error('the helper exited');
      pump();
    },
  };
}

const HELLO = { id: 0, ok: true, ready: true };

/** Polls fast: the default interval is 50 ms, long enough to outlast a deliberately short deadline. */
const until = (check: () => void) => vi.waitFor(check, { interval: 1, timeout: 2000 });

/**
 * A rejection has to be claimed on the tick it happens, or Node reports it
 * unhandled while the test is still setting up. So every test that expects
 * one attaches its assertion here, before anything is awaited.
 */
const rejects = (promise: Promise<unknown>, pattern: RegExp) => expect(promise).rejects.toThrow(pattern);

function setup(options: { spawn?: () => Promise<DaemonProcess>; timeoutMs?: number } = {}) {
  const fake = fakeProcess();
  const spawn = vi.fn(options.spawn ?? (async () => fake.process));
  const debug = vi.fn((_m: string) => {});
  const daemon = createDaemon({ spawn, timeoutMs: options.timeoutMs ?? 5000, debug, log: () => {} });
  return { fake, spawn, debug, daemon };
}

describe('createDaemon', () => {
  it('starts nothing until the first request, then waits for the handshake before sending', async () => {
    const t = setup();
    expect(t.spawn).not.toHaveBeenCalled();
    expect(t.daemon.state()).toMatchObject({ running: false, starts: 0, sent: 0 });

    const pending = t.daemon.send({ op: 'voices' });
    await Promise.resolve();
    expect(t.fake.written).toEqual([]);

    t.fake.reply(HELLO);
    await until(() => expect(t.fake.written).toEqual([{ id: 1, op: 'voices' }]));
    t.fake.reply({ id: 1, ok: true, voices: [] });
    await expect(pending).resolves.toMatchObject({ id: 1, ok: true });
    expect(t.daemon.state()).toMatchObject({ running: true, starts: 1, sent: 1, queued: 0 });
  });

  it('refuses to start when the helper cannot be spawned, and says why', async () => {
    const t = setup({ spawn: async () => Promise.reject(new Error('Executable not found')) });
    await expect(t.daemon.send({ op: 'ping' })).rejects.toThrow(/Cannot start the Windows speech helper: Executable not found/);
    expect(t.daemon.state()).toMatchObject({ running: false, starts: 1 });
  });

  it('treats a first message that is not the handshake as a failed start and kills the process', async () => {
    const t = setup();
    const asserted = rejects(t.daemon.send({ op: 'ping' }), /handshake/);
    t.fake.reply({ id: 0, ok: true });
    await asserted;
    expect(t.fake.killed()).toBe(1);
  });

  it('gives up after MAX_STARTS and repeats the last reason, rather than spawning a process per sentence', async () => {
    const t = setup({ spawn: async () => Promise.reject(new Error('blocked by policy')) });
    for (let i = 0; i < MAX_STARTS; i++) await expect(t.daemon.send({ op: 'ping' })).rejects.toThrow(/blocked by policy/);
    expect(t.spawn).toHaveBeenCalledTimes(MAX_STARTS);
    await expect(t.daemon.send({ op: 'ping' })).rejects.toThrow(/failed to start 3 times: blocked by policy/);
    // Still three: the fourth request never reached spawn
    expect(t.spawn).toHaveBeenCalledTimes(MAX_STARTS);
    t.daemon.reset();
    await expect(t.daemon.send({ op: 'ping' })).rejects.toThrow(/blocked by policy/);
    expect(t.spawn).toHaveBeenCalledTimes(MAX_STARTS + 1);
  });

  it('runs requests one at a time, in order, however many are asked for at once', async () => {
    const t = setup();
    const a = t.daemon.send({ op: 'ping' });
    const b = t.daemon.send({ op: 'voices' });
    const c = t.daemon.send({ op: 'ping' });
    t.fake.reply(HELLO);

    await until(() => expect(t.fake.written).toHaveLength(1));
    expect(t.daemon.state().queued).toBe(3);
    t.fake.reply({ id: 1, ok: true });
    await until(() => expect(t.fake.written).toHaveLength(2));
    t.fake.reply({ id: 2, ok: true, voices: [] });
    await until(() => expect(t.fake.written).toHaveLength(3));
    t.fake.reply({ id: 3, ok: true });

    await expect(Promise.all([a, b, c])).resolves.toHaveLength(3);
    expect(t.fake.written.map((w: any) => w.id)).toEqual([1, 2, 3]);
    // One start for the three of them
    expect(t.spawn).toHaveBeenCalledTimes(1);
  });

  it('keeps the helper when it reports an error: it answered in step and can take the next request', async () => {
    const t = setup();
    const asserted = rejects(t.daemon.send({ op: 'speak', voice: 'sapi5/nope', text: 'x', file: 'f' }), /no such voice: nope/);
    t.fake.reply(HELLO);
    await until(() => expect(t.fake.written).toHaveLength(1));
    t.fake.reply({ id: 1, ok: false, error: 'no such voice: nope' });
    await asserted;
    expect(t.daemon.state()).toMatchObject({ running: true, sent: 1 });
    expect(t.fake.killed()).toBe(0);

    const second = t.daemon.send({ op: 'ping' });
    await until(() => expect(t.fake.written).toHaveLength(2));
    t.fake.reply({ id: 2, ok: true });
    await expect(second).resolves.toMatchObject({ ok: true });
  });

  it('drops the helper when it answers the wrong request: the stream is out of step', async () => {
    const t = setup();
    const asserted = rejects(t.daemon.send({ op: 'ping' }), /answered request 99 while 1 was in flight/);
    t.fake.reply(HELLO);
    await until(() => expect(t.fake.written).toHaveLength(1));
    t.fake.reply({ id: 99, ok: true });
    await asserted;
    expect(t.daemon.state().running).toBe(false);
    expect(t.fake.killed()).toBe(1);
  });

  it('kills a helper that misses its deadline, rather than waiting for a reply that would land on the next request', async () => {
    const t = setup({ timeoutMs: 20 });
    const asserted = rejects(t.daemon.send({ op: 'ping' }), /did not answer within/);
    t.fake.reply(HELLO);
    await asserted;
    expect(t.fake.written).toEqual([{ id: 1, op: 'ping' }]);
    expect(t.fake.killed()).toBe(1);
    expect(t.daemon.state()).toMatchObject({ running: false, lastError: expect.stringMatching(/did not answer/) });
  });

  it('starts a new helper for the next request after one dies mid-session', async () => {
    const first = fakeProcess();
    const second = fakeProcess();
    const spawn = vi.fn(async () => (spawn.mock.calls.length === 1 ? first.process : second.process));
    const daemon = createDaemon({ spawn, timeoutMs: 5000 });

    const asserted = rejects(daemon.send({ op: 'ping' }), /speech helper failed/);
    first.reply(HELLO);
    await until(() => expect(first.written).toHaveLength(1));
    first.die();
    await asserted;
    expect(daemon.state().running).toBe(false);

    const b = daemon.send({ op: 'ping' });
    second.reply(HELLO);
    await until(() => expect(second.written).toEqual([{ id: 2, op: 'ping' }]));
    second.reply({ id: 2, ok: true });
    await expect(b).resolves.toMatchObject({ ok: true });
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('waits for a whole frame: a half-written header is not a message', async () => {
    const t = setup();
    const pending = t.daemon.send({ op: 'ping' });
    t.fake.reply(HELLO);
    await until(() => expect(t.fake.written).toHaveLength(1));
    const body = new TextEncoder().encode(JSON.stringify({ id: 1, ok: true }));
    const head = new Uint8Array(4);
    new DataView(head.buffer).setUint32(0, body.length, true);
    t.fake.raw([head[0], head[1]]);
    await new Promise((r) => setTimeout(r, 5));
    expect(t.daemon.state().sent).toBe(0);
    t.fake.raw([head[2], head[3], ...body]);
    await expect(pending).resolves.toMatchObject({ ok: true });
  });

  it('stops on demand and starts again on the next request', async () => {
    const t = setup();
    const a = t.daemon.send({ op: 'ping' });
    t.fake.reply(HELLO);
    await until(() => expect(t.fake.written).toHaveLength(1));
    t.fake.reply({ id: 1, ok: true });
    await a;
    t.daemon.stop();
    expect(t.fake.killed()).toBe(1);
    expect(t.daemon.state().running).toBe(false);
    // The budget is untouched, so a later request may still start one — and
    // this fake is closed, so the handshake fails at once
    await expect(t.daemon.send({ op: 'ping' })).rejects.toThrow();
    expect(t.spawn).toHaveBeenCalledTimes(2);
  });

  it('frames what it writes so the helper can read it back', async () => {
    const t = setup();
    const pending = t.daemon.send({ op: 'speak', voice: 'onecore/X', text: '朗读', file: 'C:\\a.wav' });
    t.fake.reply(HELLO);
    await until(() => expect(t.fake.written).toHaveLength(1));
    expect(t.fake.written[0]).toEqual({ id: 1, op: 'speak', voice: 'onecore/X', text: '朗读', file: 'C:\\a.wav' });
    t.fake.reply({ id: 1, ok: true, ms: 900, words: [{ t: 10, c: 0, n: 2 }] });
    await expect(pending).resolves.toMatchObject({ ms: 900 });
  });
});

describe('the fake process itself', () => {
  it('frames replies the way the client decodes them', () => {
    const body = new TextEncoder().encode('{"id":1,"ok":true}');
    expect(decodeFrameBody(body)).toEqual({ id: 1, ok: true });
  });
});
