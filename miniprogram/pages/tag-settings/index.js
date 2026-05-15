const { manageCandidateTags } = require("../../utils/api")

const scopeTabs = [
  { key: "all", label: "ALL" },
  { key: "male", label: "男生" },
  { key: "female", label: "女生" },
  { key: "common", label: "通用" },
]

const scopeOptions = [
  { key: "male", label: "男生" },
  { key: "female", label: "女生" },
  { key: "common", label: "通用" },
]

function scopeText(scope) {
  const found = scopeOptions.find((item) => item.key === scope)
  return found ? found.label : "通用"
}

function normalizeTagName(value) {
  return String(value || "").trim()
}

Page({
  data: {
    loading: false,
    activeScope: "all",
    scopeTabs: scopeTabs.map((item) => ({
      ...item,
      className: item.key === "all" ? "filter-tab active" : "filter-tab",
    })),
    scopeOptions,
    tags: [],
    visibleTags: [],
    modalVisible: false,
    modalMode: "create",
    editingTagId: "",
    draftName: "",
    draftScope: "common",
    saving: false,
  },
  onLoad() {
    this.loadTags()
  },
  async loadTags() {
    this.setData({ loading: true })
    try {
      const result = await manageCandidateTags({ action: "listTags" })
      const tags = (result.tags || []).map((item) => ({
        ...item,
        scopeText: scopeText(item.scope),
      }))
      this.setData({ tags, loading: false })
      this.refreshVisibleTags()
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: "标签加载失败", icon: "none" })
      console.error(error)
    }
  },
  refreshVisibleTags() {
    const activeScope = this.data.activeScope
    const visibleTags = this.data.tags.filter((item) => (
      activeScope === "all" || item.scope === activeScope
    ))
    this.setData({
      visibleTags,
      scopeTabs: this.data.scopeTabs.map((item) => ({
        ...item,
        className: item.key === activeScope ? "filter-tab active" : "filter-tab",
      })),
    })
  },
  handleScopeTap(event) {
    const { scope } = event.currentTarget.dataset
    this.setData({ activeScope: scope || "all" })
    this.refreshVisibleTags()
  },
  handleAddTag() {
    this.setData({
      modalVisible: true,
      modalMode: "create",
      editingTagId: "",
      draftName: "",
      draftScope: this.data.activeScope === "male" || this.data.activeScope === "female"
        ? this.data.activeScope
        : "common",
    })
  },
  handleEditTag(event) {
    const { id } = event.currentTarget.dataset
    const tag = this.data.tags.find((item) => item._id === id)
    if (!tag) return

    this.setData({
      modalVisible: true,
      modalMode: "edit",
      editingTagId: tag._id,
      draftName: tag.name,
      draftScope: tag.scope,
    })
  },
  handleDeleteTag(event) {
    const { id } = event.currentTarget.dataset
    const tag = this.data.tags.find((item) => item._id === id)
    if (!tag) return

    wx.showModal({
      title: "删除标签",
      content: `确认删除“${tag.name}”？已选过该标签的历史会员不会自动清空。`,
      confirmText: "删除",
      confirmColor: "#d95d70",
      success: async (res) => {
        if (!res.confirm) return
        try {
          const result = await manageCandidateTags({ action: "deleteTag", tagId: id })
          if (!result.ok) throw new Error(result.error || "delete failed")
          wx.showToast({ title: "已删除", icon: "success" })
          this.loadTags()
        } catch (error) {
          wx.showToast({ title: "删除失败", icon: "none" })
          console.error(error)
        }
      },
    })
  },
  handleDraftNameInput(event) {
    this.setData({ draftName: event.detail.value })
  },
  handleDraftScopeTap(event) {
    const { scope } = event.currentTarget.dataset
    this.setData({ draftScope: scope || "common" })
  },
  closeModal() {
    if (this.data.saving) return
    this.setData({ modalVisible: false })
  },
  stopModalTap() {},
  async handleSaveTag() {
    const name = normalizeTagName(this.data.draftName)
    if (!name) {
      wx.showToast({ title: "请输入标签内容", icon: "none" })
      return
    }

    this.setData({ saving: true })
    try {
      const result = await manageCandidateTags({
        action: "saveTag",
        tagId: this.data.editingTagId,
        name,
        scope: this.data.draftScope,
      })
      if (!result.ok) throw new Error(result.error || "save failed")
      wx.showToast({ title: "已保存", icon: "success" })
      this.setData({ modalVisible: false })
      this.loadTags()
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" })
      console.error(error)
    } finally {
      this.setData({ saving: false })
    }
  },
})
