# PulseWatch 微信小程序

面向国内部署的 PulseWatch 原生微信小程序（WXML / WXSS / JS），连接现有 PulseWatch API，可用微信开发者工具直接导入、预览与上传。

## 目录结构

```
apps/miniprogram/
├── app.js / app.json / app.wxss    # 小程序入口与全局样式
├── project.config.json             # 微信开发者工具项目配置
├── config/env.js                   # API baseUrl 配置
├── custom-tab-bar/                 # 底部 Tab 导航（监控 / 事件 / 设置）
├── utils/
│   ├── api.js                      # wx.request 封装、401 刷新与跳转
│   ├── auth.js                     # Token 本地存储
│   └── format.js                   # 时间与状态格式化
└── pages/
    ├── login/                      # 邮箱密码登录
    ├── monitors/                   # 监控列表
    ├── monitor-detail/             # 监控详情与最近检测
    ├── incidents/                  # 事件列表
    └── settings/                   # 账号信息与退出
```

## 微信开发者工具导入

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 选择 **导入项目**
3. 目录选择本仓库 `apps/miniprogram/`
4. **AppID**：
   - 正式开发：填写你在 [微信公众平台](https://mp.weixin.qq.com/) 注册的小程序 AppID
   - 仅本地体验：可选择「测试号」或使用工具提供的游客模式（`project.config.json` 中默认为 `touristappid`）
5. 点击 **编译** 即可预览

### 开发阶段跳过域名校验

在开发者工具右上角 **详情 → 本地设置** 中勾选：

- **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**

这样可使用 HTTP 直连 `http://49.234.112.108` 进行调试。

## 服务器域名配置（正式发布必做）

登录 [微信公众平台](https://mp.weixin.qq.com/) → **开发管理 → 开发设置 → 服务器域名**：

| 类型 | 说明 |
|------|------|
| request 合法域名 | 填写 PulseWatch API 的 **HTTPS** 域名（如 `https://api.yourdomain.com`） |

**注意：**

- 微信小程序正式版 **不允许** 使用裸 IP 或 HTTP，需为 API 配置 HTTPS 域名并在后台白名单
- 当前默认 `config/env.js` 指向 `http://49.234.112.108`，仅适合开发者工具调试；上线前请改为 HTTPS 域名

## 切换 API Base URL

编辑 `config/env.js`：

```javascript
module.exports = {
  baseUrl: 'https://your-api-domain.com',  // 生产 HTTPS
  // baseUrl: 'http://49.234.112.108',     // 内网/调试
};
```

修改后在微信开发者工具中 **重新编译**。

## 上传与发布

1. 在微信开发者工具点击 **上传**，填写版本号与备注
2. 登录微信公众平台 → **版本管理**，将开发版提交审核
3. 审核通过后 **发布** 即可对用户可见

> 小程序发布走微信控制台，**不需要** 运行本仓库的 `deploy/redeploy-*.js` 脚本。API 服务端仅在新增 CORS 或鉴权改动时才需 redeploy。

## 微信一键登录（服务端配置）

在 API 服务器 `.env`（`/opt/pulsewatch/api/.env`）中配置：

```bash
WECHAT_MINI_APP_ID=你的小程序AppID
WECHAT_MINI_APP_SECRET=你的小程序AppSecret
```

配置后重启 `pulsewatch-api`。小程序打开登录页将自动尝试 `wx.login` 一键登录；首次使用会自动注册 PulseWatch 账号（与 Web 邮箱账号独立，可在 Web 登录后在设置中绑定微信）。

## 使用的 API 端点

| 功能 | 方法 | 路径 |
|------|------|------|
| 微信登录是否可用 | GET | `/api/v1/auth/wechat/miniprogram/status` |
| 微信一键登录/注册 | POST | `/api/v1/auth/wechat/miniprogram` |
| 绑定微信到当前账号 | POST | `/api/v1/me/wechat/miniprogram/bind` |
| 邮箱密码登录 | POST | `/api/v1/auth/login` |
| 刷新 Token | POST | `/api/v1/auth/refresh` |
| 当前用户 | GET | `/api/v1/me` |
| 监控列表 | GET | `/api/v1/orgs/{orgId}/monitors` |
| 监控详情 | GET | `/api/v1/orgs/{orgId}/monitors/{id}` |
| 最近检测 | GET | `/api/v1/orgs/{orgId}/monitors/{id}/checks?page=1&limit=20` |
| 24h 统计 | GET | `/api/v1/orgs/{orgId}/monitors/{id}/stats?range=24h` |
| 事件列表 | GET | `/api/v1/orgs/{orgId}/incidents` |

认证方式：请求头 `Authorization: Bearer {accessToken}`，Token 存于 `wx.storage`（键名 `pulsewatch_auth`）。401 时自动尝试 refresh，失败则跳转登录页。

## 功能范围（MVP）

- ✅ 微信一键登录/自动注册（需配置 `WECHAT_MINI_APP_ID` / `SECRET`）
- ✅ 邮箱密码登录（与 Web 相同账号）
- ✅ 监控列表：状态、名称、上次检测、响应时间、24h 可用率
- ✅ 监控详情：24h 统计、最近 20 条检测记录
- ✅ 事件列表：全部 / 进行中 / 已恢复筛选
- ✅ 设置：账号、组织、API 地址、退出登录
- ❌ 双因素认证（TOTP）— 需在 Web 端登录；可在 Web 绑定微信后于小程序一键登录
- ❌ 创建/编辑监控、告警配置 — 请使用 Web 端

## 手动测试清单

- [ ] 开发者工具导入编译无报错
- [ ] 使用有效账号登录成功，进入监控 Tab
- [ ] 监控列表展示 UP/DOWN 状态，下拉刷新正常
- [ ] 点击监控进入详情，统计与检测记录加载正常
- [ ] 事件 Tab 列表与筛选正常
- [ ] 设置页显示邮箱与组织，退出后回到登录页
- [ ] 清除 Storage 或 Token 过期后自动跳转登录
- [ ] （可选）配置 HTTPS 域名后真机预览 request 正常

## 验证项目结构

在仓库根目录运行：

```bash
npm run miniprogram:validate
```

检查 `app.json`、`project.config.json`、各页面四件套及 `config/env.js` 是否存在。
