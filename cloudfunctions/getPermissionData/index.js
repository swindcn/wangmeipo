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

exports.main = async (event = {}) => {
  await requireManager(event)
  const usersResult = await db.collection("users").limit(100).get()
  const candidatesResult = await db.collection("candidates").limit(100).get()
  const permissionsResult = await db.collection("candidate_permissions").limit(100).get()

  const permissions = permissionsResult.data.map((item) => {
    const viewer = usersResult.data.find((user) => user._id === item.viewerUserId)
    const candidate = candidatesResult.data.find((candidateItem) => candidateItem._id === item.candidateId)

    return {
      ...item,
      viewerName: viewer ? viewer.nickname : item.viewerUserId,
      candidateName: candidate ? candidate.name : item.candidateId,
    }
  })

  return {
    users: usersResult.data,
    candidates: candidatesResult.data,
    permissions,
  }
}
