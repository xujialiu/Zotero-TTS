import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WebDAVError } from '../../src/core/webdav';
import { entryOf, SHARED_POSITIONS_FILENAME, SHARED_POSITIONS_FORMAT, serializeSharedPositions, type SharedItem } from '../../src/read-aloud/xujialiu-positions-file';
import { createSharedTransport, SHARED_SYNC_RETRY_MS, type SharedTransportDeps } from '../../src/read-aloud/xujialiu-positions-transport';

const FIXTURE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'xujialiu-positions.v1.json'), 'utf8');
const ID_B = `sha256:${'b'.repeat(64)}`;
const ID_C = `sha256:${'c'.repeat(64)}`;

const item = (over: Partial<SharedItem> = {}): SharedItem => ({
  id: ID_B,
  format: 'epub',
  publicationId: null,
  locator: 'epubcfi(/6/34!/4/2/4/2/4)',
  anchor: { exact: '铁柱坐在村内的小路边，望着远处的群山。', prefix: '', suffix: '' },
  stamp: { at: 1758470000000, device: 'iPhone-3f9a2c1b' },
  ...over,
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function harness(over: Partial<SharedTransportDeps> = {}) {
  const uploads: { name: string; text: string }[] = [];
  const downloads: string[] = [];
  const adopted: SharedItem[] = [];
  const errors: unknown[] = [];
  let clock = 0;
  let remote: string | Error | null = null;
  let local: SharedItem[] = [];
  let adoptTakes = true;
  const deps: SharedTransportDeps = {
    enabled: () => true,
    client: () => ({
      download: async (name) => {
        downloads.push(name);
        if (remote instanceof Error) throw remote;
        if (remote === null) throw new WebDAVError('not-found', 'no file yet', 404);
        return remote;
      },
      upload: async (name, text) => {
        uploads.push({ name, text });
      },
    }),
    local: () => local,
    adopt: (i) => {
      adopted.push(i);
      return adoptTakes;
    },
    now: () => clock,
    error: (e) => errors.push(e),
    debug: () => {},
    ...over,
  };
  const transport = createSharedTransport(deps);
  return {
    transport,
    uploads,
    downloads,
    adopted,
    errors,
    setRemote: (v: string | Error | null) => (remote = v),
    setLocal: (v: SharedItem[]) => (local = v),
    setAdopt: (v: boolean) => (adoptTakes = v),
    tick: (ms: number) => (clock += ms),
  };
}

describe('createSharedTransport', () => {
  it('does nothing while the switch is off', async () => {
    const h = harness({ enabled: () => false });
    h.setLocal([item()]);
    await h.transport.flush('startup');
    expect(h.downloads).toEqual([]);
    expect(h.transport.stats().lastOutcome).toBe('skipped');
  });

  it('creates the file from the local items on a server that has none, and uploads nothing when nothing changed', async () => {
    const h = harness();
    h.setLocal([item()]);
    await h.transport.flush('startup');
    expect(h.uploads).toEqual([{ name: SHARED_POSITIONS_FILENAME, text: serializeSharedPositions([entryOf(item())]) }]);
    h.setRemote(h.uploads[0].text);
    await h.transport.flush('reader-open');
    expect(h.uploads).toHaveLength(1);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', uploaded: false, remoteItems: 1, adopted: 0 });
  });

  it('merges by newest stamp, offers usable items, carries the rest through and uploads the union', async () => {
    const h = harness();
    h.setRemote(FIXTURE);
    h.setLocal([item({ id: ID_C, stamp: { at: 5, device: 'desk' } })]);
    await h.transport.flush('startup');
    // Offered: the fixture's epub item only — this machine's own is never offered back to it
    expect(h.adopted.map((i) => i.id)).toEqual([ID_B]);
    const uploaded = JSON.parse(h.uploads[0].text);
    expect(uploaded.items.map((i: SharedItem) => [i.id, i.format])).toEqual([
      [`sha256:${'a'.repeat(64)}`, 'pdf'],
      [ID_B, 'epub'],
      [ID_C, 'epub'],
    ]);
    expect(h.transport.stats()).toMatchObject({ carried: 1, dropped: 0, remoteItems: 2, uploaded: true });
  });

  it('leaves a newer version alone and heals a broken file', async () => {
    const newer = harness();
    newer.setRemote(JSON.stringify({ format: SHARED_POSITIONS_FORMAT, version: 2, items: [] }));
    newer.setLocal([item()]);
    await newer.transport.flush('startup');
    expect(newer.uploads).toEqual([]);
    expect(newer.transport.stats().lastOutcome).toBe('error');
    expect(String(newer.transport.stats().lastError)).toMatch(/version 2/);

    const broken = harness();
    broken.setRemote('{not json');
    broken.setLocal([item()]);
    await broken.transport.flush('startup');
    expect(broken.uploads).toHaveLength(1);
    expect(broken.transport.stats().lastOutcome).toBe('ok');
  });

  it('reports a failure once per window, backs off, and a flush runs anyway', async () => {
    const h = harness();
    h.setRemote(new WebDAVError('network', 'down'));
    h.setLocal([item()]);
    await h.transport.flush('startup');
    h.transport.poke('reader-open');
    await settle();
    expect(h.errors).toHaveLength(1);
    expect(h.transport.stats().lastOutcome).toBe('skipped');
    h.setRemote(null);
    await h.transport.flush('resume');
    expect(h.transport.stats().lastOutcome).toBe('ok');
    h.tick(SHARED_SYNC_RETRY_MS);
  });

  it('reports an erroring run as its own numbers, not the last good run\'s', async () => {
    const h = harness();
    h.setRemote(FIXTURE);
    h.setLocal([item({ id: ID_C, stamp: { at: 5, device: 'desk' } })]);
    await h.transport.flush('pause');
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', uploaded: true, adopted: 1, remoteItems: 2, carried: 1, dropped: 0 });
    const took = h.transport.stats().lastAdoption;
    expect(took).toEqual({ at: 0, count: 1 });
    h.setRemote(JSON.stringify({ format: SHARED_POSITIONS_FORMAT, version: 2, items: [] }));
    await h.transport.flush('resume');
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'error', uploaded: false, adopted: 0, remoteItems: null, carried: null, dropped: null, lastAdoption: took });
    // A later run that takes nothing (the store already holds everything the
    // file does) resets the per-run count and keeps the durable record
    h.setRemote(h.uploads[0].text);
    h.setAdopt(false);
    await h.transport.flush('reader-open');
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', uploaded: false, adopted: 0, lastAdoption: took });
  });

  it('awaits prepare once, and a failed prepare does not stop the sync', async () => {
    let prepared = 0;
    const h = harness({
      prepare: async () => {
        prepared++;
        throw new Error('backfill failed');
      },
    });
    h.setLocal([item()]);
    await h.transport.flush('startup');
    h.setRemote(h.uploads[0].text);
    await h.transport.flush('reader-open');
    expect(prepared).toBe(1);
    expect(h.errors.map(String)).toEqual(['Error: backfill failed']);
    expect(h.uploads).toHaveLength(1);
  });
});
