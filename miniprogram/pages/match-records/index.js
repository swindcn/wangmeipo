const { getMatchData, saveMatchRecord } = require("../../utils/api")

Page({
  data: {
    candidates: [],
    records: [],
    statuses: ["pending", "recommended", "viewed", "mutual_interest", "met_offline", "closed"],
    leftIndex: 0,
    rightIndex: 1,
    statusIndex: 0,
    resultNote: "",
  },
  onShow() {
    this.loadData()
  },
  async loadData() {
    try {
      const result = await getMatchData()
      this.setData({
        candidates: result.candidates || [],
        records: result.records || [],
      })
    } catch (error) {
      wx.showToast({ title: "当前身份无权限", icon: "none" })
      console.error(error)
    }
  },
  handleLeftChange(event) {
    this.setData({ leftIndex: Number(event.detail.value) })
  },
  handleRightChange(event) {
    this.setData({ rightIndex: Number(event.detail.value) })
  },
  handleStatusChange(event) {
    this.setData({ statusIndex: Number(event.detail.value) })
  },
  handleResultInput(event) {
    this.setData({ resultNote: event.detail.value })
  },
  async handleSave() {
    const left = this.data.candidates[this.data.leftIndex]
    const right = this.data.candidates[this.data.rightIndex]

    if (!left || !right || left._id === right._id) {
      wx.showToast({ title: "请正确选择两个人", icon: "none" })
      return
    }

    try {
      await saveMatchRecord({
        candidateAId: left._id,
        candidateBId: right._id,
        status: this.data.statuses[this.data.statusIndex],
        resultNote: this.data.resultNote,
      })

      wx.showToast({ title: "匹配记录已保存", icon: "success" })
      this.setData({ resultNote: "" })
      this.loadData()
    } catch (error) {
      wx.showToast({ title: "保存失败", icon: "none" })
      console.error(error)
    }
  },
})
