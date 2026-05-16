const { manageViewRequests } = require("../../utils/api")

const tabItems = [
  { key: "home", label: "资料", currentIconUrl: "../../assets/icons/tab-home.png", className: "tab-item" },
  { key: "assistant", label: "搜索", currentIconUrl: "../../assets/icons/tab-assistant.png", className: "tab-item" },
  { key: "upload", label: "传资料", currentIconUrl: "../../assets/icons/tab-upload.png", className: "tab-item tab-upload" },
  { key: "manage", label: "管理", currentIconUrl: "../../assets/icons/tab-manage-active.png", className: "tab-item active" },
  { key: "mine", label: "我的", currentIconUrl: "../../assets/icons/tab-mine.png", className: "tab-item" },
]

Page({
  data: {
    loading: false,
    items: [],
    tabItems,
  },
  onShow() {
    this.loadRequests()
  },
  async loadRequests() {
    this.setData({ loading: true })
    try {
      const result = await manageViewRequests({
        action: "listRequests",
        status: "pending",
      })

      if (!result.ok) {
        throw new Error(result.error || "list failed")
      }

      this.setData({ items: result.items || [] })
    } catch (error) {
      wx.showToast({ title: "消息加载失败", icon: "none" })
      console.error(error)
    } finally {
      this.setData({ loading: false })
    }
  },
  handleOpenRequest(event) {
    const { id, candidateId } = event.currentTarget.dataset
    if (!id || !candidateId) {
      return
    }

    wx.navigateTo({
      url: `/pages/candidate-detail/index?id=${candidateId}&requestId=${id}`,
    })
  },
  handleTabTap(event) {
    const { key } = event.currentTarget.dataset

    if (key === "home") {
      wx.redirectTo({ url: "/pages/index/index" })
      return
    }

    if (key === "assistant") {
      wx.redirectTo({ url: "/pages/ask-matchmaker/index" })
      return
    }

    if (key === "manage") {
      wx.redirectTo({ url: "/pages/candidates/index" })
      return
    }

    if (key === "upload") {
      wx.navigateTo({ url: "/pages/upload-profile/index" })
      return
    }

    if (key === "mine") {
      wx.redirectTo({ url: "/pages/my-access/index" })
    }
  },
})
