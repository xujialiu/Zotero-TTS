import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const addonDir = join(root, 'addon');
const buildDir = join(root, 'build');
const bundlePath = join(addonDir, 'content', 'zotero-tts.js');

await esbuild.build({
  entryPoints: [join(root, 'src', 'index.ts')],
  outfile: bundlePath,
  bundle: true,
  format: 'iife',
  target: 'es2022',
  platform: 'browser',
  // Zotero injects these globals; don't let esbuild try to bundle them
  external: [],
  logLevel: 'warning',
});

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

const zip = new AdmZip();
// Package the contents of addon/, not the addon/ directory itself — the xpi root must be manifest.json directly
zip.addLocalFolder(addonDir);
zip.writeZip(join(buildDir, 'zotero-tts.xpi'));

console.log('built build/zotero-tts.xpi');
