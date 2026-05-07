const { listReviewQueue } = require("../../utils/api")

Page({
  data: {
    activeTab: "pending_review",
    tabs: [
      { key: "pending_review", label: "待审核", className: "tab active" },
      { key: "reviewed", label: "已审核", className: "tab" },
    ],
    items: [],
    loading: false,
  },
  onShow() {
    this.loadItems()
  },
  async loadItems() {
    this.setData({ loading: true })

    try {
      const items = await listReviewQueue({ status: this.data.activeTab })
      this.setData({ items, loading: false })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: "当前身份无权限", icon: "none" })
      console.error(error)
    }
  },
  handleTabTap(event) {
    const activeTab = event.currentTarget.dataset.key

    this.setData({
      activeTab,
      tabs: this.data.tabs.map((item) => ({
        ...item,
        className: item.key === activeTab ? "tab active" : "tab",
      })),
    }, () => {
      this.loadItems()
    })
  },
  handleOpenReview(event) {
    const { id } = event.currentTarget.dataset
    wx.navigateTo({ url: `/pages/upload-profile/index?mode=review&id=${id}` })
  },
})
