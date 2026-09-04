// Record which English revision each Chinese page follows: `npm run docs:pin`.
// Every `X.zh.md` opens with `<!-- translated-from: X.md sha256:… -->`, and
// test/docs-translation.test.ts fails when that hash has moved — so a Chinese
// page can never quietly fall behind an English edit (issue #29). Run this
// after the translation is brought up to date, never before.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SUFFIX = '.zh.md';
const MARKER = /^<!-- translated-from: \S+ sha256:[0-9a-f]{12} -->\n?/;

function pin(source) {
  return createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, 12);
}

for (const dir of ['.', 'tutorials']) {
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(SUFFIX)) continue;
    const translated = dir === '.' ? name : join(dir, name);
    const sourceName = `${name.slice(0, -SUFFIX.length)}.md`;
    const source = dir === '.' ? sourceName : join(dir, sourceName);
    const line = `<!-- translated-from: ${sourceName} sha256:${pin(source)} -->\n`;
    const body = readFileSync(translated, 'utf8').replace(MARKER, '');
    writeFileSync(translated, line + body, 'utf8');
    console.log(`${translated} → ${sourceName}`);
  }
}
