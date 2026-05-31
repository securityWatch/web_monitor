# PulseWatch — 域名与 HTTPS 上线

生产 IP：`49.234.112.108`。默认域名配置见 `deploy/lib/config.js`（`APP_DOMAINS=gkao.com.cn,www.gkao.com.cn`）。

## 当前状态检查

`gkao.com.cn` 若仍解析到 **Cloudflare**（104.x / 172.x），有两种常见模式：

| 模式 | DNS | 源站证书 | 脚本 |
|------|-----|----------|------|
| **Cloudflare 代理（橙云）** | 保持 CF IP | 源站已有 `/etc/nginx/ssl/gkao.com.cn/`（`pulsewatch.conf`） | 勿同时启用 `sites-enabled/pulsewatch` 与 `pulsewatch.conf`（会 duplicate `default_server`） |
| **直连源站 + Let's Encrypt** | A 记录 → `49.234.112.108`（可灰云） | `setup-https.js` 签发 certbot | `apply-domain.js` → `setup-https.js` |

`apply-domain.js` / `setup-https.js` 安装配置时会 **自动移除** `sites-enabled/pulsewatch.conf`，避免与 `pulsewatch` 重复。

## 步骤 1 — DNS

| 记录 | 值 | 说明 |
|------|-----|------|
| `A` `@` | `49.234.112.108` | 根域 |
| `A` `www` | `49.234.112.108` | 可选 www |

**Cloudflare 用户：**

- 上线前可先用 **DNS only（灰云）** 让 certbot 验证通过
- 证书就绪后开 **橙云**，SSL/TLS 建议 **Full (strict)**（源站已有 Let's Encrypt）
- 若暂不用源站证书，可 **Flexible**（用户↔CF 为 HTTPS，CF↔源站 HTTP）— SEO 可用但安全性较弱

## 步骤 2 — HTTP 域名绑定

```bash
cd deploy
# 可选：APP_DOMAINS=your.com,www.your.com
node apply-domain.js
```

脚本会：

- 生成并安装 Nginx `server_name`（域名 + IP）
- 同步 API `CORS_ORIGINS`
- 从服务器检查 DNS 是否指向本机
- 启用站点前删除 `sites-enabled` 里重复的 `pulsewatch` / `pulsewatch.conf` 软链，避免 `default_server` 冲突

## 步骤 3 — HTTPS（Let's Encrypt）

DNS 已指向 `49.234.112.108` 后：

```bash
cd deploy
set CERTBOT_EMAIL=your@email.com
set NEXT_PUBLIC_SITE_URL=https://gkao.com.cn
node setup-https.js
```

脚本会：certbot 签发证书 → 切换 Nginx 443 → 以 HTTPS  canonical URL 重建 Web。

## 步骤 4 — 搜索引擎

1. 服务器 `.env` / 构建：`NEXT_PUBLIC_SITE_URL=https://你的域名`（无尾斜杠）
2. 可选：`GOOGLE_SITE_VERIFICATION`、`BAIDU_SITE_VERIFICATION` → `node patch-seo-verification.js` 再 `node redeploy-web.js`
3. Google Search Console / 百度站长：提交 `https://你的域名/sitemap.xml`
4. 检查 `/en`、`/zh` 的 canonical 与 hreflang

## 脚本一览

| 命令 | 作用 |
|------|------|
| `node apply-domain.js` | HTTP + 域名 server_name + CORS |
| `node setup-https.js` | Certbot + HTTPS Nginx + Web 重建 |
| `node apply-nginx.js` | 仅应用仓库内 `nginx/pulsewatch.conf` |
| `node redeploy-web.js` | 按 `NEXT_PUBLIC_SITE_URL` 重建前端 |

模板参考：`deploy/nginx/pulsewatch-https.conf.example`

## 备案（中国大陆）

百度长期收录建议在 **ICP 备案** 完成后使用已备案域名作为 canonical；备案期间可继续用 IP 或海外节点测试。
