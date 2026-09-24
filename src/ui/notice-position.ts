import type { ToastDocument } from './speed-toast';

/** Keep status notices over the reading area, with room for the player. */
export function positionNotice(document: ToastDocument, element: HTMLElement): () => void {
  const doc = document as Document;
  const win = doc.defaultView as any;
  element.style.bottom = '24px';
  if (!win) return () => {};

  let stopped = false;
  const split = doc.getElementById('split-view');
  const frame = doc.getElementById('ztts-player-frame') as HTMLIFrameElement | null;
  const set = (name: string, value: string) => {
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  };
  const place = () => {
    try {
      if (stopped || win.closed || !doc.defaultView) return;
      const width = win.innerWidth, height = win.innerHeight;
      const rect = split?.getBoundingClientRect();
      const left = rect?.width ? Math.max(0, rect.left) : 0;
      const right = rect?.width ? Math.min(width, rect.right) : width;
      const top = rect?.height ? Math.max(0, rect.top) : 0;
      const bottom = rect?.height ? Math.min(height, rect.bottom) : height;
      const center = (left + right) / 2;
      set('left', `${center}px`);
      set('right', 'auto');
      set('top', 'auto');
      set('margin', '0px');
      set('width', 'max-content');
      set('max-width', `${Math.max(0, Math.min(640, right - left - 32))}px`);
      set('transform', 'translateX(-50%)');

      const size = element.getBoundingClientRect();
      let edge = bottom - 24;
      const avoid = (box: { left: number; right: number; top: number; bottom: number; width: number; height: number }) => {
        if (box.width <= 0 || box.height <= 0) return;
        const overlapsX = center + size.width / 2 > box.left - 12 && center - size.width / 2 < box.right + 12;
        const overlapsY = edge > box.top - 12 && edge - size.height < box.bottom + 12;
        if (overlapsX && overlapsY) edge = box.top - 12;
      };
      if (frame && !frame.hidden) {
        const outer = frame.getBoundingClientRect();
        if (outer.width > 0 && outer.height > 0) {
          // A floating menu can enlarge its iframe above/below the panel.
          const panel = frame.contentDocument?.querySelector('.player')?.getBoundingClientRect();
          if (panel?.width && panel.height) avoid({ left: outer.left + panel.left, right: outer.left + panel.right,
            top: outer.top + panel.top, bottom: outer.top + panel.bottom, width: panel.width, height: panel.height });
          else avoid(outer);
        }
      }
      edge = Math.max(top + size.height + 8, edge);
      set('bottom', `${Math.max(0, height - edge)}px`);
    } catch (error) {
      if (!String(error).includes("can't access dead object")) throw error;
    }
  };
  place();
  const resized = new win.ResizeObserver(place);
  for (const node of [split, element, frame]) if (node) resized.observe(node);
  const changed = new win.MutationObserver(place);
  for (const node of [doc.documentElement, doc.body, frame]) {
    if (node) changed.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-layout'] });
  }
  win.addEventListener('resize', place);
  return () => {
    stopped = true;
    try {
      resized.disconnect();
      changed.disconnect();
      win.removeEventListener('resize', place);
    } catch (error) {
      if (!String(error).includes("can't access dead object")) throw error;
    }
  };
}
