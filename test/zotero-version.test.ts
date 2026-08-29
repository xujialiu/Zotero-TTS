import { describe, expect, it } from 'vitest';
import { acceptsPlugin, compareVersions } from './zotero-version';

// Ground truth: every triple below was read out of a running Zotero
// (10.0.2-beta.1+33297dd19) as Services.vc.compare(a, b). The port is only
// useful if it agrees with the comparator Zotero actually runs.
const GROUND_TRUTH: Array<[string, string, number]> = [
  ['10.0', '10.0', 0],
  ['10.0.3', '10.0', 1],
  ['10.0', '10.0.3', -1],
  ['10.0.0', '10.0', 0],
  ['10.1', '10.0', 1],
  ['9.999', '10.0', -1],
  ['10.0.SOURCE.22f08d1ce', '10.0', -1],
  ['10.0.SOURCE.22f08d1ce', '9.999', 1],
  ['10.0.SOURCE.22f08d1ce', '10.0.0', -1],
  ['10.0.SOURCE.22f08d1ce', '10.*', -1],
  ['10.1.SOURCE.deadbeef', '10.0', 1],
  ['10.0.SOURCE.a', '10.0.SOURCE.b', -1],
  ['10.0.2-beta.1+33297dd19', '10.0', 1],
  ['10.0.2-beta.1+33297dd19', '10.0.2', -1],
  ['10.0.2-beta.1+33297dd19', '10.0.2-beta.2', -1],
  ['10.0.2-beta.10', '10.0.2-beta.9', 1],
  ['7.0.9', '9.999', -1],
  ['7.0.0-beta.1+abc', '9.999', -1],
  ['7.0.9', '10.*', -1],
  ['11.0', '10.*', 1],
  ['10.99.99', '10.*', -1],
  ['10.*', '10.0', 1],
  ['1.0pre', '1.0', -1],
  ['1.0+', '1.1pre', 0],
  ['1.0.0', '1.0', 0],
  ['10.0.SOURCE', '10.0.SOURCE.22f08d1ce', -1],
  ['10.0.4', '10.*', -1],
];

describe('compareVersions', () => {
  it.each(GROUND_TRUTH)('ranks %s against %s the way Zotero does', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});

describe('acceptsPlugin', () => {
  const bounds = { strict_min_version: '9.999', strict_max_version: '10.*' };

  it('accepts a Zotero 10.0 built from source', () => {
    // The build in issue #8: "10.0.SOURCE.<hash>" ranks below "10.0".
    expect(acceptsPlugin('10.0.SOURCE.22f08d1ce', bounds)).toBe(true);
    expect(acceptsPlugin('10.0.SOURCE.22f08d1ce', { ...bounds, strict_min_version: '10.0' }))
      .toBe(false);
  });

  it('accepts released and beta Zotero 10', () => {
    for (const version of ['10.0', '10.0.4', '10.99.99', '10.0.2-beta.1+33297dd19']) {
      expect(acceptsPlugin(version, bounds)).toBe(true);
    }
  });

  it('still rejects Zotero 7 and 9, whose Read Aloud we cannot enhance', () => {
    for (const version of ['7.0.9', '7.0.0-beta.1+abc', '9.9.9']) {
      expect(acceptsPlugin(version, bounds)).toBe(false);
    }
  });

  it('still rejects Zotero 11, where the internals we patch may have moved', () => {
    expect(acceptsPlugin('11.0', bounds)).toBe(false);
  });

  it('would accept anything below 10 if the minimum were dropped', () => {
    // Why strict_min_version cannot simply be removed: Zotero defaults a
    // missing minimum to "0", and the maximum alone lets Zotero 7 in.
    expect(acceptsPlugin('7.0.9', { strict_max_version: '10.*' })).toBe(true);
  });
});
