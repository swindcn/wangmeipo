const CLOUD_ENV_ID = "cloud1-d2g8yliwa5b20fae7"

function normalizeCloudFileUrl(url) {
  const text = String(url || "").trim()
  if (!text || text.startsWith("cloud://")) return text

  const match = text.match(/^https:\/\/([^/]+)\.tcb\.qcloud\.la\/([^?]+)/)
  if (!match || !match[1] || !match[2]) return text

  try {
    const path = decodeURIComponent(match[2]).replace(/^\/+/, "")
    return path ? `cloud://${CLOUD_ENV_ID}.${match[1]}/${path}` : text
  } catch (error) {
    return text
  }
}

function normalizeCloudFileList(list) {
  return Array.isArray(list) ? list.map(normalizeCloudFileUrl).filter(Boolean) : []
}

function normalizeMediaObject(item) {
  if (!item || typeof item !== "object") return item
  const next = { ...item }

  if (next.avatarUrl) next.avatarUrl = normalizeCloudFileUrl(next.avatarUrl)
  if (next.photoUrl) next.photoUrl = normalizeCloudFileUrl(next.photoUrl)
  if (next.imageUrl) next.imageUrl = normalizeCloudFileUrl(next.imageUrl)
  if (Array.isArray(next.photoUrls)) next.photoUrls = normalizeCloudFileList(next.photoUrls)

  return next
}

function normalizeMediaList(list) {
  return Array.isArray(list) ? list.map(normalizeMediaObject) : []
}

function getDebugViewerUserId() {
  const app = getApp()
  return app && app.globalData ? app.globalData.currentViewerId || "" : ""
}

function buildCloudPayload(data) {
  const payload = { ...(data || {}) }
  const debugViewerUserId = getDebugViewerUserId()

  if (debugViewerUserId && !payload.debugViewerUserId) {
    payload.debugViewerUserId = debugViewerUserId
  }

  return payload
}

function callCloudFunction(name, data) {
  return wx.cloud.callFunction({
    name,
    data: buildCloudPayload(data),
  })
}

function unwrapResult(response) {
  return response && response.result ? response.result : {}
}

async function getDashboardSummary() {
  try {
    const response = await callCloudFunction("getDashboardSummary")
    return unwrapResult(response)
  } catch (error) {
    return {
      currentViewer: null,
      users: [],
      stats: {
        totalCandidates: 0,
        pendingReview: 0,
        published: 0,
        activeMatches: 0,
      },
    }
  }
}

async function bootstrapCloudDatabase() {
  const response = await callCloudFunction("bootstrapDatabase")
  return unwrapResult(response)
}

async function askMatchmaker(payload) {
  const response = await callCloudFunction("askMatchmaker", payload)
  return unwrapResult(response)
}

async function loadAskMatchmakerChat() {
  const response = await callCloudFunction("askMatchmaker", {
    action: "loadChat",
  })
  return unwrapResult(response)
}

async function saveAskMatchmakerChat(payload) {
  const response = await callCloudFunction("askMatchmaker", {
    action: "saveChat",
    ...(payload || {}),
  })
  return unwrapResult(response)
}

async function setCurrentViewer(viewerId) {
  const app = getApp()
  app.globalData.currentViewerId = viewerId
  return null
}

async function listCandidates(params) {
  const response = await callCloudFunction("getCandidateDetail", {
    mode: "list",
    filter: params && params.filter ? params.filter : "all",
    keyword: params && params.keyword ? params.keyword : "",
    limit: params && params.limit ? params.limit : 12,
    includePhotos: !(params && params.includePhotos === false),
  })
  return normalizeMediaList(unwrapResult(response).items || [])
}

async function listHomeCandidates() {
  try {
    return await listCandidates({ filter: "published", limit: 12, includePhotos: true })
  } catch (error) {
    return []
  }
}

async function searchHomeCandidates(keyword) {
  try {
    return await listCandidates({
      filter: "published",
      keyword,
      limit: 30,
      includePhotos: true,
    })
  } catch (error) {
    return []
  }
}

async function getCandidateDetail(candidateId, options) {
  const response = await callCloudFunction("getCandidateDetail", {
    mode: "detail",
    candidateId,
    shareToken: options && options.shareToken ? options.shareToken : "",
    source: options && options.source ? options.source : "",
  })
  return normalizeMediaObject(unwrapResult(response).item || null)
}

