const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const PERMISSION_RANK = {
  text_only: 0,
  text_with_photo: 1,
  full_profile_no_contact: 2,
  full_profile: 3,
}

function includesKeyword(candidate, keyword) {
  if (!keyword) {
    return true
  }

  const haystacks = [
    candidate.name,
    candidate.occupation,
    candidate.education,
    candidate.currentAddress,
    candidate.sourceSummary,
  ]

  return haystacks.filter(Boolean).some((item) => String(item).includes(keyword))
}

function normalizeLimit(value, fallback, max) {
  const limit = Number(value)
  if (!Number.isFinite(limit) || limit <= 0) {
    return fallback
  }

  return Math.min(Math.floor(limit), max)
}

async function buildPhotoUrls(photoAssetIds) {
  if (!Array.isArray(photoAssetIds) || photoAssetIds.length === 0) {
    return []
  }

  const result = await cloud.getTempFileURL({
    fileList: photoAssetIds,
  })

  return (result.fileList || [])
    .map((item) => item.tempFileURL || "")
    .filter(Boolean)
}

function pickHigherPermissionLevel(levels) {
  let selected = "text_only"

  for (const level of levels) {
    if (!level) {
      continue
    }

    if ((PERMISSION_RANK[level] || 0) > (PERMISSION_RANK[selected] || 0)) {
      selected = level
    }
  }

  return selected
}

function isTokenExpired(expiresAt) {
  if (!expiresAt) {
    return false
  }

  const expiresAtDate = new Date(expiresAt)
  return Number.isNaN(expiresAtDate.getTime()) ? false : expiresAtDate.getTime() < Date.now()
}

function redactCandidate(candidate, permissionLevel) {
  const safeCandidate = { ...candidate }

  if (permissionLevel === "text_only") {
    delete safeCandidate.phone
    safeCandidate.photoUrls = []
    safeCandidate.canViewPhotos = false
    return safeCandidate
  }

  if (permissionLevel === "text_with_photo") {
    delete safeCandidate.phone
    safeCandidate.canViewPhotos = true
    return safeCandidate
  }

  if (permissionLevel === "full_profile_no_contact") {
    delete safeCandidate.phone
    safeCandidate.canViewPhotos = true
    return safeCandidate
  }

  safeCandidate.canViewPhotos = true
  return safeCandidate
}

async function resolveCurrentUser(openid) {
  if (!openid) {
    return null
  }

  const userResult = await db.collection("users").where({ openid }).limit(1).get()
  return userResult.data[0] || null
}

async function resolveDebugCurrentUser(event = {}) {
  const { OPENID } = cloud.getWXContext()
  const allowDebugViewerOverride = process.env.ALLOW_DEBUG_VIEWER_OVERRIDE === "true"

  if (allowDebugViewerOverride && event.debugViewerUserId) {
    try {
      const overrideResult = await db.collection("users").doc(event.debugViewerUserId).get()
      if (overrideResult.data) {
        return overrideResult.data
      }
    } catch (error) {
      // Ignore invalid debug viewer ids and fall back to OPENID resolution.
    }
  }

  return resolveCurrentUser(OPENID)
}

async function resolveSharePermission(candidateId, shareToken) {
  if (!shareToken) {
    return ""
  }

  const result = await db.collection("share_tokens").where({
    token: shareToken,
    candidateId,
    status: "active",
  }).limit(1).get()

  const shareTokenDoc = result.data[0]
  if (!shareTokenDoc) {
    return ""
  }

  if (isTokenExpired(shareTokenDoc.expiresAt)) {
    return ""
  }

  if (
    typeof shareTokenDoc.maxUseCount === "number"
    && shareTokenDoc.maxUseCount > 0
    && typeof shareTokenDoc.useCount === "number"
    && shareTokenDoc.useCount >= shareTokenDoc.maxUseCount
  ) {
    return ""
  }

  return shareTokenDoc.permissionLevel || "text_only"
}

async function resolvePermission(currentUser, candidateId, shareToken) {
  let userPermission = "text_only"

  if (currentUser) {
    if (currentUser.role === "super_admin" || currentUser.role === "manager") {
      userPermission = "full_profile"
    } else {
      const permissionResult = await db.collection("candidate_permissions").where({
        viewerUserId: currentUser._id,
        candidateId,
      }).limit(1).get()

      if (permissionResult.data.length > 0) {
        userPermission = permissionResult.data[0].permissionLevel || "text_only"
      }
    }
  }

  const sharePermission = await resolveSharePermission(candidateId, shareToken)
  return pickHigherPermissionLevel([userPermission, sharePermission])
}

exports.main = async (event = {}) => {

  if (event.mode === "list") {
    const result = await db.collection("candidates").limit(100).get()
    const filter = event.filter || "all"
    const keyword = event.keyword || ""
    const limit = normalizeLimit(event.limit, 12, 30)
    const includePhotos = event.includePhotos !== false
    const currentUser = await resolveDebugCurrentUser(event)
    const isManager = currentUser && (currentUser.role === "super_admin" || currentUser.role === "manager")

    const filteredItems = result.data
      .filter((item) => filter === "all" || item.profileStatus === filter)
      .filter((item) => includesKeyword(item, keyword))
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .slice(0, limit)

    const items = await Promise.all(filteredItems.map(async (item) => {
      const safeItem = redactCandidate(item, isManager ? "full_profile" : "text_only")
      safeItem.permissionLevel = isManager ? "full_profile" : "text_only"

      if (safeItem.canViewPhotos && includePhotos) {
        const primaryPhotoId = Array.isArray(safeItem.photoAssetIds) && safeItem.photoAssetIds[0]
          ? [safeItem.photoAssetIds[0]]
          : []
        safeItem.photoUrls = await buildPhotoUrls(primaryPhotoId)
      }

      return safeItem
    }))

    return {
      items,
    }
  }

  const candidateId = event.candidateId || ""
  if (!candidateId) {
    return { ok: false, error: "candidateId is required" }
  }

  const candidateResult = await db.collection("candidates").doc(candidateId).get()
  const currentUser = await resolveDebugCurrentUser(event)
  const permissionLevel = await resolvePermission(currentUser, candidateId, event.shareToken || "")
  const item = redactCandidate(candidateResult.data, permissionLevel)
  item.permissionLevel = permissionLevel

  if (item.canViewPhotos) {
    item.photoUrls = await buildPhotoUrls(item.photoAssetIds || [])
  } else {
    item.photoUrls = []
  }

  return {
    ok: true,
    permissionLevel,
    item,
  }
}
