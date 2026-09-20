import { describe, expect, it } from 'vitest';
import { REVEAL_CLASS, REVEALED_ATTRIBUTE, SECRET_SELECTOR, initSecretRows, setSecretLocked } from '../../src/ui/secret-rows';

const HTML_NS = 'http://www.w3.org/1999/xhtml';

class FakeElement {
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => void>>();
  disabled = false;
  value = '';
  nextElementSibling: FakeElement | null = null;
  constructor(
    public tagName: string,
    public namespace = HTML_NS,
  ) {}
  setAttribute(name: string, value: string) {
    this.attrs.set(name, String(value));
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
  removeAttribute(name: string) {
    this.attrs.delete(name);
  }
  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }
  /** ChildNode.after: the eye lands between the field and the ? after it. */
  after(node: FakeElement) {
    this.nextElementSibling = node;
  }
  click() {
    for (const fn of this.listeners.get('click') ?? []) fn();
  }
}

function fakeSecret(value = 'CF-Access-Client-Id: abc') {
  const input = new FakeElement('input');
  input.value = value;
  return input;
}

function setup(inputs: FakeElement[]) {
  const doc = {
    createElementNS: (namespace: string, name: string) => new FakeElement(name, namespace),
    querySelectorAll: (selector: string) => (selector === SECRET_SELECTOR ? inputs : []),
  };
  initSecretRows(doc);
  return doc;
}

/** The eye the pane inserts after a field, as the DOM holds it. */
const eyeOf = (input: FakeElement) => input.nextElementSibling!;

describe('initSecretRows', () => {
  it('puts an html button after every secret field, and reveals none of them', () => {
    const inputs = [fakeSecret(), fakeSecret()];
    setup(inputs);
    for (const input of inputs) {
      const eye = eyeOf(input);
      expect(eye.tagName).toBe('button');
      expect(eye.namespace).toBe(HTML_NS);
      expect(eye.attrs.get('class')).toBe(REVEAL_CLASS);
      // A section's lock sweeps `input, menulist, checkbox`: a button is not one, so the pane decides itself when the eye is inert
      expect(eye.tagName).not.toBe('input');
      expect(input.getAttribute(REVEALED_ATTRIBUTE)).toBeNull();
      expect(eye.attrs.get('aria-pressed')).toBe('false');
    }
  });

  it('reveals the value on a click and masks it again on the next', () => {
    const input = fakeSecret();
    setup([input]);
    const eye = eyeOf(input);
    const masked = eye.attrs.get('aria-label');

    eye.click();
    expect(input.getAttribute(REVEALED_ATTRIBUTE)).toBe('true');
    expect(eye.attrs.get('aria-pressed')).toBe('true');
    expect(eye.attrs.get('aria-label')).not.toBe(masked);

    eye.click();
    expect(input.getAttribute(REVEALED_ATTRIBUTE)).toBeNull();
    expect(eye.attrs.get('aria-pressed')).toBe('false');
    expect(eye.attrs.get('aria-label')).toBe(masked);
  });

  // Revealing is presentation: the value is the pref's, byte for byte, and
  // the state is never persisted — a reopened pane is masked again
  it('never touches the field’s value', () => {
    const input = fakeSecret('CF-Access-Client-Id: abc; CF-Access-Client-Secret: def');
    setup([input]);
    eyeOf(input).click();
    eyeOf(input).click();
    expect(input.value).toBe('CF-Access-Client-Id: abc; CF-Access-Client-Secret: def');
  });
});

describe('setSecretLocked', () => {
  // Enabled means hidden (issue #19): a provider's secrets cannot be read
  // while it is on, and a field revealed before the switch is masked again
  it('masks a revealed field and makes its eye inert', () => {
    const input = fakeSecret();
    setup([input]);
    const eye = eyeOf(input);
    eye.click();

    setSecretLocked(input, true);
    expect(input.getAttribute(REVEALED_ATTRIBUTE)).toBeNull();
    expect(eye.disabled).toBe(true);
    eye.click();
    expect(input.getAttribute(REVEALED_ATTRIBUTE)).toBeNull();
  });

  it('gives the eye back when the section unlocks, still masked', () => {
    const input = fakeSecret();
    setup([input]);
    const eye = eyeOf(input);
    setSecretLocked(input, true);

    setSecretLocked(input, false);
    expect(eye.disabled).toBe(false);
    expect(input.getAttribute(REVEALED_ATTRIBUTE)).toBeNull();
    eye.click();
    expect(input.getAttribute(REVEALED_ATTRIBUTE)).toBe('true');
  });

  it('leaves a field alone that has no eye of its own', () => {
    const input = fakeSecret();
    expect(() => setSecretLocked(input, true)).not.toThrow();
    expect(input.getAttribute(REVEALED_ATTRIBUTE)).toBeNull();
  });
});