async function listReviewQueue(params) {
  const response = await callCloudFunction("listReviewQueue", params || {})
  return normalizeMediaList(unwrapResult(response).items || [])
}

async function listCandidateSubscriptions(params) {
  const response = await callCloudFunction("listCandidateSubscriptions", params || {})
  return normalizeMediaList(unwrapResult(response).items || [])
}

async function listDeletedCandidates(params) {
  const response = await callCloudFunction("listDeletedCandidates", params || {})
  return normalizeMediaList(unwrapResult(response).items || [])
}

async function reviewCandidate(candidateId, payload) {
  const response = await callCloudFunction("reviewParsedCandidate", {
    candidateId,
    ...(payload || {}),
  })
  return unwrapResult(response)
}

async function getPermissionData() {
  const response = await callCloudFunction("getPermissionData")
  return unwrapResult(response)
}

async function grantPermission(payload) {
  const response = await callCloudFunction("grantCandidatePermission", payload)
  return unwrapResult(response)
}

async function getMatchData() {
  const response = await callCloudFunction("getMatchData")
  return unwrapResult(response)
}

async function saveMatchRecord(payload) {
  const response = await callCloudFunction("recordMatch", payload)
  return unwrapResult(response)
}

async function listMyAccess(params) {
  const response = await callCloudFunction("listMyAccess", params || {})
  const result = unwrapResult(response)
  if (result && result.profile) result.profile = normalizeMediaObject(result.profile)
  if (result && Array.isArray(result.sections)) {
    result.sections = result.sections.map((section) => ({
      ...section,
      items: normalizeMediaList(section.items || []),
    }))
  } else if (result && result.sections && typeof result.sections === "object") {
    result.sections = Object.keys(result.sections).reduce((sections, key) => {
      sections[key] = normalizeMediaList(result.sections[key] || [])
      return sections
    }, {})
  }
  return result
}

async function createShareToken(payload) {
  const response = await callCloudFunction("createShareToken", payload)
  return unwrapResult(response)
}

async function submitCandidateProfile(payload) {
  const response = await callCloudFunction("submitCandidateProfile", payload)
  return unwrapResult(response)
}

async function parseCandidateText(payload) {
  const response = await callCloudFunction("parseCandidateText", payload)
  return unwrapResult(response)
}

async function upsertCurrentUser(payload) {
  const response = await callCloudFunction("upsertCurrentUser", payload)
  return unwrapResult(response)
}

async function setCandidateSubscription(payload) {
  const response = await callCloudFunction("setCandidateSubscription", payload)
  return unwrapResult(response)
}

async function manageAdminSettings(payload) {
  const response = await callCloudFunction("manageAdminSettings", payload)
  const result = unwrapResult(response)
  if (result && result.items) result.items = normalizeMediaList(result.items)
  if (result && result.superAdmins) result.superAdmins = normalizeMediaList(result.superAdmins)
  if (result && result.managers) result.managers = normalizeMediaList(result.managers)
  return result
}

async function manageViewRequests(payload) {
  const response = await callCloudFunction("manageViewRequests", payload)
  const result = unwrapResult(response)
  if (result && result.items) result.items = normalizeMediaList(result.items)
  return result
}

async function manageAccount(payload) {
  const response = await callCloudFunction("manageAccount", payload)
  const result = unwrapResult(response)
  if (result && result.user) result.user = normalizeMediaObject(result.user)
  return result
}

module.exports = {
  askMatchmaker,
  bootstrapCloudDatabase,
  createShareToken,
  getCandidateDetail,
  getDashboardSummary,
  getMatchData,
  getPermissionData,
  grantPermission,
  listCandidateSubscriptions,
  listDeletedCandidates,
  listHomeCandidates,
  loadAskMatchmakerChat,
  listCandidates,
  listMyAccess,
  listReviewQueue,
  manageViewRequests,
  manageAdminSettings,
  manageAccount,
  normalizeCloudFileUrl,
  reviewCandidate,
  saveMatchRecord,
  saveAskMatchmakerChat,
  searchHomeCandidates,
  setCandidateSubscription,
  setCurrentViewer,
  parseCandidateText,
  submitCandidateProfile,
  upsertCurrentUser,
}
