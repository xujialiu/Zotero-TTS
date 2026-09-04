<!-- translated-from: remote-access-cloudflare.md sha256:3c5e9854e7ff -->
# 用 Cloudflare 在任何地方访问你的 TTS 服务器

[English](remote-access-cloudflare.md) · **简体中文**

你在家里一台有显卡的机器上跑着 Chatterbox-TTS-Server（或者别的 OpenAI 兼容服务器），想在别处用笔记本上的 Zotero 连它。本教程把这台服务器放到 **Cloudflare Tunnel** 后面，并用 **Cloudflare Access 服务令牌**锁上，于是：

- 路由器上什么端口都不用开——隧道是从里往外拨的；
- 每个请求都在 Cloudflare 的边缘上验一次；没带令牌的请求根本到不了你家；
- 插件像连别的服务器一样连 `https://tts.example.com`。

这里用到的都在 Cloudflare 的免费套餐里。耗时约二十分钟。

## 你需要什么

- 一个 DNS 托管在 Cloudflare 上的域名（下文写作 `example.com`；示例用的是 `tts-windows.example.com`）。
- 一个 Cloudflare Zero Trust 账号（免费层）——https://one.dash.cloudflare.com
- 家里那台机器上跑着 TTS 服务器。教程假定是 8004 端口上的 Chatterbox-TTS-Server；Kokoro-FastAPI 在 8880（把它暴露出去之前先看文末的说明）。
- 用来朗读的那台机器上，插件是 1.1.2 或更新的版本——它需要**额外请求头**字段（OpenAI 那一节从 1.1.0 起有，本地引擎那一节从 1.1.2 起有）。

> **国内网络**——cloudflared 是从你家里的机器往外拨的，一般连得上；不确定的是笔记本这一端到 Cloudflare 边缘节点的线路，时好时坏，赶上差的时候长句可能撞上 Cloudflare 100 秒的请求上限（见疑难解答）。域名不必在国内注册，但 NS 必须改到 Cloudflare。如果两台机器都是你自己的，文末「其他做法」里的 Tailscale / WARP 私有网络往往更稳，也省掉令牌这一套。

## 1. 建隧道

Zero Trust → **Networks → Tunnels → Create a tunnel → Cloudflared**，起个名字（`home-tts`），再选连接器怎么跑：

**用 Docker**（家里那台机器如果就是这么跑 Chatterbox 或 Kokoro 的，Docker 已经有了）。把面板上显示的令牌抄下来，然后跑：

```
docker run -d --name cloudflared --restart unless-stopped \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run --token <TUNNEL_TOKEN>
```

在容器里，`localhost` 指的是容器自己，不是你的电脑，所以下一步里的服务地址必须写 `http://host.docker.internal:8004`（Windows 和 macOS 上的 Docker Desktop 会把这个名字解析成宿主机）。

**作为系统服务**（Windows 装安装包，macOS 用 `brew install cloudflared`，Linux 用发行版的包）：照面板给的那一行安装命令做。这样服务地址直接写 `http://localhost:8004` 就行。

不管哪种方式，连接器起来之后，面板里的隧道会显示 **Healthy**。

### 公开主机名

还在这个隧道的页面里，**Public Hostname → Add a public hostname**：

| 字段 | 填什么 |
|---|---|
| Subdomain | `tts-windows` |
| Domain | `example.com` |
| Path | 留空 |
| Type | `HTTP` |
| URL | `localhost:8004`——用 Docker 连接器就填 `host.docker.internal:8004` |

DNS 记录 Cloudflare 会替你建。到这一步，`https://tts-windows.example.com/docs` 已经能在任何地方打开 Chatterbox 的 Swagger 页面了——对所有人都能。接下来两步就是把这扇门关上。

## 2. 建一个服务令牌

插件没法在浏览器里登录，所以它用*服务令牌*来认证：一个 Client ID 和一个 Client Secret，Cloudflare 每个请求都验。

Zero Trust → **Access controls → Service credentials → Create service token**：

- 名字：`zotero-tts`
- 有效期：*Non-expiring*（永不过期），想定期轮换的话选一年。

页面只显示一次 **Client ID** 和 **Client Secret**。两个都当场存好；密钥不会再显示第二次（丢了只能另建一个）。

## 3. 用 Access 应用把这个主机名保护起来

Zero Trust → **Access controls → Applications → Add an application → Self-hosted**（2026 年的面板里叫 *Self-hosted and private*）：

