# Azure Speech on the free tier

Azure AI Speech is the plugin's **Azure** provider: several hundred neural
voices in over a hundred languages, multilingual voices that read a mixed
document in one go, and word timings — so Read Aloud highlights word by
word. Its **Free (F0)** pricing tier gives **500,000 characters of neural
text to speech per month**, every month, for as long as the resource exists.
A journal article is 40,000–80,000 characters, so that is six to twelve
papers a month, read in full, at no cost. This tutorial walks through getting
a key on that tier and putting it into the plugin. Time: about fifteen
minutes, most of it Microsoft's sign-up.

## What you need

- A Microsoft account (any Outlook/Hotmail/Xbox login, or one you create
  during sign-up).
- A credit or debit card for the Azure sign-up. Microsoft uses it to verify
  your identity; nothing is charged on the Free tier, and a free account is
  not upgraded to paid unless you do so yourself. Students can use
  [Azure for Students](https://azure.microsoft.com/free/students/) with a
  university e-mail address instead, no card needed.
- Plugin 1.0 or newer.

## 1. Create an Azure account

Go to [azure.microsoft.com/free](https://azure.microsoft.com/free/) and
**Start free**. Sign in with the Microsoft account, fill in the profile,
verify the phone number and the card. The free account also comes with a
US$200 credit for the first 30 days and twelve months of free amounts of
various services — you need none of that for the plugin: the Speech Free
tier below is permanent and independent of it.

## 2. Create a Speech resource on the Free tier

1. Open the [Azure portal](https://portal.azure.com/) and choose **Create a
   resource** (the **+** at the top left).
2. Search the marketplace for **Speech** and pick **Speech** by Microsoft
   (under Azure AI services / Foundry Tools — the name of the family changes
   every year, the product does not). Press **Create**.
3. Fill in the form:

   | Field | Value |
   |---|---|
   | Subscription | the one the sign-up created (*Free Trial* / *Azure subscription 1*) |
   | Resource group | **Create new**, any name (`zotero-tts`) |
   | Region | one near you — see below |
   | Name | anything unique (`zotero-tts-speech`) |
   | Pricing tier | **Free F0** |

   Only one Free Speech resource is allowed per subscription and region; if
   *Free F0* is grayed out, you already have one there, or had one: a deleted
   resource lingers in a soft-deleted state for a while and still counts. Pick
   another region, or purge it (Azure AI services, Manage deleted resources).
4. **Review + create**, then **Create**. Deployment takes under a minute;
   press **Go to resource**.

### Which region

The region is where your requests are served, so pick a close one for low
latency: `eastasia` (Hong Kong) or `japaneast` from East Asia, `westeurope`
or `northeurope` from Europe, `eastus` / `westus2` from North America.
Almost every voice is available in every region; the full list is in
[Speech service regions](https://learn.microsoft.com/azure/ai-services/speech-service/regions).
The plugin needs the region's short id (`eastasia`, not *East Asia*); the
resource page shows it.

## 3. Copy the key and the region

On the resource's page open **Keys and Endpoint** (under *Resource
Management* in the left column). It shows **KEY 1**, **KEY 2** and
**Location/Region**. Copy KEY 1 and note the region id. Either key works;
two exist so one can be rotated while the other stays in use.

## 4. Point the plugin at it

Zotero → Settings → TTS → **Azure** section:

| Field | Value |
|---|---|
| Enable Azure voices | on |
| API key | KEY 1 |
| Region | the region id, e.g. `eastasia` |

**Test connection** should answer `Connected. N voices available. Synthesis
works.` — the test synthesizes two characters, which proves the key can
spend, not just list voices. Open Read Aloud, choose the *Local* tier, and
the `TTS-Azure-…` voices are there; for reading a document in one language
pick a voice of that language (`TTS-Azure-Xiaoxiao`, `TTS-Azure-Ava`), for
mixed-language documents one of the *Multilingual* ones under the "Multiple
languages" entry. For word-by-word highlighting set *Settings → General →
Read Aloud → Highlight current* to **Word**.

## What the Free tier does and does not include

- **500,000 characters a month** of the standard neural voices — the
  `…Neural` voices the plugin lists, multilingual ones included. The
  counter resets on the first of each month.
- Not included: the HD voices (`…:DragonHD…` in the name) are a separate,
  paid line; on a Free resource stay with the plain neural voices.
- **20 requests per minute.** The plugin makes one request per sentence and
  prefetches a few ahead. Ordinary reading stays well under the limit, but a
  run of very short sentences (a reference list, a table) can exceed it;
  Azure then answers 429 and Read Aloud stops with a quota message. Lower
  *Prefetch* under *Settings → TTS → Reading* to 1 or 2 if that happens
  often, or press play again.
- When the month's allowance is used up, Azure refuses further requests
  until the first of the next month; in the plugin that shows as the key
  being rejected. To keep reading, change the resource's pricing tier to
  **Standard S0** (*Resource Management → Pricing tier*): pay as you go, in
  the region of US$15 per million characters for neural voices — a paper
  for about a cent. Check the current price on the
  [pricing page](https://azure.microsoft.com/pricing/details/speech/).
- Usage so far is on the resource's **Metrics** page (*Synthesized
  Characters*, summed over the month). Only the text itself counts: the
  markup the plugin wraps each sentence in is not billable.

## Troubleshooting

- **"The server rejected the API key"**: a typo in the key, or the Region
  field names a region other than the resource's (`eastasia` vs `eastus`);
  or the monthly allowance is used up, see above.
- **"Cannot connect"**: no route to `<region>.tts.speech.microsoft.com` —
  a firewall or a proxy; Zotero follows the system proxy settings.
- **No voices for my language**: the plugin lists what the region offers;
  nearly everything is everywhere, but a few voices are regional. Check the
  voice in the [Voice Gallery](https://speech.microsoft.com/portal/voicegallery)
  and, if needed, create a second resource in another region.
- **Read Aloud stops with "quota" mid-document**: the 20-requests-per-minute
  limit above, or the month's characters are gone.
