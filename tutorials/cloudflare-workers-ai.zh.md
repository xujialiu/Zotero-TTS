<!-- translated-from: cloudflare-workers-ai.md sha256:aad632fbb82e -->
# 用 Cloudflare Workers AI 的免费额度

[English](cloudflare-workers-ai.md) · **简体中文**

Cloudflare Workers AI 就是插件里的 **Cloudflare Workers AI** 服务商：Deepgram 的 **Aura** 语音——52 个英语说话人、10 个西班牙语说话人——和 **MeloTTS**，英语、中文、日语、韩语各一个语音。每个 Cloudflare 账户，免费计划也算在内，每天都有 **10,000 个 Neurons 的推理额度**，不花钱：Aura 语音够读几页，MeloTTS 够读几个小时。这些语音按句高亮，不逐词。耗时约五分钟。

## 你需要什么

- 一个 Cloudflare 账户——免费的就够：[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)。免费额度不需要域名，也不需要银行卡。
- 插件 1.11.3 或更新的版本。

## 1. 创建 Workers AI 令牌，抄下 Account ID

1. 在 [Cloudflare 控制台](https://dash.cloudflare.com/)左栏里打开 **AI → Workers AI**。新账户可能会先让你启用 Workers；这一步是免费的。
2. 选 **Use REST API**。
3. 点 **Create a Workers AI API Token**，预填好的令牌不用改，**Create API Token**，然后 **Copy API Token**。令牌只显示这一次——马上粘进插件，或者找个安全的地方存好；丢了也不要紧，重新建一个就是。
4. 同一个页面上，*Get Account ID* 底下就是 **Account ID**，一并抄下。它也在控制台每个页面的地址里：`dash.cloudflare.com/` 后面那 32 个字符。

## 2. 把两个值填进插件

Zotero → 设置 → Zotero-TTS → **Cloudflare Workers AI** 那一节：

| 字段 | 填什么 |
|---|---|
| 账户 ID | 那 32 个字符的 id |
| API 令牌 | 那个令牌 |

**测试连接**应当回答 `已连接。66 个语音可用。合成正常。`——测试会先列出模型，再合成两个字符，证明这个账户真的能花额度。**启用**会锁住这两个字段，并把语音加进来。打开朗读，语音模式选*本地*，`Cloudflare-…` 那些语音就在那里：

- **英语**下面是 Aura 的语音——`Cloudflare-Aura-2 Luna (female)`、`Cloudflare-Aura-1 Angus (male)`、……——还有 `Cloudflare-MeloTTS English`；
- **西班牙语**下面是 Aura-2 的西班牙语语音；
- **中文**、**日语**、**韩语**下面各有一个 MeloTTS 语音。

## 该选哪个语音

- **MeloTTS** 几乎不花额度：它的四种语言在免费额度里够读一整天。每种语言一个语音，英语听着比 Aura 平淡。
- **Aura-1** 是自然的英语，价钱是 Aura-2 的一半：免费额度每天够读两三页。
- **Aura-2** 有英语和西班牙语，是 Deepgram 最好的；免费额度每天够读一两页。
- 它们全都按句高亮：没有一个会报词级时间戳。要逐词高亮，用 Azure、Kokoro 或者 Windows 的系统语音。

## 免费额度包含什么、不包含什么

- **每天 10,000 个 Neurons**，免费计划和付费计划一样多，每天重置。Neurons 是 Cloudflare 计量推理用量的单位，每个模型的页面上都写着它按 Neurons 怎么算。2026-09-07 实测：一句 160 个字符，Aura-1 大约 220 个 Neurons，Aura-2 是它的两倍，MeloTTS 不到 3 个。所以一天大约是 **7,000 个字符的 Aura-1、3,500 个字符的 Aura-2，或者九个小时的 MeloTTS**。
- 免费计划上，当天的 Neurons 花完之后，请求会一直失败到第二天——在插件里表现为服务器拒绝合成，朗读停下。不会产生任何费用。
- 在 **Workers Paid** 计划上（每月 5 美元），额度用完还能接着读，每 1,000 个 Neurons 收 0.011 美元：一篇 6 万字符的论文，MeloTTS 大约一美分，Aura-1 大约一美元，Aura-2 两美元。
- 插件会在播放之前先合成几句；在 Aura 上，被你跳过的句子同样要付钱。想在文档里跳来跳去时少花一点，把*设置 → Zotero-TTS → 朗读*里的*预取后面的 N 句*改成 1。
- 当天用了多少，在控制台的 Workers AI 页面上看。

## 疑难解答

- **「服务器拒绝了 API 密钥……Authentication error」**：令牌或者 Account ID 填错了——两种情况 Cloudflare 的回答一模一样。检查 id 是不是 32 个字符，以及令牌是不是在 Workers AI 页面上建的；在别处建的令牌可能没有 Workers AI 的权限。
- **「无法连接」**：到 `api.cloudflare.com` 没有路由——防火墙或者代理的问题；Zotero 走系统的代理设置。
- **早上还能合成，现在不行了**：当天的 Neurons 花完了。等它重置，或者明天换一个 MeloTTS 的语音。
- **Aura 只读英语或西班牙语**：Aura 会的就是这两种。别的语言的文档，用 MeloTTS 的语音，或者换一个服务商。
- **中文语音把英文词也读出来了**：MeloTTS 的中文语音本来就是中英混合的。
