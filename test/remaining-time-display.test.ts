import { expect, it } from 'vitest';
import { t } from '../src/core/l10n';
import { remainingTimeLines } from '../src/ui/remaining-time';
it('labels document, named section, selection, sub-minute, and terminal states without suggesting seconds precision', () => {
  expect(remainingTimeLines({ status: 'ready', scope: 'document', seconds: 1085, sectionSeconds: 45, sectionTitle: 'Part I' }, t).map(line => line.text)).toEqual(['Document: about 19 min left', 'Part I: less than 1 min left']);
  expect(remainingTimeLines({ status: 'ready', scope: 'selection', seconds: 90 }, t).map(line => line.text)).toEqual(['Selection: about 2 min left']);
  expect(remainingTimeLines({ status: 'finished', scope: 'document', seconds: 0 }, t).map(line => line.text)).toEqual(['Finished']);
  expect(remainingTimeLines({ status: 'estimating', scope: 'document', seconds: null }, t).map(line => line.text)).toEqual(['Estimating…']);
  expect(remainingTimeLines({ status: 'unavailable', scope: 'document', seconds: null }, t).map(line => line.text)).toEqual(['Estimate unavailable']);
});

it('keeps a long section name separate from its time so only the name needs truncation', () => {
  const name = 'Part I — ' + 'A very long section name '.repeat(12);
  const lines = remainingTimeLines({ status: 'ready', scope: 'document', seconds: 900, sectionSeconds: 240, sectionTitle: name }, t);
  expect(lines[1]).toEqual({ text: name + ': about 4 min left', name, duration: 'about 4 min left' });
});
