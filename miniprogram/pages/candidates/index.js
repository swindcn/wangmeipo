const { listReviewQueue } = require("../../utils/api")

Page({
  data: {
    pendingReviewText: "",
    memberRequestText: "8+",
    menuItems: [
      {
        key: "review",
        icon: "▦",
        iconClass: "menu-icon red",
        label: "资料审核",
        badge: "",
      },
      {
        key: "access",
        icon: "◉",
        iconClass: "menu-icon blue",
        label: "会员想看",
        badge: "8+",
      },
      {
        key: "admins",
        icon: "♟",
        iconClass: "menu-icon green",
        label: "管理员设置",
        badge: "",
      },
    ],
  },
  onShow() {
    this.loadSummary()
  },
  async loadSummary() {
    try {
      const pendingItems = await listReviewQueue({ status: "pending_review" })
      const pendingReview = pendingItems.length
      const pendingReviewText = pendingReview > 99 ? "99+" : pendingReview ? `${pendingReview}+` : ""

      this.setData({
        pendingReviewText,
        menuItems: this.data.menuItems.map((item) => ({
          ...item,
          badge: item.key === "review" ? pendingReviewText : item.badge,
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

    if (key === "access") {
      wx.navigateTo({ url: "/pages/permission-manage/index" })
      return
    }

    wx.showToast({ title: "管理员设置后续接入", icon: "none" })
  },
})
