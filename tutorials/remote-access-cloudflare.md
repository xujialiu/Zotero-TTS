# Reaching your TTS server from anywhere with Cloudflare

**English** · [简体中文](remote-access-cloudflare.zh.md)

You run Chatterbox-TTS-Server (or another OpenAI-compatible server) on a
machine with a GPU at home, and you want to use it from Zotero on your laptop
somewhere else. This tutorial puts the server behind a **Cloudflare Tunnel**
and locks it with a **Cloudflare Access service token**, so that:

- nothing is opened on your router — the tunnel dials out;
- every request is checked at Cloudflare's edge; requests without the token
  never reach your home;
- the plugin talks to `https://tts.example.com` like any other server.

Everything here is on Cloudflare's free plan. Time: about twenty minutes.

## What you need

- A domain whose DNS is managed by Cloudflare (`example.com` below; the
  worked example uses `tts-windows.example.com`).
- A Cloudflare Zero Trust account (free tier) — https://one.dash.cloudflare.com
- The TTS server running on the home machine. The tutorial assumes
  Chatterbox-TTS-Server on port 8004; Kokoro-FastAPI is on 8880 (see the
  note at the end before exposing it).
- The plugin, 1.1.2 or newer, on the machine that will read aloud — it needs
  the **Extra headers** field (OpenAI section since 1.1.0, Local engine
  section since 1.1.2).

## 1. Create the tunnel

Zero Trust → **Networks → Tunnels → Create a tunnel → Cloudflared**, give it a
name (`home-tts`), and pick how to run the connector:

**In Docker** (the home machine already has Docker if it runs Chatterbox or
Kokoro this way). Copy the token shown in the dashboard and run:

```
docker run -d --name cloudflared --restart unless-stopped \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <TUNNEL_TOKEN>
```

Inside a container `localhost` is the container itself, not your PC, so the
service URL in the next step must be `http://host.docker.internal:8004`
(Docker Desktop on Windows and macOS resolves that name to the host).

**As a system service** (Windows installer, macOS `brew install cloudflared`,
Linux package): follow the dashboard's one-line install command. Then the
service URL can simply be `http://localhost:8004`.

Either way the tunnel shows **Healthy** in the dashboard once the connector is
up.

### Public hostname

Still in the tunnel's page, **Public Hostname → Add a public hostname**:

| Field | Value |
|---|---|
| Subdomain | `tts-windows` |
| Domain | `example.com` |
| Path | leave empty |
| Type | `HTTP` |
| URL | `localhost:8004` — or `host.docker.internal:8004` for the Docker connector |

Cloudflare creates the DNS record for you. At this point
`https://tts-windows.example.com/docs` already opens Chatterbox's Swagger page
from anywhere — for everyone. The next two steps close that.

## 2. Create a service token

The plugin cannot log in through a browser, so it authenticates with a
*service token*: a Client ID and a Client Secret that Cloudflare checks on
every request.

Zero Trust → **Access controls → Service credentials → Create service token**:

- Name: `zotero-tts`
- Duration: *Non-expiring*, or one year if you prefer rotating it.

The page shows the **Client ID** and the **Client Secret** once. Save both now;
the secret cannot be shown again (you would create a new token instead).

## 3. Protect the hostname with an Access application

Zero Trust → **Access controls → Applications → Add an application →
Self-hosted** (the 2026 dashboard calls it *Self-hosted and private*):

- Application name: `Chatterbox TTS`
- Destination → *Public DNS*: subdomain `tts-windows`, domain `example.com`,
  path empty.
- Policy → *Create a policy*:
  - Name: `service-token-only`
  - **Action: Service Auth** — not *Allow*. *Allow* expects a person to log
    in through a browser; *Service Auth* accepts a token in request headers.
  - Include → selector **Service Token** → choose `zotero-tts`.
- Leave the advanced settings (CORS, cookies, browser rendering) alone.
- Save.

## 4. Check it from a terminal

```
curl -s -o /dev/null -w "%{http_code}\n" https://tts-windows.example.com/v1/audio/voices
```

prints `403` (or `302`, a redirect to Cloudflare's login page): the door is
locked. Now with the token:

```
curl -s \
  -H "CF-Access-Client-Id: <CLIENT_ID>" \
  -H "CF-Access-Client-Secret: <CLIENT_SECRET>" \
  https://tts-windows.example.com/v1/audio/voices
```

prints Chatterbox's voice list, `{"status":"ok","voices":["Abigail.wav",...]}`.

## 5. Point the plugin at it

Zotero → Settings → Zotero-TTS → **OpenAI** section:

| Field | Value |
|---|---|
| Enable OpenAI voices | on |
| Server | **Chatterbox-TTS-Server** (key, model and voices gray out — Chatterbox ignores them); for another server, *Other OpenAI-compatible server* |
| Base URL | `https://tts-windows.example.com` |
| Extra headers | `CF-Access-Client-Id: <CLIENT_ID>; CF-Access-Client-Secret: <CLIENT_SECRET>` |

**Test connection** should answer `Connected. 28 voices available. Synthesis
works.` The voices then appear in Read Aloud's *Local* tier as
`OpenAI-Emily.wav` and so on.

The two header values are as sensitive as an API key: they are stored in
Zotero's preferences in plain text, and anyone holding them can use your
server. To revoke access, delete the service token in Cloudflare (or create a
new one and update the policy) and the old values stop working at once.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `403` even with the headers | The policy's action is *Allow* instead of *Service Auth*, or the token in the policy is not the one you pasted. |
| Cloudflare's login page (HTML) instead of JSON | Same: the policy wants a browser login. |
| `502 Bad Gateway` / `Cannot connect` | The tunnel cannot reach the server: with the Docker connector the service URL must be `host.docker.internal:8004`, not `localhost`; or the TTS container is down (`docker ps`). |
| Tunnel shows *Down* | The connector is not running: `docker ps` should list `cloudflared`; start it with `docker start cloudflared`. |
| Works in curl, plugin says "The server rejected the API key" | A header is missing in *Extra headers* — it must contain both `CF-Access-Client-Id` and `CF-Access-Client-Secret`, separated by `;`. |
| Long sentences fail only remotely | Cloudflare closes requests after 100 s. Chatterbox needs around 8 s for a long sentence on a 3080 Ti; a CPU-only server may not make it. |

## Notes

- **Kokoro-FastAPI** works the same way and keeps its word-level
  highlighting. Give it its own public hostname on the tunnel
  (`kokoro.example.com` → `localhost:8880`, or `host.docker.internal:8880`
  for the Docker connector) and its own Access application — the same
  service token may be used in its policy. In the plugin, *Local engine*:
  Address `https://kokoro.example.com`, Extra headers the same
  `CF-Access-Client-Id: …; CF-Access-Client-Secret: …` pair. A missing or
  wrong token shows up as "The server rejected the API key", not as the
  server being down.
- **Alternatives.** If the other machine is yours as well, a private network
  needs no token at all: Cloudflare WARP (Zero Trust → private network
  routes through the same tunnel, WARP client on the laptop) or Tailscale;
  the plugin then uses the server's private address directly. A reverse
  proxy at home that checks `Authorization: Bearer <key>` (Caddy, nginx)
  also works with the plugin's API-key field, with the difference that
  unauthenticated requests reach your network before being refused.
