const cloud = require("wx-server-sdk")
const { randomUUID } = require("node:crypto")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

async function resolveCurrentUser(event = {}) {
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

  const result = await db.collection("users").where({ openid: OPENID }).limit(1).get()
  return result.data[0] || null
}

async function isScopedManager(currentUser, candidateId) {
  if (!currentUser || !candidateId || currentUser.role !== "manager") {
    return false
  }

  const result = await db.collection("candidate_manager_scopes").where({
    managerUserId: currentUser._id,
    candidateId,
    status: "active",
  }).limit(1).get()

  return result.data.length > 0
}

async function requireKeyActionUser(event = {}) {
  const currentUser = await resolveCurrentUser(event)
  const candidateId = event.candidateId || ""

  if (!currentUser || !candidateId) {
    throw new Error("forbidden")
  }

  if (currentUser.role === "super_admin") {
    return currentUser
  }

  if (await isScopedManager(currentUser, candidateId)) {
    return currentUser
  }

  throw new Error("forbidden")
}

function resolveSharePage(permissionLevel) {
  if (permissionLevel === "public_full") {
    return "public-candidate-detail"
  }

  return "candidate-detail"
}

function validatePermissionLevel(permissionLevel) {
  const allowedLevels = ["text_only", "text_with_photo", "full_profile_no_contact", "public_full"]
  if (!allowedLevels.includes(permissionLevel)) {
    throw new Error("forbidden")
  }
}

exports.main = async (event) => {
  const now = new Date()
  const token = randomUUID().replace(/-/g, "")
  const permissionLevel = event.permissionLevel || "text_only"
  validatePermissionLevel(permissionLevel)

  const currentUser = await requireKeyActionUser(event)
  const sharePage = resolveSharePage(permissionLevel)

  await db.collection("share_tokens").add({
    data: {
      token,
      candidateId: event.candidateId,
      createdBy: currentUser._id,
      permissionLevel,
      expiresAt: event.expiresAt || null,
      useCount: 0,
      maxUseCount: event.maxUseCount || 1,
      status: "active",
      createdAt: now,
    },
  })

  return {
    ok: true,
    token,
    sharePath: `/pages/${sharePage}/index?id=${event.candidateId}&shareToken=${token}`,
  }
}
