const { getCandidateDetail } = require("../../utils/api")

Page({
  data: {
    candidate: null,
    loading: false,
    shareToken: "",
    currentPhotoIndex: 0,
    suppressNextShowRefresh: false,
  },
  onLoad(query) {
    const candidateId = query.id || ""
    const shareToken = query.shareToken || ""

    this.setData({ shareToken })
    wx.setNavigationBarTitle({ title: "公开会员资料" })
    this.loadDetail(candidateId, shareToken)
  },
  onShow() {
    if (this.data.suppressNextShowRefresh) {
      this.setData({ suppressNextShowRefresh: false })
      return
    }

    const candidateId = this.data.candidate && this.data.candidate._id
    if (candidateId && this.data.shareToken) {
      this.loadDetail(candidateId, this.data.shareToken)
    }
  },
  async loadDetail(candidateId, shareToken) {
    if (!candidateId || !shareToken) {
      wx.showToast({ title: "分享链接无效", icon: "none" })
      return
    }

    this.setData({ loading: true })
    try {
      const candidate = await getCandidateDetail(candidateId, { shareToken })
      if (!candidate || candidate.shareMode !== "public") {
        throw new Error("invalid public share")
      }

      candidate.hobbies = Array.isArray(candidate.hobbies) ? candidate.hobbies : []
      candidate.tags = Array.isArray(candidate.tags) ? candidate.tags : []
      candidate.displayPhotos = Array.isArray(candidate.photoUrls)
        ? candidate.photoUrls.filter(Boolean).map((item) => ({ type: "url", value: item }))
        : []

      this.setData({
        candidate,
        currentPhotoIndex: 0,
      })
    } catch (error) {
      wx.showToast({ title: "公开资料加载失败", icon: "none" })
      console.error(error)
    } finally {
      this.setData({ loading: false })
    }
  },
  handlePhotoChange(event) {
    this.setData({ currentPhotoIndex: event.detail.current || 0 })
  },
  handlePreviewPhoto() {
    const candidate = this.data.candidate || {}
    const photos = Array.isArray(candidate.photoUrls) ? candidate.photoUrls.filter(Boolean) : []
    if (photos.length === 0) {
      return
    }

    this.setData({ suppressNextShowRefresh: true })
    wx.previewImage({
      current: photos[this.data.currentPhotoIndex] || photos[0],
      urls: photos,
    })
  },
  onShareAppMessage() {
    const candidate = this.data.candidate || {}
    return {
      title: "公开会员资料",
      path: `/pages/public-candidate-detail/index?id=${candidate._id || ""}&shareToken=${this.data.shareToken || ""}`,
    }
  },
})
