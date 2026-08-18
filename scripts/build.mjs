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
  // Zotero 注入这些全局；不要让 esbuild 试图打包它们
  external: [],
  logLevel: 'warning',
});

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

const zip = new AdmZip();
// 打包 addon/ 的内容而非 addon/ 目录本身 —— xpi 根目录必须直接是 manifest.json
zip.addLocalFolder(addonDir);
zip.writeZip(join(buildDir, 'zotero-tts.xpi'));

console.log('built build/zotero-tts.xpi');
