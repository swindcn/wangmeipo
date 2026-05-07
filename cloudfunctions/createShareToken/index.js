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

async function requireManager(event = {}) {
  const currentUser = await resolveCurrentUser(event)

  if (!currentUser || (currentUser.role !== "manager" && currentUser.role !== "super_admin")) {
    throw new Error("forbidden")
  }

  return currentUser
}

exports.main = async (event) => {
  const now = new Date()
  const token = randomUUID().replace(/-/g, "")
  const currentUser = await requireManager(event)

  await db.collection("share_tokens").add({
    data: {
      token,
      candidateId: event.candidateId,
      createdBy: currentUser._id,
      permissionLevel: event.permissionLevel || "text_only",
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
    sharePath: `/pages/candidate-detail/index?id=${event.candidateId}&shareToken=${token}`,
  }
}
