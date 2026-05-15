const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function compactString(value) {
  return String(value || "").trim()
}

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

async function isScopedManager(currentUser, candidateId) {
  if (!currentUser || !candidateId || currentUser.role !== "manager") {
    return false
  }

  const result = await db.collection("candidate_manager_scopes").where({
    managerUserId: currentUser._id,
    candidateId,
    status: "active",
  }).limit(1).get()

  return result.data.length > 0
}

async function requireKeyActionUser(event = {}) {
  const currentUser = await resolveCurrentUser(event)
  const candidateId = compactString(event.candidateId)

  if (!currentUser || !candidateId) {
    throw new Error("forbidden")
  }

  if (currentUser.role === "super_admin") {
    return currentUser
  }

  if (await isScopedManager(currentUser, candidateId)) {
    return currentUser
  }

  throw new Error("forbidden")
}

exports.main = async (event = {}) => {
  await requireKeyActionUser(event)

  const pagePath = compactString(event.pagePath).replace(/^\/+/, "")
  if (!pagePath) {
    return { ok: false, error: "pagePath is required" }
  }

  if (!cloud.openapi || !cloud.openapi.wxacode || !cloud.openapi.wxacode.get) {
    return { ok: false, error: "wxacode api unavailable" }
  }

  const response = await cloud.openapi.wxacode.get({
    path: pagePath,
    width: 280,
  })

  const buffer = response && response.buffer ? response.buffer : response
  if (!buffer) {
    return { ok: false, error: "wxacode generate failed" }
  }

  const cloudPath = `generated-share-codes/${compactString(event.candidateId)}/${Date.now()}.png`
  const uploadResult = await cloud.uploadFile({
    cloudPath,
    fileContent: buffer,
  })

  const tempResult = await cloud.getTempFileURL({
    fileList: [uploadResult.fileID],
  })
  const fileItem = tempResult.fileList && tempResult.fileList[0] ? tempResult.fileList[0] : null

  return {
    ok: true,
    fileId: uploadResult.fileID || "",
    tempFileURL: fileItem && fileItem.tempFileURL ? fileItem.tempFileURL : "",
  }
}
