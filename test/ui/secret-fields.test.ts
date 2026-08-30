import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The pane's secret fields are masked, and nothing reveals them while their
 * provider is on (issue #19).
 *
 * `type="password"` is the whole of it. A masked field draws Gecko's own
 * reveal button — present and working in Zotero 10.0.2-beta.1 whatever
 * `layout.forms.reveal-password-button.enabled` says — and that button is
 * inert on a `disabled` input, which is what a provider section's fields
 * are while the provider is on. So the value is readable exactly while you
 * are editing it and hidden the rest of the time, with no control of the
 * plugin's own.
 */
describe('addon/content/preferences.xhtml', () => {
  const xhtml = readFileSync(new URL('../../addon/content/preferences.xhtml', import.meta.url), 'utf8');
  const inputs = [...xhtml.matchAll(/<html:input\b[^>]*>/g)].map((match) => match[0]);
  const attr = (markup: string, name: string) => markup.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const prefOf = (markup: string) => attr(markup, 'preference')?.replace(/^extensions\.zotero\.zotero-tts\./, '');

  /** Every field of the pane whose value is a secret: the keys, the gateway headers, the WebDAV password. */
  const SECRETS = ['openai.apiKey', 'openai.headers', 'azure.apiKey', 'local.headers', 'webdav.password'];

  it('masks every secret field', () => {
    for (const name of SECRETS) {
      const markup = inputs.find((input) => prefOf(input) === name);
      expect(markup, name).toBeDefined();
      expect(attr(markup!, 'type'), name).toBe('password');
    }
  });

  // A new key or header field that keeps the default type would render a
  // Cloudflare Access service token in full, and nothing else would say so
  it('leaves no field whose name says secret unmasked', () => {
    for (const markup of inputs) {
      const name = prefOf(markup);
      if (!name || !/key|password|headers/i.test(name)) continue;
      expect(SECRETS, `${name} looks like a secret`).toContain(name);
    }
  });

  // An empty type="password" input still matches :placeholder-shown
  // (measured in 10.0.2-beta.1: text empty true, password empty true,
  // password filled false), so masking costs the header fields nothing —
  // and their format hint is the only thing that says what belongs in them
  it('keeps the format hint on the two Extra headers fields', () => {
    for (const name of ['openai.headers', 'local.headers']) {
      const markup = inputs.find((input) => prefOf(input) === name);
      expect(attr(markup!, 'placeholder'), name).toBe('Name: value; Name: value');
    }
  });
});

describe('addon/content/preferences.css', () => {
  const css = readFileSync(new URL('../../addon/content/preferences.css', import.meta.url), 'utf8');

  // Masked or revealed, the field is the same width: the column stays straight
  it('sizes text and password fields alike', () => {
    expect(css).toMatch(/input:is\(\[type="text"\], \[type="password"\]\)/);
  });
});
