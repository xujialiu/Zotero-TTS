import { describe, expect, it } from 'vitest';
import {
  formatShortcut,
  matchesShortcut,
  parseShortcut,
  sameShortcut,
  shortcutFromEvent,
  shortcutProblem,
  type KeyEventLike,
} from '../../src/core/shortcuts';

function ev(partial: Partial<KeyEventLike>): KeyEventLike {
  return { key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...partial };
}

describe('parseShortcut', () => {
  it('parses a modifier + letter into a physical key code', () => {
    expect(parseShortcut('Shift+Z')).toEqual({ ctrl: false, alt: false, shift: true, meta: false, code: 'KeyZ' });
  });

  it('is case-insensitive and tolerant of spaces', () => {
    expect(parseShortcut(' ctrl + shift + a ')).toEqual({ ctrl: true, alt: false, shift: true, meta: false, code: 'KeyA' });
    expect(parseShortcut('shift+z')).toEqual(parseShortcut('SHIFT+Z'));
  });

  it('accepts modifier aliases', () => {
    expect(parseShortcut('Control+Option+Cmd+X')).toEqual({ ctrl: true, alt: true, shift: false, meta: true, code: 'KeyX' });
    expect(parseShortcut('Win+1')?.code).toBe('Digit1');
  });

  it('maps punctuation to its key code and named keys to DOM codes', () => {
    expect(parseShortcut('Alt+[')?.code).toBe('BracketLeft');
    expect(parseShortcut('Alt+]')?.code).toBe('BracketRight');
    expect(parseShortcut('Alt+\\')?.code).toBe('Backslash');
    expect(parseShortcut('Ctrl+ArrowUp')?.code).toBe('ArrowUp');
    expect(parseShortcut('Ctrl+Up')?.code).toBe('ArrowUp');
    expect(parseShortcut('F9')?.code).toBe('F9');
    expect(parseShortcut('ctrl+space')?.code).toBe('Space');
    expect(parseShortcut('Ctrl+NumpadAdd')?.code).toBe('NumpadAdd');
  });

  it('returns null for empty, modifier-only, or malformed text', () => {
    expect(parseShortcut('')).toBeNull();
    expect(parseShortcut('   ')).toBeNull();
    expect(parseShortcut('Shift')).toBeNull();
    expect(parseShortcut('Shift+')).toBeNull();
    expect(parseShortcut('Shift+Z+')).toBeNull();
    expect(parseShortcut('Bogus+Z')).toBeNull();
    expect(parseShortcut('Shift+ZZ')).toBeNull();
    // A letter where a modifier should be
    expect(parseShortcut('Shift+Z+X')).toBeNull();
  });
});

describe('formatShortcut', () => {
  it('writes modifiers in a fixed order with a readable key', () => {
    expect(formatShortcut({ ctrl: true, alt: true, shift: true, meta: true, code: 'KeyA' })).toBe('Ctrl+Alt+Shift+Meta+A');
    expect(formatShortcut({ ctrl: false, alt: true, shift: false, meta: false, code: 'BracketLeft' })).toBe('Alt+[');
    expect(formatShortcut({ ctrl: false, alt: false, shift: false, meta: false, code: 'F9' })).toBe('F9');
    expect(formatShortcut({ ctrl: false, alt: false, shift: true, meta: false, code: 'Digit1' })).toBe('Shift+1');
    expect(formatShortcut({ ctrl: true, alt: false, shift: false, meta: false, code: 'Space' })).toBe('Ctrl+Space');
  });

  it('can label Meta for the platform', () => {
    expect(formatShortcut({ ctrl: false, alt: false, shift: false, meta: true, code: 'KeyZ' }, 'Cmd')).toBe('Cmd+Z');
  });

  it('round-trips through parseShortcut', () => {
    for (const text of ['Shift+Z', 'Ctrl+Alt+[', 'F9', 'Ctrl+Shift+ArrowUp', 'Alt+Space', 'Meta+`', 'Ctrl+NumpadAdd']) {
      const s = parseShortcut(text);
      expect(s, text).not.toBeNull();
      expect(parseShortcut(formatShortcut(s!)), text).toEqual(s);
    }
  });
});

