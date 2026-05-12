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
      // Fall back to OPENID resolution.
    }
  }

  if (!OPENID) return null

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

function normalizeExpiresAt(value) {
  const text = String(value || "").trim()
  if (!text) return null

  const normalized = text.replace(/\./g, "-").replace(/\//g, "-")
  const matched = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!matched) return null

  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (year < 2020 || month < 1 || month > 12 || day < 1 || day > 31) return null

  return new Date(year, month - 1, day, 23, 59, 59)
}

exports.main = async (event = {}) => {
  const currentUser = await requireManager(event)
  const candidateId = event.candidateId || ""
  const action = event.action || "set"
  const now = new Date()

  if (!candidateId) {
    return { ok: false, error: "candidateId is required" }
  }

  if (!["set", "clear"].includes(action)) {
    return { ok: false, error: "invalid action" }
  }

  const expiresAt = action === "clear" ? null : normalizeExpiresAt(event.expiresAt)
  if (action === "set" && !expiresAt) {
    return { ok: false, error: "valid expiresAt is required" }
  }

  await db.collection("candidates").doc(candidateId).update({
    data: {
      subscriptionExpiresAt: expiresAt,
      subscriptionStatus: expiresAt && expiresAt.getTime() >= now.getTime() ? "active" : "",
      subscribedAt: action === "set" ? now : null,
      subscribedBy: action === "set" ? currentUser._id : "",
      updatedAt: now,
      updatedBy: currentUser._id,
    },
  })

  await db.collection("audit_logs").add({
    data: {
      actorUserId: currentUser._id,
      targetType: "candidate",
      targetId: candidateId,
      action: action === "set" ? "candidate_subscription_set" : "candidate_subscription_cleared",
      metadata: {
        expiresAt,
      },
      createdAt: now,
    },
  })

  return {
    ok: true,
    subscriptionExpiresAt: expiresAt,
    subscriptionStatus: expiresAt && expiresAt.getTime() >= now.getTime() ? "active" : "",
  }
}
