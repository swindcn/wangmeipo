const { manageAccount } = require("../../utils/api")

function applyUser(user) {
  const app = getApp()
  app.globalData.currentUserProfile = {
    ...(app.globalData.currentUserProfile || {}),
    registered: true,
    nickname: user.nickname || "用户",
    avatarUrl: user.avatarUrl || "",
    phone: user.phone || "",
    phoneText: user.phoneText || "",
    role: user.role || "viewer",
    roleText: user.roleText || "普通成员",
    hasPassword: Boolean(user.hasPassword),
  }
  wx.setStorageSync("currentUserProfile", app.globalData.currentUserProfile)
  wx.setStorageSync("accountLoggedIn", true)
  wx.removeStorageSync("accountLoggedOut")
}

Page({
  data: {
    password: "",
    confirmPassword: "",
    saving: false,
  },
  handlePasswordInput(event) {
    this.setData({ password: String(event.detail.value || "") })
  },
  handleConfirmInput(event) {
    this.setData({ confirmPassword: String(event.detail.value || "") })
  },
  async handleSave() {
    const password = this.data.password
    if (password.length < 6) {
      wx.showToast({ title: "密码至少6位", icon: "none" })
      return
    }
    if (password !== this.data.confirmPassword) {
      wx.showToast({ title: "两次密码不一致", icon: "none" })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: "保存中" })
    try {
      const result = await manageAccount({
        action: "updateProfile",
        userId: getApp().globalData.currentViewerId || "",
        profile: { password },
      })
      if (!result.ok) {
        throw new Error(result.error || "password save failed")
      }
      applyUser(result.user)
      wx.showToast({ title: "已设置", icon: "success" })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (error) {
      wx.showToast({ title: "保存失败", icon: "none" })
      console.error(error)
    } finally {
      wx.hideLoading()
      this.setData({ saving: false })
    }
  },
})
