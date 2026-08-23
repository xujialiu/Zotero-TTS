# zotero-tts — supplementary notes

Low-traffic history moved out of NOTES.md to keep it a working reference:
machine-specific setup logs, one-time events, and lists that have since
been overtaken. Nothing here is needed before touching Read Aloud
internals; it is kept because it happened.

## (Incident 4) Preference pane did not render after an in-place upgrade

Seen once, on an `ADDON_UPGRADE` install with the preferences window open. A
full Zotero restart cleared it. Not reproduced, not fixed, recorded only.

## Kokoro-FastAPI on the Windows machine (set up 2026-08-22)

Runs in **Docker Desktop** (WSL 2 backend, `nvidia` runtime available):
container `kokoro`, image `ghcr.io/remsky/kokoro-fastapi-gpu:latest` (cu126,
right for the RTX 3080 Ti), `--restart unless-stopped --gpus all -p
8880:8880`. The image bundles the model, CUDA torch and espeak-ng. The
user-facing setup now lives in `tutorials/kokoro-fastapi.md`.

A native `uv` install was tried first the same day (Docker was not on PATH
until a reboot) and then removed completely — clone, venv, model, the torch
wheel cache and the winget espeak-ng. Two lessons from it, in case native is
ever tried again:

- **The `gpu` extra does not give Windows a CUDA torch.** Its pin is
  `torch==2.8.0+cu126 ; platform_machine == 'x86_64'`, and on Windows
  `platform_machine` is `AMD64`, so `uv sync` installs `2.8.0+cpu`. Fix was
  `uv pip install --python .venv torch==2.8.0+cu126 --index-url
  https://download.pytorch.org/whl/cu126`, and then every `uv run` had to be
  `--no-sync`, or the lock put the CPU build back.
- espeak-ng (the phonemizer fallback upstream recommends) was installed via
  winget for the native run and uninstalled with it; the Docker image has
  its own.
- The API lessons from this setup (`/dev/captioned_speech` needs
  `stream: false`; `/v1/audio/voices` returns `{ voices: [{ id, name }] }`)
  live on in NOTES.md and CLAUDE.md.
- Verified in Docker (2026-08-22): image 12.7 GB, server up 15 s after
  `docker run`, 68 voices, two sentences synthesized in 0.18 s with 10 word
  timestamps, log says "Loading Kokoro model on cuda", `nvidia-smi -L` inside
  the container lists the RTX 3080 Ti.

## Open items from the final whole-branch review (2026-08-22, since overtaken)

The list as written on 2026-08-22; most items were resolved by later work.

1. **Rate limit is silent.** A 429 from any provider maps to
   `'quota-exceeded'`, which Zotero renders with no message and no Retry.
   Remap to `'network'` or `'unknown'` so the user gets feedback.
   *Still open at the time of the move; the Test-connection synthesis probe
   (NOTES.md) covers visibility at test time only.*
2. **Speed setting is wrong in two ways.** *Resolved: the synthesis speed
   setting was removed entirely (NOTES.md "Synthesis speed setting
   removed").*
3. **A throw inside the interface factory kills the reader tab**, not just
   Read Aloud — `_open()` has no `.catch`. Native returns `null` on failure
   and the consumer handles null; ours should too.
4. **Only the selected provider's voices are published.** *Resolved:
   providers became independent switches on 2026-08-22 and every enabled
   provider's voices are merged.*
5. Minor: `patched` reader list in the hijack never shrinks during a session;
   `toZoteroError` reaches exhaustiveness via `default` rather than a `never`
   check; the Kokoro `call()` helper classifies a user abort as
   "local server down" (unreachable today — nothing aborts through this
   interface).

## Security note (2026-08-22, one-time)

The Azure API key is stored in plaintext in `prefs.js` (Zotero prefs are
plaintext; the pane should say so). During diagnosis I grepped the whole
prefs file and the key appeared in tool output. It should be rotated. The
durable rule — grep prefs.js only for the exact pref needed, never print
whole lines — lives in CLAUDE.md.

## WebDAV client verification log (2026-08-23)

Verified against a local wsgidav 4.3.5 (Basic auth) with the bundled
client under Node: folder missing → `not-found`; first upload → PUT 409,
MKCOL, PUT 201; PROPFIND 207; download round-trips; overwrite works; a
wrong or missing password → `auth` (401); a closed port → `network`.

## Tooling note: heredoc transport (2026-08-23)

The Bash tool's heredoc transport has mangled two scripts (one with `\\.`
regex escapes, one with ellipsis characters); scripts with either go
through the Write tool and `python file.py`. The platform-level version of
this rule is in CLAUDE.md.
