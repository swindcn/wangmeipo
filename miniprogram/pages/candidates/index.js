const { listReviewQueue, manageViewRequests } = require("../../utils/api")

const tabItems = [
  { key: "home", label: "资料", currentIconUrl: "../../assets/icons/tab-home.png", className: "tab-item" },
  { key: "assistant", label: "搜索", currentIconUrl: "../../assets/icons/tab-assistant.png", className: "tab-item" },
  { key: "upload", label: "传资料", currentIconUrl: "../../assets/icons/tab-upload.png", className: "tab-item tab-upload" },
  { key: "manage", label: "管理", currentIconUrl: "../../assets/icons/tab-manage-active.png", className: "tab-item active" },
  { key: "mine", label: "我的", currentIconUrl: "../../assets/icons/tab-mine.png", className: "tab-item" },
]

Page({
  data: {
    navTopGap: 88,
    pendingReviewText: "",
    pendingViewRequestText: "",
    tabItems,
    menuItems: [
      {
        key: "review",
        iconUrl: "../../assets/icons/manage-review.png",
        iconClass: "menu-icon red",
        label: "资料审核",
        badge: "",
      },
      {
        key: "viewRequests",
        iconUrl: "../../assets/icons/mine-wanted.png",
        iconClass: "menu-icon orange",
        label: "想看处理",
        badge: "",
      },
      {
        key: "admins",
        iconUrl: "../../assets/icons/manage-admin.png",
        iconClass: "menu-icon green",
        label: "管理员设置",
        badge: "",
      },
      {
        key: "tags",
        iconUrl: "../../assets/icons/manage-admin.png",
        iconClass: "menu-icon purple",
        label: "标签管理",
        badge: "",
      },
      {
        key: "recycle",
        iconUrl: "../../assets/icons/manage-recycle.png",
        iconClass: "menu-icon orange",
        label: "会员回收站",
        badge: "",
      },
      {
        key: "subscription",
        iconUrl: "../../assets/icons/manage-subscription.png",
        iconClass: "menu-icon blue",
        label: "订阅记录",
        badge: "",
      },
    ],
  },
  onShow() {
    this.initNavMetrics()
    this.loadSummary()
  },
  initNavMetrics() {
    const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const windowWidth = windowInfo.windowWidth || 375
    const pxToRpx = (px) => px * 750 / windowWidth
    const topGapPx = menuButton && menuButton.bottom
      ? menuButton.bottom + 8
      : (windowInfo.statusBarHeight || 20) + 44

    this.setData({
      navTopGap: Math.ceil(pxToRpx(topGapPx)),
    })
  },
  async loadSummary() {
    try {
      const [pendingItems, pendingViewRequestResult] = await Promise.all([
        listReviewQueue({ status: "pending_review" }),
        manageViewRequests({ action: "listRequests", status: "pending" }),
      ])
      const pendingReview = pendingItems.length
      const pendingReviewText = pendingReview > 99 ? "99+" : pendingReview ? `${pendingReview}+` : ""
      const pendingViewRequest = pendingViewRequestResult.ok ? (pendingViewRequestResult.items || []).length : 0
      const pendingViewRequestText = pendingViewRequest > 99 ? "99+" : pendingViewRequest ? `${pendingViewRequest}+` : ""

      this.setData({
        pendingReviewText,
        pendingViewRequestText,
        menuItems: this.data.menuItems.map((item) => ({
          ...item,
          badge: item.key === "review"
            ? pendingReviewText
            : (item.key === "viewRequests" ? pendingViewRequestText : item.badge),
        })),
      })
    } catch (error) {
      console.error(error)
    }
  },
  handleMenuTap(event) {
    const { key } = event.currentTarget.dataset

    if (key === "review") {
      wx.navigateTo({ url: "/pages/review-queue/index" })
      return
    }

    if (key === "viewRequests") {
      wx.navigateTo({ url: "/pages/view-requests/index" })
      return
    }

    if (key === "recycle") {
      wx.navigateTo({ url: "/pages/recycle-bin/index" })
      return
    }

    if (key === "subscription") {
      wx.navigateTo({ url: "/pages/subscription-members/index" })
      return
    }

    if (key === "admins") {
      wx.navigateTo({ url: "/pages/admin-settings/index" })
      return
    }

    if (key === "tags") {
      wx.navigateTo({ url: "/pages/tag-settings/index" })
    }
  },
  handleTabTap(event) {
    const { key } = event.currentTarget.dataset

    if (key === "manage") {
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

    if (key === "assistant") {
      wx.redirectTo({ url: "/pages/ask-matchmaker/index" })
      return
    }

    if (key === "mine") {
      wx.redirectTo({ url: "/pages/my-access/index" })
    }
  },
})
