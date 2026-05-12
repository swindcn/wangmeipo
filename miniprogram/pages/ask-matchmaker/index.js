const {
  askMatchmaker,
  loadAskMatchmakerChat,
  saveAskMatchmakerChat,
  searchHomeCandidates,
  upsertCurrentUser,
} = require("../../utils/api")

const tabItems = [
  { key: "home", label: "汇匹配", currentIconUrl: "../../assets/icons/tab-home.png", className: "tab-item" },
  { key: "assistant", label: "问美媒", currentIconUrl: "../../assets/icons/tab-assistant-active.png", className: "tab-item active" },
  { key: "upload", label: "传资料", currentIconUrl: "../../assets/icons/tab-upload.png", className: "tab-item tab-upload" },
  { key: "manage", label: "懂管理", currentIconUrl: "../../assets/icons/tab-manage.png", className: "tab-item" },
  { key: "mine", label: "我的", currentIconUrl: "../../assets/icons/tab-mine.png", className: "tab-item" },
]

const SYSTEM_NICKNAMES = ["云开发管理员"]
const CHAT_CACHE_KEY = "askMatchmakerChat"

function cleanRegisterNickname(nickname) {
  const text = String(nickname || "").trim()
  return SYSTEM_NICKNAMES.includes(text) ? "" : text
}

function normalizeCandidate(candidate) {
  const tags = []
  if (candidate.ancestralHome) tags.push(candidate.ancestralHome)
  if (candidate.occupation) tags.push(candidate.occupation)
  if (candidate.education) tags.push(candidate.education)
  if (Array.isArray(candidate.tags)) tags.push(...candidate.tags)

  return {
    _id: candidate._id,
    title: `${candidate.gender || "会员"} ${candidate.age || "-"}岁`,
    code: candidate.candidateCode || "",
    summary: [candidate.ancestralHome, candidate.occupation, candidate.education].filter(Boolean).join(" · ") || "资料待完善",
    tags: Array.from(new Set(tags.filter(Boolean))).slice(0, 3),
    photoUrl: candidate.photoUrls && candidate.photoUrls[0] ? candidate.photoUrls[0] : "",
    locked: !candidate.canViewPhotos,
  }
}

function uniqueCandidates(items) {
  const seen = {}
  return items.filter((item) => {
    if (!item || !item._id || seen[item._id]) return false
    seen[item._id] = true
    return true
  })
}

function buildDefaultMessages() {
  return [
    {
      role: "assistant",
      text: "告诉我你的相亲需求，例如：长乐、25-30岁、教师或体制内、女生。我会先帮你找出可能合适的会员。",
    },
  ]
}

