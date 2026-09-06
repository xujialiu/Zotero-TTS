import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSite, SITE } from '../scripts/build-site.mjs';

// The public docs site, published to GitHub Pages (issue #57): README.md is
// the index, README.zh.md its Chinese twin, PHILOSOPHY.md and the tutorials
// keep their paths. The pages are rendered by the same pandoc call as
// `npm run docs`; what differs is everything a search engine reads — the
// title, the description, the canonical URL, the language alternates, the
// sitemap — and the links, which must all resolve on the site.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const rel = prefix ? posix.join(prefix, name) : name;
    if (statSync(join(dir, name)).isDirectory()) out.push(...walk(join(dir, name), rel));
    else out.push(rel);
  }
  return out;
}

let out: string;
const read = (page: string) => readFileSync(join(out, page), 'utf8');
const head = (page: string) => read(page).split('</head>')[0];

beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), 'zotero-tts-site-'));
  buildSite({ outDir: out, verification: 'test-token' });
  // A build is a dozen pandoc and git runs; ~6 s here under load (2026-09-06).
}, 60_000);

afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

describe('build-site', () => {
  it('renders the README as the index, its translation, PHILOSOPHY and every tutorial, and nothing else', () => {
    const tutorials = readdirSync(join(root, 'tutorials'))
      .filter((name) => name.endsWith('.md'))
      .map((name) => `tutorials/${name.slice(0, -3)}.html`);
    const pages = walk(out).filter((file) => file.endsWith('.html'));
    expect(pages.sort()).toEqual(['index.html', 'index.zh.html', 'PHILOSOPHY.html', ...tutorials].sort());
  });

  it('puts what a search engine reads into the head of the index', () => {
    const h = head('index.html');
    expect(read('index.html')).toMatch(/^<!doctype html>\n<html lang="en">/);
    expect(h).toContain('<title>Zotero-TTS</title>');
    expect(h).toMatch(/<meta name="description" content="An enhancer for Zotero 10.s Read Aloud/);
    expect(h).toContain(`<link rel="canonical" href="${SITE.base}">`);
    expect(h).toContain(`<link rel="alternate" hreflang="en" href="${SITE.base}">`);
    expect(h).toContain(`<link rel="alternate" hreflang="zh-CN" href="${SITE.base}index.zh.html">`);
    expect(h).toContain(`<link rel="alternate" hreflang="x-default" href="${SITE.base}">`);
    expect(h).toContain('<meta name="google-site-verification" content="test-token">');
  });

  it('gives the Chinese index its own language, canonical and description', () => {
    const h = head('index.zh.html');
    expect(read('index.zh.html')).toMatch(/^<!doctype html>\n<html lang="zh-CN">/);
    expect(h).toContain('<title>Zotero-TTS</title>');
    expect(h).toMatch(/<meta name="description" content="Zotero 10 朗读功能的增强插件/);
    expect(h).toContain(`<link rel="canonical" href="${SITE.base}index.zh.html">`);
    expect(h).toContain(`<link rel="alternate" hreflang="en" href="${SITE.base}">`);
    expect(h).toContain(`<link rel="alternate" hreflang="zh-CN" href="${SITE.base}index.zh.html">`);
  });

  it('titles a tutorial by its heading, with the plugin named, and describes it by its first paragraph', () => {
    const h = head('tutorials/kokoro-fastapi.html');
    expect(h).toContain('<title>Kokoro-FastAPI in Docker · Zotero-TTS</title>');
    const description = h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
    expect(description).toMatch(/^Kokoro-FastAPI is the plugin.s local engine/);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(h).toContain(`<link rel="canonical" href="${SITE.base}tutorials/kokoro-fastapi.html">`);
    expect(h).toContain(`<link rel="alternate" hreflang="zh-CN" href="${SITE.base}tutorials/kokoro-fastapi.zh.html">`);
  });

  it('rewrites the links between pages so the site navigates', () => {
    const index = read('index.html');
    expect(index).toContain('href="index.zh.html"');
    expect(index).toContain('href="PHILOSOPHY.html"');
    expect(index).toContain('href="tutorials/kokoro-fastapi.html"');
    expect(read('index.zh.html')).toContain('href="./"');
    expect(read('tutorials/kokoro-fastapi.zh.html')).toContain('href="kokoro-fastapi.html"');
  });

  // The browser tab and the bookmark show the plugin's icon (issue #60);
  // a link from a tutorial page climbs out of tutorials/ first
  it('gives every page the plugin icon as its favicon, copied in once', () => {
    expect(head('index.html')).toContain('<link rel="icon" type="image/png" href="assets/icon.png">');
    expect(head('index.zh.html')).toContain('<link rel="icon" type="image/png" href="assets/icon.png">');
    expect(head('tutorials/kokoro-fastapi.html')).toContain('<link rel="icon" type="image/png" href="../assets/icon.png">');
    expect(existsSync(join(out, 'assets', 'icon.png'))).toBe(true);
  });

  it('copies the images in and points the pages at the copies', () => {
    expect(read('index.html')).toContain('src="assets/word-highlight.gif"');
    expect(existsSync(join(out, 'assets', 'word-highlight.gif'))).toBe(true);
    expect(existsSync(join(out, 'assets', 'popup.png'))).toBe(true);
  });

  it('sends every other local file to GitHub', () => {
    const index = read('index.html');
    expect(index).toContain(`href="${SITE.repo}/blob/main/LICENSE"`);
    expect(index).toContain(`href="${SITE.repo}/blob/main/notes/NOTES.md"`);
    expect(walk(out)).not.toContain('LICENSE');
  });

  it('links every page to the repo', () => {
    for (const page of walk(out).filter((file) => file.endsWith('.html'))) {
      expect(read(page), page).toContain(`href="${SITE.repo}"`);
    }
  });

  it('leaves no local link or image dangling', () => {
    for (const page of walk(out).filter((file) => file.endsWith('.html'))) {
      for (const [, url] of read(page).matchAll(/\b(?:src|href)="([^"]+)"/g)) {
        if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(url)) continue;
        const target = posix.join(posix.dirname(page), url.split('#')[0]);
        const file = join(out, target);
        const ok = existsSync(file) && (!statSync(file).isDirectory() || existsSync(join(file, 'index.html')));
        expect(ok, `${page} → ${url}`).toBe(true);
      }
    }
  });

  it('writes a sitemap with the language alternates, and a robots.txt that names it', () => {
    const sitemap = read('sitemap.xml');
    expect(sitemap).toContain(`<loc>${SITE.base}</loc>`);
    expect(sitemap).toContain(`<loc>${SITE.base}tutorials/kokoro-fastapi.html</loc>`);
    expect(sitemap).not.toContain('index.html</loc>');
    expect(sitemap).toContain(`<xhtml:link rel="alternate" hreflang="zh-CN" href="${SITE.base}index.zh.html"/>`);
    expect(sitemap).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}/);
    expect(read('robots.txt')).toContain(`Sitemap: ${SITE.base}sitemap.xml`);
  });

  it('omits the verification tag when there is no token', () => {
    const plain = mkdtempSync(join(tmpdir(), 'zotero-tts-site-'));
    try {
      buildSite({ outDir: plain });
      expect(readFileSync(join(plain, 'index.html'), 'utf8')).not.toContain('google-site-verification');
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  }, 60_000);
});
