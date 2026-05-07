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
  const candidatesResult = await db.collection("candidates").limit(100).get()
  const recordsResult = await db.collection("match_records").limit(100).get()

  return {
    candidates: candidatesResult.data,
    records: recordsResult.data.map((item) => {
      const left = candidatesResult.data.find((candidate) => candidate._id === item.candidateAId)
      const right = candidatesResult.data.find((candidate) => candidate._id === item.candidateBId)

      return {
        ...item,
        leftName: left ? left.name : item.candidateAId,
        rightName: right ? right.name : item.candidateBId,
      }
    }),
  }
}
