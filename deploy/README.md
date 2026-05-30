# PulseWatch 部署脚本

## 快速命令

```bash
cd deploy && npm install
npm run api          # Go API（~1–3 分钟，未改则跳过上传）
npm run web          # Next.js（默认服务器构建，~3–8 分钟）
npm run all          # 两者并行
npm run web:static   # 仅上传 static（~1–2 分钟）
npm run web:upload   # 上传完整构建包（窄带宽 20+ 分钟，不推荐）
```

## 为何更快

| 优化 | 说明 |
|------|------|
| **服务器构建 Web** | 只 scp ~500KB 源码，不在外网上传 24MB tar |
| **API gzip + scp** | 约 5MB 替代 14MB；`sshpass`+`scp` 通常比 ssh2 fastPut 更快 |
| **API SHA 跳过** | 二进制未变不上传 |
| **依赖缓存** | 服务器 `/opt/pulsewatch/build` 保留 `node_modules`，lock 未变不跑 `npm ci` |
| **并行** | `npm run all` 同时部署 API 与 Web |

## 环境变量

- `DEPLOY_HOST` / `DEPLOY_PASSWORD`
- `REMOTE_WEB_BUILD=0` — 改回上传整包
- `FORCE_DEPLOY=1` — 强制重传 API
- `SKIP_WEB_BUILD=1` — 配合 `web:upload` / `web:static` 跳过本地 build
