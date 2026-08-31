import { describe, expect, it, vi } from 'vitest';
import { runStartupSteps } from '../../src/core/startup-steps';

describe('runStartupSteps', () => {
  it('runs every step in order, awaiting an async one, and reports them all ok', async () => {
    const order: string[] = [];
    const report = vi.fn();
    const result = await runStartupSteps(
      [
        ['first', () => void order.push('first')],
        [
          'second',
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            order.push('second');
          },
        ],
        ['third', () => void order.push('third')],
      ],
      report,
    );
    expect(order).toEqual(['first', 'second', 'third']);
    expect(result).toEqual({
      steps: [
        { name: 'first', ok: true },
        { name: 'second', ok: true },
        { name: 'third', ok: true },
      ],
      failed: [],
    });
    expect(report).not.toHaveBeenCalled();
  });

  // Issue #25: the settings pane's registration threw and took every later
  // step — the voices, the shortcuts, the bookmarks — down with it
  it('records a throwing step, reports it, and goes on with the rest', async () => {
    const order: string[] = [];
    const report = vi.fn();
    const collision = new Error('Pane with ID zotero-tts-pane already registered');
    const result = await runStartupSteps(
      [
        [
          'settings pane',
          () => {
            throw collision;
          },
        ],
        ['Read Aloud hook', () => void order.push('hook')],
      ],
      report,
    );
    expect(order).toEqual(['hook']);
    expect(result.steps).toEqual([
      { name: 'settings pane', ok: false, error: 'Error: Pane with ID zotero-tts-pane already registered' },
      { name: 'Read Aloud hook', ok: true },
    ]);
    expect(result.failed).toEqual(['settings pane']);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('settings pane', collision);
  });

  it('treats an async rejection like a throw, and still waits for the step before the next', async () => {
    const order: string[] = [];
    const report = vi.fn();
    const result = await runStartupSteps(
      [
        [
          'reading-position store',
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            order.push('store');
            throw new Error('database locked');
          },
        ],
        ['Read Aloud shortcuts', () => void order.push('shortcuts')],
      ],
      report,
    );
    expect(order).toEqual(['store', 'shortcuts']);
    expect(result.failed).toEqual(['reading-position store']);
    expect(result.steps[0]).toEqual({ name: 'reading-position store', ok: false, error: 'Error: database locked' });
    expect(report).toHaveBeenCalledWith('reading-position store', expect.any(Error));
  });

  it('describes a failure that is not an Error by its string form', async () => {
    const result = await runStartupSteps(
      [
        [
          'odd',
          () => {
            throw 'plain string';
          },
        ],
      ],
      () => {},
    );
    expect(result.steps[0]).toEqual({ name: 'odd', ok: false, error: 'plain string' });
  });

  it('survives a reporter that throws', async () => {
    const result = await runStartupSteps(
      [
        [
          'a',
          () => {
            throw new Error('x');
          },
        ],
        ['b', () => {}],
      ],
      () => {
        throw new Error('reporter down');
      },
    );
    expect(result.failed).toEqual(['a']);
    expect(result.steps[1]).toEqual({ name: 'b', ok: true });
  });
});
