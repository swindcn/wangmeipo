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

  const usersResult = await db.collection("users").where({ openid: OPENID }).limit(1).get()
  return usersResult.data[0] || null
}

exports.main = async (event = {}) => {
  const currentUser = await resolveCurrentUser(event)

  if (!currentUser) {
    return { items: [] }
  }

  if (currentUser.role === "manager" || currentUser.role === "super_admin") {
    const candidatesResult = await db.collection("candidates").limit(100).get()
    return {
      items: candidatesResult.data.map((item) => ({
        _id: `manager-${item._id}`,
        candidateId: item._id,
        name: item.name,
        occupation: item.occupation,
        permissionLevel: "full_profile",
        expiresAt: "",
      })),
    }
  }

  const permissionsResult = await db.collection("candidate_permissions").where({
    viewerUserId: currentUser._id,
  }).limit(100).get()

  const candidateIds = permissionsResult.data.map((item) => item.candidateId)
  const candidatesResult = await db.collection("candidates").limit(100).get()

  return {
    items: permissionsResult.data.map((item) => {
      const candidate = candidatesResult.data.find((candidateItem) => candidateItem._id === item.candidateId)
      return {
        _id: item._id,
        candidateId: item.candidateId,
        name: candidate ? candidate.name : item.candidateId,
        occupation: candidate ? candidate.occupation : "",
        permissionLevel: item.permissionLevel,
        expiresAt: item.expiresAt || "",
      }
    }).filter((item) => candidateIds.includes(item.candidateId)),
  }
}
