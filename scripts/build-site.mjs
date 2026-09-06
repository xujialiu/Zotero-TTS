// Build the public docs site, published to GitHub Pages (issue #57):
// `node scripts/build-site.mjs [outDir]`, default site/ (gitignored).
// .github/workflows/pages.yml runs it and deploys the result on every push to
// main that touches the docs. README.md becomes index.html, README.zh.md
// index.zh.html, PHILOSOPHY.md and tutorials/*.md keep their paths; the body
// of each is the pandoc rendering of render-md.mjs. Links: one to a published
// page stays on the site, an image is copied in, anything else local
// (LICENSE, notes/) goes to the file on GitHub. The head carries what a search
// engine reads — title, description, canonical URL, the en / zh-CN
// alternates — and the site gets sitemap.xml and robots.txt.
// GOOGLE_SITE_VERIFICATION in the environment (a repository variable in the
// workflow) becomes the Search Console verification tag.
// Needs pandoc on PATH.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLE, isMain, pandocHtml } from './render-md.mjs';

export const SITE = {
  name: 'Zotero-TTS',
  base: 'https://xujialiu.github.io/Zotero-TTS/',
  repo: 'https://github.com/xujialiu/Zotero-TTS',
  branch: 'main',
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE = /\.(?:png|gif|jpe?g|svg|webp)$/i;
/** The plugin's icon, every page's favicon (issue #60). */
const FAVICON = 'assets/icon.png';
// Search engines show about this much of a description.
const DESCRIPTION_LENGTH = 160;
// A first paragraph shorter than this is the language switcher or an image,
// not a description.
const DESCRIPTION_MIN = 40;

const FOOTER = {
  en: (repo) => `<a href="${repo}">${SITE.name} on GitHub</a> · <a href="${repo}/releases/latest">Latest release</a>`,
  'zh-CN': (repo) => `<a href="${repo}">GitHub 仓库</a> · <a href="${repo}/releases/latest">最新发行版</a>`,
};

const SITE_STYLE = `
footer {
  margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border);
  color: var(--muted); font-size: 14px;
}
`;

/** Source file (repo-relative, posix) → its path on the site, for every page published. */
function pages() {
  const map = new Map([
    ['README.md', 'index.html'],
    ['README.zh.md', 'index.zh.html'],
    ['PHILOSOPHY.md', 'PHILOSOPHY.html'],
  ]);
  for (const name of readdirSync(join(ROOT, 'tutorials')).sort()) {
    if (name.endsWith('.md')) map.set(`tutorials/${name}`, `tutorials/${name.slice(0, -3)}.html`);
  }
  return map;
}

/** The URL of a page on the site; an index is its directory. */
function urlOf(outPath) {
  if (posix.basename(outPath) !== 'index.html') return SITE.base + outPath;
  const dir = posix.dirname(outPath);
  return dir === '.' ? SITE.base : `${SITE.base}${dir}/`;
}

/** A relative link from one page to another; an index is linked as its directory. */
function linkTo(fromOut, toOut) {
  const fromDir = posix.dirname(fromOut);
  if (posix.basename(toOut) !== 'index.html') return posix.relative(fromDir, toOut);
  const rel = posix.relative(fromDir, posix.dirname(toOut));
  return rel ? `${rel}/` : './';
}

/** [hreflang, URL] for the English page and its Chinese twin, whichever of the two `src` is. */
function alternates(src, all) {
  const en = src.endsWith('.zh.md') ? `${src.slice(0, -6)}.md` : src;
  const zh = `${en.slice(0, -3)}.zh.md`;
  const list = [];
  if (all.has(en)) list.push(['en', urlOf(all.get(en))]);
  if (all.has(zh)) list.push(['zh-CN', urlOf(all.get(zh))]);
  if (all.has(en)) list.push(['x-default', urlOf(all.get(en))]);
  return list;
}

const decode = (s) =>
  s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[e]);
