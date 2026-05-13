const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function compactString(value) {
  return String(value || "").trim()
}

function toTimestamp(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === "number") return value
  if (typeof value === "object" && value.$date) {
    const dateValue = typeof value.$date === "object" && value.$date.$numberLong
      ? Number(value.$date.$numberLong)
      : new Date(value.$date).getTime()
    return Number.isFinite(dateValue) ? dateValue : 0
  }
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}.${month}.${day}`
}

function maskPhone(phone) {
  const text = compactString(phone)
  if (text.length < 7) return text
  return `${text.slice(0, 3)}****${text.slice(-2)}`
}

function getRoleText(role) {
  if (role === "super_admin") return "超级管理员"
  if (role === "manager") return "子管理员"
  return "普通用户"
}

function getSortTimestamp(candidate) {
  return toTimestamp(candidate.updatedAt || candidate.publishedAt || candidate.createdAt)
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

  if (!OPENID) return null
  const usersResult = await db.collection("users").where({ openid: OPENID }).limit(1).get()
  return usersResult.data[0] || null
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

function getStatusText(status) {
  if (status === "published" || status === "approved") return "已同意"
  if (status === "rejected") return "已拒绝"
  if (status === "pending_review" || status === "pending") return "审核中"
  if (status === "deleted") return "已删除"
  return status || ""
}

function getStatusClass(status) {
  if (status === "published" || status === "approved") return "approved"
  if (status === "rejected") return "rejected"
  if (status === "pending_review" || status === "pending") return "pending"
  return "neutral"
}

function getCandidateTitle(candidate) {
  const name = compactString(candidate.name)
  const code = compactString(candidate.candidateCode)
  if (name && code) return `${name} ${code}`
  return name || code || "会员资料"
}

function mapCandidateItem(candidate, options = {}) {
  const status = options.status || candidate.profileStatus || ""
  const submitter = candidate.submitter || {}

  return {
    _id: options.id || candidate._id,
    candidateId: candidate._id,
    title: getCandidateTitle(candidate),
    subtitle: options.subtitle || [candidate.age ? `${candidate.age}岁` : "", candidate.gender || "", candidate.occupation || ""].filter(Boolean).join(" · "),
    meta: options.meta || (submitter.nickname ? `提交人：${submitter.nickname}` : ""),
    status,
    statusText: options.statusText || getStatusText(status),
    statusClass: getStatusClass(status),
    canViewPhotos: Boolean(options.canViewPhotos),
    locked: !options.canViewPhotos,
    photoUrl: "",
    updatedAt: candidate.updatedAt || candidate.createdAt || "",
    updatedAtText: formatDate(candidate.updatedAt || candidate.createdAt),
  }
}

async function attachPhotos(items, candidateMap = {}) {
  return Promise.all(items.map(async (item) => {
    const candidate = candidateMap[item.candidateId] || item.__candidate || {}
    const photoUrl = await buildPhotoUrl(candidate.photoAssetIds || [])
    const { __candidate, ...safeItem } = item
    return {
      ...safeItem,
      photoUrl,
    }
  }))
}

async function getSubmittedItems(currentUser) {
  if (!currentUser || !currentUser._id) return []

  const result = await db.collection("candidates").limit(100).get()
  const items = result.data
    .filter((candidate) => {
      const submitter = candidate.submitter || {}
      return submitter.userId === currentUser._id || candidate.createdBy === currentUser._id
    })
    .sort((left, right) => getSortTimestamp(right) - getSortTimestamp(left))
    .map((candidate) => ({
      ...mapCandidateItem(candidate, {
        canViewPhotos: true,
      }),
      __candidate: candidate,
    }))

  return attachPhotos(items)
}

async function getWantedItems(currentUser) {
  if (!currentUser || !currentUser._id) return []

  const requestResult = await db.collection("view_requests").where({
    requesterUserId: currentUser._id,
  }).limit(100).get()

  const requests = requestResult.data
    .sort((left, right) => toTimestamp(right.updatedAt || right.requestedAt || right.createdAt) - toTimestamp(left.updatedAt || left.requestedAt || left.createdAt))
  const candidateIds = Array.from(new Set(requests.map((item) => item.candidateId).filter(Boolean)))
  if (candidateIds.length === 0) return []

  const candidateResult = await db.collection("candidates").where({ _id: _.in(candidateIds) }).limit(100).get()
  const candidateMap = candidateResult.data.reduce((result, item) => {
    result[item._id] = item
    return result
  }, {})

  const items = requests.map((request) => {
    const candidate = candidateMap[request.candidateId] || {
      _id: request.candidateId,
      candidateCode: request.candidateCode,
      name: request.candidateName,
      photoAssetIds: [],
    }
    const canViewPhotos = request.status === "approved"
    return {
      ...mapCandidateItem(candidate, {
        id: request._id,
        status: request.status,
        statusText: getStatusText(request.status),
        canViewPhotos,
        subtitle: candidate.age ? `${candidate.age}岁${candidate.gender || ""}资料` : "会员资料",
        meta: `申请时间：${formatDate(request.requestedAt || request.createdAt)}`,
      }),
      __candidate: candidate,
    }
  })

  return attachPhotos(items, candidateMap)
}

async function getViewedItems() {
  return []
}

function buildProfile(currentUser) {
  const nickname = compactString(currentUser && currentUser.nickname) || "游客123456"
  const avatarUrl = compactString(currentUser && currentUser.avatarUrl)
  const phone = compactString(currentUser && currentUser.phone)

  return {
    _id: currentUser && currentUser._id ? currentUser._id : "",
    registered: Boolean(currentUser && currentUser._id && phone),
    nickname,
    avatarUrl,
    role: currentUser && currentUser.role ? currentUser.role : "viewer",
    roleText: getRoleText(currentUser && currentUser.role),
    phone,
    phoneText: phone ? maskPhone(phone) : "未授权",
    hasPassword: Boolean(currentUser && currentUser.passwordHash),
  }
}

exports.main = async (event = {}) => {
  const action = event.action || "summary"
  const currentUser = await resolveCurrentUser(event)
  const profile = buildProfile(currentUser)

  if (action === "submitted") {
    return { ok: true, profile, items: await getSubmittedItems(currentUser) }
  }

  if (action === "wanted") {
    return { ok: true, profile, items: await getWantedItems(currentUser) }
  }

  if (action === "viewed") {
    return { ok: true, profile, items: await getViewedItems(currentUser) }
  }

  const submittedItems = await getSubmittedItems(currentUser)
  const wantedItems = await getWantedItems(currentUser)
  const viewedItems = await getViewedItems(currentUser)

  return {
    ok: true,
    profile,
    sections: {
      submitted: submittedItems.slice(0, 4),
      wanted: wantedItems.slice(0, 4),
      viewed: viewedItems.slice(0, 4),
    },
  }
}
