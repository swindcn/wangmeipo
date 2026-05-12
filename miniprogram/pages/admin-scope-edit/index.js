const { manageAdminSettings } = require("../../utils/api")

function userInitial(user) {
  return String(user && user.nickname ? user.nickname : "管").slice(0, 1)
}

function normalizeCandidate(item) {
  return {
    ...item,
    title: item.name ? `${item.name}　${item.candidateCode || ""}` : `会员姓名　${item.candidateCode || ""}`,
    meta: `${item.gender || "-"}　${item.age || "-"}岁　${item.ancestralHome || "-"}`,
  }
}

Page({
  data: {
    managerUserId: "",
    manager: null,
    selectedCandidates: [],
    saving: false,
  },
  onLoad(query) {
    const managerUserId = query.managerUserId || ""
    this.setData({ managerUserId })
    this.loadScopeData(managerUserId)
  },
  async loadScopeData(managerUserId) {
    try {
      const result = await manageAdminSettings({
        action: "getScopeEditorData",
        managerUserId,
      })
      const manager = result.manager ? {
        ...result.manager,
        initial: userInitial(result.manager),
      } : null
      this.setData({
        manager,
        selectedCandidates: (result.selectedCandidates || []).map(normalizeCandidate),
      })
    } catch (error) {
      wx.showToast({ title: "加载失败", icon: "none" })
      console.error(error)
    }
  },
  handlePickManager() {
    wx.navigateTo({
      url: `/pages/admin-user-picker/index?mode=scope&selectedUserId=${this.data.managerUserId || ""}`,
      events: {
        selectedAdminUser: (user) => {
          if (!user || !user._id) return
          this.setData({
            managerUserId: user._id,
            manager: {
              ...user,
              initial: userInitial(user),
            },
          })
        },
      },
    })
  },
  handleAddCandidates() {
    const selectedIds = this.data.selectedCandidates.map((item) => item._id).join(",")
    getApp().globalData.adminScopeSelectedCandidates = this.data.selectedCandidates
    wx.navigateTo({
      url: `/pages/admin-candidate-picker/index?selectedIds=${selectedIds}`,
      events: {
        selectedAdminCandidates: (candidates) => {
          const nextItems = Array.isArray(candidates) ? candidates.map(normalizeCandidate) : []
          this.setData({ selectedCandidates: nextItems })
        },
      },
    })
  },
  handleRemoveCandidate(event) {
    const { id } = event.currentTarget.dataset
    this.setData({
      selectedCandidates: this.data.selectedCandidates.filter((item) => item._id !== id),
    })
  },
  async handleSave() {
    if (!this.data.managerUserId) {
      wx.showToast({ title: "请选择管理员", icon: "none" })
      return
    }

    this.setData({ saving: true })
    try {
      const result = await manageAdminSettings({
        action: "saveManagerScope",
        managerUserId: this.data.managerUserId,
        candidateIds: this.data.selectedCandidates.map((item) => item._id),
      })
      if (!result.ok) {
        throw new Error(result.error || "save failed")
      }
      wx.showToast({ title: "已保存", icon: "success" })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      wx.showToast({ title: "保存失败", icon: "none" })
      console.error(error)
    } finally {
      this.setData({ saving: false })
    }
  },
})
