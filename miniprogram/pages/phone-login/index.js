const { manageAccount } = require("../../utils/api")

function applyLoginUser(user) {
  const app = getApp()
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
    phone: "",
    password: "",
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

    wx.navigateBack({ delta: 2 })
  },
  handlePhoneInput(event) {
    this.setData({ phone: String(event.detail.value || "").trim() })
  },
  handlePasswordInput(event) {
    this.setData({ password: String(event.detail.value || "") })
  },
  toggleAgree() {
    this.setData({ agreed: !this.data.agreed })
  },
  async handleLogin() {
    if (!this.data.phone || !this.data.password) {
      wx.showToast({ title: "请填写手机号和密码", icon: "none" })
      return
    }
    if (!this.data.agreed) {
      wx.showToast({ title: "请先同意用户协议", icon: "none" })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: "登录中" })
    try {
      const result = await manageAccount({
        action: "phoneLogin",
        phone: this.data.phone,
        password: this.data.password,
      })
      if (!result.ok) {
        throw new Error(result.error || "phone login failed")
      }
      applyLoginUser(result.user)
      wx.showToast({ title: "已登录", icon: "success" })
      setTimeout(() => {
        this.finishLogin()
      }, 400)
    } catch (error) {
      wx.showToast({ title: "手机号或密码错误", icon: "none" })
      console.error(error)
    } finally {
      wx.hideLoading()
      this.setData({ loading: false })
    }
  },
})
