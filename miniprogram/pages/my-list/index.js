const { listMyAccess } = require("../../utils/api")

const pageConfig = {
  submitted: {
    title: "传的资料",
    emptyText: "暂无传的资料",
  },
  wanted: {
    title: "我想看的",
    emptyText: "暂无想看的会员",
  },
  viewed: {
    title: "对看过的",
    emptyText: "功能预留中，暂无资料",
  },
}

Page({
  data: {
    type: "submitted",
    title: "传的资料",
    emptyText: "暂无资料",
    loading: false,
    items: [],
  },
  onLoad(options = {}) {
    const type = pageConfig[options.type] ? options.type : "submitted"
    const config = pageConfig[type]
    this.setData({
      type,
      title: config.title,
      emptyText: config.emptyText,
    })
    wx.setNavigationBarTitle({ title: config.title })
  },
  onShow() {
    this.loadItems()
  },
  async loadItems() {
    this.setData({ loading: true })
    try {
      const result = await listMyAccess({ action: this.data.type })
      this.setData({ items: result.items || [] })
    } catch (error) {
      wx.showToast({ title: "加载失败", icon: "none" })
      console.error(error)
    } finally {
      this.setData({ loading: false })
    }
  },
  handleOpenCandidate(event) {
    const { id } = event.currentTarget.dataset
    if (!id) return
    wx.navigateTo({ url: `/pages/candidate-detail/index?id=${id}` })
  },
})
