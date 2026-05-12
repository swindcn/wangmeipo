const { manageAdminSettings } = require("../../utils/api")

function userInitial(user) {
  return String(user && user.nickname ? user.nickname : "管").slice(0, 1)
}

Page({
  data: {
    loading: false,
    superAdmins: [],
    managers: [],
  },
  onShow() {
    this.loadSettings()
  },
  async loadSettings() {
    this.setData({ loading: true })
    try {
      const result = await manageAdminSettings({ action: "listSettings" })
      this.setData({
        superAdmins: (result.superAdmins || []).map((item) => ({
          ...item,
          initial: userInitial(item),
        })),
        managers: (result.managers || []).map((item) => ({
          ...item,
          initial: userInitial(item),
        })),
      })
    } catch (error) {
      wx.showToast({ title: "当前身份无权限", icon: "none" })
      console.error(error)
    } finally {
      this.setData({ loading: false })
    }
  },
  handleAddSuperAdmin() {
    wx.navigateTo({ url: "/pages/admin-user-picker/index?mode=superAdmin" })
  },
  handleAddManager() {
    wx.navigateTo({ url: "/pages/admin-scope-edit/index" })
  },
  handleOpenManager(event) {
    const { id } = event.currentTarget.dataset
    wx.navigateTo({ url: `/pages/admin-scope-edit/index?managerUserId=${id}` })
  },
})
