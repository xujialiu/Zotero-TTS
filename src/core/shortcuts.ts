/**
 * Keyboard shortcuts as text: "Shift+Z", "Ctrl+Alt+[", "F9".
 *
 * Matching is done on the physical key (`KeyboardEvent.code`), never on the
 * character produced, so a binding keeps working on AZERTY, Dvorak, or a
 * Cyrillic layout where Shift+<that key> does not type "Z". The text form
 * names keys by their US-layout label purely for readability. Modifiers must
 * match exactly: "Shift+Z" is not triggered by Ctrl+Shift+Z.
 */
export interface Shortcut {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** A DOM `KeyboardEvent.code`: "KeyZ", "Digit1", "BracketLeft", "F9", ... */
  code: string;
}

/** The part of KeyboardEvent this module reads; tests pass plain objects. */
export interface KeyEventLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

type ModifierName = 'ctrl' | 'alt' | 'shift' | 'meta';

const MODIFIER_ALIASES: Record<string, ModifierName> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  shift: 'shift',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  win: 'meta',
  super: 'meta',
};

/** Punctuation keys by their US-layout label. Space is parsed from ' ' but displayed as "Space". */
const SYMBOL_TO_CODE: Record<string, string> = {
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  '-': 'Minus',
  '=': 'Equal',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '`': 'Backquote',
  ' ': 'Space',
};

const CODE_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_TO_CODE)
    .filter(([symbol]) => symbol !== ' ')
    .map(([symbol, code]) => [code, symbol]),
);

const NAMED_KEYS: Record<string, string> = {
  space: 'Space',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  escape: 'Escape',
  esc: 'Escape',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  ins: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pgup: 'PageUp',
  pagedown: 'PageDown',
  pgdn: 'PageDown',
  up: 'ArrowUp',
  arrowup: 'ArrowUp',
  down: 'ArrowDown',
  arrowdown: 'ArrowDown',
  left: 'ArrowLeft',
  arrowleft: 'ArrowLeft',
  right: 'ArrowRight',
  arrowright: 'ArrowRight',
};

/** `event.key` values of modifier and lock keys, which are never shortcuts by themselves. */
const MODIFIER_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'AltGraph',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'Fn',
  'FnLock',
  'Hyper',
  'Super',
  'Symbol',
  'OS',
]);

const FUNCTION_KEY = /^F([1-9]|1[0-9]|2[0-4])$/i;

/** Turn a key token from text, or a `KeyboardEvent.key`, into a DOM code. */
function codeFromKeyToken(token: string): string | null {
  if (token.length === 1) {
    if (/[a-z]/i.test(token)) return 'Key' + token.toUpperCase();
    if (/[0-9]/.test(token)) return 'Digit' + token;
    return SYMBOL_TO_CODE[token] ?? null;
  }
  const named = NAMED_KEYS[token.toLowerCase()];
  if (named) return named;
  const fn = FUNCTION_KEY.exec(token);
  if (fn) return 'F' + fn[1];
  // Already a DOM code ("KeyA", "Digit1", "NumpadAdd")
  if (/^(Key[A-Z]|Digit[0-9]|Numpad[A-Za-z0-9]+)$/.test(token)) return token;
  return null;
}

/** The event's physical code, or one derived from its key when the platform supplies none. */
function eventCode(e: KeyEventLike): string | null {
  if (e.code && e.code !== 'Unidentified') return e.code;
  return e.key ? codeFromKeyToken(e.key) : null;
}

/** "Ctrl+Shift+A" → Shortcut, or null when the text is not a shortcut. */
export function parseShortcut(text: string): Shortcut | null {
  const tokens = text.split('+').map((t) => t.trim());
  if (tokens.some((t) => t === '')) return null;
  const s: Shortcut = { ctrl: false, alt: false, shift: false, meta: false, code: '' };
  for (const token of tokens.slice(0, -1)) {
    const modifier = MODIFIER_ALIASES[token.toLowerCase()];
    if (!modifier) return null;
    s[modifier] = true;
  }
  const code = codeFromKeyToken(tokens[tokens.length - 1]);
  if (!code) return null;
  return { ...s, code };
}

/** Canonical text form; `parseShortcut(formatShortcut(s))` round-trips. */
export function formatShortcut(s: Shortcut, metaLabel = 'Meta'): string {
  const parts: string[] = [];
  if (s.ctrl) parts.push('Ctrl');
  if (s.alt) parts.push('Alt');
  if (s.shift) parts.push('Shift');
  if (s.meta) parts.push(metaLabel);
  parts.push(keyLabel(s.code));
  return parts.join('+');
}

function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return CODE_TO_SYMBOL[code] ?? code;
}

/** The shortcut a key event represents, or null while only a modifier is held. */
export function shortcutFromEvent(e: KeyEventLike): Shortcut | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const code = eventCode(e);
  if (!code) return null;
  return { ctrl: !!e.ctrlKey, alt: !!e.altKey, shift: !!e.shiftKey, meta: !!e.metaKey, code };
}

export function matchesShortcut(s: Shortcut, e: KeyEventLike): boolean {
  if (s.ctrl !== !!e.ctrlKey || s.alt !== !!e.altKey || s.shift !== !!e.shiftKey || s.meta !== !!e.metaKey) {
    return false;
  }
  return eventCode(e) === s.code;
}

const ARROW_KEY = /^Arrow(Up|Down|Left|Right)$/;

/**
 * Why a shortcut should not be accepted. Without a modifier, any key other
 * than F1–F24 either types a character or is already a navigation key in
 * the reader, so it is refused rather than silently hijacked. A caller that
 * only ever acts while Read Aloud is open may allow the bare arrow keys
 * (`allowBareArrows`): the reader keeps them the rest of the time.
 */
export function shortcutProblem(s: Shortcut, options: { allowBareArrows?: boolean } = {}): 'needs-modifier' | null {
  if (s.ctrl || s.alt || s.shift || s.meta) return null;
  if (FUNCTION_KEY.test(s.code)) return null;
  if (options.allowBareArrows && ARROW_KEY.test(s.code)) return null;
  return 'needs-modifier';
}

export function sameShortcut(a: Shortcut, b: Shortcut): boolean {
  return a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift && a.meta === b.meta && a.code === b.code;
}
