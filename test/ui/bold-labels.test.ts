import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOLD_ATTRIBUTE, BOLD_SELECTOR, CHECKBOX_LABEL_SELECTOR, initBoldLabels } from '../../src/ui/bold-labels';
import { englishAttribute } from '../setup';

const HTML_NS = 'http://www.w3.org/1999/xhtml';

class FakeLabel {
  children: Array<string | FakeNode> = [];
  replaceChildren(...nodes: Array<string | FakeNode>) {
    this.children = nodes;
  }
}

class FakeNode {
  textContent: string | null = null;
  constructor(readonly name: string) {}
}

class FakeCheckbox {
  attrs = new Map<string, string>();
  label: FakeLabel | null = new FakeLabel();
  constructor(attrs: Record<string, string>, withLabelChild = true) {
    for (const [name, value] of Object.entries(attrs)) this.attrs.set(name, value);
    if (!withLabelChild) this.label = null;
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
  querySelector(selector: string) {
    return selector === CHECKBOX_LABEL_SELECTOR ? this.label : null;
  }
}

function setup(boxes: FakeCheckbox[]) {
  const created: string[] = [];
  initBoldLabels({
    querySelectorAll: (selector: string) => (selector === BOLD_SELECTOR ? boxes : []),
    createElementNS: (namespace: string, name: string) => {
      created.push(`${namespace} ${name}`);
      return new FakeNode(name);
    },
  });
  return { created };
}

describe('initBoldLabels', () => {
  it('redraws the named run of the label in an HTML <b>, the text around it kept', () => {
    const box = new FakeCheckbox({
      label: 'Offer only favorite voices in the Read Aloud player',
      [BOLD_ATTRIBUTE]: 'favorite voices',
    });
    const { created } = setup([box]);
    expect(created).toEqual([`${HTML_NS} b`]);
    const [before, bold, after] = box.label!.children as [string, FakeNode, string];
    expect(before).toBe('Offer only ');
    expect(bold.textContent).toBe('favorite voices');
    expect(after).toBe(' in the Read Aloud player');
  });

  // The attribute is the checkbox's accessible name, and what shows of the
  // label if this never runs — the bold run only redraws it
  it('leaves the label attribute alone', () => {
    const box = new FakeCheckbox({ label: 'Offer only favorite voices', [BOLD_ATTRIBUTE]: 'favorite voices' });
    setup([box]);
    expect(box.getAttribute('label')).toBe('Offer only favorite voices');
  });

  it('drops the empty end when the run starts or ends the label', () => {
    const first = new FakeCheckbox({ label: 'Favorite voices only', [BOLD_ATTRIBUTE]: 'Favorite voices' });
    const last = new FakeCheckbox({ label: 'Offer only favorite voices', [BOLD_ATTRIBUTE]: 'favorite voices' });
    setup([first, last]);
    expect(first.label!.children).toHaveLength(2);
    expect(first.label!.children[1]).toBe(' only');
    expect(last.label!.children).toHaveLength(2);
    expect(last.label!.children[0]).toBe('Offer only ');
  });

  it('leaves a label the run is not in untouched', () => {
    const box = new FakeCheckbox({ label: 'Use one voice everywhere', [BOLD_ATTRIBUTE]: 'favorite voices' });
    const { created } = setup([box]);
    expect(created).toEqual([]);
    expect(box.label!.children).toEqual([]);
  });

  it('tolerates an empty run and a checkbox the widget has not built its label into yet', () => {
    const empty = new FakeCheckbox({ label: 'Use one voice everywhere', [BOLD_ATTRIBUTE]: '' });
    const bare = new FakeCheckbox({ label: 'Offer only favorite voices', [BOLD_ATTRIBUTE]: 'favorite voices' }, false);
    let created: string[] = [];
    expect(() => ({ created } = setup([empty, bare]))).not.toThrow();
    expect(created).toEqual([]);
    expect(empty.label!.children).toEqual([]);
  });
});

describe('addon/content/preferences.xhtml', () => {
  const xhtml = readFileSync(new URL('../../addon/content/preferences.xhtml', import.meta.url), 'utf8');
  const checkboxes = [...xhtml.matchAll(/<checkbox\b[^>]*>/g)].map((match) => match[0]);

  // The words are the message's (addon/locale, issue #30); the markup names
  // the run's attribute so Fluent writes it beside the label
  it('bolds the favorite voices of the voice browser switch, in the Read Aloud player', () => {
    const box = checkboxes.find((markup) => markup.includes('id="ztts-favorites-only"'));
    expect(box).toBeDefined();
    expect(box).toContain('data-l10n-id="ztts-favorites-only"');
    expect(box).toContain(`data-l10n-attrs="${BOLD_ATTRIBUTE}"`);
    expect(englishAttribute('ztts-favorites-only', 'label')).toBe('Offer only favorite voices in the Read Aloud player');
    expect(englishAttribute('ztts-favorites-only', BOLD_ATTRIBUTE)).toBe('favorite voices');
  });

  // A run that is not in the label would silently stay unbolded; here for
  // en-US, and for every locale in test/l10n.test.ts
  it('names a run its own label holds on every checkbox that asks for bold', () => {
    for (const markup of checkboxes) {
      if (!markup.includes(`data-l10n-attrs="${BOLD_ATTRIBUTE}"`)) continue;
      const id = markup.match(/data-l10n-id="([^"]+)"/)?.[1];
      expect(id, markup).toBeDefined();
      expect(englishAttribute(id!, 'label'), markup).toContain(englishAttribute(id!, BOLD_ATTRIBUTE));
    }
  });
});
