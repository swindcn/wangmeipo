const { listDeletedCandidates } = require("../../utils/api")

Page({
  data: {
    items: [],
    loading: false,
  },
  onShow() {
    this.loadItems()
  },
  async loadItems() {
    this.setData({ loading: true })

    try {
      const items = await listDeletedCandidates()
      this.setData({ items, loading: false })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: "当前身份无权限", icon: "none" })
      console.error(error)
    }
  },
  handleOpenDetail(event) {
    const { id } = event.currentTarget.dataset
    wx.navigateTo({ url: `/pages/candidate-detail/index?id=${id}&source=trash` })
  },
})
