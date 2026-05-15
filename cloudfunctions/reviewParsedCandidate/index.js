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

  if (!["approve", "reject", "delete", "restore"].includes(action)) {
    return { ok: false, error: "invalid action" }
  }

  if (action === "approve" && patch && patch.gender !== "男" && patch.gender !== "女") {
    return { ok: false, error: "gender is required" }
  }

  const actionConfig = {
    approve: {
      profileStatus: "published",
      reviewedAtKey: "publishedAt",
      auditAction: "review_candidate_approved",
    },
    reject: {
      profileStatus: "rejected",
      reviewedAtKey: "rejectedAt",
      auditAction: "review_candidate_rejected",
    },
    delete: {
      profileStatus: "deleted",
      reviewedAtKey: "deletedAt",
      auditAction: "candidate_deleted",
    },
    restore: {
      profileStatus: "published",
      reviewedAtKey: "restoredAt",
      auditAction: "candidate_restored",
    },
  }[action]

  await db.collection("candidates").doc(candidateId).update({
    data: {
      ...patch,
      profileStatus: actionConfig.profileStatus,
      updatedAt: now,
      updatedBy: currentUser._id,
      reviewedAt: now,
      [actionConfig.reviewedAtKey]: now,
    },
  })

  await db.collection("audit_logs").add({
    data: {
      actorUserId: currentUser._id,
      targetType: "candidate",
      targetId: candidateId,
      action: actionConfig.auditAction,
      metadata: {
        patch,
      },
      createdAt: now,
    },
  })

  return { ok: true, profileStatus: actionConfig.profileStatus }
}
