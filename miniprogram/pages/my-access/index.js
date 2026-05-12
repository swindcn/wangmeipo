const { listMyAccess, upsertCurrentUser } = require("../../utils/api")

const tabItems = [
  { key: "home", label: "汇匹配", currentIconUrl: "../../assets/icons/tab-home.png", className: "tab-item" },
  { key: "assistant", label: "问美媒", currentIconUrl: "../../assets/icons/tab-assistant.png", className: "tab-item" },
  { key: "upload", label: "传资料", currentIconUrl: "../../assets/icons/tab-upload.png", className: "tab-item tab-upload" },
  { key: "manage", label: "懂管理", currentIconUrl: "../../assets/icons/tab-manage.png", className: "tab-item" },
  { key: "mine", label: "我的", currentIconUrl: "../../assets/icons/tab-mine-active.png", className: "tab-item active" },
]

const SYSTEM_NICKNAMES = ["云开发管理员"]

function cleanRegisterNickname(nickname) {
  const text = String(nickname || "").trim()
  return SYSTEM_NICKNAMES.includes(text) ? "" : text
}

function buildEmptySection(key, title, icon, iconClass) {
  return {
    key,
    title,
    icon,
    iconClass,
    iconUrl: `../../assets/icons/mine-${key}.png`,
    items: [],
  }
}

function maskPhone(phone) {
  const text = String(phone || "").trim()
  if (text.length < 7) return text
  return `${text.slice(0, 3)}****${text.slice(-2)}`
}

function getRoleText(role) {
  if (role === "super_admin") return "超级管理员"
  if (role === "manager") return "子管理员"
  return "普通用户"
}

function buildCachedProfile(profile = {}) {
  const nickname = cleanRegisterNickname(profile.nickname)
  const phone = String(profile.phone || "").trim()
  const role = profile.role || getApp().globalData.userRole || "viewer"
  const registered = Boolean(profile.registered || (profile.avatarUrl && nickname))

  return {
    registered,
    nickname: nickname || "游客123456",
    avatarUrl: profile.avatarUrl || "",
    role,
    roleText: profile.roleText || getRoleText(role),
    phone,
    phoneText: profile.phoneText || (phone ? maskPhone(phone) : "未授权"),
  }
}

