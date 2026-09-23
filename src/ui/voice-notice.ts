import type { VoiceNotice } from '../core/engine/handoff';
import type { PlaybackNotice } from '../core/engine/session';
import { showToast, type ToastDocument } from './speed-toast';
import { positionNotice } from './notice-position';

export const VOICE_NOTICE_ID = 'ztts-voice-notice';
export const PLAYBACK_NOTICE_ID = 'ztts-playback-notice';

type PendingVoice = { kind: 'preparing' | 'failed' | 'unavailable'; label: string };
interface Notices {
  voice: PendingVoice | null;
  playback: PlaybackNotice;
  shown: string;
  dismiss?: () => void;
  voiceTimer?: ReturnType<typeof setTimeout>;
  playbackTimer?: ReturnType<typeof setTimeout>;
}

/** Voice switching takes priority over ordinary playback preparation. Both
 * retain independent lifetimes, separate from short speed/status toasts. */
export function createVoiceNotices(deps: {
  document(reader: unknown): ToastDocument | null;
  message(kind: VoiceNotice, voice: string): string;
  playbackMessage?(kind: Exclude<PlaybackNotice, 'idle'>): string;
}) {
  const readers = new Map<unknown, Notices>();
  function state(reader: unknown) {
    let s = readers.get(reader);
    if (!s) { s = { voice: null, playback: 'idle', shown: '' }; readers.set(reader, s); }
    return s;
  }
  function render(reader: unknown, s: Notices) {
    const text = s.voice ? deps.message(s.voice.kind, s.voice.label)
      : s.playback !== 'idle' ? deps.playbackMessage?.(s.playback) : undefined;
    const id = s.voice ? VOICE_NOTICE_ID : PLAYBACK_NOTICE_ID;
    const shown = text ? `${id}:${text}` : '';
    if (s.shown === shown) {
      if (!s.voice && s.playback === 'idle') readers.delete(reader);
      return;
    }
    s.dismiss?.(); s.dismiss = undefined; s.shown = '';
    if (text) {
      const doc = deps.document(reader);
      if (!doc) return;
      s.dismiss = showToast(doc, text, undefined, null, id);
      const el = doc.getElementById(id);
      el.style.transition = 'none';
      const dismiss = s.dismiss;
      const stopPositioning = positionNotice(doc, el);
      s.dismiss = () => { stopPositioning(); dismiss(); };
      s.shown = shown;
    }
    if (!s.voice && s.playback === 'idle') readers.delete(reader);
  }
  function clear(reader: unknown) {
    const s = readers.get(reader);
    if (!s) return;
    clearTimeout(s.voiceTimer); clearTimeout(s.playbackTimer);
    s.dismiss?.(); readers.delete(reader);
  }
  return {
    notice(reader: unknown, kind: VoiceNotice, voice: string) {
      const s = state(reader);
      clearTimeout(s.voiceTimer); s.voiceTimer = undefined;
      s.voice = kind === 'preparing' || kind === 'failed' || kind === 'unavailable'
        ? { kind, label: voice } : null;
      if (s.voice && kind !== 'preparing') s.voiceTimer = setTimeout(() => {
        s.voice = null; s.voiceTimer = undefined; render(reader, s);
      }, 5000);
      render(reader, s);
    },
    playback(reader: unknown, kind: PlaybackNotice) {
      const s = state(reader);
      clearTimeout(s.playbackTimer); s.playbackTimer = undefined;
      s.playback = kind;
      if (kind === 'failed') s.playbackTimer = setTimeout(() => {
        s.playback = 'idle'; s.playbackTimer = undefined; render(reader, s);
      }, 5000);
      render(reader, s);
    },
    clear,
    dispose() { for (const reader of readers.keys()) clear(reader); },
  };
}
