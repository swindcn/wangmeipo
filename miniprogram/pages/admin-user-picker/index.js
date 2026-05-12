const { manageAdminSettings } = require("../../utils/api")

function userInitial(user) {
  return String(user && user.nickname ? user.nickname : "用").slice(0, 1)
}

Page({
  data: {
    mode: "superAdmin",
    keyword: "",
    users: [],
    selectedUserId: "",
    selectedUser: null,
    saving: false,
  },
  onLoad(query) {
    this.setData({
      mode: query.mode || "superAdmin",
      selectedUserId: query.selectedUserId || "",
    })
    this.searchUsers()
  },
  handleKeywordInput(event) {
    this.setData({ keyword: event.detail.value })
  },
  async searchUsers() {
    try {
      const result = await manageAdminSettings({
        action: "searchUsers",
        keyword: this.data.keyword,
      })
      const users = (result.users || []).map((item) => ({
        ...item,
        initial: userInitial(item),
        checked: item._id === this.data.selectedUserId,
      }))
      this.setData({
        users,
        selectedUser: users.find((item) => item.checked) || this.data.selectedUser,
      })
    } catch (error) {
      wx.showToast({ title: "用户查询失败", icon: "none" })
      console.error(error)
    }
  },
  handleSelectUser(event) {
    const { id } = event.currentTarget.dataset
    const selectedUser = this.data.users.find((item) => item._id === id) || null
    this.setData({
      selectedUserId: id,
      selectedUser,
      users: this.data.users.map((item) => ({
        ...item,
        checked: item._id === id,
      })),
    })
  },
  handleConfirm() {
    if (!this.data.selectedUserId) {
      wx.showToast({ title: "请选择用户", icon: "none" })
      return
    }

    if (this.data.mode === "scope") {
      const eventChannel = this.getOpenerEventChannel()
      if (eventChannel && eventChannel.emit) {
        eventChannel.emit("selectedAdminUser", this.data.selectedUser)
      }
      wx.navigateBack()
      return
    }

    wx.showModal({
      title: "确认授权",
      content: "超管用户拥有查看所有资料和会员的操作权限是否确认赋予该用户权限",
      confirmText: "确认",
      confirmColor: "#d95d70",
      success: (result) => {
        if (result.confirm) {
          this.saveSuperAdmin()
        }
      },
    })
  },
  async saveSuperAdmin() {
    this.setData({ saving: true })
    try {
      const result = await manageAdminSettings({
        action: "setSuperAdmin",
        userId: this.data.selectedUserId,
      })
      if (!result.ok) {
        throw new Error(result.error || "save failed")
      }
      wx.showToast({ title: "已保存", icon: "success" })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (error) {
      wx.showToast({ title: "保存失败", icon: "none" })
      console.error(error)
    } finally {
      this.setData({ saving: false })
    }
  },
})
