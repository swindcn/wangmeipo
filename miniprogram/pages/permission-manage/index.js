const { getPermissionData, grantPermission } = require("../../utils/api")

Page({
  data: {
    templates: [
      "text_only",
      "text_with_photo",
      "full_profile",
      "full_profile_no_contact",
    ],
    templateIndex: 0,
    users: [],
    candidates: [],
    permissions: [],
    userIndex: 0,
    candidateIndex: 0,
    reason: "",
    expiresAt: "2026-04-20",
  },
  onShow() {
    this.loadData()
  },
  async loadData() {
    try {
      const result = await getPermissionData()
      this.setData({
        users: result.users || [],
        candidates: result.candidates || [],
        permissions: result.permissions || [],
      })
    } catch (error) {
      wx.showToast({ title: "当前身份无权限", icon: "none" })
      console.error(error)
    }
  },
  handleUserChange(event) {
    this.setData({ userIndex: Number(event.detail.value) })
  },
  handleCandidateChange(event) {
    this.setData({ candidateIndex: Number(event.detail.value) })
  },
  handleTemplateChange(event) {
    this.setData({ templateIndex: Number(event.detail.value) })
  },
  handleReasonInput(event) {
    this.setData({ reason: event.detail.value })
  },
  handleExpireChange(event) {
    this.setData({ expiresAt: event.detail.value })
  },
  async handleGrant() {
    const user = this.data.users[this.data.userIndex]
    const candidate = this.data.candidates[this.data.candidateIndex]
    const permissionLevel = this.data.templates[this.data.templateIndex]

    if (!user || !candidate) {
      wx.showToast({ title: "请选择用户和资料", icon: "none" })
      return
    }

    try {
      await grantPermission({
        viewerUserId: user._id,
        candidateId: candidate._id,
        permissionLevel,
        reason: this.data.reason,
        expiresAt: this.data.expiresAt,
      })

      wx.showToast({ title: "授权已保存", icon: "success" })
      this.loadData()
    } catch (error) {
      wx.showToast({ title: "授权保存失败", icon: "none" })
      console.error(error)
    }
  },
})
