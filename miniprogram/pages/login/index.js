const { manageAccount } = require("../../utils/api")

function applyLoginUser(user) {
  const app = getApp()
  if (!user) return

  app.globalData.userRole = user.role || "viewer"
  app.globalData.currentViewerId = user._id || ""
  app.globalData.currentUserProfile = {
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
    agreed: false,
    loading: false,
    redirect: "",
  },
  onLoad(query = {}) {
    this.setData({
      redirect: query.redirect || "",
    })
  },
  finishLogin() {
    if (this.data.redirect === "upload") {
      wx.redirectTo({ url: "/pages/upload-profile/index" })
      return
    }

    wx.navigateBack()
  },
  toggleAgree() {
    this.setData({ agreed: !this.data.agreed })
  },
  ensureAgreed() {
    if (this.data.agreed) return true
    wx.showToast({ title: "请先同意用户协议", icon: "none" })
    return false
  },
  async handleQuickLogin(event) {
    if (!this.ensureAgreed()) return
    if (!event.detail || !event.detail.code) {
      wx.showToast({ title: "未授权手机号", icon: "none" })
      return
    }

    this.setData({ loading: true })
    let loadingShown = false
    wx.showLoading({ title: "登录中" })
    loadingShown = true
    try {
      const result = await manageAccount({
        action: "quickLogin",
        phoneCode: event.detail.code,
      })
      if (!result.ok) {
        throw new Error(result.error || "quick login failed")
      }
      applyLoginUser(result.user)
      wx.showToast({ title: "已登录", icon: "success" })
      setTimeout(() => this.finishLogin(), 400)
    } catch (error) {
      wx.showToast({ title: "登录失败", icon: "none" })
      console.error(error)
    } finally {
      if (loadingShown) wx.hideLoading()
      this.setData({ loading: false })
    }
  },
  handlePhoneLogin() {
    if (!this.ensureAgreed()) return
    const redirectQuery = this.data.redirect ? `?redirect=${this.data.redirect}` : ""
    wx.navigateTo({ url: `/pages/phone-login/index${redirectQuery}` })
  },
  handleOpenAgreement(event) {
    const { type } = event.currentTarget.dataset
    wx.navigateTo({ url: `/pages/legal/index?type=${type || "terms"}` })
  },
})
