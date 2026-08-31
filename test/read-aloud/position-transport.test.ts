import { describe, expect, it } from 'vitest';
import { WebDAVError } from '../../src/core/webdav';
import { POSITIONS_FILENAME, POSITIONS_FORMAT, POSITIONS_VERSION, serializePositions } from '../../src/read-aloud/position-file';
import { createPositionTransport, SYNC_RETRY_MS, type PositionTransportDeps } from '../../src/read-aloud/position-transport';
import type { PositionEntry } from '../../src/read-aloud/read-aloud-position';

const entry = (over: Partial<PositionEntry> = {}): PositionEntry => ({
  lib: 1,
  key: 'ABCD1234',
  pos: { pageIndex: 3, rects: [[20, 30, 20, 30]] },
  ts: 1000,
  ...over,
});

/** Lets queued microtasks (a skipped or failed sync completes in one) run out. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function harness(over: Partial<PositionTransportDeps> = {}) {
  const uploads: { name: string; text: string }[] = [];
  const downloads: string[] = [];
  const adopted: PositionEntry[] = [];
  const errors: unknown[] = [];
  let clock = 0;
  /** What the server holds: null → not-found, an Error → thrown, text → returned. */
  let remote: string | Error | null = null;
  let local: PositionEntry[] = [];
  let adoptTakes = true;
  /** Gates for successive downloads; a missing gate resolves at once. */
  const gates: Promise<void>[] = [];

  const deps: PositionTransportDeps = {
    enabled: () => true,
    client: () => ({
      download: async (name) => {
        downloads.push(name);
        await gates.shift();
        if (remote instanceof Error) throw remote;
        if (remote === null) throw new WebDAVError('not-found', 'no file yet', 404);
        return remote;
      },
      upload: async (name, text) => {
        uploads.push({ name, text });
      },
    }),
    local: () => local,
    adopt: (e) => {
      adopted.push(e);
      return adoptTakes;
    },
    itemExists: () => true,
    libraryExists: () => true,
    now: () => clock,
    error: (e) => errors.push(e),
    debug: () => {},
    ...over,
  };
  const transport = createPositionTransport(deps);
  return {
    transport,
    uploads,
    downloads,
    adopted,
    errors,
    setRemote: (v: string | Error | null) => (remote = v),
    setLocal: (v: PositionEntry[]) => (local = v),
    setAdopt: (v: boolean) => (adoptTakes = v),
    tick: (ms: number) => (clock += ms),
    gate: (p: Promise<void>) => gates.push(p),
  };
}

