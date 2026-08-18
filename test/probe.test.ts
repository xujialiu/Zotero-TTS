import { describe, expect, it } from 'vitest';
import { runProbe } from '../src/probe';

const allGood = {
  hookFiredBeforeInterfaceRead: true,
  segmenterInBootstrap: true,
  segmenterInReaderFrame: true,
  highlightApiInPdfFrame: true,
  webSocketCtorObtained: true,
};

describe('runProbe', () => {
  it('reports every check as passing when the environment supports all of them', () => {
    const report = runProbe(allGood);
    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it('names each failing check', () => {
    const report = runProbe({ ...allGood, segmenterInReaderFrame: false, webSocketCtorObtained: false });
    expect(report.ok).toBe(false);
    expect(report.failures).toEqual(['segmenterInReaderFrame', 'webSocketCtorObtained']);
  });

  it('treats an unprobed check as a failure rather than silently passing', () => {
    const report = runProbe({ ...allGood, highlightApiInPdfFrame: null });
    expect(report.ok).toBe(false);
    expect(report.failures).toEqual(['highlightApiInPdfFrame']);
  });
});
