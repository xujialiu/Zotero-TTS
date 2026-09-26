import type { RemainingSnapshot } from '../core/engine/session';
import type { L10nArgs } from '../core/l10n';

export function remainingTimeLabels(value: RemainingSnapshot, t: (id: string, args?: L10nArgs) => string): string[] {
  if (value.status === 'estimating') return [t('ztts-time-estimating')];
  if (value.status === 'unavailable') return [t('ztts-time-unavailable')];
  if (value.status === 'finished') return [t('ztts-time-finished')];
  const label = (name: string, seconds: number) => seconds < 60
    ? t('ztts-time-under-minute', { name })
    : t('ztts-time-minutes', { name, minutes: Math.ceil(seconds / 60) });
  const lines = [label(value.scope === 'selection' ? t('ztts-time-selection') : t('ztts-time-document'), value.seconds ?? 0)];
  if (value.scope === 'document' && value.sectionTitle && value.sectionSeconds !== undefined) lines.push(label(value.sectionTitle, value.sectionSeconds));
  return lines;
}
