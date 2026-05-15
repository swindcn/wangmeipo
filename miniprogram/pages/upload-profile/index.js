const {
  getCandidateDetail,
  getDashboardSummary,
  parseCandidateText,
  reviewCandidate,
  submitCandidateProfile,
  upsertCurrentUser,
} = require("../../utils/api")

const availableTags = ["美女", "帅哥", "聘礼高", "谢媒费高", "离异", "家境好", "公务员", "事业单位", "要求多"]

const zodiacList = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"]
const genderList = ["男", "女"]
const educationList = ["高中", "大专", "本科", "硕士", "博士以上"]
const religionList = ["无", "佛", "基督", "天主", "伊斯兰", "其他"]

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
}

function cleanValue(value) {
  return String(value || "")
    .replace(/^[：:\s]+/, "")
    .replace(/[。；;，,、\s]+$/, "")
    .trim()
}

function extractValue(text, aliases) {
  const normalized = normalizeText(text)
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean)

  for (const alias of aliases) {
    const escapedAlias = escapeRegExp(alias)
    const linePattern = new RegExp(`^${escapedAlias}\\s*[：:\\s]+(.+)$`)
    const foundLine = lines.find((line) => linePattern.test(line))
    if (foundLine) {
      return cleanValue(foundLine.replace(linePattern, "$1"))
    }

    const pattern = new RegExp(`${escapedAlias}\\s*[：:]\\s*([^\\n]+)`)
    const matched = normalized.match(pattern)
    if (matched && matched[1]) {
      return cleanValue(matched[1])
    }
  }
  return ""
}

function extractNumber(text, aliases) {
  const value = extractValue(text, aliases)
  const matched = value.match(/\d+/)
  return matched ? matched[0] : ""
}

function normalizeHeightCm(value) {
  const text = String(value || "").trim()
  if (!text) return ""

  const meterWithCm = text.match(/(\d)\s*米\s*(\d{1,2})/)
  if (meterWithCm) {
    return String(Number(meterWithCm[1]) * 100 + Number(meterWithCm[2].padEnd(2, "0")))
  }

  const meterValue = text.match(/(\d(?:\.\d+)?)\s*(米|m)\b/i)
  if (meterValue) {
    const meters = Number(meterValue[1])
    if (meters > 1 && meters < 3) return String(Math.round(meters * 100))
  }

  const numberValue = text.match(/\d+(\.\d+)?/)
  if (!numberValue) return ""

  const number = Number(numberValue[0])
  if (number > 1 && number < 3) return String(Math.round(number * 100))
  if (number >= 100 && number <= 230) return String(Math.round(number))
  return ""
}

function extractHeightCm(text) {
  return normalizeHeightCm(extractValue(text, ["身高", "身长", "个子"]))
}

function normalizeWeightKg(value) {
  const text = String(value || "").trim()
  if (!text) return ""
  const matched = text.match(/\d+(\.\d+)?/)
  if (!matched) return ""
  const number = Number(matched[0])
  if (/[斤]/.test(text) && number > 60) return String(Math.round(number / 2))
  if (number >= 30 && number <= 180) return String(Math.round(number))
  return ""
}

function extractWeightKg(text) {
  return normalizeWeightKg(extractValue(text, ["体重", "重量"]))
}

function inferAssets(text) {
  const labeled = extractValue(text, ["房产情况", "房产", "住房", "房子", "资产"])
  if (labeled) return labeled

  const line = normalizeText(text).split(/\n+/).find((item) => /房|套房|婚房|嫁妆/.test(item))
  return line ? cleanValue(line) : ""
}

