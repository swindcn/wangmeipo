const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function compactString(value) {
  return String(value || "").trim()
}

function toTimestamp(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === "number") return value
  if (typeof value === "object" && value.$date) {
    const dateValue = typeof value.$date === "object" && value.$date.$numberLong
      ? Number(value.$date.$numberLong)
      : new Date(value.$date).getTime()
    return Number.isFinite(dateValue) ? dateValue : 0
  }
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}.${month}.${day}`
}

async function resolveCurrentUser(event = {}) {
  const { OPENID } = cloud.getWXContext()
  const allowDebugViewerOverride = process.env.ALLOW_DEBUG_VIEWER_OVERRIDE === "true"

  if (allowDebugViewerOverride && event.debugViewerUserId) {
    try {
      const overrideResult = await db.collection("users").doc(event.debugViewerUserId).get()
      if (overrideResult.data) return overrideResult.data
    } catch (error) {
      // Ignore invalid debug viewer ids and fall back to OPENID resolution.
    }
  }

  if (!OPENID) return null
  const result = await db.collection("users").where({ openid: OPENID }).limit(1).get()
  return result.data[0] || null
}

function isAdmin(user) {
  return user && (user.role === "super_admin" || user.role === "manager")
}

async function buildPhotoUrl(photoAssetIds) {
  if (!Array.isArray(photoAssetIds) || photoAssetIds.length === 0) {
    return ""
  }

  const result = await cloud.getTempFileURL({ fileList: [photoAssetIds[0]] })
  return result.fileList && result.fileList[0] ? result.fileList[0].tempFileURL || "" : ""
}

async function ensureCollection() {
  try {
    await db.createCollection("view_requests")
  } catch (error) {
    const message = String(error && (error.errMsg || error.message || error))
    if (!message.includes("already exists") && !message.includes("collection exists")) {
      try {
        await db.collection("view_requests").limit(1).get()
      } catch (innerError) {
        throw error
      }
    }
  }
}

async function submitRequest(event = {}, currentUser) {
  const candidateId = compactString(event.candidateId)
  if (!candidateId) {
    return { ok: false, error: "candidateId is required" }
  }

  if (!currentUser || !currentUser._id) {
    return { ok: false, error: "registration_required" }
  }

  await ensureCollection()

  const now = new Date()
  const existingResult = await db.collection("view_requests").where({
    requesterUserId: currentUser._id,
    candidateId,
    status: "pending",
  }).limit(1).get()

  if (existingResult.data.length > 0) {
    return { ok: true, status: "pending", requestId: existingResult.data[0]._id }
  }

  const candidateResult = await db.collection("candidates").doc(candidateId).get()
  const candidate = candidateResult.data || {}
  const addResult = await db.collection("view_requests").add({
    data: {
      candidateId,
      candidateCode: candidate.candidateCode || "",
      candidateName: candidate.name || "",
      requesterUserId: currentUser._id,
      requesterOpenid: currentUser.openid || "",
      requesterNickname: currentUser.nickname || "",
      requesterAvatarUrl: currentUser.avatarUrl || "",
      requesterPhone: currentUser.phone || "",
      status: "pending",
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  })

  return { ok: true, status: "pending", requestId: addResult._id }
}

async function listRequests(event = {}, currentUser) {
  if (!isAdmin(currentUser)) {
    throw new Error("forbidden")
  }

  await ensureCollection()

  const status = compactString(event.status) || "pending"
  const requestResult = await db.collection("view_requests").where({ status }).limit(100).get()
  const requests = requestResult.data.sort((left, right) => toTimestamp(right.requestedAt || right.createdAt) - toTimestamp(left.requestedAt || left.createdAt))
  const candidateIds = Array.from(new Set(requests.map((item) => item.candidateId).filter(Boolean)))
  let candidateMap = {}

  if (candidateIds.length > 0) {
    const candidateResult = await db.collection("candidates").where({ _id: _.in(candidateIds) }).limit(100).get()
    candidateMap = candidateResult.data.reduce((result, item) => {
      result[item._id] = item
      return result
    }, {})
  }

  const items = await Promise.all(requests.map(async (request) => {
    const candidate = candidateMap[request.candidateId] || {}
    const candidateName = candidate.name || request.candidateName || ""
    const candidateCode = candidate.candidateCode || request.candidateCode || request.candidateId
    return {
      _id: request._id,
      candidateId: request.candidateId,
      candidateName,
      candidateCode,
      title: `想看${candidateName ? candidateName : ""}${candidateCode ? ` ${candidateCode}` : ""}`,
      requesterNickname: request.requesterNickname || "未命名用户",
      requesterPhone: request.requesterPhone || "",
      requestedAt: request.requestedAt || request.createdAt || "",
      requestedAtText: formatDate(request.requestedAt || request.createdAt),
      status: request.status || "",
      photoUrl: await buildPhotoUrl(candidate.photoAssetIds),
    }
  }))

  return { ok: true, items }
}

async function reviewRequest(event = {}, currentUser) {
  if (!isAdmin(currentUser)) {
    throw new Error("forbidden")
  }

  const requestId = compactString(event.requestId)
  const action = compactString(event.reviewAction || event.action)
  if (!requestId || !["approve", "reject"].includes(action)) {
    return { ok: false, error: "invalid params" }
  }

  const now = new Date()
  const requestResult = await db.collection("view_requests").doc(requestId).get()
  const request = requestResult.data
  if (!request) {
    return { ok: false, error: "request not found" }
  }

  const status = action === "approve" ? "approved" : "rejected"
  await db.collection("view_requests").doc(requestId).update({
    data: {
      status,
      reviewedAt: now,
      reviewedBy: currentUser._id,
      updatedAt: now,
    },
  })

  if (action === "approve") {
    const existingPermission = await db.collection("candidate_permissions").where({
      viewerUserId: request.requesterUserId,
      candidateId: request.candidateId,
    }).limit(1).get()
    const permissionData = {
      permissionLevel: "full_profile",
      reason: "想看申请审批通过",
      expiresAt: null,
      grantedBy: currentUser._id,
      updatedAt: now,
    }

    if (existingPermission.data.length > 0) {
      await db.collection("candidate_permissions").doc(existingPermission.data[0]._id).update({
        data: permissionData,
      })
    } else {
      await db.collection("candidate_permissions").add({
        data: {
          viewerUserId: request.requesterUserId,
          candidateId: request.candidateId,
          createdAt: now,
          ...permissionData,
        },
      })
    }
  }

  return { ok: true, status }
}

exports.main = async (event = {}) => {
  const currentUser = await resolveCurrentUser(event)
  const action = event.action || "submitRequest"

  if (action === "submitRequest") {
    return submitRequest(event, currentUser)
  }

  if (action === "listRequests") {
    return listRequests(event, currentUser)
  }

  if (action === "reviewRequest") {
    return reviewRequest(event, currentUser)
  }

  return { ok: false, error: "unknown action" }
}
