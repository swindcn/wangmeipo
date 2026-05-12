const { manageAdminSettings } = require("../../utils/api")

const genderFilters = [
  { key: "ALL", label: "ALL" },
  { key: "男", label: "男" },
  { key: "女", label: "女" },
  { key: "未知", label: "未知" },
]

function normalizeCandidate(item, selectedIdSet) {
  return {
    ...item,
    title: item.name ? `${item.name}　${item.candidateCode || ""}` : `会员姓名　${item.candidateCode || ""}`,
    meta: `${item.gender || "-"}　${item.age || "-"}岁　${item.ancestralHome || "-"}`,
    checked: Boolean(selectedIdSet[item._id]),
  }
}

Page({
  data: {
    keyword: "",
    gender: "ALL",
    genderFilters: genderFilters.map((item) => ({ ...item, className: item.key === "ALL" ? "gender-chip active" : "gender-chip" })),
    candidates: [],
    selectedIds: [],
    selectedMap: {},
    selectedCandidateMap: {},
  },
  onLoad(query) {
    const selectedIds = String(query.selectedIds || "").split(",").filter(Boolean)
    const cachedSelectedCandidates = getApp().globalData.adminScopeSelectedCandidates || []
    const selectedCandidateMap = cachedSelectedCandidates.reduce((result, item) => {
      if (item && item._id) {
        result[item._id] = item
      }
      return result
    }, {})
    const selectedMap = selectedIds.reduce((result, id) => {
      result[id] = true
      return result
    }, {})
    this.setData({ selectedIds, selectedMap, selectedCandidateMap })
    this.searchCandidates()
  },
  handleKeywordInput(event) {
    this.setData({ keyword: event.detail.value })
  },
  handleGenderTap(event) {
    const { key } = event.currentTarget.dataset
    this.setData({
      gender: key,
      genderFilters: genderFilters.map((item) => ({
        ...item,
        className: item.key === key ? "gender-chip active" : "gender-chip",
      })),
    })
    this.searchCandidates()
  },
  async searchCandidates() {
    try {
      const result = await manageAdminSettings({
        action: "searchCandidates",
        keyword: this.data.keyword,
        gender: this.data.gender,
      })
      this.setData({
        candidates: (result.candidates || []).map((item) => normalizeCandidate(item, this.data.selectedMap)),
      })
    } catch (error) {
      wx.showToast({ title: "会员查询失败", icon: "none" })
      console.error(error)
    }
  },
  handleToggleCandidate(event) {
    const { id } = event.currentTarget.dataset
    const selectedMap = { ...this.data.selectedMap }
    if (selectedMap[id]) {
      delete selectedMap[id]
    } else {
      selectedMap[id] = true
    }

    const selectedCandidateMap = { ...this.data.selectedCandidateMap }
    const candidate = this.data.candidates.find((item) => item._id === id)
    if (selectedMap[id] && candidate) {
      selectedCandidateMap[id] = candidate
    } else {
      delete selectedCandidateMap[id]
    }

    const selectedIds = Object.keys(selectedMap)
    this.setData({
      selectedMap,
      selectedCandidateMap,
      selectedIds,
      candidates: this.data.candidates.map((item) => ({
        ...item,
        checked: Boolean(selectedMap[item._id]),
      })),
    })
  },
  handleConfirm() {
    const selectedIdSet = this.data.selectedIds.reduce((result, id) => {
      result[id] = true
      return result
    }, {})
    const candidatesById = this.data.candidates.reduce((result, item) => {
      result[item._id] = item
      return result
    }, { ...this.data.selectedCandidateMap })
    const selectedCandidates = this.data.selectedIds
      .map((id) => candidatesById[id])
      .filter(Boolean)
      .filter((item) => selectedIdSet[item._id])
      .map((item) => ({ ...item, checked: false }))

    const eventChannel = this.getOpenerEventChannel()
    if (eventChannel && eventChannel.emit) {
      eventChannel.emit("selectedAdminCandidates", selectedCandidates)
    }
    wx.navigateBack()
  },
})
