import { describe, expect, it } from 'vitest';
import { readingSections, sectionAt } from '../../src/read-aloud/reading-sections';
const segments = [1, 3, 4, 7, 9].map(n => ({ text: 'Sentence', position: { start: [n, 0, 0], end: [n, 0, 8] } }));
describe('reading sections', () => {
  it('uses the outermost title, includes children, and excludes material before its first boundary', () => {
    const outline = [{ title: 'Part I', ref: [3], children: [{ title: 'Chapter 1', ref: [4] }] }, { title: 'Part II', ref: [7] }];
    const sections = readingSections(outline, segments);
    expect(sectionAt(sections, 0)).toBeUndefined();
    expect(sectionAt(sections, 2)).toEqual({ title: 'Part I', start: 1, end: 3 });
    expect(sectionAt(sections, 3)).toEqual({ title: 'Part II', start: 3, end: 5 });
  });
  it('refuses unresolved, duplicate, reversed, or crossing boundaries instead of merging chapters silently', () => {
    for (const outline of [
      [{ title: 'A', ref: [3] }, { title: 'B' }],
      [{ title: 'A', ref: [3] }, { title: 'B', ref: [3] }],
      [{ title: 'A', ref: [7] }, { title: 'B', ref: [3] }],
      [{ title: 'A', ref: [3] }, { title: 'B', ref: [5] }],
    ]) expect(readingSections(outline, segments)).toEqual([]);
  });
});
