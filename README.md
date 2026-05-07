# wangmeipo

微信小程序一期联调骨架，面向相亲人员管理场景。

当前目录结构：

- `docs/`：一期规划文档、资料 Schema
- `shared/`：前后端共享类型和 LLM 解析契约
- `miniprogram/`：小程序前端骨架
- `cloudfunctions/`：微信云开发云函数骨架
- `services/`：公众号回调等公开服务

一期目标：

- 公众号资料采集入库
- OCR/LLM 结构化解析
- 文字可见、照片受控可见
- 授权查看完整资料
- 匹配记录

## 启动建议

1. 使用微信开发者工具打开当前目录 [wangmeipo](/Users/swindcn/Documents/wangmeipo)，不要只打开 `miniprogram/` 子目录，否则工具里看不到 `cloudfunctions/`
2. 修改 [project.config.json](/Users/swindcn/Documents/wangmeipo/project.config.json) 中的 `appid`
3. 修改 [app.js](/Users/swindcn/Documents/wangmeipo/miniprogram/app.js) 中的 `envId`
4. 逐个安装和上传 `cloudfunctions/` 下的云函数
5. 如需接公众号回调，部署 [official-account-webhook](/Users/swindcn/Documents/wangmeipo/services/official-account-webhook)

推荐直接使用根目录脚本：

- `npm run check:syntax`
- `npm run deploy:functions`
- `npm run deploy:functions:dry-run`
- `npm run deploy:webhook`
- `npm run deploy:webhook:dry-run`
- `npm run predeploy`
- `npm run predeploy:dry-run`

建议先准备两份本地环境文件：

- `cp .env.local.example .env.local`
- `cp services/official-account-webhook/.env.local.example services/official-account-webhook/.env.local`

## 关键文件

- 资料结构： [candidate-profile.schema.json](/Users/swindcn/Documents/wangmeipo/docs/candidate-profile.schema.json)
- 数据设计： [cloudbase-data-design.md](/Users/swindcn/Documents/wangmeipo/docs/cloudbase-data-design.md)
- LLM 契约： [llm-parser-contract.ts](/Users/swindcn/Documents/wangmeipo/shared/llm-parser-contract.ts)
- 云环境说明： [cloud-env.md](/Users/swindcn/Documents/wangmeipo/docs/setup/cloud-env.md)
- 初始化脚本说明： [bootstrap-database.md](/Users/swindcn/Documents/wangmeipo/docs/setup/bootstrap-database.md)
- 索引清单： [database-indexes.md](/Users/swindcn/Documents/wangmeipo/docs/setup/database-indexes.md)
- 安全规则模板： [database-rules-template.json](/Users/swindcn/Documents/wangmeipo/docs/setup/database-rules-template.json)

## 当前骨架说明

- 前端页面使用原生小程序写法，便于先把云开发主链路跑通
- 云函数均为一期最小骨架，已预留数据库集合和 LLM 解析入口
- `runParsePipeline` 中包含基础规则解析，后续可替换成正式 OCR + LLM 实现
- 小程序当前已收口为完全云模式
- 首页支持切换联调身份，可直接验证不同权限下的资料显示差异
- 联调身份切换默认关闭，只有云函数环境变量 `ALLOW_DEBUG_VIEWER_OVERRIDE=true` 时才会生效
- 首页可直接执行云数据库初始化
- 首页左上角品牌区域连续点击 5 次，会调用 `bootstrapDatabase`，把当前微信 `openid` 绑定为默认管理员 `user-manager-1`
- 公众号消息接入通过公开服务接收 XML，再调用云函数完成入库和解析
- 解析失败后会按任务计数回到 `queued`，可由队列消费函数继续重跑
- `official-account-webhook` 已支持公众号安全模式 AES 解密
- 候选人详情页生成的分享令牌，已可通过 `shareToken` 打开受控资料页

## 当前可联调页面

- 首页：切换身份，查看统计
- 候选人列表：按状态和关键词筛选
- 候选人详情：查看权限裁剪结果、生成分享令牌、直接发布资料
- 待校正队列：查看待审核资料并快速发布
- 授权管理：给指定用户开放指定候选人的资料
- 匹配记录：录入和查看撮合状态
- 我的可查看对象：查看当前身份已开放对象

## 切到云开发前建议准备的集合

- `users`
- `candidates`
- `raw_sources`
- `parse_tasks`
- `candidate_permissions`
- `share_tokens`
- `match_records`
- `match_logs`
- `audit_logs`

## 当前真实云开发入口

- [bootstrapDatabase](/Users/swindcn/Documents/wangmeipo/cloudfunctions/bootstrapDatabase/index.js)：初始化云数据库样例数据
- [getDashboardSummary](/Users/swindcn/Documents/wangmeipo/cloudfunctions/getDashboardSummary/index.js)：首页统计
- [getCandidateDetail](/Users/swindcn/Documents/wangmeipo/cloudfunctions/getCandidateDetail/index.js)：列表和详情权限裁剪
- [submitCandidateProfile](/Users/swindcn/Documents/wangmeipo/cloudfunctions/submitCandidateProfile/index.js)：小程序手动上传资料，按角色决定免审或待审
- [ingestOfficialAccountMessage](/Users/swindcn/Documents/wangmeipo/cloudfunctions/ingestOfficialAccountMessage/index.js)：原始消息入库与图片转存
- [runParsePipeline](/Users/swindcn/Documents/wangmeipo/cloudfunctions/runParsePipeline/index.js)：OCR + LLM 解析
- [drainParseQueue](/Users/swindcn/Documents/wangmeipo/cloudfunctions/drainParseQueue/index.js)：继续消费失败后回到 `queued` 的解析任务
- [official-account-webhook](/Users/swindcn/Documents/wangmeipo/services/official-account-webhook/server.js)：公众号开发者服务器回调入口
