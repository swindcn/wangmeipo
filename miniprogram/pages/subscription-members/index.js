const { listCandidateSubscriptions } = require("../../utils/api")

Page({
  data: {
    activeTab: "active",
    tabs: [
      { key: "active", label: "在订阅", className: "tab active" },
      { key: "expired", label: "已过期", className: "tab" },
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
      const items = await listCandidateSubscriptions({ status: this.data.activeTab })
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
  handleOpenDetail(event) {
    const { id } = event.currentTarget.dataset
    wx.navigateTo({ url: `/pages/candidate-detail/index?id=${id}` })
  },
})
