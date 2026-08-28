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

  // Zotero 10's Extension.sys.mjs (parseManifest) hard-rejects any extension
  // whose applications.zotero lacks id, update_url, or strict_max_version —
  // the install dialog then shows only "may be incompatible", with no detail.
  // These three are therefore install-blocking, not cosmetic.
  it('carries every field Zotero 10 refuses to install without', () => {
    execFileSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
    const entry = new AdmZip(xpi).getEntry('manifest.json');
    const { zotero } = JSON.parse(entry!.getData().toString('utf8')).applications;
    expect(typeof zotero.id).toBe('string');
    expect(zotero.update_url).toMatch(/^https:\/\//);
    expect(zotero.strict_max_version).toMatch(/^\d+\.\*$/);
  });

  it('packages every runtime file the plugin loads by path', () => {
    execFileSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
    const names = new AdmZip(xpi).getEntries().map((e) => e.entryName);
    // prefs.js supplies every default; the pane markup is loaded by
    // registerPrefsPane. Dropping either breaks the pane or all defaults.
    expect(names).toContain('prefs.js');
    expect(names).toContain('content/preferences.xhtml');
    // The ? icons' style, registered with the pane (registerPrefsPane)
    expect(names).toContain('content/preferences.css');
  });

  // Zotero runs a pane's `scripts` before it inserts the pane's markup, so
  // initialization that touches elements must run from the root element's
  // onload (dispatched after insertion). A pane script once did this job and
  // silently found nothing; never bring it back.
  it('initializes the preferences pane from its root onload, not from a pane script', () => {
    execFileSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
    const zip = new AdmZip(xpi);
    const markup = zip.getEntry('content/preferences.xhtml')!.getData().toString('utf8');
    expect(markup).toMatch(/<vbox[^>]*\sonload="Zotero\.ZoteroTTS\.prefsPane\.onPaneLoad\(document\)"/);
    expect(zip.getEntries().map((e) => e.entryName)).not.toContain('content/preferences-shim.js');
  });
});
