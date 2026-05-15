const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const KEY_ACTIONS = [
  "edit",
  "delete",
  "setSubscription",
  "publicShare",
]

const SEARCH_FIELD_DEFS = [
  { key: "tags", label: "标签", weight: 12, getValue: (candidate) => candidate.tags },
  { key: "occupation", label: "职业", weight: 11, getValue: (candidate) => candidate.occupation },
  { key: "ancestralHome", label: "祖籍", weight: 10, getValue: (candidate) => candidate.ancestralHome },
  { key: "currentAddress", label: "常住地", weight: 9, getValue: (candidate) => candidate.currentAddress },
  { key: "matchRequirements", label: "择偶要求", weight: 8, getValue: (candidate) => candidate.matchRequirements },
  { key: "familyBackground", label: "家庭情况", weight: 7, getValue: (candidate) => candidate.familyBackground },
  { key: "assets", label: "房产情况", weight: 7, getValue: (candidate) => candidate.assets },
  { key: "personality", label: "性格", weight: 6, getValue: (candidate) => candidate.personality },
  { key: "hobbies", label: "爱好", weight: 6, getValue: (candidate) => candidate.hobbies },
  { key: "education", label: "学历", weight: 6, getValue: (candidate) => candidate.education },
  { key: "gender", label: "性别", weight: 5, getValue: (candidate) => candidate.gender },
  { key: "age", label: "年龄", weight: 5, getValue: (candidate) => candidate.age },
  { key: "birthYear", label: "出生年份", weight: 5, getValue: (candidate) => candidate.birthYear },
  { key: "zodiac", label: "生肖", weight: 5, getValue: (candidate) => candidate.zodiac },
  { key: "religion", label: "宗教", weight: 4, getValue: (candidate) => candidate.religion },
  { key: "candidateCode", label: "编号", weight: 4, getValue: (candidate) => candidate.candidateCode },
  { key: "sourceSummary", label: "备注", weight: 3, getValue: (candidate) => candidate.sourceSummary },
  { key: "rawText", label: "原文", weight: 3, getValue: (candidate) => candidate.rawText },
  { key: "submitter", label: "提交人", weight: 2, getValue: (candidate) => candidate.submitter && candidate.submitter.nickname },
  { key: "name", label: "姓名", weight: 1, getValue: (candidate) => candidate.name },
]

const SEARCH_SYNONYMS = {
  公务员: ["公务员", "体制内", "事业单位", "编制", "机关", "国企", "稳定工作", "银行", "光大银行"],
  体制内: ["体制内", "公务员", "事业单位", "编制", "机关", "国企", "银行", "光大银行"],
  编制: ["编制", "体制内", "公务员", "事业单位", "国企", "银行"],
  稳定: ["稳定", "稳定工作", "工作稳定", "体制内", "公务员", "事业单位", "国企", "教师", "医生", "银行", "光大银行"],
  稳定工作: ["稳定工作", "工作稳定", "稳定", "体制内", "公务员", "事业单位", "国企", "银行", "光大银行"],
  银行: ["银行", "光大银行", "体制内", "稳定工作"],
  二婚: ["二婚", "离异", "离婚", "再婚", "二婚带娃", "离异带娃", "离异带孩", "带娃", "带孩"],
  离异: ["离异", "离婚", "二婚", "再婚", "离异带娃", "离异带孩", "带娃", "带孩"],
  离婚: ["离婚", "离异", "二婚", "再婚", "离异带娃", "二婚带娃", "带娃", "带孩"],
  再婚: ["再婚", "二婚", "离异", "离婚"],
  带娃: ["带娃", "带孩", "离异带娃", "二婚带娃", "离异", "二婚"],
  长乐: ["长乐"],
  本科: ["本科", "大学"],
  硕士: ["硕士", "研究生"],
  美女: ["美女", "女", "女生", "女孩", "女士"],
  帅哥: ["帅哥", "男", "男生", "男孩", "男士"],
  女: ["女", "女生", "女孩", "女士"],
  男: ["男", "男生", "男孩", "男士"],
}

const QUICK_FILTER_KEYS = ["male", "female", "secondMarriage", "stableJob", "fuzhou", "changle"]
const SECOND_MARRIAGE_TERMS = ["离异", "离婚", "二婚", "再婚", "离异带娃", "离异带孩", "带娃", "带孩"]
const STABLE_JOB_TERMS = [
  "公务员",
  "国企",
  "央企",
  "事业单位",
  "体制内",
  "编制",
  "在编",
  "机关",
  "教师",
  "医生",
  "银行",
  "电网",
  "烟草",
  "铁路",
  "稳定工作",
  "工作稳定",
]