- 应用名：`Chatterbox TTS`
- Destination → *Public DNS*：subdomain 填 `tts-windows`，domain 填 `example.com`，path 留空。
- Policy → *Create a policy*：
  - 名字：`service-token-only`
  - **Action 选 Service Auth**——不是 *Allow*。*Allow* 等的是人在浏览器里登录；*Service Auth* 收的是请求头里的令牌。
  - Include → 选择器选 **Service Token** → 选 `zotero-tts`。
- 高级设置（CORS、cookie、浏览器渲染）都别动。
- 保存。

## 4. 在终端里验一下

```
curl -s -o /dev/null -w "%{http_code}\n" https://tts-windows.example.com/v1/audio/voices
```

会打印 `403`（或者 `302`，跳转到 Cloudflare 的登录页）：门锁上了。现在带上令牌：

```
curl -s \
  -H "CF-Access-Client-Id: <CLIENT_ID>" \
  -H "CF-Access-Client-Secret: <CLIENT_SECRET>" \
  https://tts-windows.example.com/v1/audio/voices
```

会打印出 Chatterbox 的语音列表，`{"status":"ok","voices":["Abigail.wav",...]}`。

## 5. 把插件指过去

Zotero → 设置 → Zotero-TTS → **OpenAI** 那一节：

| 字段 | 填什么 |
|---|---|
| 启用 OpenAI 语音 | 开 |
| 服务器 | **Chatterbox-TTS-Server**（密钥、模型和语音会置灰——Chatterbox 不看它们）；别的服务器就选*其他 OpenAI 兼容服务器* |
| API 地址 | `https://tts-windows.example.com` |
| 额外请求头 | `CF-Access-Client-Id: <CLIENT_ID>; CF-Access-Client-Secret: <CLIENT_SECRET>` |

**测试连接**应当回答 `Connected. 28 voices available. Synthesis works.`。之后这些语音就出现在朗读的*本地*语音模式里，形如 `OpenAI-Emily.wav`。

这两个请求头的值和 API 密钥一样敏感：它们以明文存在 Zotero 的首选项里，谁拿到就能用你的服务器。要收回访问权，去 Cloudflare 删掉这个服务令牌（或者新建一个并改策略），旧的值立刻失效。

## 疑难解答

| 现象 | 原因 |
|---|---|
| 带了请求头还是 `403` | 策略的 action 是 *Allow* 而不是 *Service Auth*，或者策略里选的令牌不是你粘贴的那个。|
| 返回的是 Cloudflare 的登录页（HTML）而不是 JSON | 同上：策略要的是浏览器登录。|
| `502 Bad Gateway` / 「无法连接」 | 隧道够不到服务器：用 Docker 连接器时服务地址必须是 `host.docker.internal:8004`，不能是 `localhost`；也可能是 TTS 容器没在跑（`docker ps`）。|
| 隧道显示 *Down* | 连接器没在跑：`docker ps` 应该能列出 `cloudflared`，用 `docker start cloudflared` 起来。|
| curl 通，插件却说「服务器拒绝了 API 密钥」 | *额外请求头*里少了一个——必须同时有 `CF-Access-Client-Id` 和 `CF-Access-Client-Secret`，中间用 `;` 分隔。|
| 只有远程时长句失败 | Cloudflare 100 秒后会掐断请求。长句在 3080 Ti 上的 Chatterbox 约需 8 秒；纯 CPU 的服务器可能赶不上。|

## 说明

- **Kokoro-FastAPI** 同样这么做，而且逐词高亮不会丢。在隧道上给它一个自己的公开主机名（`kokoro.example.com` → `localhost:8880`，用 Docker 连接器就是 `host.docker.internal:8880`），再给它一个自己的 Access 应用——策略里可以用同一个服务令牌。插件这边，在*本地引擎*里：地址填 `https://kokoro.example.com`，额外请求头同样填 `CF-Access-Client-Id: …; CF-Access-Client-Secret: …`。令牌漏了或填错，表现是「服务器拒绝了 API 密钥」，而不是服务器没起来。
- **其他做法**。如果另一台机器也是你自己的，用私有网络就完全不需要令牌：Cloudflare WARP（Zero Trust → 私有网络走同一条隧道，笔记本上装 WARP 客户端）或者 Tailscale；插件直接用服务器的内网地址即可。在家里放一个检查 `Authorization: Bearer <key>` 的反向代理（Caddy、nginx）也能配合插件的 API 密钥字段用，区别是没通过认证的请求会先进到你的网络里才被拒。
