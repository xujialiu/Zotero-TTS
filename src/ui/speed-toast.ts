/**
 * A short "1.3×" overlay confirming a speed change. Shown in whichever
 * document is visible: the reader iframe, or the chrome window when the
 * reader's tab is hidden behind another.
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
  'font:600 15px/1 system-ui,-apple-system,sans-serif',
  'padding:7px 14px',
  'border-radius:8px',
  'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
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

const hideTimers = new WeakMap<object, unknown>();

export function showSpeedToast(doc: ToastDocument, speed: number, timer: ToastTimer = DEFAULT_TIMER, durationMs = 900): void {
  let el = doc.getElementById(SPEED_TOAST_ID);
  if (!el) {
    // Explicit XHTML namespace: the chrome window is XUL/XHTML mixed and a bare createElement there is not reliably HTML
    el = doc.createElementNS(XHTML, 'div');
    el.id = SPEED_TOAST_ID;
    el.style.cssText = STYLE;
    (doc.body ?? doc.documentElement).appendChild(el);
  }
  el.textContent = `${speed.toFixed(1)}×`;
  el.style.opacity = '1';
  if (hideTimers.has(doc)) timer.clear(hideTimers.get(doc));
  hideTimers.set(
    doc,
    timer.set(() => {
      el.style.opacity = '0';
    }, durationMs),
  );
}

export function removeSpeedToast(doc: ToastDocument): void {
  doc.getElementById(SPEED_TOAST_ID)?.remove();
}