function normalizeSearchText(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeSearchText).filter(Boolean).join(" ")
  }

  if (value === null || value === undefined) {
    return ""
  }

  return String(value).toLowerCase().replace(/\s+/g, "")
}

function uniqueItems(items) {
  return Array.from(new Set(items.filter(Boolean)))
}

function normalizeQuickFilters(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return uniqueItems(value.map((item) => String(item || "").trim()).filter((item) => QUICK_FILTER_KEYS.includes(item)))
}

function getCandidateText(candidate, keys) {
  return normalizeSearchText(keys.map((key) => {
    const value = candidate[key]
    if (Array.isArray(value)) return value.join(" ")
    if (value && typeof value === "object") return Object.values(value).filter(Boolean).join(" ")
    return value || ""
  }).join(" "))
}

function includesAny(text, terms) {
  const normalizedText = normalizeSearchText(text)
  return terms.some((term) => normalizedText.includes(normalizeSearchText(term)))
}

function isSecondMarriageCandidate(candidate) {
  const text = getCandidateText(candidate, [
    "tags",
    "sourceSummary",
    "rawText",
    "familyBackground",
    "assets",
    "matchRequirements",
  ])
  if (!text) {
    return false
  }

  if (/(不接受|不要|不能接受|拒绝)(离异|离婚|二婚|再婚|带娃|带孩)/.test(text)) {
    return false
  }

  return includesAny(text, SECOND_MARRIAGE_TERMS)
}

function isStableJobCandidate(candidate) {
  const text = getCandidateText(candidate, [
    "tags",
    "occupation",
    "sourceSummary",
    "rawText",
    "familyBackground",
    "matchRequirements",
  ])
  return includesAny(text, STABLE_JOB_TERMS)
}

function getLocationBucket(candidate) {
  const text = getCandidateText(candidate, ["currentAddress", "ancestralHome"])
  if (!text) {
    return ""
  }

  // 地址里同时出现“福州”和“长乐”时，按更精确的长乐归类。
  if (text.includes("长乐")) {
    return "changle"
  }

  if (text.includes("福州")) {
    return "fuzhou"
  }

  return ""
}

function evaluateQuickFilters(candidate, quickFilters) {
  if (!quickFilters.length) {
    return true
  }

  const genderFilters = quickFilters.filter((item) => item === "male" || item === "female")
  if (genderFilters.length > 0) {
    const expectedGenders = genderFilters.map((item) => item === "male" ? "男" : "女")
    if (!expectedGenders.includes(candidate.gender)) {
      return false
    }
  }

  const locationFilters = quickFilters.filter((item) => item === "fuzhou" || item === "changle")
  if (locationFilters.length > 0 && !locationFilters.includes(getLocationBucket(candidate))) {
    return false
  }

  if (quickFilters.includes("secondMarriage") && !isSecondMarriageCandidate(candidate)) {
    return false
  }

  if (quickFilters.includes("stableJob") && !isStableJobCandidate(candidate)) {
    return false
  }

  return true
}

function parseAgeCriteria(keyword) {
  const text = normalizeSearchText(keyword)
  if (!text) {
    return null
  }

  const rangeMatched = text.match(/(?:年龄)?(\d{2})(?:岁)?(?:-|~|到|至)(\d{2})(?:岁)?/)
  if (rangeMatched) {
    const minAge = Number(rangeMatched[1])
    const maxAge = Number(rangeMatched[2])
    if (Number.isFinite(minAge) && Number.isFinite(maxAge)) {
      return {
        min: Math.min(minAge, maxAge),
        max: Math.max(minAge, maxAge),
        label: `${Math.min(minAge, maxAge)}-${Math.max(minAge, maxAge)}岁`,
        raw: rangeMatched[0],
      }
    }
  }

  const minMatched = text.match(/(\d{2})(?:岁)?(?:以上|及以上|起)/)
  if (minMatched) {
    const minAge = Number(minMatched[1])
    if (Number.isFinite(minAge)) {
      return {
        min: minAge,
        max: null,
        label: `${minAge}岁以上`,
        raw: minMatched[0],
      }
    }
  }

  const maxMatched = text.match(/(\d{2})(?:岁)?(?:以下|以内|内)/)
  if (maxMatched) {
    const maxAge = Number(maxMatched[1])
    if (Number.isFinite(maxAge)) {
      return {
        min: null,
        max: maxAge,
        label: `${maxAge}岁以下`,
        raw: maxMatched[0],
      }
    }
  }

  const singleMatched = text.match(/(?:年龄)?(\d{2})(?:岁|左右)?/)
  if (singleMatched) {
    const age = Number(singleMatched[1])
    if (Number.isFinite(age)) {
      return {
        min: age,
        max: age,
        label: `${age}岁`,
        raw: singleMatched[0],
      }
    }
  }

  if (/年轻|年轻点|年轻的|小姑娘/.test(text)) {
    return {
      min: 20,
      max: 32,
      label: "年轻",
      raw: "年轻",
    }
  }

  return null
}

