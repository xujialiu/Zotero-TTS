// Render Markdown to a browser preview: `node scripts/render-md.mjs [files...]`
// (default: README, PHILOSOPHY, tutorials/, notes/). Each file becomes
// docs/<same path>.html — the source tree mirrored under docs/, with relative
// links rewritten so images and cross-links still resolve.
// Needs pandoc on PATH. docs/ is gitignored.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';

const OUT_DIR = 'docs';

const STYLE = `
:root {
  --fg: #1f2328; --muted: #59636e; --bg: #ffffff; --border: #d1d9e0;
  --code-bg: #f6f8fa; --link: #0969da; --quote: #59636e;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fg: #f0f6fc; --muted: #9198a1; --bg: #0d1117; --border: #3d444d;
    --code-bg: #151b23; --link: #4493f8; --quote: #9198a1;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0 auto; max-width: 1012px; padding: 32px 24px 96px;
  background: var(--bg); color: var(--fg);
  font: 16px/1.6 -apple-system, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  word-wrap: break-word;
}
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
h1, h2, h3, h4 { margin: 24px 0 16px; font-weight: 600; line-height: 1.25; }
h1 { font-size: 2em; }
h2 { font-size: 1.5em; }
h3 { font-size: 1.25em; }
h1, h2 { padding-bottom: .3em; border-bottom: 1px solid var(--border); }
p, ul, ol, table, pre, details, blockquote { margin: 0 0 16px; }
li { margin-top: .25em; }
img { max-width: 100%; vertical-align: middle; }
code {
  padding: .2em .4em; border-radius: 6px; background: var(--code-bg);
  font: 85%/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
}
pre {
  padding: 16px; overflow: auto; border-radius: 6px; background: var(--code-bg);
  font: 85%/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
}
pre code { padding: 0; background: none; font-size: 100%; }
table { display: block; width: max-content; max-width: 100%; overflow: auto; border-collapse: collapse; }
th, td { padding: 6px 13px; border: 1px solid var(--border); }
tr:nth-child(2n) td { background: var(--code-bg); }
blockquote { padding: 0 1em; color: var(--quote); border-left: .25em solid var(--border); }
details { padding: 8px 16px; border: 1px solid var(--border); border-radius: 6px; }
details[open] summary { margin-bottom: 12px; }
summary { cursor: pointer; font-weight: 600; }
hr { height: 1px; margin: 24px 0; border: 0; background: var(--border); }
kbd {
  padding: 3px 5px; border: 1px solid var(--border); border-bottom-width: 2px;
  border-radius: 6px; background: var(--code-bg); font-size: 11px;
}
`;

function render(src) {
  const srcDir = dirname(src).split(/[\\/]/).join('/');
  const outDir = srcDir === '.' ? OUT_DIR : posix.join(OUT_DIR, srcDir);
  const body = execFileSync(
    'pandoc',
    ['-f', 'gfm', '-t', 'html', '--wrap=preserve', src],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
    // docs/ mirrors the source tree, so a link to another rendered .md keeps
    // its path; everything else (images, LICENSE) is re-aimed at the source.
    .replace(/\b(src|href)="([^"]+)"/g, (whole, attr, url) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(url)) return whole;
      const [target, hash = ''] = url.split(/(?=#)/);
      if (target.toLowerCase().endsWith('.md')) {
        return `${attr}="${target.slice(0, -3)}.html${hash}"`;
      }
      const back = posix.relative(outDir, posix.join(srcDir, target));
      return `${attr}="${back}${hash}"`;
    });
  const title = basename(src).replace(/\.md$/i, '');
  const out = join(outDir, `${title}.html`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    out,
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
${body}</body>
</html>
`,
    'utf8',
  );
  return out;
}

// The default set is every doc the README links to, so the preview navigates.
function defaultFiles() {
  const files = ['README.md', 'PHILOSOPHY.md'];
  for (const dir of ['tutorials', 'notes']) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.md')) files.push(join(dir, name));
    }
  }
  return files;
}

const files = process.argv.slice(2);
for (const file of files.length ? files : defaultFiles()) {
  console.log(render(file));
}