function inferWorkLocation(text) {
  const content = normalizeText(text)
  const patterns = [
    /工作(?:在|地|地点|单位在)\s*([\u4e00-\u9fa5A-Za-z0-9·\-]{2,18})/,
    /在\s*([\u4e00-\u9fa5A-Za-z0-9·\-]{2,18})\s*(?:工作|上班|任职|就业)/,
    /([\u4e00-\u9fa5A-Za-z0-9·\-]{2,18})\s*(?:工作|上班|任职|就业)/,
  ]

  for (const pattern of patterns) {
    const matched = content.match(pattern)
    if (matched && matched[1]) {
      return cleanWorkLocation(matched[1])
    }
  }

  return ""
}

function cleanWorkLocation(value) {
  const text = cleanValue(value)
  if (!text) return ""

  const localPlace = text.match(/^(长乐|福州|福清|仓山|鼓楼|台江|晋安|马尾|闽侯|连江|罗源|闽清|永泰|平潭|金峰|航城|吴航|营前|漳港|江田|松下|古槐|文武砂|鹤上|潭头|梅花|文岭|玉田|首占|罗联|猴屿)/)
  if (localPlace) return localPlace[1]

  const suffixPlace = text.match(/^(.{2,10}?(?:省|市|区|县|镇|乡|街道|开发区|新区))/)
  if (suffixPlace) return suffixPlace[1]

  if (/(公司|集团|银行|医院|学校|单位|工厂|厂|局|所|中心|店|企业|机构)/.test(text)) {
    return ""
  }

  return text.length <= 8 ? text : ""
}

function getCurrentYear() {
  return new Date().getFullYear()
}

function normalizeYear(value) {
  const matched = String(value || "").match(/\d{4}/)
  if (!matched) return ""
  const year = Number(matched[0])
  const currentYear = getCurrentYear()
  if (year < 1900 || year > currentYear) return ""
  return String(year)
}

function deriveAgeFromBirthYear(birthYear) {
  const year = Number(normalizeYear(birthYear))
  if (!year) return ""
  return String(getCurrentYear() - year)
}

function normalizeAge(value) {
  const matched = String(value || "").match(/\d{1,3}/)
  if (!matched) return ""
  const age = Number(matched[0])
  if (age < 18 || age > 90) return ""
  return String(age)
}

function deriveBirthYearFromAge(age) {
  const normalizedAge = Number(normalizeAge(age))
  if (!normalizedAge) return ""
  return String(getCurrentYear() - normalizedAge)
}

function deriveZodiacFromBirthYear(birthYear) {
  const year = Number(normalizeYear(birthYear))
  if (!year) return ""
  return zodiacList[(year - 4) % 12]
}

function applyBirthYearDerivedFields(form, options = {}) {
  const birthYear = normalizeYear(form.birthYear)

  if (!birthYear) {
    const normalizedAge = normalizeAge(form.age)
    const inferredBirthYear = deriveBirthYearFromAge(normalizedAge)
    if (!inferredBirthYear) {
      if (!birthYear) return form
    } else {
      const nextForm = {
        ...form,
        age: normalizedAge,
        birthYear: inferredBirthYear,
      }

      if (!options.keepZodiac && !form.zodiac) {
        nextForm.zodiac = deriveZodiacFromBirthYear(inferredBirthYear)
      }

      nextForm.zodiacDisplay = nextForm.zodiac || "选择"
      return nextForm
    }
  }

  const nextForm = {
    ...form,
    birthYear,
    age: deriveAgeFromBirthYear(birthYear) || form.age,
  }

  if (!options.keepZodiac && !form.zodiac) {
    nextForm.zodiac = deriveZodiacFromBirthYear(birthYear)
  }

  nextForm.zodiacDisplay = nextForm.zodiac || "选择"
  return nextForm
}

function buildDefaultForm() {
  return {
    name: "",
    birthYear: "",
    age: "",
    gender: "",
    zodiac: "",
    heightCm: "",
    weightKg: "",
    education: "",
    religion: "",
    genderDisplay: "选择",
    zodiacDisplay: "选择",
    educationDisplay: "选择",
    religionDisplay: "选择",
    ancestralHome: "",
    occupation: "",
    personality: "",
    assets: "",
    familyBackground: "",
    currentAddress: "",
    matchRequirements: "",
    phone: "",
  }
}

