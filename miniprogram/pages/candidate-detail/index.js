const { createShareToken, getCandidateDetail, reviewCandidate } = require("../../utils/api")

Page({
  data: {
    candidate: null,
    loading: false,
    shareToken: "",
    sharePath: "",
    activeShareToken: "",
  },
  onLoad(query) {
    const shareToken = query.shareToken || ""

    this.setData({ activeShareToken: shareToken })
    this.loadDetail(query.id || getApp().globalData.currentCandidateId, shareToken)
  },
  onShow() {
    if (this.data.candidate && this.data.candidate._id) {
      this.loadDetail(this.data.candidate._id, this.data.activeShareToken)
    }
  },
  async loadDetail(id, shareToken) {
    if (!id) {
      return
    }

    this.setData({ loading: true })

    try {
      const candidate = await getCandidateDetail(id, { shareToken })
      if (candidate) {
        candidate.hobbies = Array.isArray(candidate.hobbies) ? candidate.hobbies : []
        if (candidate.photoUrls && candidate.photoUrls.length > 0) {
          candidate.displayPhotos = candidate.photoUrls.map((item) => ({
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
      this.setData({ candidate: candidate || null })
    } catch (error) {
      wx.showToast({ title: "详情加载失败", icon: "none" })
      console.error(error)
    } finally {
      this.setData({ loading: false })
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
  async handleCreateShareToken() {
    const candidateId = this.data.candidate && this.data.candidate._id
    if (!candidateId) {
      return
    }

    try {
      const result = await createShareToken({
        candidateId,
        permissionLevel: this.data.candidate.permissionLevel || "text_only",
      })

      this.setData({
        shareToken: result.token || "",
        sharePath: result.sharePath || "",
      })
      wx.showToast({ title: "已生成分享令牌", icon: "none" })
    } catch (error) {
      wx.showToast({ title: "生成失败", icon: "none" })
      console.error(error)
    }
  },
  handleGoPermission() {
    wx.navigateTo({ url: "/pages/permission-manage/index" })
  },
  handleGoMatch() {
    wx.navigateTo({ url: "/pages/match-records/index" })
  },
  onShareAppMessage() {
    const candidate = this.data.candidate || {}

    return {
      title: `${candidate.name || "候选人"}资料分享`,
      path: this.data.sharePath || `/pages/candidate-detail/index?id=${candidate._id || ""}`,
    }
  },
})
