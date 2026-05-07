# official-account-webhook

公众号开发者服务器入口，建议部署到微信云开发云托管或其他可公开访问的 Node 服务。

## 环境变量

- `PORT`
- `CLOUDBASE_ENV_ID`
- `WECHAT_OFFICIAL_ACCOUNT_TOKEN`
- `WECHAT_OFFICIAL_ACCOUNT_APP_ID`
- `WECHAT_OFFICIAL_ACCOUNT_ENCODING_AES_KEY`

本地预发建议先复制模板：

```bash
cp /Users/swindcn/Documents/wangmeipo/services/official-account-webhook/.env.local.example /Users/swindcn/Documents/wangmeipo/services/official-account-webhook/.env.local
```

## 当前支持

- `GET` 验签
- `POST` 明文模式消息
- `/healthz` 健康检查
- 文本消息入库
- 图片消息入库并交给云函数下载转存
- 链接消息入库
- 自动触发 `ingestOfficialAccountMessage` 和 `runParsePipeline`
- 安全模式 AES 解密与加密回复

## 当前限制

- 依赖云函数环境变量中的 `OPENAI_API_KEY` 才能启用 OCR/LLM 真解析
- 目前仍未覆盖所有兼容模式边界场景

## 云托管部署要点

- 当前目录已包含 [Dockerfile](/Users/swindcn/Documents/wangmeipo/services/official-account-webhook/Dockerfile)
- 启动命令为 `npm start`
- 健康检查路径可配置为 `/healthz`
