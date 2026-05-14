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

App({
  globalData: {
    envId: "cloud1-d2g8yliwa5b20fae7",
    userRole: "viewer",
    currentCandidateId: "",
    currentViewerId: "",
    currentUserProfile: {
      registered: false,
      nickname: "",
      avatarUrl: "",
      phone: "",
      phoneText: "未授权",
      role: "viewer",
      roleText: "普通用户",
    },
    homeProfilesDirty: false,
    deletedCandidateIds: [],
  },
  onLaunch() {
    if (!wx.cloud) {
      console.error("当前基础库不支持云开发")
      return
    }

    wx.cloud.init({
      env: this.globalData.envId,
      traceUser: true,
    })

    this.refreshCurrentUser()
  },
  async refreshCurrentUser() {
    try {
      const response = await wx.cloud.callFunction({
        name: "getDashboardSummary",
        data: {},
      })
      const currentViewer = response && response.result ? response.result.currentViewer : null

      if (!currentViewer) {
        return
      }

      const phone = currentViewer.phone || ""
      const phoneText = phone && phone.length >= 7
        ? `${phone.slice(0, 3)}****${phone.slice(-2)}`
        : phone || "未授权"
      const role = currentViewer.role || "viewer"
      const roleText = role === "super_admin" ? "超级管理员" : role === "manager" ? "子管理员" : "普通用户"

      this.globalData.userRole = role
      this.globalData.currentViewerId = currentViewer._id || ""
      const accountLoggedIn = Boolean(wx.getStorageSync("accountLoggedIn")) && !wx.getStorageSync("accountLoggedOut")
      this.globalData.currentUserProfile = {
        registered: Boolean(accountLoggedIn && currentViewer._id && phone),
        nickname: currentViewer.nickname || "",
        avatarUrl: normalizeCloudFileUrl(currentViewer.avatarUrl || ""),
        phone,
        phoneText,
        role,
        roleText,
        hasPassword: Boolean(currentViewer.passwordHash),
      }
      wx.setStorageSync("currentUserProfile", this.globalData.currentUserProfile)
      return currentViewer
    } catch (error) {
      console.error("同步当前用户失败", error)
    }

    return null
  },
})
