# 集合初始化脚本

项目使用 [bootstrapDatabase](/Users/swindcn/Documents/wangmeipo/cloudfunctions/bootstrapDatabase/index.js) 作为集合初始化脚本。

## 作用

- 绑定首个管理员 `openid`
- 写入基础用户样例
- 写入候选人样例
- 写入基础授权记录
- 写入基础匹配记录

## 使用方式

1. 部署云函数 `bootstrapDatabase`
2. 在 [app.js](/Users/swindcn/Documents/wangmeipo/miniprogram/app.js) 中填好 `envId`
3. 首页左上角品牌区域连续点击 5 次，触发“初始化云数据库”

如需用一个微信号在小程序里切换“管理员 / 浏览者”身份联调，再给云函数环境增加 `ALLOW_DEBUG_VIEWER_OVERRIDE=true`。

## 说明

- 管理员以云数据库 `users` 集合里的 `role` 字段为准，值为 `manager` 或 `super_admin` 时，提交资料可免审核直接上架
- 小程序 [app.js](/Users/swindcn/Documents/wangmeipo/miniprogram/app.js) 里的 `userRole` 只用于前端展示提示，不能作为真实权限依据
- 云开发的集合通常会在首次写入时自动创建
- 因此初始化脚本的主要职责是首批数据和管理员绑定
- 对于 `raw_sources`、`parse_tasks`、`candidate_assets`、`share_tokens`、`audit_logs` 这类运行态集合，会在真实业务流首次写入时自动出现
