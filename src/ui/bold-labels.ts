/**
 * A run of a checkbox's label drawn in bold.
 *
 * A XUL <checkbox> draws its `label` attribute as plain text: MozCheckbox
 * copies the attribute into a `.checkbox-label` child (the `text=label`
 * inheritance in toolkit's checkbox.js) and wipes whatever children the
 * markup gave it, so no <b> can be written there. The text therefore stays
 * in the attribute — it is the accessible name, and what shows if this never
 * runs — and `bold="…"` names the run of it redrawn here, in that same
 * `.checkbox-label`. A XUL label is `display: inline-block` unless it has a
 * `value` attribute (xul.css), and this one has none, so the <b> and the text
 * around it lay out as one line.
 *
 * Not a bare checkbox beside a <label control="…"> holding the markup:
 * MozTextLabel's click flips the checkbox's `checked` without a `command`
 * event, and Zotero's preference binding writes the pref from `command`,
 * `input` and `change` (preferences/preferences.js) — the box would tick and
 * the pref would stay behind. Inside the checkbox nothing of its own click,
 * keyboard or focus behavior moves.
 */

const HTML_NS = 'http://www.w3.org/1999/xhtml';

/** Names the run of the checkbox's own `label` to draw in bold. */
export const BOLD_ATTRIBUTE = 'bold';
export const BOLD_SELECTOR = `checkbox[${BOLD_ATTRIBUTE}]`;
/** MozCheckbox's own label child, in the light DOM (its `markup`). */
export const CHECKBOX_LABEL_SELECTOR = '.checkbox-label';

interface NodeLike {
  textContent: string | null;
}

interface LabelLike {
  replaceChildren(...nodes: Array<string | NodeLike>): void;
}

interface CheckboxLike {
  getAttribute(name: string): string | null;
  querySelector(selector: string): LabelLike | null;
}

export interface BoldLabelsDocument {
  querySelectorAll(selector: string): Iterable<CheckboxLike>;
  createElementNS(namespace: string, name: string): NodeLike;
}

export function initBoldLabels(doc: BoldLabelsDocument): void {
  for (const box of doc.querySelectorAll(BOLD_SELECTOR)) {
    const run = box.getAttribute(BOLD_ATTRIBUTE) ?? '';
    const text = box.getAttribute('label') ?? '';
    const at = run ? text.indexOf(run) : -1;
    if (at < 0) continue;
    // Before the widget has built its label, there is nothing to redraw
    const label = box.querySelector(CHECKBOX_LABEL_SELECTOR);
    if (!label) continue;
    const bold = doc.createElementNS(HTML_NS, 'b');
    bold.textContent = run;
    const parts: Array<string | NodeLike> = [text.slice(0, at), bold, text.slice(at + run.length)];
    label.replaceChildren(...parts.filter((part) => part !== ''));
  }
}
