const { listMyAccess } = require("../../utils/api")

Page({
  data: {
    items: [],
  },
  onShow() {
    this.loadItems()
  },
  async loadItems() {
    try {
      const items = await listMyAccess()
      this.setData({ items })
    } catch (error) {
      wx.showToast({ title: "加载失败", icon: "none" })
      console.error(error)
    }
  },
  handleOpenDetail(event) {
    const { candidateId } = event.currentTarget.dataset
    wx.navigateTo({ url: `/pages/candidate-detail/index?id=${candidateId}` })
  },
})
