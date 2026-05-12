# 相亲管理小程序一期数据设计

面向 `微信小程序 + 微信公众号 + 微信云开发` 的一期实现，目标覆盖：

- 公众号采集原始资料
- OCR/LLM 结构化解析
- 文字可见、照片受控可见
- 指定人员查看指定成员完整信息
- 匹配记录与审计

## 集合设计

### `users`

管理系统用户。

关键字段：

- `_id`
- `openid`
- `unionid`
- `nickname`
- `avatarUrl`
- `role`: `super_admin | manager | viewer`
- `status`: `active | disabled`
- `createdAt`
- `updatedAt`

建议索引：

- `openid` 唯一索引
- `role + status`

### `candidates`

候选人主资料，结构字段建议直接复用 [candidate-profile.schema.json](/Users/swindcn/Documents/wangmeipo/docs/candidate-profile.schema.json)。

补充系统字段：

- `_id`
- `candidateCode`
- `defaultPhotoVisible`: `false`
- `createdBy`
- `updatedBy`
- `createdAt`
- `updatedAt`
- `publishedAt`

建议索引：

- `candidateCode` 唯一索引
- `profileStatus + updatedAt`
- `visibilityLevel + updatedAt`
- `gender + age`

### `candidate_assets`

候选人附件和照片映射。

关键字段：

- `_id`
- `candidateId`
- `fileId`
- `assetType`: `photo | document | voice | other`
- `isPrimary`
- `visibilityLevel`: `private | authorized | full`
- `uploadedBy`
- `createdAt`

建议索引：

- `candidateId + assetType`
- `candidateId + isPrimary`

### `raw_sources`

公众号或人工录入的原始来源。务必保留，便于回溯。

关键字段：

- `_id`
- `sourceType`: `official_account_text | official_account_image | manual_entry | chat_forward`
- `sourceMessageId`
- `candidateId`
- `rawText`
- `photoAssetIds`
- `sourceUrl`
- `parseStatus`: `pending | parsed | failed | reviewed`
- `parserVersion`
- `createdBy`
- `createdAt`

建议索引：

- `sourceMessageId`
- `candidateId + createdAt`
- `parseStatus + createdAt`

### `parse_tasks`

解析任务队列。用于 OCR、规则抽取、LLM 调用和重试。

关键字段：

- `_id`
- `sourceId`
- `taskType`: `ocr | rule_parse | llm_parse`
- `status`: `queued | running | success | failed | review_required`
- `attemptCount`
- `parserVersion`
- `errorMessage`
- `startedAt`
- `finishedAt`
- `createdAt`

建议索引：

- `sourceId + taskType`
- `status + createdAt`

### `candidate_permissions`

控制某人能否看某候选人的哪些内容。

关键字段：

- `_id`
- `viewerUserId`
- `candidateId`
- `permissionLevel`: `text_only | text_with_photo | full_profile | full_profile_no_contact`
- `grantedBy`
- `reason`
- `expiresAt`
- `createdAt`
- `updatedAt`

建议索引：

- `viewerUserId + candidateId` 唯一索引
- `candidateId + permissionLevel`
- `expiresAt`

### `candidate_manager_scopes`

控制次级管理员能管理哪些会员资料。超管不需要写入此集合，默认拥有全部管理范围。

关键字段：

- `_id`
- `managerUserId`: 次级管理员用户 ID
- `candidateId`: 可管理的会员 ID
- `status`: `active | disabled`
- `grantedBy`: 授权人 ID
- `reason`
- `createdAt`
- `updatedAt`

建议索引：

- `managerUserId + candidateId` 唯一索引
- `candidateId + status`
- `managerUserId + status`

### `share_tokens`

小程序分享后落地的访问控制记录。

关键字段：

- `_id`
- `token`
- `candidateId`
- `createdBy`
- `permissionLevel`
- `expiresAt`
- `useCount`
- `maxUseCount`
- `status`: `active | expired | revoked`
- `createdAt`

