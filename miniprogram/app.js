App({
  globalData: {
    envId: "cloud1-d2g8yliwa5b20fae7",
    userRole: "viewer",
    currentCandidateId: "",
    currentViewerId: "",
    currentUserProfile: {
      nickname: "",
      avatarUrl: "",
      phone: "",
    },
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

      this.globalData.userRole = currentViewer.role || "viewer"
      this.globalData.currentViewerId = currentViewer._id || ""
      this.globalData.currentUserProfile = {
        nickname: currentViewer.nickname || "",
        avatarUrl: currentViewer.avatarUrl || "",
        phone: currentViewer.phone || "",
      }
      return currentViewer
    } catch (error) {
      console.error("同步当前用户失败", error)
    }

    return null
  },
})
