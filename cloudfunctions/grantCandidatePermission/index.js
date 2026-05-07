const cloud = require("wx-server-sdk")

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

async function requireManager(event = {}) {
  const currentUser = await resolveCurrentUser(event)

  if (!currentUser || (currentUser.role !== "manager" && currentUser.role !== "super_admin")) {
    throw new Error("forbidden")
  }

  return currentUser
}

exports.main = async (event) => {
  const now = new Date()
  const {
    viewerUserId,
    candidateId,
    permissionLevel = "text_only",
    reason = "",
    expiresAt = null,
  } = event

  const currentUser = await requireManager(event)

  if (!viewerUserId || !candidateId) {
    return { ok: false, error: "viewerUserId and candidateId are required" }
  }

  const existingResult = await db.collection("candidate_permissions").where({
    viewerUserId,
    candidateId,
  }).limit(1).get()

  if (existingResult.data.length > 0) {
    await db.collection("candidate_permissions").doc(existingResult.data[0]._id).update({
      data: {
        permissionLevel,
        reason,
        expiresAt,
        updatedAt: now,
      },
    })
  } else {
    await db.collection("candidate_permissions").add({
      data: {
        viewerUserId,
        candidateId,
        permissionLevel,
        grantedBy: currentUser._id,
        reason,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      },
    })
  }

  return { ok: true }
}