function normalizeFormDisplays(form) {
  const gender = form.gender === "男" || form.gender === "女" ? form.gender : ""
  return {
    ...form,
    gender,
    genderDisplay: gender || "必选",
    zodiacDisplay: form.zodiac || "选择",
    educationDisplay: form.education || "选择",
    religionDisplay: form.religion || "选择",
  }
}

function buildFormFromCandidate(candidate) {
  const form = {
    ...buildDefaultForm(),
    name: candidate.name || "",
    birthYear: candidate.birthYear ? String(candidate.birthYear) : "",
    age: candidate.age ? String(candidate.age) : "",
    gender: candidate.gender || "",
    zodiac: candidate.zodiac || "",
    heightCm: candidate.heightCm ? String(candidate.heightCm) : "",
    weightKg: candidate.weightKg ? String(candidate.weightKg) : "",
    education: candidate.education || "",
    religion: candidate.religion || "",
    ancestralHome: candidate.ancestralHome || "",
    occupation: candidate.occupation || "",
    personality: candidate.personality || "",
    assets: candidate.assets && candidate.assets.house ? candidate.assets.house : "",
    familyBackground: candidate.familyBackground || "",
    currentAddress: candidate.currentAddress || "",
    matchRequirements: candidate.matchRequirements || "",
    phone: candidate.phone || "",
  }

  return normalizeFormDisplays(form)
}

function buildSubmitterSnapshot(source) {
  const submitter = source || {}
  const nickname = submitter.nickname || ""

  return {
    nickname,
    avatarUrl: submitter.avatarUrl || "",
    avatarPreview: submitter.avatarPreview || submitter.avatarUrl || "",
    phone: submitter.phone || "",
    initial: String(nickname || "提").slice(0, 1),
  }
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message || "request timeout")), timeoutMs)
    }),
  ])
}

