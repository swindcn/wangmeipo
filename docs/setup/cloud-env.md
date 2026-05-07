# 云开发接入清单

## 小程序

- 修改 [project.config.json](/Users/swindcn/Documents/wangmeipo/project.config.json) 中的 `appid`
- 修改 [app.js](/Users/swindcn/Documents/wangmeipo/miniprogram/app.js) 中的 `envId`

## 云函数环境变量

默认优先使用小米 MIMO。至少配置以下变量：

- `LLM_PROVIDER=mimo`
- `MIMO_API_KEY`
- `MIMO_LLM_MODEL`
- `MIMO_BASE_URL`

推荐值：

- `LLM_PROVIDER=mimo`
- `MIMO_BASE_URL=https://api.mimo-v2.com/v1`
- `MIMO_LLM_MODEL=mimo-v2-pro`
- `LLM_REQUEST_TIMEOUT_MS=30000`

火山方舟保留为备用配置：

- `LLM_PROVIDER=volcengine`
- `ARK_API_KEY`
- `ARK_LLM_MODEL`
- `ARK_BASE_URL`

火山方舟推荐值：

- `LLM_PROVIDER=volcengine`
- `ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3`
- `ARK_LLM_MODEL=<火山方舟推理接入点 ID>`
- `ARK_VISION_MODEL=<支持视觉的火山方舟推理接入点 ID，可选>`
- `LLM_REQUEST_TIMEOUT_MS=8000`

OpenAI 兼容保留为备用配置：

- `OPENAI_API_KEY`
- `OPENAI_LLM_MODEL`
- `OPENAI_VISION_MODEL`
- `OPENAI_BASE_URL`
- `ALLOW_DEBUG_VIEWER_OVERRIDE` 可选，仅用于单账号联调多身份

OpenAI 备用推荐值：

- `OPENAI_BASE_URL=https://api.openai.com/v1`
- `OPENAI_LLM_MODEL=gpt-4.1-mini`
- `OPENAI_VISION_MODEL=gpt-4.1-mini`
- `ALLOW_DEBUG_VIEWER_OVERRIDE=false`

## 需要部署的云函数

- `bootstrapDatabase`
- `getDashboardSummary`
- `getCandidateDetail`
- `listReviewQueue`
- `getPermissionData`
- `grantCandidatePermission`
- `getMatchData`
- `recordMatch`
- `listMyAccess`
- `createShareToken`
- `submitCandidateProfile`
- `ingestOfficialAccountMessage`
- `runParsePipeline`
- `drainParseQueue`
- `reviewParsedCandidate`

配套文档：

- [bootstrap-database.md](/Users/swindcn/Documents/wangmeipo/docs/setup/bootstrap-database.md)
- [database-indexes.md](/Users/swindcn/Documents/wangmeipo/docs/setup/database-indexes.md)
- [database-rules-template.json](/Users/swindcn/Documents/wangmeipo/docs/setup/database-rules-template.json)

## 公众号回调服务

使用 [services/official-account-webhook](/Users/swindcn/Documents/wangmeipo/services/official-account-webhook) 作为云托管或公开服务部署。

需要配置环境变量：

- `CLOUDBASE_ENV_ID`
- `WECHAT_OFFICIAL_ACCOUNT_TOKEN`
- `WECHAT_OFFICIAL_ACCOUNT_APP_ID`
- `WECHAT_OFFICIAL_ACCOUNT_ENCODING_AES_KEY`
- `PORT`

当前版本已支持：

- 明文模式
- 安全模式 AES 解密

当前仍未支持：

- 兼容模式下的复杂混合消息场景细化处理

## 推荐定时任务

建议增加一个定时触发器，定时调用 `drainParseQueue`，例如每 1 到 5 分钟执行一次，用于继续处理之前失败后重新排队的解析任务。
