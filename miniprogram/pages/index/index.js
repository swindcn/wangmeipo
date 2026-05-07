const { bootstrapCloudDatabase, listHomeCandidates, upsertCurrentUser } = require("../../utils/api")

const fallbackProfiles = [
  {
    _id: "demo-1",
    name: "林悦",
    age: 26,
    gender: "女",
    genderIcon: "♀",
    genderClass: "female",
    tags: ["长乐", "教师"],
    imageUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=700&q=80",
  },
  {
    _id: "demo-2",
    name: "陈思",
    age: 22,
    gender: "女",
    genderIcon: "♀",
    genderClass: "female",
    tags: ["家境一般", "本科"],
    imageUrl: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=700&q=80",
  },
  {
    _id: "demo-3",
    name: "周航",
    age: 26,
    gender: "男",
    genderIcon: "♂",
    genderClass: "male",
    tags: ["长乐", "程序员"],
    imageUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=700&q=80",
  },
  {
    _id: "demo-4",
    name: "高阳",
    age: 22,
    gender: "男",
    genderIcon: "♂",
    genderClass: "male",
    tags: ["家境好", "创业"],
    imageUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=700&q=80",
  },
  {
    _id: "demo-5",
    name: "苏晴",
    age: 26,
    gender: "女",
    genderIcon: "♀",
    genderClass: "female",
    tags: ["长乐", "公务员"],
    imageUrl: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=700&q=80",
  },
  {
    _id: "demo-6",
    name: "许安",
    age: 22,
    gender: "女",
    genderIcon: "♀",
    genderClass: "female",
    tags: ["公务员", "美女"],
    imageUrl: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=700&q=80",
  },
  {
    _id: "demo-7",
    name: "叶宁",
    age: 26,
    gender: "女",
    genderIcon: "♀",
    genderClass: "female",
    tags: ["长乐", "独立"],
    imageUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=700&q=80",
  },
  {
    _id: "demo-8",
    name: "何屿",
    age: 22,
    gender: "男",
    genderIcon: "♂",
    genderClass: "male",
    tags: ["家境好", "硕士"],
    imageUrl: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=700&q=80",
  },
]

const tabItems = [
  { key: "home", label: "汇匹配", icon: "❤", className: "tab-item active" },
  { key: "manage", label: "懂管理", icon: "▦", className: "tab-item" },
  { key: "upload", label: "传资料", icon: "+", className: "tab-item tab-upload" },
  { key: "matches", label: "汇匹配", icon: "♡", className: "tab-item" },
  { key: "mine", label: "汇匹配", icon: "♥", className: "tab-item" },
]

let homeProfilesCache = null
let homeProfilesCacheAt = 0
const HOME_CACHE_TTL = 2 * 60 * 1000
const SYSTEM_NICKNAMES = ["云开发管理员"]

function cleanRegisterNickname(nickname) {
  const text = String(nickname || "").trim()
  return SYSTEM_NICKNAMES.includes(text) ? "" : text
}

function normalizeProfile(candidate, index) {
  const tags = []
  if (candidate.ancestralHome) tags.push(candidate.ancestralHome)
  if (candidate.occupation) tags.push(candidate.occupation)
  if (candidate.education && tags.length < 2) tags.push(candidate.education)

  return {
    _id: candidate._id || `candidate-${index}`,
    name: candidate.name || "未命名",
    age: candidate.age || "-",
    gender: candidate.gender || "女",
    genderIcon: candidate.gender === "男" ? "♂" : "♀",
    genderClass: candidate.gender === "男" ? "male" : "female",
    tags: tags.length > 0 ? tags.slice(0, 2) : ["待完善"],
    imageUrl: candidate.photoUrls && candidate.photoUrls[0] ? candidate.photoUrls[0] : fallbackProfiles[index % fallbackProfiles.length].imageUrl,
  }
}

