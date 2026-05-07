# 上线清单

以下步骤按顺序执行。

## 1. 安装 CLI

官方 CloudBase CLI 安装命令：

```bash
npm i -g @cloudbase/cli
```

登录：

```bash
tcb login
```

如果使用 API Key：

```bash
tcb login --key
```

## 2. 准备本地配置

在项目根目录 [wangmeipo](/Users/swindcn/Documents/wangmeipo) 下复制环境变量模板：

```bash
cp .env.local.example .env.local
```

至少填写：

- `ENV_ID`
- `REGION`
- `OPENAI_API_KEY`

如需在一期联调阶段用一个微信号模拟多个身份，再额外配置：

- `ALLOW_DEBUG_VIEWER_OVERRIDE=true`

正式上线建议保持默认值 `false`。

然后修改小程序 [app.js](/Users/swindcn/Documents/wangmeipo/miniprogram/app.js) 的 `envId`。

如果要走公众号 webhook 预发，再补一份服务侧环境文件：

```bash
cp services/official-account-webhook/.env.local.example services/official-account-webhook/.env.local
```

## 3. 上传云函数

项目根目录执行：

```bash
cd /Users/swindcn/Documents/wangmeipo
tcb fn deploy --all --force --yes
```

如果你希望按项目内约定顺序逐个部署，并且从 `.env.local` 自动读取 `ENV_ID`，可直接执行：

```bash
cd /Users/swindcn/Documents/wangmeipo
npm run deploy:functions
```

只想先看将要执行的命令：

```bash
cd /Users/swindcn/Documents/wangmeipo
npm run deploy:functions:dry-run
```

如果希望把“语法检查 + 云函数部署 + 公众号 webhook 部署”串成一次预发动作，可执行：

```bash
cd /Users/swindcn/Documents/wangmeipo
npm run predeploy
```

先预览完整命令链：

```bash
cd /Users/swindcn/Documents/wangmeipo
npm run predeploy:dry-run
```

如果本机还没安装 `tcb` CLI，也可以在微信开发者工具里上传：

1. 打开项目 [wangmeipo](/Users/swindcn/Documents/wangmeipo)
2. 确认云开发环境为 `cloud1-d2g8yliwa5b20fae7`
3. 确认左侧项目目录里能看到 `cloudfunctions/`；如果看不到，说明打开的是 `miniprogram/` 子目录，需要重新导入 [wangmeipo](/Users/swindcn/Documents/wangmeipo) 根目录
4. 在 `cloudfunctions/submitCandidateProfile` 上右键
5. 选择“上传并部署：云端安装依赖”
6. 上传完成后再回小程序上传页测试保存

如果环境不在上海，按官方 CLI 文档附加地域参数，例如广州：

```bash
tcb fn deploy --all --force --yes -r gz
```

推荐上传顺序：

1. `bootstrapDatabase`
2. `getDashboardSummary`
3. `getCandidateDetail`
4. `listReviewQueue`
5. `getPermissionData`
6. `grantCandidatePermission`
7. `getMatchData`
8. `recordMatch`
9. `listMyAccess`
10. `createShareToken`
11. `submitCandidateProfile`
12. `ingestOfficialAccountMessage`
13. `runParsePipeline`
14. `drainParseQueue`
15. `reviewParsedCandidate`

## 4. 初始化数据库

在微信开发者工具打开小程序后，进入首页点击“初始化云数据库”。

然后去控制台手动创建索引，参照：

- [database-indexes.md](/Users/swindcn/Documents/wangmeipo/docs/setup/database-indexes.md)

数据库安全规则可按模板粘贴：

- [database-rules-template.json](/Users/swindcn/Documents/wangmeipo/docs/setup/database-rules-template.json)

## 5. 部署公众号回调服务

先进入服务目录：

```bash
cd /Users/swindcn/Documents/wangmeipo/services/official-account-webhook
```

如果你本地已有 CloudBase CLI，按官方云托管 CLI 文档可直接部署：

```bash
tcb cloudrun deploy -e <ENV_ID> -s official-account-webhook --port 3000 --source . --force
```

也可以直接调用项目脚本：

```bash
cd /Users/swindcn/Documents/wangmeipo
npm run deploy:webhook
```

如果环境不在上海，可追加 `-r`，例如：

```bash
tcb cloudrun deploy -e <ENV_ID> -s official-account-webhook --port 3000 --source . --force -r gz
```

服务环境变量至少要配置：

- `CLOUDBASE_ENV_ID`
- `WECHAT_OFFICIAL_ACCOUNT_TOKEN`
- `WECHAT_OFFICIAL_ACCOUNT_APP_ID`
- `WECHAT_OFFICIAL_ACCOUNT_ENCODING_AES_KEY`
- `PORT=3000`

推荐直接在 [services/official-account-webhook/.env.local.example](/Users/swindcn/Documents/wangmeipo/services/official-account-webhook/.env.local.example) 基础上复制出 `.env.local` 再填写。

云函数环境变量如果开启了 `ALLOW_DEBUG_VIEWER_OVERRIDE=true`，只用于联调，不要在正式环境长期保留。

健康检查路径：

```text
/healthz
```

## 6. 配置公众号后台

公众号后台需要填写：

- 服务器地址 URL：云托管服务公网地址
- Token：`WECHAT_OFFICIAL_ACCOUNT_TOKEN`
- EncodingAESKey：`WECHAT_OFFICIAL_ACCOUNT_ENCODING_AES_KEY`
- 消息加解密方式：建议直接选“安全模式”

如果先想降低复杂度，也可以先选“明文模式”，待链路稳定后再切“安全模式”。

## 7. 配置定时重试

建议增加一个定时触发器或外部调度，每 1 到 5 分钟执行一次：

```bash
tcb fn invoke drainParseQueue
```

如果你不走 CLI 调度，也可以在控制台里为 `drainParseQueue` 建定时触发。

## 8. 联调顺序

1. 小程序首页初始化数据库
2. 小程序查看候选人列表是否正常
3. 公众号发送一条文本资料，确认进入 `raw_sources`
4. 公众号发送一张图片资料，确认进入 `raw_sources` 且图片进入云存储
5. 检查 `parse_tasks` 是否从 `queued` 进入 `success` 或 `review_required`
6. 检查 `candidates` 是否生成结构化资料
