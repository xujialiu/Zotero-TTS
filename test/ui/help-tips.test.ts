import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { HELP_ATTRIBUTE, HELP_ICON_SELECTOR, HELP_POPUPSET_ID, HELP_TIP_ID, initHelpTips } from '../../src/ui/help-tips';

class FakeIcon {
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<(event: { screenX: number; screenY: number }) => void>>();
  constructor(help?: string) {
    if (help !== undefined) this.attrs.set(HELP_ATTRIBUTE, help);
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
  addEventListener(type: string, fn: (event: { screenX: number; screenY: number }) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }
  fire(type: string, at = { screenX: 700, screenY: 400 }) {
    for (const fn of this.listeners.get(type) ?? []) fn(at);
  }
}

function setup(icons: FakeIcon[], withPopupset = true) {
  const tip = { attrs: new Map<string, string>(), openPopupAtScreen: vi.fn(), hidePopup: vi.fn(), setAttribute(k: string, v: string) { this.attrs.set(k, v); } };
  const popupset = { append: vi.fn() };
  const created: string[] = [];
  const doc = {
    getElementById: (id: string) => (withPopupset && id === HELP_POPUPSET_ID ? popupset : null),
    createElementNS: (ns: string, name: string) => {
      created.push(`${ns} ${name}`);
      return tip;
    },
    querySelectorAll: (selector: string) => (selector === HELP_ICON_SELECTOR ? icons : []),
  };
  initHelpTips(doc);
  return { tip, popupset, created };
}

describe('initHelpTips', () => {
  it('creates the one XUL tooltip of the pane and appends it to the popupset', () => {
    const { tip, popupset, created } = setup([]);
    expect(created).toEqual(['http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul tooltip']);
    expect(tip.attrs.get('id')).toBe(HELP_TIP_ID);
    expect(popupset.append).toHaveBeenCalledWith(tip);
  });

  // At the pointer, not under the icon: anchored to the icon the text sat
  // under the arrow cursor. The point is passed as is — Gecko itself puts a
  // tooltip popup 21 px below the point it is given, as it does Zotero's own.
  it('opens the pane tooltip with the icon text the moment the mouse enters, at the pointer', () => {
    const icon = new FakeIcon('Only while Read Aloud is open.');
    const { tip } = setup([icon]);
    icon.fire('mouseenter', { screenX: 812, screenY: 331 });
    expect(tip.attrs.get('label')).toBe('Only while Read Aloud is open.');
    expect(tip.openPopupAtScreen).toHaveBeenCalledTimes(1);
    expect(tip.openPopupAtScreen).toHaveBeenCalledWith(812, 331, false);
  });

  it('closes it when the mouse leaves or presses', () => {
    const icon = new FakeIcon('text');
    const { tip } = setup([icon]);
    icon.fire('mouseenter');
    icon.fire('mouseleave');
    expect(tip.hidePopup).toHaveBeenCalledTimes(1);
    icon.fire('mouseenter');
    icon.fire('mousedown');
    expect(tip.hidePopup).toHaveBeenCalledTimes(2);
  });

  it('reads the text at hover time, so a note written later (the server preset) shows', () => {
    const icon = new FakeIcon();
    const { tip } = setup([icon]);
    icon.fire('mouseenter');
    expect(tip.openPopupAtScreen).not.toHaveBeenCalled();
    icon.attrs.set(HELP_ATTRIBUTE, 'Chatterbox has no key.');
    icon.fire('mouseenter');
    expect(tip.attrs.get('label')).toBe('Chatterbox has no key.');
    expect(tip.openPopupAtScreen).toHaveBeenCalledTimes(1);
  });

  it('tolerates a pane without the popupset', () => {
    const icon = new FakeIcon('text');
    expect(() => setup([icon], false)).not.toThrow();
    expect(() => icon.fire('mouseenter')).not.toThrow();
  });
});

// The icons' text lives in `help`, which nothing of Zotero's reads: a
// `tooltiptext` would open Zotero's own tooltip 500 ms later as well.
describe('addon/content/preferences.xhtml', () => {
  const xhtml = readFileSync(new URL('../../addon/content/preferences.xhtml', import.meta.url), 'utf8');
  const rowOf = (marker: string) => {
    const at = xhtml.indexOf(marker);
    expect(at, marker).toBeGreaterThan(-1);
    return xhtml.slice(xhtml.lastIndexOf('<hbox', at), xhtml.indexOf('</hbox>', at));
  };
  const help = /<label class="ztts-help" value="\?" help="([^"]+)"\/>/;

  it('has the popupset the tooltip goes into, no tooltip of its own, and a class on the root for the stylesheet', () => {
    expect(xhtml).toContain(`<popupset id="${HELP_POPUPSET_ID}"/>`);
    // Written in the markup, Zotero's parse-then-import creates it twice over
    expect(xhtml).not.toContain('<tooltip');
    expect(xhtml).toMatch(/<vbox class="ztts-pane"[^>]*\sonload="Zotero\.ZoteroTTS\.prefsPane\.onPaneLoad\(document\)"/);
  });

  it('gives no icon a tooltiptext', () => {
    expect(xhtml).not.toMatch(/ztts-help[^>]*tooltiptext=/);
  });

  it('explains the Reading switches with a ? instead of a parenthesis in the label', () => {
    const rows: Array<[string, RegExp, RegExp]> = [
      ['readAloud.sameForAllDocuments', /label="Use one voice everywhere"/, /one voice per document language/],
      ['readAloud.globalSpeed', /label="Use one speed everywhere"/, /one speed per document language/],
      ['readAloud.hideZoteroLocalVoices', /label="Hide System Local voices"/, /marked “Local-…”/],
    ];
    for (const [pref, label, text] of rows) {
      const row = rowOf(`preference="extensions.zotero.zotero-tts.${pref}"`);
      expect(row, pref).toMatch(label);
      expect(row.match(help)?.[1], pref).toMatch(text);
    }
  });

  it('explains Extra headers, in the OpenAI and the local group alike', () => {
    for (const marker of ['id="ztts-openai-headers"', 'preference="extensions.zotero.zotero-tts.local.headers"']) {
      const text = rowOf(marker).match(help)?.[1];
      expect(text, marker).toMatch(/Cloudflare Access/);
      expect(text, marker).toMatch(/CF-Access-Client-Id/);
    }
  });
});