Page({
  data: {
    keyword: "",
    leftProfiles: [],
    rightProfiles: [],
    tabItems,
    activeTab: "home",
    initTapCount: 0,
    hasLoadedProfiles: false,
    loadingProfiles: false,
    refresherTriggered: false,
    authModalVisible: false,
    registering: false,
    registerProfile: {
      nickname: "",
      avatarUrl: "",
      avatarPreview: "",
      phone: "",
      initial: "提",
    },
  },
  onShow() {
    this.syncRegisterProfile()
    if (!this.data.hasLoadedProfiles) {
      this.loadProfiles()
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
        initial: String(nickname || "提").slice(0, 1),
      },
    })
  },
  async loadProfiles(options = {}) {
    const now = Date.now()
    const useCache = !options.force && homeProfilesCache && now - homeProfilesCacheAt < HOME_CACHE_TTL

    if (useCache) {
      this.setWaterfall(homeProfilesCache, { fromCache: true })
      return
    }

    this.setData({ loadingProfiles: true })

    try {
      const candidates = await listHomeCandidates()
      const source = candidates.length > 0
        ? candidates.map((item, index) => normalizeProfile(item, index))
        : fallbackProfiles

      homeProfilesCache = source
      homeProfilesCacheAt = Date.now()
      this.setWaterfall(source)
    } catch (error) {
      if (!this.data.hasLoadedProfiles) {
        this.setWaterfall(fallbackProfiles)
      }
      console.error(error)
    } finally {
      this.setData({ loadingProfiles: false })
    }
  },
  async refreshHomeProfiles() {
    homeProfilesCache = null
    homeProfilesCacheAt = 0

    await this.loadProfiles({ force: true })
  },
  async onPullDownRefresh() {
    try {
      await this.refreshHomeProfiles()
    } finally {
      wx.stopPullDownRefresh()
    }
  },
  async handleScrollRefresh() {
    if (this.data.refresherTriggered) return

    this.setData({ refresherTriggered: true })
    try {
      await this.refreshHomeProfiles()
    } finally {
      this.setData({ refresherTriggered: false })
    }
  },
  setWaterfall(items, options = {}) {
    const leftProfiles = []
    const rightProfiles = []

    items.forEach((item, index) => {
      if (index % 2 === 0) {
        leftProfiles.push(item)
      } else {
        rightProfiles.push(item)
      }
    })

    this.setData({
      leftProfiles,
      rightProfiles,
      hasLoadedProfiles: true,
      loadingProfiles: options.fromCache ? this.data.loadingProfiles : false,
    })
  },
  refreshTabs(activeTab) {
    this.setData({
      activeTab,
      tabItems: tabItems.map((item) => ({
        ...item,
        className: [
          "tab-item",
          item.key === "upload" ? "tab-upload" : "",
          item.key === activeTab ? "active" : "",
        ].filter(Boolean).join(" "),
      })),
    })
  },
  handleSearchInput(event) {
    this.setData({ keyword: event.detail.value })
  },
  handleSearch() {
    const keyword = this.data.keyword.trim()
    const items = fallbackProfiles.filter((item) => {
      if (!keyword) return true
      return [item.name, String(item.age), ...item.tags].some((text) => text.includes(keyword))
    })
    this.setWaterfall(items)
  },
  async handleBrandTap() {
    const initTapCount = this.data.initTapCount + 1
    this.setData({ initTapCount })

    if (initTapCount < 5) {
      return
    }

    wx.showLoading({ title: "初始化中" })
    try {
      const result = await bootstrapCloudDatabase()
      if (!result.ok) {
        throw new Error(result.error || "bootstrap failed")
      }
      wx.showToast({ title: "已绑定管理员", icon: "success" })
      homeProfilesCache = null
      homeProfilesCacheAt = 0
      this.loadProfiles({ force: true })
    } catch (error) {
      wx.showToast({ title: "初始化失败", icon: "none" })
      console.error(error)
    } finally {
      wx.hideLoading()
      this.setData({ initTapCount: 0 })
    }
  },
  handleOpenProfile(event) {
    const { id } = event.currentTarget.dataset
    if (String(id).indexOf("demo-") === 0) {
      wx.showToast({ title: "示例资料", icon: "none" })
      return
    }

    wx.navigateTo({ url: `/pages/candidate-detail/index?id=${id}` })
  },
  handleTabTap(event) {
    const { key } = event.currentTarget.dataset

    if (key === "upload") {
      this.handleUploadEntry()
      return
    }

    if (key === "manage") {
      wx.navigateTo({ url: "/pages/candidates/index" })
      return
    }

    if (key === "matches") {
      wx.navigateTo({ url: "/pages/match-records/index" })
      return
    }

    if (key === "mine") {
      wx.navigateTo({ url: "/pages/my-access/index" })
      return
    }

    this.refreshTabs(key)
  },
  hasCompletedRegister() {
    const app = getApp()
    const profile = app.globalData.currentUserProfile || {}
    return Boolean(cleanRegisterNickname(profile.nickname) && profile.avatarUrl)
  },
  async handleUploadEntry() {
    const app = getApp()
    if (app.refreshCurrentUser) {
      await app.refreshCurrentUser()
    }

    if (this.hasCompletedRegister()) {
      wx.navigateTo({ url: "/pages/upload-profile/index" })
      return
    }

    this.syncRegisterProfile()
    this.setData({ authModalVisible: true })
  },
  closeAuthModal() {
    if (this.data.registering) return
    this.setData({ authModalVisible: false })
  },
  stopAuthModalTap() {},
  getImageExtension(filePath) {
    const matched = String(filePath || "").match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
    return matched ? matched[1].toLowerCase() : "jpg"
  },
  async handleRegisterAvatar(event) {
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
  handleRegisterNickname(event) {
    const nickname = cleanRegisterNickname(event.detail.value)
    this.setData({
      "registerProfile.nickname": nickname,
      "registerProfile.initial": String(nickname || "提").slice(0, 1),
    })
  },
  handleRegisterPhoneInput(event) {
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
    wx.showLoading({ title: "注册中" })

    try {
      const result = await upsertCurrentUser({
        profile,
        phoneCode: options.phoneCode || "",
      })

      if (!result.ok) {
        throw new Error(result.error || "register failed")
      }

      this.applyRegisteredUser(result.user)
      this.setData({ authModalVisible: false })
      wx.navigateTo({ url: "/pages/upload-profile/index" })
    } catch (error) {
      wx.showToast({ title: "注册失败", icon: "none" })
      console.error(error)
    } finally {
      wx.hideLoading()
      this.setData({ registering: false })
    }
  },
  async handleRegisterPhone(event) {
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

    app.globalData.userRole = user && user.role ? user.role : app.globalData.userRole
    app.globalData.currentViewerId = user && user._id ? user._id : app.globalData.currentViewerId
    app.globalData.currentUserProfile = {
      nickname,
      avatarUrl: user && user.avatarUrl ? user.avatarUrl : "",
      phone: user && user.phone ? user.phone : "",
    }

    this.setData({
      registerProfile: {
        nickname,
        avatarUrl: app.globalData.currentUserProfile.avatarUrl,
        avatarPreview: app.globalData.currentUserProfile.avatarUrl,
        phone: app.globalData.currentUserProfile.phone,
        initial: String(nickname || "提").slice(0, 1),
      },
    })
  },
})
