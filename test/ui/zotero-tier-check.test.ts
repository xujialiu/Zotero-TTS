import { describe, expect, it, vi } from 'vitest';
import type { ZoteroVoice } from '../../src/read-aloud/zotero-voices';
import { checkZoteroTier } from '../../src/ui/zotero-tier-check';

const VOICES: ZoteroVoice[] = [
  { id: 'std-ava', label: 'Ava', locale: 'en-US', tier: 'standard' },
  { id: 'std-ava', label: 'Ava', locale: 'de-DE', tier: 'standard' },
  { id: 'std-andrew', label: 'Andrew', locale: 'en-US', tier: 'standard' },
  { id: 'prm-aria', label: 'Aria', locale: 'en-US', tier: 'premium' },
];

function deps(over: { signedIn?: boolean; voices?: ZoteroVoice[]; credits?: { standard: number | null; premium: number | null } } = {}) {
  const listVoices = vi.fn(async () => over.voices ?? VOICES);
  const credits = vi.fn(async () => over.credits ?? { standard: 1234, premium: 56 });
  return { signedIn: () => over.signedIn ?? true, service: { listVoices, credits }, listVoices, credits };
}

describe('checkZoteroTier', () => {
  it('fails without a signed-in Zotero account, before asking Zotero anything', async () => {
    const d = deps({ signedIn: false });
    expect(await checkZoteroTier('standard', d)).toEqual({ ok: false, message: 'Not signed in to a Zotero account: sign in under Edit → Settings → Sync.' });
    expect(d.listVoices).not.toHaveBeenCalled();
    expect(d.credits).not.toHaveBeenCalled();
  });

  it('fails when Zotero lists no voice of the tier', async () => {
    const d = deps({ voices: VOICES.filter((v) => v.tier === 'standard') });
    expect(await checkZoteroTier('premium', d)).toEqual({ ok: false, message: 'Zotero lists no Premium voices.' });
    expect(d.credits).not.toHaveBeenCalled();
  });

  it('passes with the voice count — one per voice, not per locale — and the tier’s credits, grouped as the locale writes numbers', async () => {
    expect(await checkZoteroTier('standard', deps())).toEqual({ ok: true, message: 'Signed in: 2 Standard voices, 1,234 credits remaining.' });
    expect(await checkZoteroTier('premium', deps())).toEqual({ ok: true, message: 'Signed in: 1 Premium voices, 56 credits remaining.' });
  });

  it('passes without a credits figure when Zotero gives none', async () => {
    expect(await checkZoteroTier('standard', deps({ credits: { standard: null, premium: 5 } }))).toEqual({ ok: true, message: 'Signed in: 2 Standard voices.' });
  });

  it('lets a listing that fails reject, as a provider’s check does', async () => {
    const d = deps();
    d.listVoices.mockRejectedValueOnce(new Error("Zotero's own voices are unavailable (network)"));
    await expect(checkZoteroTier('standard', d)).rejects.toThrow('unavailable');
  });
});
