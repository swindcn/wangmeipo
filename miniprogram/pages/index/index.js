const {
  bootstrapCloudDatabase,
  listHomeCandidates,
} = require("../../utils/api")

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
  { key: "home", label: "汇匹配", iconUrl: "../../assets/icons/tab-home.png", activeIconUrl: "../../assets/icons/tab-home-active.png", currentIconUrl: "../../assets/icons/tab-home-active.png", className: "tab-item active" },
  { key: "assistant", label: "问美媒", iconUrl: "../../assets/icons/tab-assistant.png", activeIconUrl: "../../assets/icons/tab-assistant-active.png", currentIconUrl: "../../assets/icons/tab-assistant.png", className: "tab-item" },
  { key: "upload", label: "传资料", iconUrl: "../../assets/icons/tab-upload.png", activeIconUrl: "../../assets/icons/tab-upload.png", currentIconUrl: "../../assets/icons/tab-upload.png", className: "tab-item tab-upload" },
  { key: "manage", label: "懂管理", iconUrl: "../../assets/icons/tab-manage.png", activeIconUrl: "../../assets/icons/tab-manage-active.png", currentIconUrl: "../../assets/icons/tab-manage.png", className: "tab-item" },
  { key: "mine", label: "我的", iconUrl: "../../assets/icons/tab-mine.png", activeIconUrl: "../../assets/icons/tab-mine-active.png", currentIconUrl: "../../assets/icons/tab-mine.png", className: "tab-item" },
]

let homeProfilesCache = null
let homeProfilesCacheAt = 0
const HOME_CACHE_TTL = 2 * 60 * 1000
const HOME_PAGE_SIZE = 12
const SYSTEM_NICKNAMES = ["云开发管理员"]
const QUICK_FILTERS = [
  { key: "male", label: "男生" },
  { key: "female", label: "女生" },
  { key: "fuzhou", label: "福州" },
  { key: "changle", label: "长乐" },
  { key: "stableJob", label: "工作稳定" },
]

function cleanRegisterNickname(nickname) {
  const text = String(nickname || "").trim()
  return SYSTEM_NICKNAMES.includes(text) ? "" : text
}

function formatHitReasonTag(reason) {
  const text = String(reason || "")
  const parts = text.split("命中：")
  if (parts.length < 2) {
    return text
  }

  const fieldName = parts[0]
  const matchedText = parts.slice(1).join("命中：")
  if (fieldName === "标签") {
    return matchedText
  }

  return `${fieldName} ${matchedText}`
}

function buildQuickFilterItems(activeKeys = []) {
  const activeMap = activeKeys.reduce((result, key) => {
    result[key] = true
    return result
  }, {})

  return QUICK_FILTERS.map((item) => ({
    ...item,
    active: Boolean(activeMap[item.key]),
    className: `quick-filter-chip${activeMap[item.key] ? " active" : ""}`,
  }))
}

function normalizeProfile(candidate, index) {
  const tags = []
  const gender = candidate.gender === "男" || candidate.gender === "女" ? candidate.gender : "未知"
  if (candidate.ancestralHome) tags.push(candidate.ancestralHome)
  if (candidate.occupation) tags.push(candidate.occupation)
  if (candidate.education && tags.length < 2) tags.push(candidate.education)
  if (Array.isArray(candidate.hitReasons) && candidate.hitReasons.length > 0) {
    tags.unshift(formatHitReasonTag(candidate.hitReasons[0]))
  }

  return {
    _id: candidate._id || `candidate-${index}`,
    name: candidate.name || "未命名",
    age: candidate.age || "-",
    zodiac: candidate.zodiac || "",
    gender,
    genderIcon: gender === "男" ? "♂" : (gender === "女" ? "♀" : "未知"),
    genderClass: gender === "男" ? "male" : (gender === "女" ? "female" : "unknown"),
    tags: tags.length > 0 ? tags.slice(0, 2) : ["待完善"],
    canViewPhotos: Boolean(candidate.canViewPhotos),
    isPrivateLocked: !candidate.canViewPhotos,
    imageUrl: candidate.thumbnailUrls && candidate.thumbnailUrls[0]
      ? candidate.thumbnailUrls[0]
      : (candidate.photoUrls && candidate.photoUrls[0] ? candidate.photoUrls[0] : fallbackProfiles[index % fallbackProfiles.length].imageUrl),
  }
}

