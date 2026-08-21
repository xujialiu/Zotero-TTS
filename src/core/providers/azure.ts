import { alignWordsToText } from '../align';
import type { TimedWord } from '../align';
import {
  buildSSML,
  buildTextFrame,
  parseBinaryFrame,
  parseTextFrame,
  parseWordBoundaries,
} from './azure-ws';
import { SynthesisError } from './errors';
import type { SynthesisOptions, SynthesisResult, TTSProvider, VoiceInfo } from './types';

export type AzureConfig = { apiKey: string; region: string };

export type AzureDeps = {
  fetch: typeof fetch;
  getWebSocket: () => typeof WebSocket;
  newRequestId: () => string;
};

const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

/**
 * The plugin sandbox has no WebSocket (spec §2.10), so we get the
 * constructor from the chrome window. Fetched on demand rather than
 * cached at startup, to avoid holding a reference to a window that has
 * since closed.
 */
export function getChromeWebSocket(): typeof WebSocket {
  const win = Zotero.getMainWindow() ?? Services.wm.getMostRecentWindow(null);
  if (typeof win?.WebSocket !== 'function') {
    throw new SynthesisError('unknown', 'No chrome window available to obtain WebSocket');
  }
  return win.WebSocket;
}

export function newRequestId(): string {
  return Zotero.Utilities.randomString(32, '0123456789abcdef');
}

export function createAzureProvider(cfg: AzureConfig, deps: AzureDeps): TTSProvider {
  return {
    id: 'azure',
    capabilities: { wordTimestamps: true },

    async listVoices(): Promise<VoiceInfo[]> {
      if (!cfg.apiKey) throw new SynthesisError('no-key', 'Azure API key is not set');

      let response: Response;
      try {
        response = await deps.fetch(
          `https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
          { headers: { 'Ocp-Apim-Subscription-Key': cfg.apiKey } },
        );
      } catch (e) {
        throw new SynthesisError('network', String(e));
      }
      if (!response.ok) {
        throw new SynthesisError('unknown', `Azure voices returned ${response.status}`);
      }

      const list = (await response.json()) as { ShortName: string; LocalName?: string; Locale: string }[];
      return list.map((v) => ({ id: v.ShortName, label: v.LocalName ?? v.ShortName, locale: v.Locale }));
    },

    synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult> {
      if (!cfg.apiKey) {
        return Promise.reject(new SynthesisError('no-key', 'Azure API key is not set'));
      }
      // An already-aborted signal must short-circuit before we ever open a
      // socket or run the handshake. The abort listener registered below only
      // fires on a FUTURE abort event, not a signal that was already aborted
      // when passed in, so without this guard we would still pay for a full
      // connect and handshake before ever noticing the abort.
      if (o.signal.aborted) {
        return Promise.reject(new SynthesisError('unknown', 'aborted'));
      }

      const WS = deps.getWebSocket();
      const requestId = deps.newRequestId();
      const url =
        `wss://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/websocket/v1` +
        `?Ocp-Apim-Subscription-Key=${encodeURIComponent(cfg.apiKey)}` +
        `&X-ConnectionId=${requestId}`;

      return new Promise<SynthesisResult>((resolve, reject) => {
        // The constructor itself can throw synchronously (e.g. a malformed
        // URL). The Promise executor would auto-reject with that raw thrown
        // value, which is not a SynthesisError -- and the hijack mode's
        // toZoteroError maps anything that is not a SynthesisError to
        // "unknown", silently discarding the real reason. Convert explicitly.
        let socket: WebSocket;
        try {
          socket = new WS(url);
        } catch (e) {
          reject(new SynthesisError('unknown', String(e)));
          return;
        }
        socket.binaryType = 'arraybuffer';

        const chunks: Uint8Array[] = [];
        const words: TimedWord[] = [];
        let settled = false;

        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          try {
            socket.close();
          } catch {
            // Already closed
          }
          try {
            fn();
          } catch (e) {
            // fn() is the resolve/reject call itself. settled is already true
            // at this point, so a nested finish() call from some other catch
            // would just no-op and the promise would never settle. Reject
            // directly instead, bypassing the settled guard.
            reject(new SynthesisError('unknown', String(e)));
          }
        };

        o.signal.addEventListener('abort', () =>
          finish(() => reject(new SynthesisError('unknown', 'aborted'))),
        );

        socket.onerror = () => finish(() => reject(new SynthesisError('network', 'Azure socket error')));
        socket.onclose = () =>
          finish(() => reject(new SynthesisError('network', 'Azure socket closed before turn.end')));

        socket.onopen = () => {
          // Sending the handshake frames can throw synchronously. A throw
          // from an event-handler property does not propagate back to
          // whatever triggered the event, and there is no .catch() on the
          // promise this function returns -- so an unguarded throw here would
          // leave synthesize() hanging forever, exactly like an unguarded
          // onmessage would.
          try {
            const headers = (path: string, contentType: string) => ({
              Path: path,
              'X-RequestId': requestId,
              'X-Timestamp': new Date().toISOString(),
              'Content-Type': contentType,
            });

            socket.send(
              buildTextFrame(
                headers('speech.config', 'application/json'),
                JSON.stringify({ context: { system: { name: 'zotero-tts' } } }),
              ),
            );
            socket.send(
              buildTextFrame(
                headers('synthesis.context', 'application/json'),
                JSON.stringify({
                  synthesis: {
                    audio: {
                      metadataOptions: { wordBoundaryEnabled: true, sentenceBoundaryEnabled: false },
                      outputFormat: OUTPUT_FORMAT,
                    },
                  },
                }),
              ),
            );
            socket.send(
              buildTextFrame(headers('ssml', 'application/ssml+xml'), buildSSML(text, o.voice, o.speed)),
            );
          } catch (e) {
            finish(() => reject(new SynthesisError('unknown', String(e))));
          }
        };

        socket.onmessage = (event: MessageEvent) => {
          // parseBinaryFrame / parseTextFrame can throw on truncated or corrupt
          // input (unlike parseWordBoundaries, they carry no never-throw guarantee).
          // Real socket data can be malformed, so the whole handler body is guarded:
          // an uncaught exception here would escape into the socket's event dispatch
          // and leave the synthesis promise hanging forever.
          try {
            if (typeof event.data === 'string') {
              const { headers, body } = parseTextFrame(event.data);
              if (headers.Path === 'audio.metadata') {
                words.push(...parseWordBoundaries(body));
              } else if (headers.Path === 'turn.end') {
                const total = chunks.reduce((n, c) => n + c.length, 0);
                const audio = new Uint8Array(total);
                let at = 0;
                for (const c of chunks) {
                  audio.set(c, at);
                  at += c.length;
                }
                const timestamps = words.length ? alignWordsToText(words, text) : undefined;
                finish(() =>
                  resolve({
                    audio: new Blob([audio], { type: 'audio/mpeg' }),
                    // The `timestamps` key must be omitted entirely when absent, not
                    // set to `undefined` — an object literal with `timestamps: undefined`
                    // still has the key present (`'timestamps' in result` is true), which
                    // violates the project rule that absence signals "no word timestamps".
                    ...(timestamps?.length ? { timestamps } : {}),
                  }),
                );
              }
              return;
            }
            const { headers, payload } = parseBinaryFrame(event.data as ArrayBuffer);
            if (headers.Path === 'audio' && payload.length) {
              chunks.push(payload);
            }
          } catch (e) {
            finish(() => reject(new SynthesisError('unknown', String(e))));
          }
        };
      });
    },
  };
}
