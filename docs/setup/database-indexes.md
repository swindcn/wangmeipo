# 云数据库索引清单

以下索引建议在云开发控制台手动创建。

## `users`

- `openid` 唯一索引
- `role + status`

## `candidates`

- `candidateCode` 唯一索引
- `profileStatus + updatedAt`
- `visibilityLevel + updatedAt`
- `gender + age`

## `candidate_assets`

- `candidateId + assetType`
- `candidateId + isPrimary`
- `candidateId + fileId`

## `raw_sources`

- `sourceMessageId`
- `candidateId + createdAt`
- `parseStatus + createdAt`

## `parse_tasks`

- `sourceId + taskType`
- `status + createdAt`
- `status + nextRetryAt`

## `candidate_permissions`

- `viewerUserId + candidateId`
- `candidateId + permissionLevel`
- `expiresAt`

## `candidate_manager_scopes`

- `managerUserId + candidateId` 唯一索引
- `candidateId + status`
- `managerUserId + status`

## `share_tokens`

- `token` 唯一索引
- `candidateId + createdAt`
- `expiresAt + status`

## `match_records`

- `candidateAId + candidateBId`
- `status + updatedAt`

## `match_logs`

- `matchRecordId + createdAt`

## `audit_logs`

- `actorUserId + createdAt`
- `targetType + targetId`
- `action + createdAt`
