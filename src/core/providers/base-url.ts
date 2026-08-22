/**
 * Accept a base URL the way people write it — with or without a trailing
 * slash, with or without the `/v1` the OpenAI SDK expects in `base_url` —
 * and return the prefix that endpoint paths such as `/v1/audio/speech` are
 * appended to. Without this, `http://localhost:8880/v1` turns into
 * `http://localhost:8880/v1/v1/audio/speech`.
 */
export function normalizeBaseURL(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1$/i, '')
    .replace(/\/+$/, '');
}
