import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FluentBundle, FluentResource } from '@fluent/bundle';
import { setMessageSource } from '../src/core/l10n';

/**
 * Every test sees the plugin's strings as a user does (issue #30): `t()`
 * formats through Fluent's reference implementation over the en-US file,
 * so a test asserts the sentence the pane shows, and a change of wording
 * in the file is what fails it — never a copy of the sentence kept in the
 * test. Bidi isolation is off, as in Gecko's own bundles, so the text is
 * the plain sentence. Loaded by vitest before every test file
 * (vitest.config.ts setupFiles); a test that installs a source of its own
 * calls installEnglishStrings() afterwards.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const EN_US_FTL = join(root, 'addon', 'locale', 'en-US', 'zotero-tts.ftl');

export function englishBundle(): FluentBundle {
  const bundle = new FluentBundle('en-US', { useIsolating: false });
  const errors = bundle.addResource(new FluentResource(readFileSync(EN_US_FTL, 'utf8')));
  if (errors.length) throw errors[0];
  return bundle;
}

let shared: FluentBundle | null = null;
const bundle = () => (shared ??= englishBundle());

/** A message's value in en-US, as the pane shows it; undefined when it has none. For the markup tests, whose wording lives in the file now. */
export function englishValue(id: string): string | undefined {
  const message = bundle().getMessage(id);
  return message?.value ? bundle().formatPattern(message.value) : undefined;
}

/** A message's attribute in en-US — a label, a ? icon's help — as the pane shows it; undefined when there is none. */
export function englishAttribute(id: string, attribute: string): string | undefined {
  const pattern = bundle().getMessage(id)?.attributes[attribute];
  return pattern ? bundle().formatPattern(pattern) : undefined;
}

export function installEnglishStrings(): void {
  const bundle = englishBundle();
  setMessageSource({
    formatValueSync(id, args) {
      const message = bundle.getMessage(id);
      if (!message?.value) return null;
      const errors: Error[] = [];
      const text = bundle.formatPattern(message.value, args, errors);
      if (errors.length) throw errors[0];
      return text;
    },
  });
}

installEnglishStrings();
