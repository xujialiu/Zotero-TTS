import { expect, it } from 'vitest';
import { t } from '../src/core/l10n';
import { remainingTimeLabels } from '../src/ui/remaining-time';
it('labels document, named section, selection, sub-minute, and terminal states without suggesting seconds precision', () => {
  expect(remainingTimeLabels({ status: 'ready', scope: 'document', seconds: 1085, sectionSeconds: 45, sectionTitle: 'Part I' }, t)).toEqual(['Document: about 19 min left', 'Part I: less than 1 min left']);
  expect(remainingTimeLabels({ status: 'ready', scope: 'selection', seconds: 90 }, t)).toEqual(['Selection: about 2 min left']);
  expect(remainingTimeLabels({ status: 'finished', scope: 'document', seconds: 0 }, t)).toEqual(['Finished']);
  expect(remainingTimeLabels({ status: 'estimating', scope: 'document', seconds: null }, t)).toEqual(['Estimating…']);
  expect(remainingTimeLabels({ status: 'unavailable', scope: 'document', seconds: null }, t)).toEqual(['Estimate unavailable']);
});
