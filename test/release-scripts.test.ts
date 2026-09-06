import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  VERSION_RE,
  compareVersions,
  pointUpdateJson,
  releaseLink,
  setVersionLine,
  stripPrerelease,
} from '../scripts/release-lib.mjs';

/**
 * The pure parts of scripts/release-prepare.mjs and scripts/release-point.mjs.
 *
 * A release rewrites three files by hand's worth of edits — the two version
 * lines and update.json's pointer — and the one thing that must hold is that
 * nothing else in those files moves: they are edited as text on the real
 * files here, and putting the old value back must give the old bytes.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const PLUGIN_ID = 'zotero-tts@xujialiu.top';

describe('a release version', () => {
  it('is a clean X.Y.Z, never a test build', () => {
    expect(VERSION_RE.test('1.10.15')).toBe(true);
    expect(VERSION_RE.test('1.10.15-beta3')).toBe(false);
    expect(VERSION_RE.test('v1.10.15')).toBe(false);
    expect(VERSION_RE.test('1.10')).toBe(false);
  });

  it('drops the -beta suffix a test build carries', () => {
    expect(stripPrerelease('1.10.15-beta3')).toBe('1.10.15');
    expect(stripPrerelease('1.10.15')).toBe('1.10.15');
  });

  it('orders numerically, the suffix ignored', () => {
    expect(compareVersions('1.10.15', '1.10.9')).toBe(1);
    expect(compareVersions('1.10.9', '1.10.15')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('1.10.15-beta3', '1.10.15')).toBe(0);
    expect(compareVersions('1.10.15', '1.10.15')).toBe(0);
  });
});

describe('the version line', () => {
  it.each(['package.json', 'addon/manifest.json'])('is the only thing that moves in %s', (file) => {
    const before = read(file);
    const after = setVersionLine(before, '9.9.9');
    expect(JSON.parse(after).version).toBe('9.9.9');
    // Every other byte stays: the old value put back gives the old file.
    expect(setVersionLine(after, JSON.parse(before).version)).toBe(before);
    // And the rest of the JSON is the same document.
    expect({ ...JSON.parse(after), version: undefined }).toEqual({ ...JSON.parse(before), version: undefined });
  });

  it('is required', () => {
    expect(() => setVersionLine('{ "name": "x" }', '1.0.0')).toThrow('no "version" line');
  });
});

describe('update.json', () => {
  it('names the asset every installed copy downloads', () => {
    expect(releaseLink('1.10.14')).toBe(
      'https://github.com/xujialiu/Zotero-TTS/releases/download/v1.10.14/zotero-tts.xpi',
    );
  });

  it('is pointed at a release with nothing else touched', () => {
    const before = read('update.json');
    const after = pointUpdateJson(before, '9.9.9');
    const entry = JSON.parse(after).addons[PLUGIN_ID].updates[0];
    expect(entry.version).toBe('9.9.9');
    expect(entry.update_link).toBe(releaseLink('9.9.9'));
    expect(pointUpdateJson(after, JSON.parse(before).addons[PLUGIN_ID].updates[0].version)).toBe(before);
  });

  it('refuses a file with more than one entry, or none', () => {
    const one = read('update.json');
    const two = one.replace(/"update_link": "[^"]+",/, (line) => `${line}\n          ${line}`);
    expect(() => pointUpdateJson(two, '9.9.9')).toThrow('2 "update_link" values');
    expect(() => pointUpdateJson('{}', '9.9.9')).toThrow('0 "version" values');
  });
});
