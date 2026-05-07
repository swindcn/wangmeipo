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

  if (!OPENID) {
    return null
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
  const { candidateId, patch = {}, action = "approve" } = event

  const currentUser = await requireManager(event)

  if (!candidateId) {
    return { ok: false, error: "candidateId is required" }
  }

  if (!["approve", "reject"].includes(action)) {
    return { ok: false, error: "invalid action" }
  }

  const profileStatus = action === "approve" ? "published" : "rejected"
  const reviewedAtKey = action === "approve" ? "publishedAt" : "rejectedAt"

  await db.collection("candidates").doc(candidateId).update({
    data: {
      ...patch,
      profileStatus,
      updatedAt: now,
      updatedBy: currentUser._id,
      reviewedAt: now,
      [reviewedAtKey]: now,
    },
  })

  await db.collection("audit_logs").add({
    data: {
      actorUserId: currentUser._id,
      targetType: "candidate",
      targetId: candidateId,
      action: action === "approve" ? "review_candidate_approved" : "review_candidate_rejected",
      metadata: {
        patch,
      },
      createdAt: now,
    },
  })

  return { ok: true, profileStatus }
}