function removeAgeCriteriaText(keyword, ageCriteria) {
  if (!ageCriteria || !ageCriteria.raw) {
    return keyword
  }

  return normalizeSearchText(keyword).replace(ageCriteria.raw, "")
}

function extractSearchTokens(keyword) {
  const text = normalizeSearchText(keyword)
  if (!text) {
    return []
  }

  const rawParts = String(keyword)
    .split(/[\s,，、;；|/]+/)
    .map((item) => normalizeSearchText(item))
    .filter(Boolean)
  const tokens = rawParts.length > 0 ? rawParts : [text]

  Object.keys(SEARCH_SYNONYMS).forEach((key) => {
    const normalizedKey = normalizeSearchText(key)
    if (text.includes(normalizedKey)) {
      tokens.push(normalizedKey)
    }
  })

  if (/女|女生|女孩|女士|美女/.test(text)) {
    tokens.push("女")
  }

  if (/男|男生|男孩|男士|帅哥/.test(text)) {
    tokens.push("男")
  }

  const synonymKeys = Object.keys(SEARCH_SYNONYMS).map(normalizeSearchText)
  const meaningfulTokens = tokens.filter((token) => {
    const matchedKeys = synonymKeys.filter((key) => token.includes(key))
    if (matchedKeys.length === 0) return true
    return matchedKeys.includes(token)
  })

  return uniqueItems(meaningfulTokens)
}

function expandSearchToken(token) {
  const normalizedToken = normalizeSearchText(token)
  const synonymKey = Object.keys(SEARCH_SYNONYMS).find((key) => normalizeSearchText(key) === normalizedToken)
  const synonyms = synonymKey ? SEARCH_SYNONYMS[synonymKey].map(normalizeSearchText) : []
  return uniqueItems([normalizedToken, ...synonyms])
}

function buildSearchGroups(keyword) {
  const ageCriteria = parseAgeCriteria(keyword)
  const keywordWithoutAge = removeAgeCriteriaText(keyword, ageCriteria)
  return extractSearchTokens(keywordWithoutAge).map((token) => ({
    token,
    terms: expandSearchToken(token),
  }))
}

function getSearchFieldText(candidate, field) {
  return normalizeSearchText(field.getValue(candidate))
}

function getGenderToken(token) {
  const normalizedToken = normalizeSearchText(token)
  if (["女", "美女", "女生", "女孩", "女士"].includes(normalizedToken)) {
    return "女"
  }

  if (["男", "帅哥", "男生", "男孩", "男士"].includes(normalizedToken)) {
    return "男"
  }

  return ""
}

function evaluateSearchCandidate(candidate, searchGroups, ageCriteria) {
  const hitReasons = []
  let score = 0

  if (ageCriteria) {
    const age = Number(candidate.age)
    const minAge = ageCriteria.min
    const maxAge = ageCriteria.max
    const matchesMin = minAge === null || age >= minAge
    const matchesMax = maxAge === null || age <= maxAge

    if (!Number.isFinite(age) || !matchesMin || !matchesMax) {
      return {
        matched: false,
        score: 0,
        hitReasons: [],
      }
    }

    score += 10
    hitReasons.push(`年龄命中：${ageCriteria.label}`)
  }

  if (searchGroups.length === 0) {
    return {
      matched: true,
      score,
      hitReasons,
    }
  }

  for (const group of searchGroups) {
    let groupMatched = false
    const genderToken = getGenderToken(group.token)

    if (genderToken) {
      if (candidate.gender !== genderToken) {
        return {
          matched: false,
          score: 0,
          hitReasons: [],
        }
      }

      score += 5
      hitReasons.push(`性别命中：${genderToken}`)
      continue
    }

    for (const field of SEARCH_FIELD_DEFS) {
      const fieldText = getSearchFieldText(candidate, field)
      if (!fieldText) {
        continue
      }

      const matchedTerm = group.terms.find((term) => fieldText.includes(term))
      if (!matchedTerm) {
        continue
      }

      groupMatched = true
      score += field.weight
      hitReasons.push(`${field.label}命中：${matchedTerm}`)
      break
    }

    if (!groupMatched) {
      return {
        matched: false,
        score: 0,
        hitReasons: [],
      }
    }
  }

  return {
    matched: true,
    score,
    hitReasons: uniqueItems(hitReasons).slice(0, 3),
  }
}