describe('createPositionTransport', () => {
  it('does nothing while the switch is off', async () => {
    const h = harness({ enabled: () => false });
    h.setLocal([entry()]);
    await h.transport.flush('startup');
    expect(h.downloads).toEqual([]);
    expect(h.uploads).toEqual([]);
    expect(h.transport.stats().lastOutcome).toBe('skipped');
  });

  it('uploads this machine’s entries when the server has no file yet', async () => {
    const h = harness();
    const mine = entry();
    h.setLocal([mine]);
    await h.transport.flush('startup');
    expect(h.downloads).toEqual([POSITIONS_FILENAME]);
    expect(h.uploads).toEqual([{ name: POSITIONS_FILENAME, text: serializePositions([mine]) }]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', remoteEntries: 0, uploaded: true });
  });

  it('uploads nothing when there is no file and nothing local', async () => {
    const h = harness();
    await h.transport.flush('startup');
    expect(h.uploads).toEqual([]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', uploaded: false });
  });

  it('adopts a newer remote entry and skips the upload when nothing changed', async () => {
    const h = harness();
    const older = entry({ ts: 1000 });
    const newer = entry({ ts: 2000, pos: { pageIndex: 9, rects: [[9, 9, 9, 9]] } });
    h.setLocal([older]);
    h.setRemote(serializePositions([newer]));
    await h.transport.flush('reader-open');
    expect(h.adopted).toEqual([newer]);
    expect(h.uploads).toEqual([]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', remoteEntries: 1, adopted: 1, uploaded: false });
  });

  it('uploads the merged union when this machine holds the newer entry', async () => {
    const h = harness();
    h.setAdopt(false); // the sampler refuses what is not strictly newer
    const newer = entry({ ts: 2000 });
    const older = entry({ ts: 1000, pos: { pageIndex: 1, rects: [[1, 1, 1, 1]] } });
    const theirs = entry({ lib: 2, key: 'THEIRS01', ts: 500 });
    h.setLocal([newer]);
    h.setRemote(serializePositions([older, theirs]));
    await h.transport.flush('reader-close');
    expect(h.uploads).toEqual([{ name: POSITIONS_FILENAME, text: serializePositions([newer, theirs]) }]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', adopted: 0, uploaded: true });
  });

  it('keeps a foreign entry in the file but out of the store', async () => {
    const h = harness({ itemExists: (_lib, key) => key !== 'FOREIGN1' });
    const mine = entry({ ts: 2000 });
    const foreign = entry({ key: 'FOREIGN1', ts: 3000 });
    h.setLocal([mine]);
    h.setRemote(serializePositions([foreign]));
    await h.transport.flush('startup');
    expect(h.adopted).toEqual([mine]); // the foreign entry is never offered to the sampler
    expect(h.uploads).toEqual([{ name: POSITIONS_FILENAME, text: serializePositions([mine, foreign]) }]);
  });

  it('hands adopt the parsed, normalized position', async () => {
    const h = harness();
    const text = JSON.stringify({
      format: POSITIONS_FORMAT,
      version: POSITIONS_VERSION,
      items: [entry({ ts: 2000, pos: { pageIndex: 3, rects: [[10, 20, 30, 40]] } })],
    });
    h.setRemote(text);
    await h.transport.flush('startup');
    expect(h.adopted).toEqual([entry({ ts: 2000, pos: { pageIndex: 3, rects: [[20, 30, 20, 30]] } })]);
  });

  it('treats a broken remote file as absent and heals it, reporting once', async () => {
    const h = harness();
    const mine = entry();
    h.setLocal([mine]);
    h.setRemote('<html>maintenance</html>');
    await h.transport.flush('startup');
    expect(h.errors).toHaveLength(1);
    expect(h.uploads).toEqual([{ name: POSITIONS_FILENAME, text: serializePositions([mine]) }]);
    expect(h.transport.stats().lastOutcome).toBe('ok');
  });

  it('leaves a newer build’s file strictly alone', async () => {
    const h = harness();
    h.setLocal([entry()]);
    h.setRemote(JSON.stringify({ format: POSITIONS_FORMAT, version: POSITIONS_VERSION + 1, items: [] }));
    await h.transport.flush('startup');
    expect(h.adopted).toEqual([]);
    expect(h.uploads).toEqual([]);
    const stats = h.transport.stats();
    expect(stats.lastOutcome).toBe('error');
    expect(stats.lastError).toContain(`version ${POSITIONS_VERSION + 1}`);
  });

  it('backs off after a failure and retries once the window passes', async () => {
    const h = harness();
    h.setRemote(new WebDAVError('network', 'no reply'));
    await h.transport.flush('startup');
    expect(h.transport.stats().lastOutcome).toBe('error');
    expect(h.downloads).toHaveLength(1);

    h.transport.poke('reader-open'); // inside the window: no request at all
    await settle();
    expect(h.downloads).toHaveLength(1);
    expect(h.transport.stats().lastOutcome).toBe('skipped');

    h.tick(SYNC_RETRY_MS);
    h.setRemote(null);
    h.transport.poke('reader-open');
    await settle();
    expect(h.downloads).toHaveLength(2);
    expect(h.transport.stats().lastOutcome).toBe('ok');
  });

  it('reports a persisting failure once per window, not once per attempt', async () => {
    const h = harness();
    h.setRemote(new WebDAVError('network', 'no reply'));
    await h.transport.flush('startup');
    h.tick(1000);
    await h.transport.flush('shutdown'); // forced through the back-off, still fails
    expect(h.downloads).toHaveLength(2);
    expect(h.errors).toHaveLength(1);
    h.tick(SYNC_RETRY_MS);
    await h.transport.flush('shutdown');
    expect(h.errors).toHaveLength(2);
  });

  it('reports an unusable configuration instead of hanging or throwing', async () => {
    const h = harness({
      client: () => {
        throw new WebDAVError('config', 'Set the WebDAV URL first.');
      },
    });
    await h.transport.flush('startup');
    expect(h.errors).toHaveLength(1);
    expect(h.transport.stats().lastOutcome).toBe('error');
  });

  it('coalesces a burst of pokes into the running sync plus one trailing one', async () => {
    const h = harness();
    let release!: () => void;
    h.gate(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const first = h.transport.flush('one');
    h.transport.poke('two');
    h.transport.poke('three');
    h.transport.poke('four');
    expect(h.downloads).toHaveLength(1);
    release();
    await first;
    await settle();
    expect(h.downloads).toHaveLength(2); // one in flight, one trailing — never four
    expect(h.transport.stats().syncs).toBe(2);
    expect(h.transport.stats().lastTrigger).toBe('four');
  });

  it('a flush behind a running sync still forces its own', async () => {
    const h = harness();
    h.setRemote(new WebDAVError('network', 'no reply'));
    await h.transport.flush('startup'); // opens the failure window
    h.setRemote(null);
    let release!: () => void;
    h.gate(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const running = h.transport.flush('reader-close');
    const behind = h.transport.flush('shutdown');
    release();
    await running;
    await behind;
    // Both forced through: the running one and the trailing shutdown flush
    expect(h.downloads).toHaveLength(3);
    expect(h.transport.stats().lastOutcome).toBe('ok');
  });
});
