import { describe, expect, it } from 'vitest';
import { renderSectionHeading } from '../../src/ui/section-heading';

class FakeLink {
  attrs: Record<string, string> = {};
  textContent = '';
  constructor(
    public tag: string,
    public is?: string,
  ) {}
  setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  }
}

type Child = { text: string } | FakeLink;

function fakeDoc() {
  return {
    createTextNode: (text: string): Child => ({ text }),
    createXULElement: (tag: string, options?: { is?: string }) => new FakeLink(tag, options?.is),
  };
}

function fakeHeading() {
  const children: Child[] = [];
  return { children, replaceChildren: (...nodes: Child[]) => void children.splice(0, children.length, ...nodes) };
}

/** What the heading shows: each child as its text, or the link as its tag, custom element, href and text. */
const shown = (children: Child[]) =>
  children.map((child) => (child instanceof FakeLink ? { tag: child.tag, is: child.is, href: child.attrs.href, text: child.textContent } : child));

describe('renderSectionHeading', () => {
  it('writes the name, then the site’s host in parentheses as a zotero-text-link that opens its address', () => {
    const heading = fakeHeading();
    renderSectionHeading(fakeDoc(), heading, 'Kokoro FastAPI', { host: 'github.com/remsky/Kokoro-FastAPI', url: 'https://github.com/remsky/Kokoro-FastAPI' });
    expect(shown(heading.children)).toEqual([
      { text: 'Kokoro FastAPI (' },
      { tag: 'label', is: 'zotero-text-link', href: 'https://github.com/remsky/Kokoro-FastAPI', text: 'github.com/remsky/Kokoro-FastAPI' },
      { text: ')' },
    ]);
  });

  it('writes the name alone for an engine without a site', () => {
    const heading = fakeHeading();
    renderSectionHeading(fakeDoc(), heading, 'piper');
    expect(shown(heading.children)).toEqual([{ text: 'piper' }]);
    renderSectionHeading(fakeDoc(), heading, 'piper', null);
    expect(shown(heading.children)).toEqual([{ text: 'piper' }]);
  });
});
