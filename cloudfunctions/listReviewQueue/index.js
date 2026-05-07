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

async function buildPhotoUrl(photoAssetIds) {
  if (!Array.isArray(photoAssetIds) || photoAssetIds.length === 0) {
    return ""
  }

  const result = await cloud.getTempFileURL({
    fileList: [photoAssetIds[0]],
  })

  const firstFile = result.fileList && result.fileList[0]
  return firstFile && firstFile.tempFileURL ? firstFile.tempFileURL : ""
}

function getGenderTitle(candidate) {
  if (candidate.gender === "男") return "男士"
  if (candidate.gender === "女") return "女士"
  return "会员"
}

function mapReviewItem(item) {
  const submitter = item.submitter || {}

  return {
    _id: item._id,
    candidateId: item._id,
    candidateName: item.name || "未命名资料",
    age: item.age || "",
    gender: item.gender || "",
    genderTitle: getGenderTitle(item),
    submitterName: submitter.nickname || "未知提交人",
    submitterPhone: submitter.phone || "",
    submitterAvatarUrl: submitter.avatarUrl || "",
    profileStatus: item.profileStatus || "",
    reviewStatusText: item.profileStatus === "rejected" ? "已拒绝" : "已同意",
    reviewStatusClass: item.profileStatus === "rejected" ? "status rejected" : "status approved",
    updatedAt: item.updatedAt,
    confidence: item.confidence && typeof item.confidence.overall === "number" ? item.confidence.overall : 0,
    reason: Array.isArray(item.uncertainFields) && item.uncertainFields.length > 0
      ? `待确认字段：${item.uncertainFields.join("、")}`
      : "待人工核验",
  }
}

exports.main = async (event = {}) => {
  await requireManager(event)
  const status = event.status || "pending_review"
  const reviewStatuses = status === "reviewed" ? ["published", "rejected"] : ["pending_review"]
  const result = await db.collection("candidates").limit(100).get()
  const items = result.data
    .filter((item) => reviewStatuses.includes(item.profileStatus))
    .filter((item) => item.submitter && item.submitter.userId)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))

  const mappedItems = await Promise.all(items.map(async (item) => ({
    ...mapReviewItem(item),
    photoUrl: await buildPhotoUrl(item.photoAssetIds || []),
  })))

  return {
    items: mappedItems,
  }
}
