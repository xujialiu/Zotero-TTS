import type { RemainingSnapshot } from '../core/engine/session';
import type { L10nArgs } from '../core/l10n';

/** Keep the time visible while a long section name shrinks; text is the full accessible label. */
export interface RemainingTimeLine { text: string; name?: string; duration?: string }

export function remainingTimeLines(value: RemainingSnapshot, t: (id: string, args?: L10nArgs) => string): RemainingTimeLine[] {
  if (value.status === 'estimating') return [{ text: t('ztts-time-estimating') }];
  if (value.status === 'unavailable') return [{ text: t('ztts-time-unavailable') }];
  if (value.status === 'finished') return [{ text: t('ztts-time-finished') }];
  const label = (name: string, seconds: number): RemainingTimeLine => {
    const duration = seconds < 60 ? t('ztts-time-under-minute') : t('ztts-time-minutes', { minutes: Math.ceil(seconds / 60) });
    return { text: t('ztts-time-summary', { name, time: duration }), name, duration };
  };
  const lines = [label(value.scope === 'selection' ? t('ztts-time-selection') : t('ztts-time-document'), value.seconds ?? 0)];
  if (value.scope === 'document' && value.sectionTitle && value.sectionSeconds !== undefined) lines.push(label(value.sectionTitle, value.sectionSeconds));
  return lines;
}