Page({
  data: {
    mode: "create",
    candidateId: "",
    pageTitle: "上传/编辑信息",
    saveButtonText: "保存",
    rejectButtonText: "拒绝",
    rejectLoading: false,
    photoItems: [],
    rawText: "",
    tags: availableTags,
    tagItems: availableTags.map((item) => ({
      name: item,
      className: "tag-pill",
    })),
    selectedTags: [],
    pickerOptions: {
      gender: genderList,
      zodiac: zodiacList,
      education: educationList,
      religion: religionList,
    },
    form: buildDefaultForm(),
    submitter: buildSubmitterSnapshot({}),
    reviewStatus: "pending_review",
    reviewStatusText: "",
    isManager: false,
    reviewHint: "普通用户提交：保存后进入审核",
    saving: false,
  },
  onLoad(query = {}) {
    const app = getApp()
    const mode = query.mode === "review" || query.mode === "edit" ? query.mode : "create"
    const submitter = buildSubmitterSnapshot(app.globalData.currentUserProfile || {})
    const isManager = app.globalData.userRole === "manager" || app.globalData.userRole === "super_admin"

    this.setData({
      mode,
      candidateId: query.id || "",
      pageTitle: "上传/编辑信息",
      saveButtonText: mode === "review" ? "同意" : "保存",
      rejectButtonText: mode === "edit" ? "取消" : "拒绝",
      submitter,
      isManager,
      reviewStatus: isManager ? "published" : "pending_review",
      reviewStatusText: mode === "review" ? "待审核" : (isManager ? "" : "待审核"),
      reviewHint: mode === "review"
        ? "管理员审核：修改后可拒绝或同意"
        : (mode === "edit" ? "管理员编辑：保存后更新会员资料" : (isManager ? "管理员提交：保存后直接上架" : "普通用户提交：保存后进入审核")),
    })

    wx.setNavigationBarTitle({ title: "上传/编辑信息" })

    if ((mode === "review" || mode === "edit") && query.id) {
      this.loadReviewCandidate(query.id)
    }
  },
  onShow() {
    if (this.data.mode === "create") {
      this.refreshSubmitterFromCloud()
    }
  },
  async refreshSubmitterFromCloud() {
    try {
      const result = await getDashboardSummary()
      const currentViewer = result.currentViewer
      if (!currentViewer) return

      this.applyBoundUser(currentViewer)
    } catch (error) {
      console.error("刷新提交人失败", error)
    }
  },
  async loadReviewCandidate(candidateId) {
    wx.showLoading({ title: "加载中" })

    try {
      const candidate = await getCandidateDetail(candidateId)
      if (!candidate) {
        throw new Error("candidate not found")
      }

      const selectedTags = Array.isArray(candidate.tags) && candidate.tags.length > 0 ? candidate.tags : []
      const photoUrls = Array.isArray(candidate.photoUrls) ? candidate.photoUrls : []
      const photoAssetIds = Array.isArray(candidate.photoAssetIds) ? candidate.photoAssetIds : []
      const thumbnailAssetIds = Array.isArray(candidate.thumbnailAssetIds) ? candidate.thumbnailAssetIds : []
      const photoItems = photoUrls.map((url, index) => ({
        url,
        fileId: photoAssetIds[index] || "",
        thumbnailFileId: thumbnailAssetIds[index] || "",
        isRemote: true,
      }))

      this.setData({
        form: buildFormFromCandidate(candidate),
        rawText: candidate.rawText || "",
        selectedTags,
        tagItems: this.data.tags.map((item) => ({
          name: item,
          className: selectedTags.includes(item) ? "tag-pill selected" : "tag-pill",
        })),
        photoItems,
        submitter: buildSubmitterSnapshot(candidate.submitter || {}),
      })
    } catch (error) {
      wx.showToast({ title: "资料加载失败", icon: "none" })
      console.error(error)
    } finally {
      wx.hideLoading()
    }
  },
  handleChooseImage() {
    const remain = 3 - this.data.photoItems.length
    if (remain <= 0) {
      wx.showToast({ title: "最多上传3张", icon: "none" })
      return
    }

    wx.chooseMedia({
      count: remain,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (result) => {
        const nextPhotos = result.tempFiles.map((item) => ({
          url: item.tempFilePath,
          fileId: "",
          thumbnailFileId: "",
          isRemote: false,
        }))
        this.setData({ photoItems: this.data.photoItems.concat(nextPhotos).slice(0, 3) })
      },
    })
  },
  handleRemovePhoto(event) {
    const index = Number(event.currentTarget.dataset.index)
    const photoItems = this.data.photoItems.filter((_, itemIndex) => itemIndex !== index)
    this.setData({ photoItems })
  },
  async ensureCurrentUserBound() {
    const submitter = this.data.submitter
    if (!submitter.nickname) {
      wx.showToast({ title: "请先完成注册", icon: "none" })
      return false
    }

    const result = await upsertCurrentUser({
      profile: submitter,
    })

    if (!result.ok) {
      throw new Error(result.error || "bind user failed")
    }

    this.applyBoundUser(result.user)
    return true
  },
  applyBoundUser(user) {
    const app = getApp()
    const submitter = buildSubmitterSnapshot(user || {})

    app.globalData.currentUserProfile = {
      nickname: submitter.nickname,
      avatarUrl: submitter.avatarUrl,
      phone: submitter.phone,
    }
    app.globalData.userRole = user && user.role ? user.role : app.globalData.userRole
    app.globalData.currentViewerId = user && user._id ? user._id : app.globalData.currentViewerId

    this.setData({
      submitter,
      isManager: app.globalData.userRole === "manager" || app.globalData.userRole === "super_admin",
    })
  },
  handleTextInput(event) {
    this.setData({ rawText: event.detail.value })
  },
  buildLocalParsedForm(text) {
    let form = {
      ...buildDefaultForm(),
      name: extractValue(text, ["姓名", "名字"]),
      age: extractNumber(text, ["年龄", "年纪"]),
      birthYear: normalizeYear(extractValue(text, ["出生", "出生年份", "出生年", "年份"])) || normalizeYear(text),
      gender: extractValue(text, ["性别"]),
      zodiac: extractValue(text, ["属相", "生肖"]),
      heightCm: extractHeightCm(text),
      weightKg: extractWeightKg(text),
      education: extractValue(text, ["学历", "文化"]),
      religion: extractValue(text, ["宗教", "信仰"]),
      ancestralHome: extractValue(text, ["祖籍", "老家", "籍贯"]),
      occupation: extractValue(text, ["职业", "工作"]),
      personality: extractValue(text, ["性格"]),
      assets: inferAssets(text),
      familyBackground: extractValue(text, ["家庭成员", "家庭情况", "家庭"]),
      currentAddress: extractValue(text, ["常住地址", "常住地", "地址"]) || inferWorkLocation(text),
      matchRequirements: extractValue(text, ["相亲需求", "择偶要求", "要求"]),
    }
    form = applyBirthYearDerivedFields(form)
    return normalizeFormDisplays(form)
  },
  buildCloudParsedForm(profile) {
    const nextProfile = profile || {}
    let form = {
      ...buildDefaultForm(),
      name: nextProfile.name || "",
      age: nextProfile.age || "",
      birthYear: nextProfile.birthYear || "",
      gender: nextProfile.gender || "",
      zodiac: nextProfile.zodiac || "",
      heightCm: nextProfile.heightCm || "",
      weightKg: nextProfile.weightKg || "",
      education: nextProfile.education || "",
      religion: nextProfile.religion || "",
      ancestralHome: nextProfile.ancestralHome || "",
      occupation: nextProfile.occupation || "",
      personality: nextProfile.personality || "",
      assets: nextProfile.assets || "",
      familyBackground: nextProfile.familyBackground || "",
      currentAddress: nextProfile.currentAddress || inferWorkLocation([
        this.data.rawText,
        nextProfile.occupation,
      ].filter(Boolean).join("\n")),
      matchRequirements: nextProfile.matchRequirements || "",
      phone: nextProfile.phone || "",
    }
    form = applyBirthYearDerivedFields(form)
    return normalizeFormDisplays(form)
  },
  async handleParseText() {
    const text = this.data.rawText.trim()
    if (!text) {
      wx.showToast({ title: "请先粘贴资料", icon: "none" })
      return
    }

    wx.showLoading({ title: "AI解析中" })
    try {
      const result = await withTimeout(
        parseCandidateText({ rawText: text }),
        30000,
        "AI解析超时",
      )
      if (!result.ok) {
        throw new Error(result.error || "parse failed")
      }

      this.setData({ form: this.buildCloudParsedForm(result.profile) })
      wx.showToast({
        title: result.provider === "rule_only" || result.provider === "rule_fallback" ? "规则解析完成" : "AI解析完成",
        icon: "none",
      })
    } catch (error) {
      this.setData({ form: this.buildLocalParsedForm(text) })
      wx.showToast({ title: "已用本地规则解析", icon: "none" })
      console.error(error)
    } finally {
      wx.hideLoading()
    }
  },
  handleFieldInput(event) {
    const { field } = event.currentTarget.dataset
    const value = event.detail.value

    if (field === "birthYear" || field === "age") {
      this.setData({ [`form.${field}`]: value })
      return
    }

    this.setData({ [`form.${field}`]: value })
  },
  handleDerivedFieldBlur(event) {
    const { field } = event.currentTarget.dataset
    const value = event.detail.value

    if (field === "birthYear") {
      if (!String(value || "").trim()) {
        this.setData({
          "form.birthYear": "",
          "form.zodiac": "",
          "form.zodiacDisplay": "选择",
        })
        return
      }

      const form = applyBirthYearDerivedFields({
        ...this.data.form,
        birthYear: value,
      })
      this.setData({ form })
      return
    }

    if (field === "age") {
      const form = applyBirthYearDerivedFields({
        ...this.data.form,
        age: value,
      })
      this.setData({ form })
      return
    }

    this.setData({ [`form.${field}`]: value })
  },
  handlePickerChange(event) {
    const { field, source } = event.currentTarget.dataset
    const index = Number(event.detail.value)
    const value = this.getPickerSource(source)[index] || ""
    this.setData({
      [`form.${field}`]: value,
      [`form.${field}Display`]: value || "选择",
    })
  },
  getPickerSource(source) {
    if (source === "gender") return genderList
    if (source === "zodiac") return zodiacList
    if (source === "education") return educationList
    if (source === "religion") return religionList
    return []
  },
  handleTagTap(event) {
    const tag = event.currentTarget.dataset.tag
    const selectedTags = this.data.selectedTags.includes(tag)
      ? this.data.selectedTags.filter((item) => item !== tag)
      : this.data.selectedTags.concat(tag)

    this.setData({
      selectedTags,
      tagItems: this.data.tags.map((item) => ({
        name: item,
        className: selectedTags.includes(item) ? "tag-pill selected" : "tag-pill",
      })),
    })
  },
  handleReject() {
    if (this.data.mode === "review") {
      this.reviewProfile("reject")
      return
    }

    wx.navigateBack()
  },
  handleSave() {
    if (!this.ensureGenderSelected()) return

    if (this.data.mode === "review") {
      this.reviewProfile("approve")
      return
    }

    if (this.data.mode === "edit") {
      this.reviewProfile("approve")
      return
    }

    this.submitProfile()
  },
  ensureGenderSelected() {
    const gender = this.data.form && this.data.form.gender
    if (gender === "男" || gender === "女") {
      return true
    }

    wx.showToast({ title: "请选择性别", icon: "none" })
    return false
  },
  buildCandidatePatch(photoAssetIds, thumbnailAssetIds) {
    const form = this.data.form

    return {
      name: form.name || "",
      birthYear: form.birthYear ? Number(form.birthYear) : null,
      age: form.age ? Number(form.age) : null,
      gender: form.gender || "",
      zodiac: form.zodiac || "",
      heightCm: form.heightCm ? Number(form.heightCm) : null,
      weightKg: form.weightKg ? Number(form.weightKg) : null,
      education: form.education || "",
      religion: form.religion || "",
      ancestralHome: form.ancestralHome || "",
      occupation: form.occupation || "",
      personality: form.personality || "",
      assets: {
        house: form.assets || "",
        car: "",
        other: "",
      },
      familyBackground: form.familyBackground || "",
      currentAddress: form.currentAddress || "",
      matchRequirements: form.matchRequirements || "",
      phone: form.phone || "",
      tags: this.data.selectedTags,
      rawText: this.data.rawText,
      photosPresent: photoAssetIds.length > 0,
      photoAssetIds,
      thumbnailAssetIds,
    }
  },
  async submitProfile() {
    const form = this.data.form
    if (!this.ensureGenderSelected()) {
      return
    }

    if (!form.age && !form.birthYear) {
      wx.showToast({ title: "请补年龄或出生年份", icon: "none" })
      return
    }

    if (this.data.photoItems.length === 0) {
      wx.showToast({ title: "请至少上传1张照片", icon: "none" })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: "提交中" })

    try {
      const isBound = await this.ensureCurrentUserBound()
      if (!isBound) return

      const { photoAssetIds, thumbnailAssetIds } = await this.uploadPhotoSet()
      const result = await submitCandidateProfile({
        profile: form,
        tags: this.data.selectedTags,
        rawText: this.data.rawText,
        photoAssetIds,
        thumbnailAssetIds,
        submitter: this.data.submitter,
      })

      if (!result.ok) {
        throw new Error(result.error || "submit failed")
      }

      wx.showToast({
        title: result.needsReview ? "已提交审核" : "已上架",
        icon: "success",
      })

      getApp().globalData.homeProfilesDirty = true

      setTimeout(() => {
        wx.navigateBack()
      }, 600)
    } catch (error) {
      wx.showToast({ title: "提交失败", icon: "none" })
      console.error(error)
    } finally {
      wx.hideLoading()
      this.setData({ saving: false })
    }
  },
  async reviewProfile(action) {
    if (!this.data.candidateId) return
    if (action === "approve" && !this.ensureGenderSelected()) return

    this.setData({ saving: true })
    this.setData({ rejectLoading: action === "reject" })
    wx.showLoading({ title: this.data.mode === "edit" ? "保存中" : (action === "approve" ? "同意中" : "拒绝中") })

    try {
      const { photoAssetIds, thumbnailAssetIds } = await this.uploadPhotoSet()
      const result = await reviewCandidate(this.data.candidateId, {
        action,
        patch: this.buildCandidatePatch(photoAssetIds, thumbnailAssetIds),
      })

      if (!result.ok) {
        throw new Error(result.error || "review failed")
      }

      wx.showToast({ title: this.data.mode === "edit" ? "已保存" : (action === "approve" ? "已同意" : "已拒绝"), icon: "success" })
      getApp().globalData.homeProfilesDirty = true
      setTimeout(() => {
        wx.navigateBack()
      }, 600)
    } catch (error) {
      wx.showToast({ title: "审核失败", icon: "none" })
      console.error(error)
    } finally {
      wx.hideLoading()
      this.setData({ saving: false, rejectLoading: false })
    }
  },
  async uploadPhotoSet() {
    const nextPhotoItems = this.data.photoItems.slice()
    const photoAssetIds = []
    const thumbnailAssetIds = []

    for (let index = 0; index < nextPhotoItems.length; index += 1) {
      const item = nextPhotoItems[index]

      if (item.fileId) {
        photoAssetIds.push(item.fileId)
        thumbnailAssetIds.push(item.thumbnailFileId || "")
        continue
      }

      const extension = this.getImageExtension(item.url)
      const cloudPath = `candidate-submissions/${Date.now()}-${index}.${extension}`
      const result = await wx.cloud.uploadFile({
        cloudPath,
        filePath: item.url,
      })
      const fileId = result.fileID || ""
      const thumbnailFileId = fileId ? await this.uploadThumbnail(item.url, index) : ""
      if (fileId) {
        nextPhotoItems[index] = {
          ...item,
          fileId,
          thumbnailFileId,
          isRemote: true,
        }
        photoAssetIds.push(fileId)
        thumbnailAssetIds.push(thumbnailFileId)
      }
    }

    this.setData({ photoItems: nextPhotoItems })
    return { photoAssetIds, thumbnailAssetIds }
  },
  async uploadThumbnail(filePath, index) {
    try {
      const compressed = await wx.compressImage({
        src: filePath,
        quality: 45,
      })
      const extension = this.getImageExtension(compressed.tempFilePath || filePath)
      const result = await wx.cloud.uploadFile({
        cloudPath: `candidate-thumbnails/${Date.now()}-${index}.${extension}`,
        filePath: compressed.tempFilePath || filePath,
      })
      return result.fileID || ""
    } catch (error) {
      console.error("缩略图生成失败", error)
      return ""
    }
  },
  getImageExtension(filePath) {
    const normalized = String(filePath || "").toLowerCase()
    if (normalized.includes(".png")) return "png"
    if (normalized.includes(".webp")) return "webp"
    if (normalized.includes(".gif")) return "gif"
    return "jpg"
  },
})
