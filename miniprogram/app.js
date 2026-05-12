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
      this.globalData.currentUserProfile = {
        registered: Boolean(currentViewer._id && currentViewer.avatarUrl && currentViewer.nickname && currentViewer.nickname !== "云开发管理员"),
        nickname: currentViewer.nickname || "",
        avatarUrl: currentViewer.avatarUrl || "",
        phone,
        phoneText,
        role,
        roleText,
      }
      wx.setStorageSync("currentUserProfile", this.globalData.currentUserProfile)
      return currentViewer
    } catch (error) {
      console.error("同步当前用户失败", error)
    }

    return null
  },
})