const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeText(s).replace(/"/g, '&quot;');
/** The text of a rendered fragment, entities decoded, whitespace collapsed. */
const text = (html) => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** The first real paragraph, cut to what a result snippet shows. */
function describe(body) {
  for (const [, inner] of body.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)) {
    const t = text(inner);
    if (t.length < DESCRIPTION_MIN) continue;
    if (t.length <= DESCRIPTION_LENGTH) return t;
    const cut = t.slice(0, DESCRIPTION_LENGTH - 1);
    const space = cut.lastIndexOf(' ');
    return `${space > DESCRIPTION_LENGTH / 2 ? cut.slice(0, space) : cut}…`;
  }
  return '';
}

/**
 * Rewrite the body's relative links for the site. `images` collects every
 * image referenced, as repo-relative path → the page that references it.
 */
function rewrite(body, src, outPath, all, images) {
  const srcDir = posix.dirname(src);
  const outDir = posix.dirname(outPath);
  return body.replace(/\b(src|href)="([^"]+)"/g, (whole, attr, url) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(url)) return whole;
    const [target, hash = ''] = url.split(/(?=#)/);
    const rel = posix.normalize(posix.join(srcDir, target));
    if (all.has(rel)) return `${attr}="${linkTo(outPath, all.get(rel))}${hash}"`;
    if (IMAGE.test(rel)) {
      images.set(rel, src);
      return `${attr}="${posix.relative(outDir, rel)}${hash}"`;
    }
    return `${attr}="${SITE.repo}/blob/${SITE.branch}/${rel}${hash}"`;
  });
}

function page(src, outPath, all, images, verification) {
  const body = rewrite(pandocHtml(join(ROOT, src)), src, outPath, all, images);
  images.set(FAVICON, src);
  const heading = text(body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '') || posix.basename(src, '.md');
  const title = heading.includes(SITE.name) ? heading : `${heading} · ${SITE.name}`;
  const lang = src.endsWith('.zh.md') ? 'zh-CN' : 'en';
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeText(title)}</title>`,
    `<meta name="description" content="${escapeAttr(describe(body))}">`,
    `<link rel="canonical" href="${urlOf(outPath)}">`,
    ...alternates(src, all).map(([hreflang, href]) => `<link rel="alternate" hreflang="${hreflang}" href="${href}">`),
    `<link rel="icon" type="image/png" href="${posix.relative(posix.dirname(outPath), FAVICON)}">`,
  ];
  if (verification) head.push(`<meta name="google-site-verification" content="${escapeAttr(verification)}">`);
  head.push(`<style>${STYLE}${SITE_STYLE}</style>`);
  return `<!doctype html>
<html lang="${lang}">
<head>
${head.join('\n')}
</head>
<body>
${body}<footer>${FOOTER[lang](SITE.repo)}</footer>
</body>
</html>
`;
}

/** When the source was last committed, ISO 8601; empty outside a git checkout. */
function lastmod(src) {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cI', '--', src], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function sitemap(all) {
  const urls = [...all].map(([src, outPath]) => {
    const lines = [`<loc>${urlOf(outPath)}</loc>`];
    const modified = lastmod(src);
    if (modified) lines.push(`<lastmod>${modified}</lastmod>`);
    for (const [hreflang, href] of alternates(src, all)) {
      lines.push(`<xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}"/>`);
    }
    return `<url>\n${lines.join('\n')}\n</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`;
}

const robots = () => `User-agent: *
Allow: /

Sitemap: ${SITE.base}sitemap.xml
`;

/** Build the site into `outDir`; returns the files written, site-relative. */
export function buildSite({ outDir = join(ROOT, 'site'), verification = process.env.GOOGLE_SITE_VERIFICATION ?? '' } = {}) {
  const all = pages();
  const images = new Map();
  const written = [];
  const write = (rel, content) => {
    const file = join(outDir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content, 'utf8');
    written.push(rel);
  };
  for (const [src, outPath] of all) write(outPath, page(src, outPath, all, images, verification));
  for (const [rel, src] of images) {
    const from = join(ROOT, rel);
    if (!existsSync(from)) throw new Error(`${src} shows ${rel}, which does not exist`);
    const to = join(outDir, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    written.push(rel);
  }
  write('sitemap.xml', sitemap(all));
  write('robots.txt', robots());
  return written;
}

if (isMain(import.meta.url)) {
  const outDir = process.argv[2] ? resolve(process.argv[2]) : undefined;
  for (const file of buildSite({ outDir })) console.log(join(outDir ?? 'site', file));
}