function normalizeLimit(value, fallback, max) {
  const limit = Number(value)
  if (!Number.isFinite(limit) || limit <= 0) {
    return fallback
  }

  return Math.min(Math.floor(limit), max)
}

function toTimestamp(value) {
  if (!value) {
    return 0
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === "number") {
    return value
  }

  if (typeof value === "object") {
    if (value.$date && value.$date.$numberLong) {
      return Number(value.$date.$numberLong) || 0
    }

    if (value.$date) {
      const dateValue = typeof value.$date === "object" && value.$date.$numberLong
        ? Number(value.$date.$numberLong)
        : new Date(value.$date).getTime()
      return Number.isFinite(dateValue) ? dateValue : 0
    }
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getSortTimestamp(candidate) {
  return toTimestamp(candidate.updatedAt || candidate.publishedAt || candidate.createdAt)
}

function getCandidateUploadTimestamp(candidate) {
  return toTimestamp(candidate.createdAt || candidate.publishedAt || candidate.updatedAt)
}

async function buildPhotoUrls(photoAssetIds) {
  if (!Array.isArray(photoAssetIds) || photoAssetIds.length === 0) {
    return []
  }

  const result = await cloud.getTempFileURL({
    fileList: photoAssetIds,
  })

  return (result.fileList || [])
    .map((item) => item.tempFileURL || "")
    .filter(Boolean)
}

function isTokenExpired(expiresAt) {
  if (!expiresAt) {
    return false
  }

  const expiresAtDate = new Date(expiresAt)
  return Number.isNaN(expiresAtDate.getTime()) ? false : expiresAtDate.getTime() < Date.now()
}

function redactCandidate(candidate, access) {
  const safeCandidate = { ...candidate }
  const permissionLevel = access.permissionLevel || "text_only"

  if (!access.canViewPhone) {
    delete safeCandidate.phone
  }

  if (!access.canViewName) {
    delete safeCandidate.name
  }

  safeCandidate.canViewPhotos = access.canViewPhotos
  safeCandidate.canViewName = access.canViewName
  safeCandidate.canViewPhone = access.canViewPhone
  safeCandidate.canViewKeyData = access.canViewKeyData
  safeCandidate.canUseKeyActions = access.canUseKeyActions
  safeCandidate.canEdit = access.canEdit
  safeCandidate.canDelete = access.canDelete
  safeCandidate.canSetSubscription = access.canSetSubscription
  safeCandidate.canPublicShare = access.canPublicShare
  safeCandidate.permissionLevel = permissionLevel
  safeCandidate.shareMode = access.shareMode || "private"
  return safeCandidate
}

async function resolveCurrentUser(openid) {
  if (!openid) {
    return null
  }

  const userResult = await db.collection("users").where({ openid }).limit(1).get()
  return userResult.data[0] || null
}

async function resolveDebugCurrentUser(event = {}) {
  const { OPENID } = cloud.getWXContext()
  const allowDebugViewerOverride = process.env.ALLOW_DEBUG_VIEWER_OVERRIDE === "true"

  if (allowDebugViewerOverride && event.debugViewerUserId) {
    try {
      const overrideResult = await db.collection("users").doc(event.debugViewerUserId).get()
      if (overrideResult.data) {
        return overrideResult.data
      }
    } catch (error) {
      // Ignore invalid debug viewer ids and fall back to OPENID resolution.
    }
  }

  return resolveCurrentUser(OPENID)
}

async function resolveSharePermission(candidateId, shareToken) {
  if (!shareToken) {
    return ""
  }

  const result = await db.collection("share_tokens").where({
    token: shareToken,
    candidateId,
    status: "active",
  }).limit(1).get()

  const shareTokenDoc = result.data[0]
  if (!shareTokenDoc) {
    return ""
  }

  if (isTokenExpired(shareTokenDoc.expiresAt)) {
    return ""
  }

  if (
    typeof shareTokenDoc.maxUseCount === "number"
    && shareTokenDoc.maxUseCount > 0
    && typeof shareTokenDoc.useCount === "number"
    && shareTokenDoc.useCount >= shareTokenDoc.maxUseCount
  ) {
    return ""
  }

  return shareTokenDoc.permissionLevel || "text_only"
}

async function resolveUserPermission(currentUser, candidateId) {
  if (!currentUser || !candidateId) {
    return ""
  }

  try {
    const result = await db.collection("candidate_permissions").where({
      viewerUserId: currentUser._id,
      candidateId,
    }).limit(1).get()
    const permission = result.data[0]
    if (!permission) {
      return ""
    }

    if (permission.expiresAt && isTokenExpired(permission.expiresAt)) {
      return ""
    }

    return permission.permissionLevel || ""
  } catch (error) {
    return ""
  }
}

async function resolveMyViewRequestStatus(currentUser, candidateId) {
  if (!currentUser || !candidateId) {
    return ""
  }

  try {
    const result = await db.collection("view_requests").where({
      requesterUserId: currentUser._id,
      candidateId,
    }).limit(20).get()
    const activeRequest = result.data
      .filter((item) => item.status === "pending")
      .sort((left, right) => getSortTimestamp(right) - getSortTimestamp(left))[0]
    return activeRequest ? activeRequest.status : ""
  } catch (error) {
    return ""
  }
}

function buildAccess({
  canViewPhotos = false,
  canViewName = false,
  canViewPhone = false,
  canUseKeyActions = false,
  permissionLevel = "text_only",
  shareMode = "private",
} = {}) {
  const keyActions = canUseKeyActions

  return {
    canViewPhotos,
    canViewName,
    canViewPhone,
    canViewKeyData: canViewPhotos && canViewName && canViewPhone,
    canUseKeyActions: keyActions,
    canEdit: keyActions,
    canDelete: keyActions,
    canSetSubscription: keyActions,
    canPublicShare: keyActions,
    permissionLevel,
    shareMode,
    keyActions: keyActions ? KEY_ACTIONS : [],
  }
}

async function isScopedManager(currentUser, candidateId) {
  if (!currentUser || !candidateId) {
    return false
  }

  try {
    const result = await db.collection("candidate_manager_scopes").where({
      managerUserId: currentUser._id,
      candidateId,
      status: "active",
    }).limit(1).get()
    return result.data.length > 0
  } catch (error) {
    return false
  }
}

function isCandidateCreator(currentUser, candidate) {
  if (!currentUser || !candidate) {
    return false
  }

  const submitter = candidate.submitter || {}
  return Boolean(
    (submitter.userId && submitter.userId === currentUser._id)
    || (candidate.createdBy && candidate.createdBy === currentUser._id),
  )
}

async function resolveAccess(currentUser, candidate, shareToken) {
  const candidateId = candidate && candidate._id ? candidate._id : ""
  const sharePermission = await resolveSharePermission(candidateId, shareToken)
  const userPermission = await resolveUserPermission(currentUser, candidateId)

  if (sharePermission === "public_full") {
    return buildAccess({
      canViewPhotos: true,
      canViewName: false,
      canViewPhone: false,
      canUseKeyActions: false,
      permissionLevel: "public_full",
      shareMode: "public",
    })
  }

  if (currentUser && currentUser.role === "super_admin") {
    return buildAccess({
      canViewPhotos: true,
      canViewName: true,
      canViewPhone: true,
      canUseKeyActions: true,
      permissionLevel: "full_profile",
    })
  }

  if (currentUser && currentUser.role === "manager") {
    const scoped = await isScopedManager(currentUser, candidateId)
    if (scoped) {
      return buildAccess({
        canViewPhotos: true,
        canViewName: true,
        canViewPhone: true,
        canUseKeyActions: true,
        permissionLevel: "full_profile",
      })
    }
  }

  if (isCandidateCreator(currentUser, candidate)) {
    return buildAccess({
      canViewPhotos: true,
      canViewName: true,
      canViewPhone: true,
      canUseKeyActions: false,
      permissionLevel: "creator_key_data",
    })
  }

  if (userPermission === "text_with_photo") {
    return buildAccess({
      canViewPhotos: true,
      canViewName: false,
      canViewPhone: false,
      canUseKeyActions: false,
      permissionLevel: "text_with_photo",
    })
  }

  if (userPermission === "full_profile_no_contact") {
    return buildAccess({
      canViewPhotos: true,
      canViewName: true,
      canViewPhone: false,
      canUseKeyActions: false,
      permissionLevel: "full_profile_no_contact",
    })
  }

  if (userPermission === "full_profile") {
    return buildAccess({
      canViewPhotos: true,
      canViewName: true,
      canViewPhone: true,
      canUseKeyActions: false,
      permissionLevel: "full_profile",
    })
  }

  if (sharePermission === "text_with_photo") {
    return buildAccess({
      canViewPhotos: true,
      canViewName: false,
      canViewPhone: false,
      canUseKeyActions: false,
      permissionLevel: "text_with_photo",
    })
  }

  if (sharePermission === "full_profile_no_contact") {
    return buildAccess({
      canViewPhotos: true,
      canViewName: true,
      canViewPhone: false,
      canUseKeyActions: false,
      permissionLevel: "full_profile_no_contact",
    })
  }

  return buildAccess({
    canViewPhotos: false,
    canViewName: false,
    canViewPhone: false,
    canUseKeyActions: false,
    permissionLevel: "text_only",
  })
}

exports.main = async (event = {}) => {

  if (event.mode === "list") {
    const result = await db.collection("candidates").limit(100).get()
    const filter = event.filter || "all"
    const keyword = event.keyword || ""
    const quickFilters = normalizeQuickFilters(event.quickFilters)
    const limit = normalizeLimit(event.limit, 12, 30)
    const skip = Math.max(0, Number(event.skip || 0) || 0)
    const includePhotos = event.includePhotos !== false
    const currentUser = await resolveDebugCurrentUser(event)
    const ageCriteria = parseAgeCriteria(keyword)
    const searchGroups = buildSearchGroups(keyword)

    const filteredItems = result.data
      .filter((item) => filter === "all" || item.profileStatus === filter)
      .filter((item) => evaluateQuickFilters(item, quickFilters))
      .map((item) => ({
        item,
        search: evaluateSearchCandidate(item, searchGroups, ageCriteria),
      }))
      .filter(({ search }) => search.matched)
      .sort((left, right) => {
        if (searchGroups.length > 0 && left.search.score !== right.search.score) {
          return right.search.score - left.search.score
        }

        return getCandidateUploadTimestamp(right.item) - getCandidateUploadTimestamp(left.item)
      })
      .slice(skip, skip + limit)

    const items = await Promise.all(filteredItems.map(async ({ item, search }) => {
      const access = await resolveAccess(currentUser, item, "")
      const safeItem = redactCandidate(item, access)
      safeItem.myViewRequestStatus = await resolveMyViewRequestStatus(currentUser, item._id)
      safeItem.searchScore = search.score
      safeItem.hitReasons = search.hitReasons

      if (includePhotos) {
        const rawThumbnailAssetIds = Array.isArray(item.thumbnailAssetIds) ? item.thumbnailAssetIds : []
        const rawPhotoAssetIds = Array.isArray(item.photoAssetIds) ? item.photoAssetIds : []
        const primaryThumbnailId = rawThumbnailAssetIds[0] ? [rawThumbnailAssetIds[0]] : []
        const primaryPhotoId = rawPhotoAssetIds[0] ? [rawPhotoAssetIds[0]] : []
        safeItem.thumbnailUrls = await buildPhotoUrls(primaryThumbnailId.length ? primaryThumbnailId : primaryPhotoId)
        safeItem.photoUrls = await buildPhotoUrls(primaryPhotoId)
      } else {
        safeItem.thumbnailUrls = []
        safeItem.photoUrls = []
      }

      if (safeItem.canViewPhotos && includePhotos) {
        safeItem.photoAssetIds = Array.isArray(item.photoAssetIds) && item.photoAssetIds[0]
          ? [item.photoAssetIds[0]]
          : []
      }

      return safeItem
    }))

    return {
      items,
    }
  }

  const candidateId = event.candidateId || ""
  if (!candidateId) {
    return { ok: false, error: "candidateId is required" }
  }

  const candidateResult = await db.collection("candidates").doc(candidateId).get()
  const currentUser = await resolveDebugCurrentUser(event)
  const shareToken = event.shareToken || ""
  const access = await resolveAccess(currentUser, candidateResult.data, shareToken)
  const item = redactCandidate(candidateResult.data, access)
  item.myViewRequestStatus = await resolveMyViewRequestStatus(currentUser, candidateId)
  if (event.source === "trash" && access.canUseKeyActions) {
    item.fromTrash = true
  }

  item.photoUrls = await buildPhotoUrls(candidateResult.data.photoAssetIds || [])

  return {
    ok: true,
    permissionLevel: access.permissionLevel,
    access,
    item,
  }
}
