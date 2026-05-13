const { manageAccount } = require("../../utils/api")

function applyUser(user) {
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
    profile: {
      nickname: "",
      avatarUrl: "",
      phoneText: "",
      hasPassword: false,
    },
    saving: false,
    nicknameModalVisible: false,
    avatarModalVisible: false,
    draftNickname: "",
    draftAvatarUrl: "",
  },
  onShow() {
    const profile = getApp().globalData.currentUserProfile || wx.getStorageSync("currentUserProfile") || {}
    this.setData({
      profile: {
        nickname: profile.nickname || "",
        avatarUrl: profile.avatarUrl || "",
        phoneText: profile.phoneText || "",
        hasPassword: Boolean(profile.hasPassword),
      },
    })
  },
  getImageExtension(filePath) {
    const matched = String(filePath || "").match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
    return matched ? matched[1].toLowerCase() : "jpg"
  },
  async uploadAvatarFile(filePath) {
    if (!filePath) return ""
    const extension = this.getImageExtension(filePath)
    const result = await wx.cloud.uploadFile({
      cloudPath: `user-avatars/${Date.now()}.${extension}`,
      filePath,
    })
    return result.fileID || filePath
  },
  openAvatarModal() {
    this.setData({
      avatarModalVisible: true,
      draftAvatarUrl: this.data.profile.avatarUrl || "",
    })
  },
  closeAvatarModal() {
    if (this.data.saving) return
    this.setData({ avatarModalVisible: false })
  },
  async handleChooseWechatAvatar(event) {
    const avatarPreview = event.detail.avatarUrl || ""
    if (!avatarPreview) return

    this.setData({ draftAvatarUrl: avatarPreview })
    try {
      const fileID = await this.uploadAvatarFile(avatarPreview)
      this.setData({ draftAvatarUrl: fileID || avatarPreview })
    } catch (error) {
      console.error(error)
    }
  },
  chooseAvatarFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album"],
      success: async (result) => {
        const filePath = result.tempFiles && result.tempFiles[0] ? result.tempFiles[0].tempFilePath : ""
        if (!filePath) return
        this.setData({ draftAvatarUrl: filePath })
        try {
          const fileID = await this.uploadAvatarFile(filePath)
          this.setData({ draftAvatarUrl: fileID || filePath })
        } catch (error) {
          wx.showToast({ title: "头像上传失败", icon: "none" })
          console.error(error)
        }
      },
    })
  },
  openNicknameModal() {
    this.setData({
      nicknameModalVisible: true,
      draftNickname: this.data.profile.nickname || "",
    })
  },
  closeNicknameModal() {
    if (this.data.saving) return
    this.setData({ nicknameModalVisible: false })
  },
  handleDraftNicknameInput(event) {
    this.setData({ draftNickname: String(event.detail.value || "").trim() })
  },
  handleWechatNicknameInput(event) {
    this.setData({ draftNickname: String(event.detail.value || "").trim() })
  },
  openPasswordSettings() {
    wx.navigateTo({ url: "/pages/password-settings/index" })
  },
  async saveProfilePatch(profilePatch, successTitle) {
    this.setData({ saving: true })
    wx.showLoading({ title: "保存中" })
    try {
      const result = await manageAccount({
        action: "updateProfile",
        userId: getApp().globalData.currentViewerId || "",
        profile: profilePatch,
      })
      if (!result.ok) {
        throw new Error(result.error || "save failed")
      }
      applyUser(result.user)
      this.setData({
        profile: {
          nickname: result.user.nickname || "",
          avatarUrl: result.user.avatarUrl || "",
          phoneText: result.user.phoneText || "",
          hasPassword: Boolean(result.user.hasPassword),
        },
      })
      wx.showToast({ title: successTitle || "已保存", icon: "success" })
    } catch (error) {
      wx.showToast({ title: "保存失败", icon: "none" })
      console.error(error)
    } finally {
      wx.hideLoading()
      this.setData({ saving: false })
    }
  },
  async saveNickname() {
    if (!this.data.draftNickname) {
      wx.showToast({ title: "请填写昵称", icon: "none" })
      return
    }
    await this.saveProfilePatch({ nickname: this.data.draftNickname }, "已保存")
    this.setData({ nicknameModalVisible: false })
  },
  async saveAvatar() {
    if (!this.data.draftAvatarUrl) {
      wx.showToast({ title: "请选择头像", icon: "none" })
      return
    }
    await this.saveProfilePatch({ avatarUrl: this.data.draftAvatarUrl }, "已保存")
    this.setData({ avatarModalVisible: false })
  },
  handleLogout() {
    const app = getApp()
    app.globalData.userRole = "viewer"
    app.globalData.currentViewerId = ""
    app.globalData.currentUserProfile = {
      registered: false,
      nickname: "",
      avatarUrl: "",
      phone: "",
      phoneText: "",
      role: "viewer",
      roleText: "普通成员",
      hasPassword: false,
    }
    wx.removeStorageSync("currentUserProfile")
    wx.removeStorageSync("accountLoggedIn")
    wx.setStorageSync("accountLoggedOut", true)
    wx.showToast({ title: "已退出", icon: "success" })
    setTimeout(() => {
      wx.redirectTo({ url: "/pages/my-access/index" })
    }, 400)
  },
})