建议索引：

- `token` 唯一索引
- `candidateId + createdAt`
- `expiresAt + status`

### `match_records`

记录谁被推荐给谁，结果如何。

关键字段：

- `_id`
- `candidateAId`
- `candidateBId`
- `createdBy`
- `status`: `pending | recommended | viewed | one_side_rejected | mutual_interest | met_offline | closed`
- `firstSharedAt`
- `lastFollowUpAt`
- `resultNote`
- `createdAt`
- `updatedAt`

建议索引：

- `candidateAId + candidateBId`
- `status + updatedAt`

### `match_logs`

匹配过程中的状态变化、回访、备注。

关键字段：

- `_id`
- `matchRecordId`
- `actionType`: `create | share | follow_up | status_change | note`
- `operatorUserId`
- `content`
- `createdAt`

建议索引：

- `matchRecordId + createdAt`

### `audit_logs`

关键敏感操作审计。

关键字段：

- `_id`
- `actorUserId`
- `targetType`: `candidate | asset | permission | share_token | match_record`
- `targetId`
- `action`
- `metadata`
- `createdAt`

建议索引：

- `actorUserId + createdAt`
- `targetType + targetId`
- `action + createdAt`

## 云函数清单

### `ingestOfficialAccountMessage`

职责：

- 接公众号回调
- 写入 `raw_sources`
- 如果带图片则把图片转存云存储并记录 `candidate_assets`
- 创建解析任务

### `runParsePipeline`

职责：

- 读取 `raw_sources`
- 先执行规则解析
- 再按需调用 OCR / LLM
- 产出结构化资料
- 写入 `candidates`
- 写入 `parse_tasks`

### `reviewParsedCandidate`

职责：

- 人工校正结构化资料
- 将 `profileStatus` 从 `pending_review` 改为 `published`
- 写审计日志

### `grantCandidatePermission`

职责：

- 维护 `candidate_permissions`
- 支持设置可见级别和过期时间
- 写审计日志

### `getCandidateDetail`

职责：

- 根据当前用户和候选人 ID 返回裁剪后的资料
- 未授权用户仅返回文字字段
- 对联系方式和照片二次裁剪

### `createShareToken`

职责：

- 创建带时效和权限级别的分享 token
- 供小程序 `onShareAppMessage` 使用

### `recordMatch`

职责：

- 创建和更新 `match_records`
- 写入 `match_logs`

## 一期访问规则

### 未授权浏览者

- 可看：基础文字资料、自我描述、择偶要求
- 不可看：照片、电话、原始来源、精确授权记录

### 授权用户

- 根据 `candidate_permissions.permissionLevel` 裁剪返回
- `text_with_photo` 可看文字和照片，不可看电话
- `full_profile` 可看完整资料
- `full_profile_no_contact` 不返回电话

### 管理员/红娘

- 可看完整资料
- 可维护权限、匹配记录和审计日志

## 解析流程

1. 公众号或管理端提交原始内容。
2. 原文进入 `raw_sources`，图片进入 `candidate_assets`。
3. 创建 `parse_tasks`。
4. `runParsePipeline` 执行：
   - 规则提取标准字段
   - OCR 提取图片文字
   - LLM 把长文本拆成结构化字段
   - 按 Schema 校验
5. 低置信度或敏感字段不完整时进入 `pending_review`。
6. 人工确认后发布。

## 一期建议先做的页面

- 登录页
- 候选人列表页
- 候选人详情页
- 待校正队列页
- 授权管理页
- 匹配记录页
- 我的可查看对象页

## 落地建议

- 照片不要存公开链接，统一走受控访问。
- 所有 LLM 返回先做 JSON Schema 校验，再写库。
- 联系方式默认视为敏感字段，只有 `full_profile` 级别返回。
- 分享只分享 token，不直接分享真实内部 ID。
