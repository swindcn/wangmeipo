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
  return unwrapResult(response).items || []
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
  return unwrapResult(response).item || null
}

async function listReviewQueue(params) {
  const response = await callCloudFunction("listReviewQueue", params || {})
  return unwrapResult(response).items || []
}

async function listCandidateSubscriptions(params) {
  const response = await callCloudFunction("listCandidateSubscriptions", params || {})
  return unwrapResult(response).items || []
}

async function listDeletedCandidates(params) {
  const response = await callCloudFunction("listDeletedCandidates", params || {})
  return unwrapResult(response).items || []
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
  return unwrapResult(response)
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
  return unwrapResult(response)
}

async function manageViewRequests(payload) {
  const response = await callCloudFunction("manageViewRequests", payload)
  return unwrapResult(response)
}

async function manageAccount(payload) {
  const response = await callCloudFunction("manageAccount", payload)
  return unwrapResult(response)
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
