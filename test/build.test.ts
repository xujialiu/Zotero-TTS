import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import { buildDateString } from '../scripts/build-date.mjs';
import { acceptsPlugin } from './zotero-version';

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

  it('declares the plugin id', () => {
    execFileSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
    const entry = new AdmZip(xpi).getEntry('manifest.json');
    const manifest = JSON.parse(entry!.getData().toString('utf8'));
    expect(manifest.applications.zotero.id).toBe('zotero-tts@xujialiu.top');
  });

  // The version bounds are run through Mozilla's comparator, which ranks a
  // trailing non-numeric part *below* nothing ("1.0pre" < "1.0"). A minimum of
  // "10.0" therefore locked out every Zotero 10.0 built from source, whose
  // version is "10.0.SOURCE.<hash>" (issue #8). Both the shipped manifest and
  // update.json — which gates auto-updates the same way — must accept them.
  it.each([
    ['10.0', 'a Zotero 10.0 release'],
    ['10.0.4', 'a later Zotero 10 release'],
    ['10.0.2-beta.1+33297dd19', 'a Zotero 10 beta'],
    ['10.0.SOURCE.22f08d1ce', 'a Zotero 10.0 built from source'],
  ])('is installable on %s (%s)', (version) => {
    execFileSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
    const entry = new AdmZip(xpi).getEntry('manifest.json');
    const { zotero } = JSON.parse(entry!.getData().toString('utf8')).applications;
    expect(acceptsPlugin(version, zotero)).toBe(true);

    const update = JSON.parse(readFileSync(join(root, 'update.json'), 'utf8'));
    const { applications } = update.addons['zotero-tts@xujialiu.top'].updates[0];
    expect(acceptsPlugin(version, applications.zotero)).toBe(true);
  });

  it.each([
    ['7.0.9', 'Zotero 7'],
    ['11.0', 'Zotero 11'],
  ])('is not installable on %s (%s)', (version) => {
    execFileSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
    const entry = new AdmZip(xpi).getEntry('manifest.json');
    const { zotero } = JSON.parse(entry!.getData().toString('utf8')).applications;
    expect(acceptsPlugin(version, zotero)).toBe(false);
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

  // Zotero registers a plugin's Fluent files from `locale/<locale>/` in the
  // xpi itself (xpcom/plugins.js registerLocales), and the pane's every
  // string is in them: an xpi without them is a pane of blank labels (issue #30)
  it('packages the Fluent file of every locale', () => {
    execFileSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
    const names = new AdmZip(xpi).getEntries().map((e) => e.entryName);
    expect(names).toContain('locale/en-US/zotero-tts.ftl');
    expect(names).toContain('locale/zh-CN/zotero-tts.ftl');
  });

  // The date the pane's Build section shows exists nowhere else: esbuild's
  // `define` is what puts it into the bundle, and a define that stops being
  // applied would leave the identifier standing and the row on a dash.
  it('bakes the build date into the bundle', () => {
    execFileSync('node', ['scripts/build.mjs'], { cwd: root, stdio: 'pipe' });
    const bundle = new AdmZip(xpi).getEntry('content/zotero-tts.js')!.getData().toString('utf8');
    expect(bundle).not.toContain('__BUILD_DATE__');
    expect(bundle).toContain(`"${buildDateString()}"`);
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
