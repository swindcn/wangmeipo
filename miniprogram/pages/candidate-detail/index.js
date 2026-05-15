const {
  createShareToken,
  getCandidateDetail,
  manageViewRequests,
  reviewCandidate,
  setCandidateSubscription,
} = require("../../utils/api")

const SYSTEM_NICKNAMES = ["云开发管理员"]

function cleanRegisterNickname(nickname) {
  const text = String(nickname || "").trim()
  return SYSTEM_NICKNAMES.includes(text) ? "" : text
}

function getCandidatePhotoSources(candidate = {}) {
  const urls = Array.isArray(candidate.photoUrls) ? candidate.photoUrls.filter(Boolean) : []
  const assetIds = Array.isArray(candidate.photoAssetIds) ? candidate.photoAssetIds.filter(Boolean) : []
  return urls.length > 0 ? urls : assetIds
}

function getCandidateReadablePhotoSources(candidate = {}) {
  return Array.isArray(candidate.photoUrls) ? candidate.photoUrls.filter(Boolean) : []
}

Page({
  data: {
    candidate: null,
    loading: false,
    shareToken: "",
    sharePath: "",
    shareModeText: "",
    publicSharePath: "",
    privateSharePath: "",
    pendingShareMode: "",
    activeShareToken: "",
    shareCardImageUrl: "",
    shareCardReady: false,
    posterGenerating: false,
    currentPhotoIndex: 0,
    suppressNextShowRefresh: false,
    navBarTop: 0,
    navBarHeight: 32,
    navBarRight: 128,
    source: "",
    requestId: "",
    todayDate: "",
  },
  onLoad(query) {
    const shareToken = query.shareToken || ""

    this.initNavigationMetrics()
    this.setData({
      activeShareToken: shareToken,
      source: query.source || "",
      requestId: query.requestId || "",
      todayDate: this.formatDateInput(new Date()),
    })
    wx.setNavigationBarTitle({ title: "会员详情" })
    this.loadDetail(query.id || getApp().globalData.currentCandidateId, shareToken, query.source || "")
  },
  initNavigationMetrics() {
    const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()

    if (!menuButton || !menuButton.top) {
      this.setData({
        navBarTop: (windowInfo.statusBarHeight || 20) + 4,
        navBarHeight: 32,
        navBarRight: 128,
      })
      return
    }

    this.setData({
      navBarTop: menuButton.top,
      navBarHeight: menuButton.height,
      navBarRight: (windowInfo.windowWidth || 375) - menuButton.left + 8,
    })
  },
  onShow() {
    if (this.data.suppressNextShowRefresh) {
      this.setData({ suppressNextShowRefresh: false })
      return
    }

    if (this.data.candidate && this.data.candidate._id) {
      this.loadDetail(this.data.candidate._id, this.data.activeShareToken, this.data.source)
    }
  },
  async loadDetail(id, shareToken, source) {
    if (!id) {
      return
    }

    this.setData({ loading: true })

    try {
      const candidate = await getCandidateDetail(id, { shareToken, source })
      if (candidate) {
        candidate.hobbies = Array.isArray(candidate.hobbies) ? candidate.hobbies : []
        candidate.tags = Array.isArray(candidate.tags) ? candidate.tags : []
        candidate.canViewPhotos = Boolean(candidate.canViewPhotos)
        candidate.canViewName = Boolean(candidate.canViewName)
        candidate.canViewPhone = Boolean(candidate.canViewPhone)
        candidate.canUseKeyActions = Boolean(candidate.canUseKeyActions)
        candidate.isPrivateLocked = !candidate.canViewPhotos
        candidate.hasKeyDataAccess = Boolean(candidate.canViewPhotos && candidate.canViewName && candidate.canViewPhone)
        candidate.viewRequestButtonText = candidate.myViewRequestStatus === "pending" ? "待审核" : "想看"
        candidate.viewRequestPending = candidate.myViewRequestStatus === "pending"
        candidate.isTrashMode = source === "trash" || candidate.fromTrash
        candidate.isSubscribed = this.isSubscriptionActive(candidate.subscriptionExpiresAt)
        candidate.subscriptionExpiresText = this.formatDisplayDate(candidate.subscriptionExpiresAt)
        const displayPhotoSources = getCandidatePhotoSources(candidate)
        if (displayPhotoSources.length > 0) {
          candidate.displayPhotos = displayPhotoSources.map((item) => ({
            type: "url",
            value: item,
          }))
        } else if (candidate.photoSlots && candidate.photoSlots.length > 0) {
          candidate.displayPhotos = candidate.photoSlots.map((item) => ({
            type: "slot",
            value: item,
          }))
        } else {
          candidate.displayPhotos = []
        }
      }
      this.setData({
        candidate: candidate || null,
        currentPhotoIndex: 0,
        shareCardImageUrl: "",
        shareCardReady: false,
      })
      if (candidate) {
        this.prepareShareCardImage(candidate)
      }
      if (candidate && source !== "trash") {
        this.preparePrivateSharePath(candidate._id)
      }
      if (candidate && candidate.canUseKeyActions && source !== "trash") {
        this.prepareSharePaths(candidate._id)
      }
    } catch (error) {
      wx.showToast({ title: "详情加载失败", icon: "none" })
      console.error(error)
    } finally {
      this.setData({ loading: false })
    }
  },
  hasCompletedRegister() {
    const app = getApp()
    const profile = app.globalData.currentUserProfile || {}
    return Boolean(cleanRegisterNickname(profile.nickname) && profile.avatarUrl)
  },
  async handleViewRequest() {
    const candidate = this.data.candidate || {}
    if (!candidate._id || candidate.viewRequestPending || candidate.hasKeyDataAccess) {
      return
    }

    const app = getApp()
    if (app.refreshCurrentUser) {
      await app.refreshCurrentUser()
    }

    if (!this.hasCompletedRegister()) {
      wx.navigateTo({ url: "/pages/login/index" })
      return
    }

    this.submitViewRequest()
  },
  async submitViewRequest() {
    const candidateId = this.data.candidate && this.data.candidate._id
    if (!candidateId) return

    wx.showLoading({ title: "提交中" })
    try {
      const result = await manageViewRequests({
        action: "submitRequest",
        candidateId,
      })

      if (!result.ok) {
        throw new Error(result.error || "request failed")
      }

      this.setData({
        "candidate.myViewRequestStatus": "pending",
        "candidate.viewRequestButtonText": "待审核",
        "candidate.viewRequestPending": true,
      })
      wx.showToast({ title: "已提交申请", icon: "success" })
    } catch (error) {
      wx.showToast({ title: "申请失败", icon: "none" })
      console.error(error)
    } finally {
      wx.hideLoading()
    }
  },
  async handleReviewViewRequest(event) {
    const requestId = this.data.requestId
    const reviewAction = event.currentTarget.dataset.action
    if (!requestId || !this.canUseKeyActions()) {
      return
    }

    wx.showLoading({ title: reviewAction === "approve" ? "同意中" : "拒绝中" })
    try {
      const result = await manageViewRequests({
        action: "reviewRequest",
        requestId,
        reviewAction,
      })

      if (!result.ok) {
        throw new Error(result.error || "review request failed")
      }

      wx.showToast({ title: reviewAction === "approve" ? "已同意" : "已拒绝", icon: "success" })
      setTimeout(() => {
        wx.navigateBack()
      }, 500)
    } catch (error) {
      wx.showToast({ title: "处理失败", icon: "none" })
      console.error(error)
    } finally {
      wx.hideLoading()
    }
  },
  async handleApprove() {
    const candidateId = this.data.candidate && this.data.candidate._id
    if (!candidateId) {
      return
    }

    try {
      await reviewCandidate(candidateId)
      wx.showToast({ title: "已发布", icon: "success" })
      this.loadDetail(candidateId, this.data.activeShareToken)
    } catch (error) {
      wx.showToast({ title: "发布失败", icon: "none" })
      console.error(error)
    }
  },
  async createShare(mode) {
    const candidateId = this.data.candidate && this.data.candidate._id
    if (!candidateId || (mode === "public" && !this.canUseKeyActions())) {
      return
    }

    try {
      const isPublic = mode === "public"
      const result = await createShareToken({
        candidateId,
        permissionLevel: isPublic ? "public_full" : "text_only",
        maxUseCount: 0,
      })

      this.setData({
        shareToken: result.token || "",
        sharePath: result.sharePath || "",
        shareModeText: isPublic ? "公开分享" : "私密分享",
        [isPublic ? "publicSharePath" : "privateSharePath"]: result.sharePath || "",
      })
      return result
    } catch (error) {
      wx.showToast({ title: "生成失败", icon: "none" })
      console.error(error)
      return null
    }
  },
  async prepareSharePaths(candidateId) {
    if (!candidateId || this.data.publicSharePath) {
      return
    }

    await this.createShare("public")
    this.setData({
      shareToken: "",
      sharePath: "",
      shareModeText: "",
    })
  },
  preparePrivateSharePath(candidateId) {
    if (!candidateId || this.data.privateSharePath) {
      return
    }

    this.setData({
      privateSharePath: `/pages/candidate-detail/index?id=${candidateId}`,
    })
  },
  handlePublicShareTap(event) {
    const mode = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset.mode || "public"
      : "public"
    this.setData({
      pendingShareMode: mode,
      shareModeText: "公开分享",
      sharePath: this.data.publicSharePath,
    })
  },
  handlePrivateShareTap(event) {
    const mode = event && event.currentTarget && event.currentTarget.dataset
      ? event.currentTarget.dataset.mode || "private"
      : "private"
    this.setData({
      pendingShareMode: mode,
      shareModeText: "私密分享",
      sharePath: this.data.privateSharePath,
    })
  },
  handlePhotoChange(event) {
    this.setData({ currentPhotoIndex: event.detail.current || 0 })
  },
  handlePreviewPhoto() {
    const candidate = this.data.candidate || {}
    const photos = getCandidateReadablePhotoSources(candidate)
    if (!candidate.canViewPhotos || photos.length === 0) {
      return
    }

    this.setData({ suppressNextShowRefresh: true })
    wx.previewImage({
      current: photos[this.data.currentPhotoIndex] || photos[0],
      urls: photos,
    })
  },
  handleGoMatch() {
    wx.navigateTo({ url: "/pages/match-records/index" })
  },
  getPosterText(candidate) {
    const basics = [
      candidate.age ? `${candidate.age}岁` : "",
      candidate.gender || "",
      candidate.heightCm ? `${candidate.heightCm}cm` : "",
      candidate.education || "",
      candidate.occupation || "",
    ].filter(Boolean)
    const tags = Array.isArray(candidate.tags) ? candidate.tags.slice(0, 4) : []
    const requirements = String(candidate.matchRequirements || "").replace(/\s+/g, " ").slice(0, 42)

    return {
      title: candidate.canViewName && candidate.name ? candidate.name : "会员资料",
      code: candidate.candidateCode || "",
      basics: basics.join(" · ") || "资料待完善",
      tags,
      personality: candidate.personality || "性格资料待完善",
      requirements: requirements || "择偶要求待完善",
    }
  },
  wrapPosterText(ctx, text, maxWidth, maxLines) {
    const chars = String(text || "").split("")
    const lines = []
    let line = ""

    chars.forEach((char) => {
      const testLine = line + char
      if (ctx.measureText(testLine).width > maxWidth && line) {
        lines.push(line)
        line = char
      } else {
        line = testLine
      }
    })

    if (line) lines.push(line)
    return lines.slice(0, maxLines)
  },
  drawRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + width, y, x + width, y + height, r)
    ctx.arcTo(x + width, y + height, x, y + height, r)
    ctx.arcTo(x, y + height, x, y, r)
    ctx.arcTo(x, y, x + width, y, r)
    ctx.closePath()
  },
  async getPosterImagePath(candidate) {
    const photos = getCandidateReadablePhotoSources(candidate)
    if (!candidate.canViewPhotos || !photos.length) {
      return ""
    }

    try {
      const result = await wx.getImageInfo({ src: photos[this.data.currentPhotoIndex] || photos[0] })
      return {
        path: result.path || "",
        width: result.width || 0,
        height: result.height || 0,
      }
    } catch (error) {
      console.error("海报照片读取失败", error)
      return null
    }
  },
  drawCoverImage(ctx, image, imageInfo, x, y, width, height) {
    const sourceWidth = imageInfo && imageInfo.width ? imageInfo.width : image.width
    const sourceHeight = imageInfo && imageInfo.height ? imageInfo.height : image.height
    const sourceRatio = sourceWidth / sourceHeight
    const targetRatio = width / height
    let sourceX = 0
    let sourceY = 0
    let cropWidth = sourceWidth
    let cropHeight = sourceHeight

    if (sourceRatio > targetRatio) {
      cropWidth = sourceHeight * targetRatio
      sourceX = (sourceWidth - cropWidth) / 2
    } else {
      cropHeight = sourceWidth / targetRatio
      sourceY = (sourceHeight - cropHeight) / 2
    }

    ctx.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, x, y, width, height)
  },
  drawPosterPlaceholder(ctx, x, y, width, height, locked) {
    ctx.save()
    this.drawRoundRect(ctx, x, y, width, height, 28)
    ctx.clip()
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height)
    gradient.addColorStop(0, "#eadccf")
    gradient.addColorStop(1, "#d2bca8")
    ctx.fillStyle = gradient
    ctx.fillRect(x, y, width, height)

    ctx.fillStyle = "rgba(47, 36, 31, 0.14)"
    ctx.beginPath()
    ctx.arc(x + width * 0.5, y + height * 0.42, width * 0.16, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(x + width * 0.28, y + height * 0.62, width * 0.44, height * 0.18)

    ctx.fillStyle = "#7f5330"
    ctx.font = "700 17px sans-serif"
    ctx.textAlign = "center"
    ctx.fillText(locked ? "照片未开放" : "暂无照片", x + width / 2, y + height - 36)
    ctx.restore()
  },
  async drawPosterToTempFile(candidate) {
    const query = wx.createSelectorQuery()
    const canvasInfo = await new Promise((resolve, reject) => {
      query.select("#posterCanvas")
        .fields({ node: true, size: true })
        .exec((result) => {
          if (!result || !result[0] || !result[0].node) {
            reject(new Error("poster canvas not found"))
            return
          }
          resolve(result[0])
        })
    })
    const canvas = canvasInfo.node
    const ctx = canvas.getContext("2d")
    const width = 750
    const basePhotoSize = 642
    const photoHeight = Math.round(basePhotoSize * 1.2)
    const height = 1334 + (photoHeight - basePhotoSize)
    const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio || 2 : wx.getSystemInfoSync().pixelRatio || 2
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const posterText = this.getPosterText(candidate)
    const photoInfo = await this.getPosterImagePath(candidate)

    ctx.fillStyle = "#f6f0e7"
    ctx.fillRect(0, 0, width, height)

    const bgGradient = ctx.createLinearGradient(0, 0, width, 520)
    bgGradient.addColorStop(0, "#e28c98")
    bgGradient.addColorStop(1, "#b96f42")
    ctx.fillStyle = bgGradient
    ctx.fillRect(0, 0, width, 520)

    ctx.fillStyle = "rgba(255,255,255,0.18)"
    ctx.beginPath()
    ctx.arc(110, 110, 180, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(685, 260, 210, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = "#ffffff"
    ctx.font = "900 34px sans-serif"
    ctx.textAlign = "left"
    ctx.fillText("王美婆", 54, 82)
    ctx.font = "500 22px sans-serif"
    ctx.fillText("认真介绍 · 真诚相看", 54, 118)

    const photoWidth = 642
    const photoX = 54
    const photoY = 164
    ctx.save()
    this.drawRoundRect(ctx, photoX, photoY, photoWidth, photoHeight, 36)
    ctx.clip()
    if (photoInfo && photoInfo.path) {
      ctx.fillStyle = "#eadccf"
      ctx.fillRect(photoX, photoY, photoWidth, photoHeight)
      const image = canvas.createImage()
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
        image.src = photoInfo.path
      })
      this.drawCoverImage(ctx, image, photoInfo, photoX, photoY, photoWidth, photoHeight)
    } else {
      this.drawPosterPlaceholder(ctx, photoX, photoY, photoWidth, photoHeight, !candidate.canViewPhotos)
    }
    ctx.restore()

    const overlay = ctx.createLinearGradient(0, photoY + photoHeight - 252, 0, photoY + photoHeight)
    overlay.addColorStop(0, "rgba(0,0,0,0)")
    overlay.addColorStop(1, "rgba(0,0,0,0.58)")
    ctx.fillStyle = overlay
    this.drawRoundRect(ctx, photoX, photoY, photoWidth, photoHeight, 36)
    ctx.fill()

    const photoBottom = photoY + photoHeight
    const cardY = photoBottom + 44

    ctx.fillStyle = "#ffffff"
    ctx.font = "900 42px sans-serif"
    ctx.fillText(posterText.title, 124, photoBottom - 80)
    ctx.font = "700 24px sans-serif"
    ctx.fillStyle = "rgba(255,255,255,0.86)"
    ctx.fillText(posterText.code || "会员资料", 124, photoBottom - 42)

    ctx.fillStyle = "#ffffff"
    this.drawRoundRect(ctx, 54, cardY, 642, 354, 34)
    ctx.fill()

    ctx.fillStyle = "#2f241f"
    ctx.font = "900 32px sans-serif"
    ctx.fillText(posterText.basics, 88, cardY + 64)

    let tagX = 88
    const tagY = cardY + 98
    posterText.tags.forEach((tag) => {
      const tagText = String(tag || "").slice(0, 8)
      const tagWidth = Math.min(ctx.measureText(tagText).width + 42, 170)
      ctx.fillStyle = "#f0dfd1"
      this.drawRoundRect(ctx, tagX, tagY, tagWidth, 42, 21)
      ctx.fill()
      ctx.fillStyle = "#8a5635"
      ctx.font = "700 20px sans-serif"
      ctx.textAlign = "center"
      ctx.fillText(tagText, tagX + tagWidth / 2, tagY + 28)
      tagX += tagWidth + 14
    })
    ctx.textAlign = "left"

    ctx.fillStyle = "#8a7463"
    ctx.font = "700 23px sans-serif"
    ctx.fillText("性格", 88, cardY + 186)
    ctx.fillText("择偶要求", 88, cardY + 262)

    ctx.fillStyle = "#2f241f"
    ctx.font = "500 25px sans-serif"
    this.wrapPosterText(ctx, posterText.personality, 490, 2).forEach((line, index) => {
      ctx.fillText(line, 190, cardY + 186 + index * 34)
    })
    this.wrapPosterText(ctx, posterText.requirements, 490, 2).forEach((line, index) => {
      ctx.fillText(line, 190, cardY + 262 + index * 34)
    })

    ctx.fillStyle = "#8a7463"
    ctx.font = "500 22px sans-serif"
    ctx.fillText("长按识别小程序卡片或进入会员详情查看更多", 88, cardY + 416)
    ctx.fillStyle = "#b96f42"
    ctx.font = "900 24px sans-serif"
    ctx.fillText("资料真实度以人工审核为准", 88, cardY + 452)

    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,
        width,
        height,
        destWidth: width * 2,
        destHeight: height * 2,
        fileType: "jpg",
        quality: 0.92,
        success: (result) => resolve(result.tempFilePath),
        fail: reject,
      })
    })
  },
  async drawShareCardToTempFile(candidate) {
    const query = wx.createSelectorQuery()
    const canvasInfo = await new Promise((resolve, reject) => {
      query.select("#posterCanvas")
        .fields({ node: true, size: true })
        .exec((result) => {
          if (!result || !result[0] || !result[0].node) {
            reject(new Error("share card canvas not found"))
            return
          }
          resolve(result[0])
        })
    })
    const canvas = canvasInfo.node
    const ctx = canvas.getContext("2d")
    const width = 500
    const height = 400
    const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio || 2 : wx.getSystemInfoSync().pixelRatio || 2
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const photoInfo = await this.getPosterImagePath(candidate)
    ctx.fillStyle = "#f6f0e7"
    ctx.fillRect(0, 0, width, height)

    const gradient = ctx.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, "#f3d7dc")
    gradient.addColorStop(1, "#ead6c6")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)

    const photoSize = 292
    const photoX = Math.round((width - photoSize) / 2)
    const photoY = 42
    ctx.save()
    this.drawRoundRect(ctx, photoX, photoY, photoSize, photoSize, 28)
    ctx.clip()
    if (photoInfo && photoInfo.path) {
      const image = canvas.createImage()
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
        image.src = photoInfo.path
      })
      this.drawCoverImage(ctx, image, photoInfo, photoX, photoY, photoSize, photoSize)
    } else {
      this.drawPosterPlaceholder(ctx, photoX, photoY, photoSize, photoSize, false)
    }
    ctx.restore()

    ctx.fillStyle = "#2f241f"
    ctx.font = "900 30px sans-serif"
    ctx.textAlign = "center"
    ctx.fillText("优质会员资料", width / 2, 366)

    return new Promise((resolve, reject) => {
      wx.canvasToTempFilePath({
        canvas,
        width,
        height,
        destWidth: width * 2,
        destHeight: height * 2,
        fileType: "jpg",
        quality: 0.9,
        success: (result) => resolve(result.tempFilePath),
        fail: reject,
      })
    })
  },
  async prepareShareCardImage(candidate) {
    try {
      const imageUrl = await this.drawShareCardToTempFile(candidate)
      if (this.data.candidate && candidate && this.data.candidate._id === candidate._id) {
        this.setData({
          shareCardImageUrl: imageUrl || "",
          shareCardReady: true,
        })
      }
    } catch (error) {
      console.error("分享卡片封面生成失败", error)
      if (this.data.candidate && candidate && this.data.candidate._id === candidate._id) {
        this.setData({ shareCardReady: true })
      }
    }
  },
  async handleSharePoster() {
    const candidate = this.data.candidate
    if (!candidate || this.data.posterGenerating) {
      return
    }

    this.setData({ posterGenerating: true })
    wx.showLoading({ title: "生成海报中" })

    try {
      const imagePath = await this.drawPosterToTempFile(candidate)
      wx.hideLoading()
      if (wx.showShareImageMenu) {
        await wx.showShareImageMenu({ path: imagePath })
      } else {
        await wx.saveImageToPhotosAlbum({ filePath: imagePath })
        wx.showToast({ title: "已保存到相册", icon: "success" })
      }
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: "海报生成失败", icon: "none" })
      console.error(error)
    } finally {
      this.setData({ posterGenerating: false })
    }
  },
  isSubscriptionActive(value) {
    if (!value) return false
    const expiresAt = new Date(value)
    return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() >= Date.now()
  },
  formatDateInput(value) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  },
  formatDisplayDate(value) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}.${month}.${day}`
  },
  async handleSubscriptionDateChange(event) {
    const candidateId = this.data.candidate && this.data.candidate._id
    const expiresAt = event.detail.value
    if (!candidateId || !expiresAt || !this.canUseKeyActions()) {
      return
    }

    wx.showLoading({ title: "订阅中" })
    try {
      const result = await setCandidateSubscription({
        candidateId,
        expiresAt,
      })
      if (!result.ok) {
        throw new Error(result.error || "set subscription failed")
      }

      wx.showToast({ title: "已订阅", icon: "success" })
      this.loadDetail(candidateId, this.data.activeShareToken, this.data.source)
    } catch (error) {
      wx.showToast({ title: "订阅失败", icon: "none" })
      console.error(error)
    } finally {
      wx.hideLoading()
    }
  },
  handleBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({ url: "/pages/index/index" })
      },
    })
  },
  handleEdit() {
    const candidateId = this.data.candidate && this.data.candidate._id
    if (!candidateId || !this.canUseKeyActions()) {
      return
    }

    wx.navigateTo({
      url: `/pages/upload-profile/index?mode=edit&id=${candidateId}`,
    })
  },
  handleRestore() {
    const candidateId = this.data.candidate && this.data.candidate._id
    if (!candidateId || !this.canUseKeyActions()) {
      return
    }

    wx.showModal({
      title: "恢复会员资料",
      content: "恢复后该会员将重新进入已发布资料。",
      confirmText: "恢复",
      success: async (result) => {
        if (!result.confirm) {
          return
        }

        wx.showLoading({ title: "恢复中" })
        try {
          const response = await reviewCandidate(candidateId, { action: "restore" })
          if (!response.ok) {
            throw new Error(response.error || "restore failed")
          }

          wx.showToast({ title: "已恢复", icon: "success" })
          setTimeout(() => {
            wx.navigateBack()
          }, 500)
        } catch (error) {
          wx.showToast({ title: "恢复失败", icon: "none" })
          console.error(error)
        } finally {
          wx.hideLoading()
        }
      },
    })
  },
  handleDelete() {
    const candidateId = this.data.candidate && this.data.candidate._id
    if (!candidateId || !this.canUseKeyActions()) {
      return
    }

    wx.showModal({
      title: "删除会员资料",
      content: "删除后该资料将从首页和审核列表移除，后续可在数据库中恢复。",
      confirmText: "删除",
      confirmColor: "#b64a34",
      success: async (result) => {
        if (!result.confirm) {
          return
        }

        wx.showLoading({ title: "删除中" })
        try {
          const response = await reviewCandidate(candidateId, { action: "delete" })
          if (!response.ok) {
            throw new Error(response.error || "delete failed")
          }

          const app = getApp()
          const deletedCandidateIds = app.globalData.deletedCandidateIds || []
          if (!deletedCandidateIds.includes(candidateId)) {
            app.globalData.deletedCandidateIds = deletedCandidateIds.concat(candidateId)
          }

          wx.showToast({ title: "已删除", icon: "success" })
          setTimeout(() => {
            wx.navigateBack({
              fail: () => {
                wx.redirectTo({ url: "/pages/index/index" })
              },
            })
          }, 500)
        } catch (error) {
          wx.showToast({ title: "删除失败", icon: "none" })
          console.error(error)
        } finally {
          wx.hideLoading()
        }
      },
    })
  },
  canUseKeyActions() {
    return Boolean(this.data.candidate && this.data.candidate.canUseKeyActions)
  },
  onShareAppMessage(res) {
    const candidate = this.data.candidate || {}
    const targetDataset = res && res.target && res.target.dataset ? res.target.dataset : {}
    const mode = targetDataset.mode || this.data.pendingShareMode
    const sharePath = mode === "public"
      ? this.data.publicSharePath
      : (mode === "private" ? this.data.privateSharePath : this.data.sharePath)
    const modeText = mode === "public" ? "公开分享" : (mode === "private" ? "私密分享" : this.data.shareModeText)

    return {
      title: "优质会员资料",
      path: sharePath || `/pages/candidate-detail/index?id=${candidate._id || ""}`,
      imageUrl: this.data.shareCardImageUrl || getCandidateReadablePhotoSources(candidate)[0] || "",
    }
  },
})
