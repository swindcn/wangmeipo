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
    matchRecordId = "",
    candidateAId,
    candidateBId,
    status = "pending",
    resultNote = "",
  } = event

  const currentUser = await requireManager(event)

  if (!candidateAId || !candidateBId) {
    return { ok: false, error: "candidateAId and candidateBId are required" }
  }

  let targetId = matchRecordId

  if (!targetId) {
    const addResult = await db.collection("match_records").add({
      data: {
        candidateAId,
        candidateBId,
        createdBy: currentUser._id,
        status,
        resultNote,
        firstSharedAt: now,
        lastFollowUpAt: now,
        createdAt: now,
        updatedAt: now,
      },
    })
    targetId = addResult._id
  } else {
    await db.collection("match_records").doc(targetId).update({
      data: {
        status,
        resultNote,
        lastFollowUpAt: now,
        updatedAt: now,
      },
    })
  }

  await db.collection("match_logs").add({
    data: {
      matchRecordId: targetId,
      actionType: matchRecordId ? "status_change" : "create",
      operatorUserId: currentUser._id,
      content: resultNote || status,
      createdAt: now,
    },
  })

  return { ok: true, matchRecordId: targetId }
}
