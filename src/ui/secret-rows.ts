import { t } from '../core/l10n';

/**
 * The eye beside every secret field — the API keys, the two Extra headers
 * lines, the WebDAV password — and the masking it switches.
 *
 * Issue #19 left these fields to Gecko: `type="password"` drew the
 * browser's own reveal button, and that button is inert on the `disabled`
 * input a locked section has, which gave "enabled means hidden" for free.
 * What it also gave is a field nothing can be copied out of: Gecko refuses
 * copy and cut on a password editor whether the value is revealed or not
 * (measured in 10.0.3-beta.3: 151 characters selected, `editor.canCopy()`
 * false; the same field as `type="text"`, true). Reading a gateway token
 * back off the screen is not what the eye is for — it is there so the
 * value can be taken somewhere else.
 *
 * So the field is an ordinary text box and the masking is the pane's: the
 * dots are `-webkit-text-security` (Firefox 140 draws them exactly as a
 * password field does, and an empty field still shows its placeholder), and
 * this is the control that turns them off. Revealed, the box is an ordinary
 * one — select, copy, edit.
 *
 * Two properties the markup carries on its own, so a failure here leaves
 * the value covered rather than bare: the masked state is the absence of
 * the attribute, and the stylesheet masks anything with the marker class
 * that is not explicitly revealed. Nothing is persisted — every pane opens
 * masked.
 */

const HTML_NS = 'http://www.w3.org/1999/xhtml';

/** The marker on every field whose value is a secret; the stylesheet masks by it. */
export const SECRET_SELECTOR = 'input.ztts-secret';
export const REVEAL_CLASS = 'ztts-reveal';
/** On the field while its value is in the clear. Absent is masked, which is what the markup alone says. */
export const REVEALED_ATTRIBUTE = 'data-revealed';

interface SecretElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  after(node: unknown): void;
  nextElementSibling?: EyeElement | null;
}

interface EyeElement {
  disabled: boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, fn: () => void): void;
}

export interface SecretRowsDocument {
  createElementNS(namespace: string, name: string): EyeElement;
  querySelectorAll(selector: string): Iterable<SecretElement>;
}

/** Whether a field of a provider section is one of the secrets, told by the marker the stylesheet masks by. */
export function isSecretField(element: { getAttribute?(name: string): string | null }): boolean {
  return (element.getAttribute?.('class') ?? '').split(/\s+/).includes('ztts-secret');
}

/** The eye of a field, when the pane put one there. */
function eyeOf(input: SecretElement): EyeElement | null {
  const next = input.nextElementSibling ?? null;
  return next && next.getAttribute('class') === REVEAL_CLASS ? next : null;
}

function paintEye(eye: EyeElement, revealed: boolean): void {
  eye.setAttribute('aria-pressed', revealed ? 'true' : 'false');
  const label = revealed ? t('ztts-secret-hide') : t('ztts-secret-show');
  eye.setAttribute('aria-label', label);
  eye.setAttribute('title', label);
}

function setRevealed(input: SecretElement, revealed: boolean): void {
  if (revealed) input.setAttribute(REVEALED_ATTRIBUTE, 'true');
  else input.removeAttribute(REVEALED_ATTRIBUTE);
  const eye = eyeOf(input);
  if (eye) paintEye(eye, revealed);
}

/**
 * A provider section's lock, as ui/provider-rows.ts paints it: while the
 * provider is on its secrets are masked and the eye does nothing, so a
 * value revealed for editing does not stay bare behind the lock — the
 * state a shared screen or a screenshot catches (issue #19).
 */
export function setSecretLocked(input: SecretElement, locked: boolean): void {
  if (locked) setRevealed(input, false);
  const eye = eyeOf(input);
  if (eye) eye.disabled = locked;
}

/** One eye after each secret field, before the `?` where there is one. */
export function initSecretRows(doc: SecretRowsDocument): void {
  for (const input of doc.querySelectorAll(SECRET_SELECTOR)) {
    const eye = doc.createElementNS(HTML_NS, 'button');
    eye.setAttribute('class', REVEAL_CLASS);
    // Not an <input>: provider-rows disables `input, menulist, checkbox`
    // throughout a locked section, and whether the eye works there is this
    // module's decision, not a side effect of that sweep
    eye.setAttribute('type', 'button');
    paintEye(eye, false);
    eye.addEventListener('click', () => {
      if (eye.disabled) return;
      setRevealed(input, input.getAttribute(REVEALED_ATTRIBUTE) !== 'true');
    });
    input.after(eye);
  }
}
