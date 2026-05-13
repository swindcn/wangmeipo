const { listMyAccess } = require("../../utils/api")

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
  const accountLoggedIn = Boolean(wx.getStorageSync("accountLoggedIn"))
  const accountLoggedOut = Boolean(wx.getStorageSync("accountLoggedOut"))
  const nickname = cleanRegisterNickname(profile.nickname)
  const phone = String(profile.phone || "").trim()
  const role = profile.role || getApp().globalData.userRole || "viewer"
  const hasUserProfile = Boolean(profile.registered || profile.loggedIn || profile._id || phone || nickname || profile.avatarUrl)
  const cloudRecognizedUser = Boolean(profile.registered || profile._id || phone || profile.role === "super_admin" || profile.role === "manager")
  const loggedIn = Boolean(!accountLoggedOut && hasUserProfile && (accountLoggedIn || cloudRecognizedUser))

  return {
    registered: loggedIn,
    nickname: loggedIn ? (nickname || "用户") : "游客123456",
    avatarUrl: profile.avatarUrl || "",
    role,
    roleText: profile.roleText || getRoleText(role),
    phone,
    phoneText: profile.phoneText || (phone ? maskPhone(phone) : "未授权"),
    hasPassword: Boolean(profile.hasPassword),
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
      if (result.profile && result.profile.registered) {
        wx.removeStorageSync("accountLoggedOut")
        wx.setStorageSync("accountLoggedIn", true)
      }
      const profile = buildCachedProfile(result.profile || this.data.profile)
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

    const profileSource = globalProfile.registered || globalProfile.nickname || globalProfile.avatarUrl || cachedProfile.registered
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
    if (profile && profile.registered && !wx.getStorageSync("accountLoggedOut")) {
      try {
        wx.setStorageSync("accountLoggedIn", true)
      } catch (error) {
        console.error("缓存登录态失败", error)
      }
    }
    const normalizedProfile = buildCachedProfile(profile)

    app.globalData.userRole = normalizedProfile.role || app.globalData.userRole
    app.globalData.currentUserProfile = normalizedProfile

    try {
      wx.setStorageSync("currentUserProfile", normalizedProfile)
    } catch (error) {
      console.error("缓存用户资料失败", error)
    }
  },
  handleLoginTap() {
    wx.navigateTo({ url: "/pages/login/index" })
  },
  handleSettingsTap() {
    if (!this.data.profile.registered) {
      this.handleLoginTap()
      return
    }
    wx.navigateTo({ url: "/pages/profile-settings/index" })
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
