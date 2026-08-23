import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../../src/core/settings';
import type { KeyEventLike } from '../../src/core/shortcuts';
import { recorderOutcome, shortcutLabel } from '../../src/ui/shortcut-recorder';

function ev(partial: Partial<KeyEventLike>): KeyEventLike {
  return { key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...partial };
}

const current = { ...DEFAULTS.shortcuts, speedUp: 'Shift+A' };

describe('recorderOutcome', () => {
  it('cancels on Escape', () => {
    expect(recorderOutcome(ev({ key: 'Escape', code: 'Escape' }), 'speedUp', current)).toEqual({ kind: 'cancel' });
  });

  it('clears on a bare Backspace or Delete', () => {
    expect(recorderOutcome(ev({ key: 'Backspace', code: 'Backspace' }), 'speedUp', current)).toEqual({ kind: 'clear' });
    expect(recorderOutcome(ev({ key: 'Delete', code: 'Delete' }), 'speedUp', current)).toEqual({ kind: 'clear' });
  });

  it('keeps waiting while only a modifier is held', () => {
    expect(recorderOutcome(ev({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }), 'speedUp', current)).toEqual({ kind: 'ignore' });
  });

  it('rejects a bare printable key, which would otherwise type', () => {
    expect(recorderOutcome(ev({ key: 'k', code: 'KeyK' }), 'speedUp', current)).toEqual({ kind: 'reject', reason: 'needs-modifier' });
  });

  it('rejects a combination another action already uses', () => {
    expect(recorderOutcome(ev({ key: 'X', code: 'KeyX', shiftKey: true }), 'speedUp', current)).toEqual({
      kind: 'reject',
      reason: 'conflict',
      conflictsWith: 'speedDown',
    });
  });

  it('lets a navigation action sit on a bare arrow key, but not a speed action', () => {
    expect(recorderOutcome(ev({ key: 'ArrowDown', code: 'ArrowDown' }), 'nextSentence', current)).toEqual({ kind: 'set', text: 'ArrowDown' });
    expect(recorderOutcome(ev({ key: 'ArrowDown', code: 'ArrowDown' }), 'speedUp', current)).toEqual({
      kind: 'reject',
      reason: 'needs-modifier',
    });
  });

  it('detects conflicts across the speed and navigation actions', () => {
    expect(recorderOutcome(ev({ key: 'ArrowRight', code: 'ArrowRight' }), 'previousSentence', current)).toEqual({
      kind: 'reject',
      reason: 'conflict',
      conflictsWith: 'nextSentence',
    });
    expect(recorderOutcome(ev({ key: 'Z', code: 'KeyZ', shiftKey: true }), 'nextParagraph', current)).toEqual({
      kind: 'reject',
      reason: 'conflict',
      conflictsWith: 'speedReset',
    });
  });

  it('allows re-recording the same combination for the same action', () => {
    expect(recorderOutcome(ev({ key: 'X', code: 'KeyX', shiftKey: true }), 'speedDown', current)).toEqual({ kind: 'set', text: 'Shift+X' });
  });

  it('records a valid combination in canonical form', () => {
    expect(recorderOutcome(ev({ key: 'k', code: 'KeyK', ctrlKey: true }), 'speedUp', current)).toEqual({ kind: 'set', text: 'Ctrl+K' });
    expect(recorderOutcome(ev({ key: 'F9', code: 'F9' }), 'speedUp', current)).toEqual({ kind: 'set', text: 'F9' });
    // A modified Backspace is a shortcut, not a request to clear
    expect(recorderOutcome(ev({ key: 'Backspace', code: 'Backspace', ctrlKey: true }), 'speedUp', current)).toEqual({
      kind: 'set',
      text: 'Ctrl+Backspace',
    });
  });
});

describe('shortcutLabel', () => {
  it('shows the canonical combination, a placeholder when unset, and flags junk', () => {
    expect(shortcutLabel('shift+z')).toBe('Shift+Z');
    expect(shortcutLabel('')).toBe('Not set');
    expect(shortcutLabel('garbage')).toBe('garbage (invalid)');
    expect(shortcutLabel('meta+z', 'Cmd')).toBe('Cmd+Z');
  });
});
