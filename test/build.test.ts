import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const xpi = join(root, 'build', 'zotero-tts.xpi');

describe('build', () => {
  it('produces an xpi containing the manifest, bootstrap and bundle', () => {
    execFileSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
    expect(existsSync(xpi)).toBe(true);

    const names = new AdmZip(xpi).getEntries().map((e) => e.entryName);
    expect(names).toContain('manifest.json');
    expect(names).toContain('bootstrap.js');
    expect(names).toContain('content/zotero-tts.js');
  });

  it('declares the plugin id and minimum Zotero version', () => {
    execFileSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
    const entry = new AdmZip(xpi).getEntry('manifest.json');
    const manifest = JSON.parse(entry!.getData().toString('utf8'));
    expect(manifest.applications.zotero.id).toBe('zotero-tts@xujialiu.top');
    expect(manifest.applications.zotero.strict_min_version).toBe('10.0');
  });
});
