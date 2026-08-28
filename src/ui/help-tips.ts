/**
 * The ? icons' tooltips, open the moment the mouse is on the icon.
 *
 * Zotero's own tooltips (`tooltiptext`) open after `ui.tooltip.delay_ms`,
 * 500 ms — a pref of the whole application (every tooltip in Zotero, and
 * it stays in the profile), not a plugin's to change. So the icons carry
 * their text in `help`, an attribute nothing of Zotero's reads (a
 * `tooltiptext` would open Zotero's tooltip 500 ms later as well), and
 * one <tooltip> of the pane is opened on mouseenter and closed on
 * mouseleave. A <tooltip> renders its `label` itself — XULTooltipElement
 * (dom/xul, C++) gives it a description.tooltip-label child when it is
 * created and copies the attribute into it — so the popup is the very
 * element and style of Zotero's own tooltips, only without the wait.
 *
 * The tooltip is created here rather than written in the markup: Zotero
 * parses a pane's markup into a fragment and then imports it into the
 * window, and a <tooltip> created twice that way ends up with two label
 * descriptions (the second empty; measured 2026-08-28).
 */

const XUL_NS = 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';

/** The pane's <popupset>, which the tooltip is appended to. */
export const HELP_POPUPSET_ID = 'ztts-popupset';
export const HELP_TIP_ID = 'ztts-help-tip';
export const HELP_ICON_SELECTOR = '.ztts-help';
/** The icon's text; server-preset-rows.ts rewrites the server icon's on every preset. */
export const HELP_ATTRIBUTE = 'help';
interface TipLike {
  setAttribute(name: string, value: string): void;
  /** XULPopupElement's; a Document's typing does not know the element is a tooltip */
  openPopupAtScreen?(x: number, y: number, isContextMenu: boolean): void;
  hidePopup?(): void;
}

interface PointerEventLike {
  screenX: number;
  screenY: number;
}

interface IconLike {
  getAttribute(name: string): string | null;
  addEventListener(type: string, fn: (event: PointerEventLike) => void): void;
}

export interface HelpTipsDocument {
  getElementById(id: string): { append(...nodes: any[]): void } | null;
  createElementNS(namespace: string, name: string): TipLike;
  querySelectorAll(selector: string): Iterable<IconLike>;
}

export function initHelpTips(doc: HelpTipsDocument): void {
  const popupset = doc.getElementById(HELP_POPUPSET_ID);
  if (!popupset) return;
  const tip = doc.createElementNS(XUL_NS, 'tooltip');
  tip.setAttribute('id', HELP_TIP_ID);
  popupset.append(tip);
  const hide = () => tip.hidePopup?.();
  for (const icon of doc.querySelectorAll(HELP_ICON_SELECTOR)) {
    icon.addEventListener('mouseenter', (event) => {
      // Read now, not at init: the server icon's note follows the preset
      const text = icon.getAttribute(HELP_ATTRIBUTE) ?? '';
      if (!text) return;
      tip.setAttribute('label', text);
      // At the pointer, where Zotero's own tooltips go (anchored under the icon,
      // the text began under the arrow cursor). The point goes in as is: Gecko
      // itself places a tooltip popup 21 px below the point it is given — the
      // height of an arrow cursor — and adding the 21 here doubled it (2026-08-28).
      tip.openPopupAtScreen?.(event.screenX, event.screenY, false);
    });
    icon.addEventListener('mouseleave', hide);
    icon.addEventListener('mousedown', hide);
  }
}
