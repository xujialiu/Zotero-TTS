/**
 * A provider section's heading with its site in parentheses (issue #112):
 * `Kokoro-FastAPI (github.com/remsky/Kokoro-FastAPI)`, the host a
 * zotero-text-link that opens the address in the browser. The sections
 * whose name is fixed carry the same shape in preferences.xhtml; this
 * renders the one heading the pane fills at load, the local engine's,
 * whose name and site come from the engine registry.
 */

export interface HeadingSite {
  /** The host as shown, `github.com/remsky/Kokoro-FastAPI`. */
  host: string;
  /** The address the link opens. */
  url: string;
}

export interface HeadingDoc {
  createTextNode(text: string): unknown;
  /** Zotero's `document.createXULElement(name, { is })`: the link is a XUL label extended by zotero-text-link. */
  createXULElement(name: string, options?: { is?: string }): { setAttribute(name: string, value: string): void; textContent: string };
}

export interface HeadingElement {
  replaceChildren(...nodes: unknown[]): void;
}

/** The heading's content: the name alone, or the name, a space and the site's host in parentheses as a link. */
export function renderSectionHeading(doc: HeadingDoc, heading: HeadingElement, label: string, site?: HeadingSite | null): void {
  if (!site) {
    heading.replaceChildren(doc.createTextNode(label));
    return;
  }
  const link = doc.createXULElement('label', { is: 'zotero-text-link' });
  link.setAttribute('href', site.url);
  // Text content, as the pane's other links carry theirs (Fluent fills them the same way)
  link.textContent = site.host;
  heading.replaceChildren(doc.createTextNode(`${label} (`), link, doc.createTextNode(')'));
}
