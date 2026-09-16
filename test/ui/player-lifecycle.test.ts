import { describe, expect, it } from 'vitest';
import { isPlayerDocumentLive } from '../../src/ui/player';

describe('player document lifecycle', () => {
  it('rejects a document whose window was detached after fixture teardown', () => {
    const doc: { defaultView: { closed: boolean } | null } = { defaultView: { closed: false } };
    expect(isPlayerDocumentLive(doc, () => false)).toBe(true);
    doc.defaultView = null;
    expect(isPlayerDocumentLive(doc, () => false)).toBe(false);
  });
  it('handles a live document wrapper with a dead inner window', () => {
    const window = { closed: false }, doc = { defaultView: window };
    expect(isPlayerDocumentLive(doc, value => value === window)).toBe(false);
    expect(isPlayerDocumentLive({ get defaultView(): never { throw new Error('dead object'); } }, () => false)).toBe(false);
  });
});