Page({
  data: {
    tabItems,
    question: "",
    pendingQuestion: "",
    loading: false,
    inputFocused: false,
    authModalVisible: false,
    registering: false,
    registerProfile: {
      nickname: "",
      avatarUrl: "",
      avatarPreview: "",
      phone: "",
      initial: "问",
    },
    messages: buildDefaultMessages(),
    candidates: [],
  },
  onLoad() {
    this.restoreChatState()
    this.loadRemoteChatState()
  },
  onShow() {
    this.syncRegisterProfile()
  },
  restoreChatState() {
    try {
      const cached = wx.getStorageSync(CHAT_CACHE_KEY)
      if (!cached) return

      this.setData({
        messages: Array.isArray(cached.messages) && cached.messages.length > 0 ? cached.messages : buildDefaultMessages(),
        candidates: Array.isArray(cached.candidates) ? cached.candidates : [],
      })
    } catch (error) {
      console.error(error)
    }
  },
  async loadRemoteChatState() {
    try {
      const app = getApp()
      if (app.refreshCurrentUser) {
        await app.refreshCurrentUser()
      }

      if (!this.hasCompletedRegister()) {
        return
      }

      const result = await loadAskMatchmakerChat()
      const messages = Array.isArray(result.messages) && result.messages.length > 0
        ? result.messages
        : null
      const candidates = Array.isArray(result.candidates) ? result.candidates : []

      if (!messages) {
        return
      }

      this.setData({ messages, candidates })
      this.persistChatState({ messages, candidates }, { remote: false })
    } catch (error) {
      console.error(error)
    }
  },
  persistChatState(nextState = {}, options = {}) {
    const messages = nextState.messages || this.data.messages
    const candidates = nextState.candidates || this.data.candidates

    try {
      wx.setStorageSync(CHAT_CACHE_KEY, {
        messages,
        candidates,
        updatedAt: Date.now(),
      })
    } catch (error) {
      console.error(error)
    }

    if (options.remote === false || !this.hasCompletedRegister()) {
      return
    }

    saveAskMatchmakerChat({ messages, candidates }).catch((error) => {
      console.error(error)
    })
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
        initial: String(nickname || "问").slice(0, 1),
      },
    })
  },
  hasCompletedRegister() {
    const app = getApp()
    const profile = app.globalData.currentUserProfile || {}
    return Boolean(cleanRegisterNickname(profile.nickname) && profile.avatarUrl)
  },
  handleQuestionInput(event) {
    this.setData({ question: event.detail.value })
  },
  handleInputFocus() {
    this.setData({ inputFocused: true })
  },
  handleInputBlur() {
    this.setData({ inputFocused: false })
  },
  async handleAsk() {
    const question = this.data.question.trim()
    if (!question) {
      wx.showToast({ title: "请输入相亲需求", icon: "none" })
      return
    }

    const app = getApp()
    if (app.refreshCurrentUser) {
      await app.refreshCurrentUser()
    }

    if (!this.hasCompletedRegister()) {
      this.syncRegisterProfile()
      this.setData({
        pendingQuestion: question,
        authModalVisible: true,
      })
      return
    }

    this.runAsk(question)
  },
  async runAsk(question) {
    const matchingMessage = {
      role: "assistant",
      text: "匹配中...",
      pending: true,
    }
    const nextMessages = this.data.messages.concat(
      { role: "user", text: question },
      matchingMessage,
    )

    this.setData({
      loading: true,
      messages: nextMessages,
      question: "",
      candidates: [],
    })
    this.persistChatState({ messages: nextMessages, candidates: [] })

    try {
      const parsed = await askMatchmaker({ question })
      const searchKeyword = parsed.keyword || question
      let candidates = await searchHomeCandidates(searchKeyword)
      const relaxedKeyword = parsed.relaxedKeyword || ""

      if (relaxedKeyword && relaxedKeyword !== searchKeyword && candidates.length < 6) {
        const relaxedCandidates = await searchHomeCandidates(relaxedKeyword)
        candidates = uniqueCandidates(candidates.concat(relaxedCandidates))
      }

      const normalizedCandidates = candidates.map(normalizeCandidate)
      const reply = normalizedCandidates.length > 0
        ? `${parsed.reply || `我先按“${searchKeyword}”帮你筛选。`} 找到 ${normalizedCandidates.length} 位可能匹配的会员。无法查看关键资料的会员，可以进入详情后点“想看”。`
        : `${parsed.reply || `我先按“${searchKeyword}”帮你筛选。`} 暂时没有找到明显匹配的会员。你可以放宽年龄、地区或职业条件再试。`
      const finalMessages = nextMessages.slice(0, -1).concat({ role: "assistant", text: reply })

      this.setData({
        messages: finalMessages,
        candidates: normalizedCandidates,
      })
      this.persistChatState({ messages: finalMessages, candidates: normalizedCandidates })
    } catch (error) {
      const finalMessages = nextMessages.slice(0, -1).concat({ role: "assistant", text: "这次匹配失败了，请稍后再试。" })
      this.setData({ messages: finalMessages })
      this.persistChatState({ messages: finalMessages, candidates: [] })
      wx.showToast({ title: "查询失败", icon: "none" })
      console.error(error)
    } finally {
      this.setData({ loading: false })
    }
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
      "registerProfile.initial": String(nickname || "问").slice(0, 1),
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
      const pendingQuestion = this.data.pendingQuestion
      this.setData({
        authModalVisible: false,
        pendingQuestion: "",
      })
      if (pendingQuestion) {
        await this.runAsk(pendingQuestion)
      }
    } catch (error) {
      wx.showToast({ title: "注册失败", icon: "none" })
      console.error(error)
    } finally {
      wx.hideLoading()
      this.setData({ registering: false })
    }
  },
  handleRegisterPhone(event) {
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

    this.syncRegisterProfile()
  },
  handleOpenCandidate(event) {
    const { id } = event.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/candidate-detail/index?id=${id}` })
  },
  handleTabTap(event) {
    const { key } = event.currentTarget.dataset

    if (key === "assistant") {
      return
    }

    if (key === "home") {
      wx.redirectTo({ url: "/pages/index/index" })
      return
    }

    if (key === "upload") {
      wx.navigateTo({ url: "/pages/upload-profile/index" })
      return
    }

    if (key === "manage") {
      wx.redirectTo({ url: "/pages/candidates/index" })
      return
    }

    if (key === "mine") {
      wx.redirectTo({ url: "/pages/my-access/index" })
    }
  },
})
