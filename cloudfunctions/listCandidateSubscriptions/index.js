const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

async function resolveCurrentUser(event = {}) {
  const { OPENID } = cloud.getWXContext()
  const allowDebugViewerOverride = process.env.ALLOW_DEBUG_VIEWER_OVERRIDE === "true"

  if (allowDebugViewerOverride && event.debugViewerUserId) {
    try {
      const overrideResult = await db.collection("users").doc(event.debugViewerUserId).get()
      if (overrideResult.data) return overrideResult.data
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

async function buildPhotoUrl(photoAssetIds) {
  if (!Array.isArray(photoAssetIds) || photoAssetIds.length === 0) return ""

  const result = await cloud.getTempFileURL({
    fileList: [photoAssetIds[0]],
  })
  const firstFile = result.fileList && result.fileList[0]
  return firstFile && firstFile.tempFileURL ? firstFile.tempFileURL : ""
}

function getTimestamp(value) {
  if (!value) return 0
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}.${month}.${day}`
}

function mapItem(item) {
  const submitter = item.submitter || {}
  return {
    _id: item._id,
    candidateId: item._id,
    candidateName: item.name || "",
    candidateCode: item.candidateCode || "",
    submitterName: submitter.nickname || "未知提交人",
    subscriptionExpiresAt: item.subscriptionExpiresAt || null,
    subscriptionExpiresText: formatDate(item.subscriptionExpiresAt),
    updatedAt: item.updatedAt,
  }
}

exports.main = async (event = {}) => {
  await requireManager(event)
  const status = event.status || "active"
  const now = Date.now()

  const result = await db.collection("candidates").limit(100).get()
  const items = result.data
    .filter((item) => item.profileStatus !== "deleted")
    .filter((item) => item.subscriptionExpiresAt)
    .filter((item) => {
      const expiresAt = getTimestamp(item.subscriptionExpiresAt)
      return status === "expired" ? expiresAt < now : expiresAt >= now
    })
    .sort((left, right) => getTimestamp(right.subscriptionExpiresAt) - getTimestamp(left.subscriptionExpiresAt))

  const mappedItems = await Promise.all(items.map(async (item) => ({
    ...mapItem(item),
    photoUrl: await buildPhotoUrl(item.photoAssetIds || []),
  })))

  return { items: mappedItems }
}
