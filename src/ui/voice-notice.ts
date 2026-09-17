import type { VoiceNotice } from '../read-aloud/voice-switch';
import { showToast, type ToastDocument } from './speed-toast';

export const VOICE_NOTICE_ID = 'ztts-voice-notice';

/** A switch owns its notice independently of short speed/status toasts. */
export function createVoiceNotices(deps: {
  document(reader: unknown): ToastDocument | null;
  message(kind: VoiceNotice, voice: string): string;
}) {
  const visible = new Map<unknown, () => void>();
  function clear(reader: unknown) {
    visible.get(reader)?.();
    visible.delete(reader);
  }
  return {
    notice(reader: unknown, kind: VoiceNotice, voice: string) {
      clear(reader);
      if (kind === 'ready' || kind === 'selected' || kind === 'cancelled') return;
      const doc = deps.document(reader);
      if (!doc) return;
      const dismiss = showToast(doc, deps.message(kind, voice), undefined,
        kind === 'preparing' ? null : 5000, VOICE_NOTICE_ID);
      const el = doc.getElementById(VOICE_NOTICE_ID);
      el.style.bottom = '108px';
      el.style.transition = 'none';
      visible.set(reader, dismiss);
    },
    dispose() {
      for (const reader of visible.keys()) clear(reader);
    },
  };
}
