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

  const usersResult = await db.collection("users").where({ openid: OPENID }).limit(1).get()
  return usersResult.data[0] || null
}

exports.main = async (event = {}) => {
  const usersResult = await db.collection("users").limit(20).get()
  const candidatesResult = await db.collection("candidates").limit(100).get()
  const matchesResult = await db.collection("match_records").limit(100).get()
  const currentViewer = await resolveCurrentUser(event)

  return {
    currentViewer,
    users: usersResult.data,
    stats: {
      totalCandidates: candidatesResult.data.length,
      pendingReview: candidatesResult.data.filter((item) => item.profileStatus === "pending_review").length,
      published: candidatesResult.data.filter((item) => item.profileStatus === "published").length,
      activeMatches: matchesResult.data.filter((item) => item.status !== "closed").length,
    },
  }
}
