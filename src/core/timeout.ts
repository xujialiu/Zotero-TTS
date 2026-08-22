/**
 * Reject a promise that takes too long. Every request the plugin makes goes
 * through here, because a request that never settles shows up in Zotero as
 * a spinner that never stops — the user cannot tell a slow server from a
 * dead one. `onTimeout` lets the caller abort the underlying request so it
 * does not keep running in the background.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, makeError: () => Error, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        // Aborting is best-effort; the rejection below is what matters
      }
      reject(makeError());
    }, ms);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}