Page({
  data: {
    keyword: "",
    leftProfiles: [],
    rightProfiles: [],
    profileOrder: [],
    tabItems,
    activeTab: "home",
    initTapCount: 0,
    hasLoadedProfiles: false,
    loadingProfiles: false,
    loadingMore: false,
    hasMoreProfiles: true,
    pageOffset: 0,
    searchMode: false,
    activeQuickFilters: [],
    quickFilterItems: buildQuickFilterItems(),
    refresherTriggered: false,
    headerTopGap: 88,
    profileScrollHeight: 520,
  },
  onLoad() {
    this.initHeaderMetrics()
  },
  onShow() {
    this.applyPendingDeletedCandidates()
    const app = getApp()
    if (app.globalData.homeProfilesDirty) {
      app.globalData.homeProfilesDirty = false
      this.refreshHomeProfiles()
      return
    }

    if (!this.data.hasLoadedProfiles) {
      this.loadProfiles()
    }
  },
  applyPendingDeletedCandidates() {
    const app = getApp()
    const deletedCandidateIds = app.globalData.deletedCandidateIds || []
    if (deletedCandidateIds.length === 0) {
      return
    }

    const deletedIdSet = deletedCandidateIds.reduce((result, id) => {
      result[String(id)] = true
      return result
    }, {})
    const currentItems = this.data.profileOrder.length > 0
      ? this.data.profileOrder
      : this.data.leftProfiles.concat(this.data.rightProfiles)
    const visibleItems = currentItems.filter((item) => !deletedIdSet[String(item._id)])

    if (homeProfilesCache) {
      homeProfilesCache = homeProfilesCache.filter((item) => !deletedIdSet[String(item._id)])
      homeProfilesCacheAt = Date.now()
    }

    app.globalData.deletedCandidateIds = []

    if (currentItems.length !== visibleItems.length) {
      this.setWaterfall(visibleItems, { fromCache: true })
    }
  },
  initHeaderMetrics() {
    const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const windowWidth = windowInfo.windowWidth || 375
    const rpxToPx = (rpx) => rpx * windowWidth / 750
    const pxToRpx = (px) => px * 750 / windowWidth
    let topGapPx

    if (!menuButton || !menuButton.bottom) {
      topGapPx = (windowInfo.statusBarHeight || 20) + 44
    } else {
      const bottomGapPx = 8
      topGapPx = menuButton.bottom + bottomGapPx
    }

    const headerHeightPx = 0
    const searchHeightPx = rpxToPx(162)
    const bottomTabsHeightPx = rpxToPx(118)
    const profileScrollHeight = Math.max(
      320,
      Math.floor((windowInfo.windowHeight || 667) - topGapPx - headerHeightPx - searchHeightPx - bottomTabsHeightPx),
    )

    this.setData({
      headerTopGap: Math.ceil(pxToRpx(topGapPx)),
      profileScrollHeight,
    })
  },
  async loadProfiles(options = {}) {
    const now = Date.now()
    const keyword = String(this.data.keyword || "").trim()
    const quickFilters = this.data.activeQuickFilters || []
    const isFiltered = Boolean(keyword || quickFilters.length)
    const useCache = !isFiltered && !options.force && homeProfilesCache && now - homeProfilesCacheAt < HOME_CACHE_TTL

    if (useCache) {
      this.setWaterfall(homeProfilesCache, { fromCache: true })
      return
    }

    this.setData({ loadingProfiles: true })

    try {
      const candidates = await listHomeCandidates({
        keyword,
        quickFilters,
        limit: HOME_PAGE_SIZE,
        skip: 0,
      })
      const source = candidates.length > 0 || isFiltered
        ? candidates.map((item, index) => normalizeProfile(item, index))
        : fallbackProfiles

      if (!isFiltered) {
        homeProfilesCache = source
        homeProfilesCacheAt = Date.now()
      }
      this.setWaterfall(source)
      this.setData({
        pageOffset: candidates.length,
        hasMoreProfiles: candidates.length >= HOME_PAGE_SIZE,
        searchMode: isFiltered,
      })
      return { count: source.length, isFiltered }
    } catch (error) {
      if (!this.data.hasLoadedProfiles) {
        this.setWaterfall(fallbackProfiles)
      }
      console.error(error)
      return { count: 0, isFiltered }
    } finally {
      this.setData({ loadingProfiles: false })
    }
  },
  async refreshHomeProfiles() {
    homeProfilesCache = null
    homeProfilesCacheAt = 0

    await this.loadProfiles({ force: true })
  },
  async handleLoadMore() {
    if (this.data.loadingProfiles || this.data.loadingMore || !this.data.hasMoreProfiles) {
      return
    }

    this.setData({ loadingMore: true })
    try {
      const keyword = String(this.data.keyword || "").trim()
      const quickFilters = this.data.activeQuickFilters || []
      const candidates = await listHomeCandidates({
        keyword,
        quickFilters,
        limit: HOME_PAGE_SIZE,
        skip: this.data.pageOffset,
      })
      const currentItems = this.data.profileOrder || []
      const nextItems = candidates.map((item, index) => normalizeProfile(item, this.data.pageOffset + index))
      const mergedItems = currentItems.concat(nextItems)

      if (!keyword && quickFilters.length === 0) {
        homeProfilesCache = mergedItems
        homeProfilesCacheAt = Date.now()
      }
      this.setWaterfall(mergedItems)
      this.setData({
        pageOffset: this.data.pageOffset + candidates.length,
        hasMoreProfiles: candidates.length >= HOME_PAGE_SIZE,
      })
    } catch (error) {
      wx.showToast({ title: "加载失败", icon: "none" })
      console.error(error)
    } finally {
      this.setData({ loadingMore: false })
    }
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
      profileOrder: items,
      hasLoadedProfiles: true,
      loadingProfiles: options.fromCache ? this.data.loadingProfiles : false,
    })
  },
  refreshTabs(activeTab) {
    this.setData({
      activeTab,
      tabItems: tabItems.map((item) => ({
        ...item,
        currentIconUrl: item.key === activeTab ? item.activeIconUrl : item.iconUrl,
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
  async handleSearch() {
    try {
      const result = await this.loadProfiles({ force: true })
      if (result && result.isFiltered && result.count === 0) {
        wx.showToast({ title: "未找到匹配会员", icon: "none" })
      }
    } catch (error) {
      wx.showToast({ title: "搜索失败", icon: "none" })
      console.error(error)
    }
  },
  handleQuickFilterTap(event) {
    const { key } = event.currentTarget.dataset
    const activeQuickFilters = this.data.activeQuickFilters || []
    const nextFilters = activeQuickFilters.includes(key)
      ? activeQuickFilters.filter((item) => item !== key)
      : activeQuickFilters.concat(key)

    this.setData({
      activeQuickFilters: nextFilters,
      quickFilterItems: buildQuickFilterItems(nextFilters),
    })
    this.loadProfiles({ force: true })
  },
  handleClearQuickFilters() {
    this.setData({
      activeQuickFilters: [],
      quickFilterItems: buildQuickFilterItems(),
    })
    this.loadProfiles({ force: true })
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
      wx.redirectTo({ url: "/pages/candidates/index" })
      return
    }

    if (key === "assistant") {
      wx.redirectTo({ url: "/pages/ask-matchmaker/index" })
      return
    }

    if (key === "mine") {
      wx.redirectTo({ url: "/pages/my-access/index" })
      return
    }

    this.refreshTabs(key)
  },
  hasCompletedRegister() {
    const app = getApp()
    const profile = app.globalData.currentUserProfile || {}
    return Boolean((profile.registered || profile.phone) && cleanRegisterNickname(profile.nickname))
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

    wx.navigateTo({ url: "/pages/login/index?redirect=upload" })
  },
})
