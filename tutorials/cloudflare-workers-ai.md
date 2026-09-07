# Cloudflare Workers AI on the free allowance

**English** · [简体中文](cloudflare-workers-ai.zh.md)

Cloudflare Workers AI is the plugin's **Cloudflare Workers AI** provider:
Deepgram's **Aura** voices — 52 English speakers and 10 Spanish ones — and
**MeloTTS**, one voice each for English, Chinese, Japanese and Korean. Every
Cloudflare account, the free plan included, gets **10,000 Neurons of
inference a day** at no charge, which is a few pages with an Aura voice or
hours of reading with MeloTTS. These voices highlight by sentence, not by
word. Time: about five minutes.

## What you need

- A Cloudflare account — a free one is enough:
  [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up). No
  domain and no card is needed for the free allowance.
- Plugin 1.11.3 or newer.

## 1. Create a Workers AI token and copy the Account ID

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/) open **AI →
   Workers AI** in the left column. A new account may be asked to enable
   Workers first; that is free.
2. Choose **Use REST API**.
3. Press **Create a Workers AI API Token**, leave the prefilled token as it
   is, **Create API Token**, then **Copy API Token**. The token is shown
   once — paste it into the plugin right away, or keep it somewhere safe; a
   lost one is simply replaced by a new one.
4. The same page shows the **Account ID** under *Get Account ID*; copy it
   too. It is also in the address of every dashboard page: the 32
   characters after `dash.cloudflare.com/`.

## 2. Put both into the plugin

Zotero → Settings → Zotero-TTS → **Cloudflare Workers AI** section:

| Field | Value |
|---|---|
| Account ID | the 32-character id |
| API token | the token |

**Test connection** should answer `Connected. 66 voices available. Synthesis
works.` — the test lists the models, then synthesizes two letters, which
proves the account can spend. **Enable** locks the fields and adds the
voices. Open Read Aloud, choose the *Local* tier, and the `Cloudflare-…`
voices are there:

- under **English**, the Aura voices — `Cloudflare-Aura-2 Luna (female)`,
  `Cloudflare-Aura-1 Angus (male)`, … — and `Cloudflare-MeloTTS English`;
- under **Spanish**, the Aura-2 Spanish voices;
- under **Chinese**, **Japanese** and **Korean**, one MeloTTS voice each.

## Which voice for what

- **MeloTTS** costs next to nothing: its four languages read all day within
  the free allowance. One voice per language, plainer than Aura in English.
- **Aura-1** is natural English at half of Aura-2's price: two or three
  pages a day for free.
- **Aura-2**, English and Spanish, is Deepgram's best; the free allowance
  is one or two pages a day.
- Every one of them is highlighted by sentence: none reports word timings.
  For word-by-word highlighting use Azure, Kokoro or the Windows voices.

## What the free allowance does and does not include

- **10,000 Neurons a day**, on the free plan and the paid one alike, reset
  daily. Neurons are Cloudflare's unit for inference, and each model's page
  says what it costs in them. Measured on 2026-09-07: a 160-character
  sentence is about 220 Neurons on Aura-1, twice that on Aura-2, and under 3
  on MeloTTS. A day is therefore roughly **7,000 characters of Aura-1,
  3,500 of Aura-2, or nine hours of MeloTTS**.
- On the free plan, once the day's Neurons are spent, requests fail until
  the next day — in the plugin the server refuses to synthesize and Read
  Aloud stops. Nothing is charged.
- On the **Workers Paid** plan (US$5 a month) reading continues past the
  allowance at US$0.011 per 1,000 Neurons: a paper of 60,000 characters is
  about a cent on MeloTTS, a dollar on Aura-1, two on Aura-2.
- The plugin synthesizes a few sentences ahead of playback, and on Aura a
  sentence you skip past is still paid for. To spend less while jumping
  around a document, lower *Prefetch* under *Settings → Zotero-TTS →
  Reading* to 1.
- The day's usage is on the dashboard's Workers AI page.

## Troubleshooting

- **"The server rejected the API key … Authentication error"**: the token
  or the Account ID is wrong — Cloudflare answers the same for both. Check
  that the id has 32 characters and that the token was made on the Workers
  AI page; a token made elsewhere may lack the Workers AI permission.
- **"Cannot connect"**: no route to `api.cloudflare.com` — a firewall or a
  proxy; Zotero follows the system proxy settings.
- **Synthesis worked this morning and fails now**: the day's Neurons are
  spent. Wait for the reset, or switch to a MeloTTS voice tomorrow.
- **Aura reads only English or Spanish**: that is what Aura speaks. A
  document in another language wants a MeloTTS voice, or another provider.
- **The Chinese voice reads English words too**: MeloTTS's Chinese voice is
  a mixed Chinese-and-English one by design.
