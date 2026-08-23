/**
 * Request headers typed into a settings field: `Name: value` pairs separated
 * by `;` or newlines. For gateways that authenticate with their own headers
 * — a Cloudflare Access service token, a reverse proxy with a custom header —
 * in front of a server that has no API key. Malformed pairs are dropped
 * rather than sent half-formed; a header name may not contain whitespace.
 */
export function parseHeaderList(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of text.split(/[;\n]/)) {
    const colon = pair.indexOf(':');
    if (colon < 1) continue;
    const name = pair.slice(0, colon).trim();
    const value = pair.slice(colon + 1).trim();
    if (!name || !value || /\s/.test(name)) continue;
    headers[name] = value;
  }
  return headers;
}
