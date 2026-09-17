/**
 * A short "1.3×" overlay confirming a speed change — and, through
 * `showToast`, the line that says Read Aloud is not starting with the
 * default voice this time (read-aloud/memory-sync.ts, issue #35). Shown in
 * whichever document is visible: the reader iframe, or the chrome window
 * when the reader's tab is hidden behind another.
 */
export const SPEED_TOAST_ID = 'ztts-speed-toast';

const XHTML = 'http://www.w3.org/1999/xhtml';

const STYLE = [
  'position:fixed',
  'bottom:64px',
  'left:50%',
  'transform:translateX(-50%)',
  'z-index:2147483647',
  'background:rgba(38,38,42,0.92)',
  'color:#fff',
  'font:600 15px/1.3 system-ui,-apple-system,sans-serif',
  'padding:7px 14px',
  'border-radius:8px',
  'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
  // A sentence wraps inside the viewport instead of running off it; the speed stays one short line
  'max-width:min(80vw, 640px)',
  'text-align:center',
  'pointer-events:none',
  'opacity:0',
  'transition:opacity 120ms ease',
].join(';');

export interface ToastTimer {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

/** The part of Document the toast needs; tests pass a fake. */
export interface ToastDocument {
  getElementById(id: string): any;
  createElementNS(ns: string, name: string): any;
  body: any;
  documentElement: any;
}

const DEFAULT_TIMER: ToastTimer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const dismissals = new WeakMap<object, Map<string, () => void>>();

/** An overlay; null duration stays until its returned, ownership-safe dismissal. */
export function showToast(doc: ToastDocument, text: string, timer: ToastTimer = DEFAULT_TIMER,
  durationMs: number | null = 900, id = SPEED_TOAST_ID): () => void {
  let slots = dismissals.get(doc);
  if (!slots) { slots = new Map(); dismissals.set(doc, slots); }
  slots.get(id)?.();
  let el = doc.getElementById(id);
  if (!el) {
    // Explicit XHTML namespace: the chrome window is XUL/XHTML mixed and a bare createElement there is not reliably HTML
    el = doc.createElementNS(XHTML, 'div');
    el.id = id;
    el.style.cssText = STYLE;
    (doc.body ?? doc.documentElement).appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  let handle: unknown;
  const dismiss = () => {
    if (slots.get(id) !== dismiss) return;
    slots.delete(id);
    if (handle !== undefined) timer.clear(handle);
    try { el.style.opacity = '0'; }
    catch (error) {
      // The reader may close while its voice-change notice is visible.
      if (!String(error).includes("can't access dead object")) throw error;
    }
  };
  slots.set(id, dismiss);
  if (durationMs !== null) handle = timer.set(dismiss, durationMs);
  return dismiss;
}

export function showSpeedToast(doc: ToastDocument, speed: number, timer: ToastTimer = DEFAULT_TIMER, durationMs = 900): void {
  showToast(doc, `${speed.toFixed(2).replace(/0$/, '')}×`, timer, durationMs);
}

export function removeSpeedToast(doc: ToastDocument): void {
  dismissals.get(doc)?.get(SPEED_TOAST_ID)?.();
  doc.getElementById(SPEED_TOAST_ID)?.remove();
}