describe('shortcutFromEvent', () => {
  it('reads the physical code and modifier state', () => {
    expect(shortcutFromEvent(ev({ key: 'Z', code: 'KeyZ', shiftKey: true }))).toEqual({
      ctrl: false,
      alt: false,
      shift: true,
      meta: false,
      code: 'KeyZ',
    });
  });

  it('returns null while only a modifier is held', () => {
    expect(shortcutFromEvent(ev({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }))).toBeNull();
    expect(shortcutFromEvent(ev({ key: 'Control', code: 'ControlLeft', ctrlKey: true }))).toBeNull();
    expect(shortcutFromEvent(ev({ key: 'Meta', code: 'MetaLeft', metaKey: true }))).toBeNull();
    expect(shortcutFromEvent(ev({ key: 'Alt', code: 'AltLeft', altKey: true }))).toBeNull();
  });

  it('falls back to the key when the event carries no code', () => {
    expect(shortcutFromEvent(ev({ key: 'a', code: '', shiftKey: true }))?.code).toBe('KeyA');
    expect(shortcutFromEvent(ev({ key: '[', code: '', altKey: true }))?.code).toBe('BracketLeft');
    expect(shortcutFromEvent(ev({ key: 'Unidentified', code: '' }))).toBeNull();
  });
});

describe('matchesShortcut', () => {
  const shiftZ = parseShortcut('Shift+Z')!;

  it('matches on physical code with exactly the stored modifiers', () => {
    expect(matchesShortcut(shiftZ, ev({ key: 'Z', code: 'KeyZ', shiftKey: true }))).toBe(true);
    // No shift
    expect(matchesShortcut(shiftZ, ev({ key: 'z', code: 'KeyZ' }))).toBe(false);
    // Extra modifier
    expect(matchesShortcut(shiftZ, ev({ key: 'Z', code: 'KeyZ', shiftKey: true, ctrlKey: true }))).toBe(false);
    expect(matchesShortcut(shiftZ, ev({ key: 'X', code: 'KeyX', shiftKey: true }))).toBe(false);
  });

  it('is layout independent: a non-Latin key label still matches by code', () => {
    expect(matchesShortcut(shiftZ, ev({ key: 'Я', code: 'KeyZ', shiftKey: true }))).toBe(true);
  });

  it('falls back to the key when the event carries no code', () => {
    expect(matchesShortcut(shiftZ, ev({ key: 'Z', code: '', shiftKey: true }))).toBe(true);
    expect(matchesShortcut(shiftZ, ev({ key: 'z', code: '', shiftKey: true }))).toBe(true);
  });
});

describe('shortcutProblem', () => {
  const bare = (code: string) => ({ ctrl: false, alt: false, shift: false, meta: false, code });

  it('requires a modifier for anything that would otherwise type or navigate', () => {
    expect(shortcutProblem(parseShortcut('Shift+Z')!)).toBeNull();
    expect(shortcutProblem(bare('KeyZ'))).toBe('needs-modifier');
    expect(shortcutProblem(bare('ArrowUp'))).toBe('needs-modifier');
    expect(shortcutProblem(bare('Space'))).toBe('needs-modifier');
  });

  it('allows bare function keys', () => {
    expect(shortcutProblem(bare('F9'))).toBeNull();
    expect(shortcutProblem(bare('F12'))).toBeNull();
  });
});

describe('sameShortcut', () => {
  it('compares modifiers and code', () => {
    expect(sameShortcut(parseShortcut('shift+z')!, parseShortcut('Shift+Z')!)).toBe(true);
    expect(sameShortcut(parseShortcut('Shift+Z')!, parseShortcut('Ctrl+Z')!)).toBe(false);
    expect(sameShortcut(parseShortcut('Shift+Z')!, parseShortcut('Shift+X')!)).toBe(false);
  });
});