Page({
  data: {
    loading: false,
    registering: false,
    profileReady: false,
    navTopGap: 88,
    tabItems,
    profile: {
      registered: false,
      nickname: "游客123456",
      avatarUrl: "",
      roleText: "普通用户",
      phoneText: "未授权",
    },
    registerProfile: {
      nickname: "",
      avatarUrl: "",
      avatarPreview: "",
      phone: "",
      initial: "我",
    },
    sections: [
      buildEmptySection("submitted", "传的资料", "", "pink"),
      buildEmptySection("wanted", "我想看的", "", "orange"),
      buildEmptySection("viewed", "对看过的", "", "purple"),
    ],
  },
  onShow() {
    this.initNavMetrics()
    this.applyCachedProfile()
    this.loadSummary()
    this.syncRegisterProfile()
  },
  initNavMetrics() {
    const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const windowWidth = windowInfo.windowWidth || 375
    const pxToRpx = (px) => px * 750 / windowWidth
    const topGapPx = menuButton && menuButton.bottom
      ? menuButton.bottom + 8
      : (windowInfo.statusBarHeight || 20) + 44

    this.setData({
      navTopGap: Math.ceil(pxToRpx(topGapPx)),
    })
  },
  async loadSummary() {
    this.setData({ loading: true })
    try {
      const result = await listMyAccess({ action: "summary" })
      const sections = result.sections || {}
      const profile = result.profile || this.data.profile
      this.cacheProfile(profile)
      this.setData({
        profile,
        profileReady: true,
        sections: [
          {
            ...buildEmptySection("submitted", "传的资料", "", "pink"),
            items: sections.submitted || [],
          },
          {
            ...buildEmptySection("wanted", "我想看的", "", "orange"),
            items: sections.wanted || [],
          },
          {
            ...buildEmptySection("viewed", "对看过的", "", "purple"),
            items: sections.viewed || [],
          },
        ],
      })
    } catch (error) {
      wx.showToast({ title: "加载失败", icon: "none" })
      console.error(error)
    } finally {
      this.setData({ loading: false, profileReady: true })
    }
  },
  applyCachedProfile() {
    const app = getApp()
    const globalProfile = app.globalData.currentUserProfile || {}
    let cachedProfile = {}

    try {
      cachedProfile = wx.getStorageSync("currentUserProfile") || {}
    } catch (error) {
      cachedProfile = {}
    }

    const profileSource = globalProfile.registered || globalProfile.avatarUrl || globalProfile.nickname
      ? globalProfile
      : cachedProfile

    if (!profileSource || (!profileSource.registered && !profileSource.avatarUrl && !profileSource.nickname)) {
      return
    }

    const profile = buildCachedProfile(profileSource)
    this.setData({
      profile,
      profileReady: true,
    })
  },
  cacheProfile(profile) {
    const app = getApp()
    const normalizedProfile = buildCachedProfile(profile)

    app.globalData.userRole = normalizedProfile.role || app.globalData.userRole
    app.globalData.currentUserProfile = normalizedProfile

    try {
      wx.setStorageSync("currentUserProfile", normalizedProfile)
    } catch (error) {
      console.error("缓存用户资料失败", error)
    }
  },
  syncRegisterProfile() {
    const app = getApp()
    const profile = app.globalData.currentUserProfile || {}
    const nickname = cleanRegisterNickname(profile.nickname)

    this.setData({
      registerProfile: {
        nickname,
        avatarUrl: profile.avatarUrl || "",
        avatarPreview: profile.avatarUrl || "",
        phone: profile.phone || "",
        initial: String(nickname || "我").slice(0, 1),
      },
    })
  },
  getImageExtension(filePath) {
    const matched = String(filePath || "").match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
    return matched ? matched[1].toLowerCase() : "jpg"
  },
  async handleChooseAvatar(event) {
    const avatarPreview = event.detail.avatarUrl || ""
    if (!avatarPreview) return

    this.setData({
      "registerProfile.avatarPreview": avatarPreview,
    })

    try {
      const extension = this.getImageExtension(avatarPreview)
      const result = await wx.cloud.uploadFile({
        cloudPath: `user-avatars/${Date.now()}.${extension}`,
        filePath: avatarPreview,
      })
      this.setData({
        "registerProfile.avatarUrl": result.fileID || avatarPreview,
      })
    } catch (error) {
      this.setData({
        "registerProfile.avatarUrl": avatarPreview,
      })
      console.error(error)
    }
  },
  handleNicknameInput(event) {
    const nickname = cleanRegisterNickname(event.detail.value)
    this.setData({
      "registerProfile.nickname": nickname,
      "registerProfile.initial": String(nickname || "我").slice(0, 1),
    })
  },
  handlePhoneInput(event) {
    this.setData({
      "registerProfile.phone": String(event.detail.value || "").trim(),
    })
  },
  async saveRegisterProfile(options = {}) {
    const profile = this.data.registerProfile

    if (!profile.avatarUrl) {
      wx.showToast({ title: "请先选择头像", icon: "none" })
      return
    }

    if (!profile.nickname) {
      wx.showToast({ title: "请先填写昵称", icon: "none" })
      return
    }

    this.setData({ registering: true })
    wx.showLoading({ title: "授权中" })

    try {
      const result = await upsertCurrentUser({
        profile,
        phoneCode: options.phoneCode || "",
      })

      if (!result.ok) {
        throw new Error(result.error || "register failed")
      }

      this.applyRegisteredUser(result.user)
      await this.loadSummary()
      wx.showToast({ title: "已授权", icon: "success" })
    } catch (error) {
      wx.showToast({ title: "授权失败", icon: "none" })
      console.error(error)
    } finally {
      wx.hideLoading()
      this.setData({ registering: false })
    }
  },
  handlePhoneAuth(event) {
    if (!event.detail || !event.detail.code) {
      wx.showToast({ title: "未授权手机号", icon: "none" })
      return
    }

    this.saveRegisterProfile({ phoneCode: event.detail.code })
  },
  handleRegisterWithoutPhone() {
    this.saveRegisterProfile()
  },
  applyRegisteredUser(user) {
    const app = getApp()
    const nickname = cleanRegisterNickname(user && user.nickname ? user.nickname : "")
    const phone = user && user.phone ? user.phone : ""
    const role = user && user.role ? user.role : app.globalData.userRole

    app.globalData.userRole = role
    app.globalData.currentViewerId = user && user._id ? user._id : app.globalData.currentViewerId
    this.cacheProfile({
      registered: Boolean(user && user._id && nickname && user.avatarUrl),
      nickname,
      avatarUrl: user && user.avatarUrl ? user.avatarUrl : "",
      phone,
      role,
    })

    this.syncRegisterProfile()
  },
  handleOpenSection(event) {
    const { key } = event.currentTarget.dataset
    if (!key) return
    wx.navigateTo({ url: `/pages/my-list/index?type=${key}` })
  },
  handleOpenCandidate(event) {
    const { id } = event.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/candidate-detail/index?id=${id}` })
  },
  handleTabTap(event) {
    const { key } = event.currentTarget.dataset

    if (key === "mine") return

    if (key === "home") {
      wx.redirectTo({ url: "/pages/index/index" })
      return
    }

    if (key === "assistant") {
      wx.redirectTo({ url: "/pages/ask-matchmaker/index" })
      return
    }

    if (key === "manage") {
      wx.redirectTo({ url: "/pages/candidates/index" })
      return
    }

    if (key === "upload") {
      wx.navigateTo({ url: "/pages/upload-profile/index" })
    }
  },
})
