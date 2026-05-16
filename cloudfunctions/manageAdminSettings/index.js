const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const SEARCH_FIELD_DEFS = [
  { label: "标签", weight: 12, getValue: (candidate) => candidate.tags },
  { label: "职业", weight: 11, getValue: (candidate) => candidate.occupation },
  { label: "祖籍", weight: 10, getValue: (candidate) => candidate.ancestralHome },
  { label: "常住地", weight: 9, getValue: (candidate) => candidate.currentAddress },
  { label: "择偶要求", weight: 8, getValue: (candidate) => candidate.matchRequirements },
  { label: "家庭情况", weight: 7, getValue: (candidate) => candidate.familyBackground },
  { label: "房产情况", weight: 7, getValue: (candidate) => candidate.assets },
  { label: "性格", weight: 6, getValue: (candidate) => candidate.personality },
  { label: "爱好", weight: 6, getValue: (candidate) => candidate.hobbies },
  { label: "学历", weight: 6, getValue: (candidate) => candidate.education },
  { label: "性别", weight: 5, getValue: (candidate) => candidate.gender },
  { label: "年龄", weight: 5, getValue: (candidate) => candidate.age },
  { label: "出生年份", weight: 5, getValue: (candidate) => candidate.birthYear },
  { label: "生肖", weight: 5, getValue: (candidate) => candidate.zodiac },
  { label: "宗教", weight: 4, getValue: (candidate) => candidate.religion },
  { label: "编号", weight: 4, getValue: (candidate) => candidate.candidateCode },
  { label: "备注", weight: 3, getValue: (candidate) => candidate.sourceSummary },
  { label: "原文", weight: 3, getValue: (candidate) => candidate.rawText },
  { label: "提交人", weight: 2, getValue: (candidate) => candidate.submitter && candidate.submitter.nickname },
  { label: "姓名", weight: 1, getValue: (candidate) => candidate.name },
]

const SEARCH_SYNONYMS = {
  公务员: ["公务员", "体制内", "事业单位", "编制", "机关", "国企", "稳定工作"],
  体制内: ["体制内", "公务员", "事业单位", "编制", "机关"],
  编制: ["编制", "体制内", "公务员", "事业单位"],
  稳定: ["稳定", "体制内", "公务员", "事业单位", "国企", "教师", "医生"],
  长乐: ["长乐"],
  本科: ["本科", "大学"],
  硕士: ["硕士", "研究生"],
  女: ["女", "女生", "女孩", "女士"],
  男: ["男", "男生", "男孩", "男士"],
}

function compactString(value) {
  return String(value || "").trim()
}

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

  if (/女|女生|女孩|女士/.test(text)) {
    tokens.push("女")
  }

  if (/男|男生|男孩|男士/.test(text)) {
    tokens.push("男")
  }

  return uniqueItems(tokens)
}

function expandSearchToken(token) {
  const normalizedToken = normalizeSearchText(token)
  const synonymKey = Object.keys(SEARCH_SYNONYMS).find((key) => normalizeSearchText(key) === normalizedToken)
  const synonyms = synonymKey ? SEARCH_SYNONYMS[synonymKey].map(normalizeSearchText) : []
  return uniqueItems([normalizedToken, ...synonyms])
}

function isCjkText(value) {
  return /^[\u4e00-\u9fa5]+$/.test(value)
}

function buildSegmentCandidates(token) {
  const text = normalizeSearchText(token)
  if (!isCjkText(text) || text.length < 4) {
    return []
  }

  const candidates = []
  if (text.length % 2 === 0) {
    const segments = text.match(/.{2}/g) || []
    if (segments.length > 1) candidates.push(segments)
  }

  if (text.length >= 5) {
    candidates.push([text.slice(0, 2), text.slice(2)])
    candidates.push([text.slice(0, 3), text.slice(3)])
  }

  return candidates
    .map((segments) => segments.map(normalizeSearchText).filter((item) => item.length >= 2))
    .filter((segments) => segments.length > 1)
}

function findMatchedSearchTerm(fieldText, terms) {
  const directMatch = terms.find((term) => fieldText.includes(term))
  if (directMatch) {
    return directMatch
  }

  for (const term of terms) {
    const matchedSegments = buildSegmentCandidates(term).find((segments) => (
      segments.every((segment) => fieldText.includes(segment))
    ))
    if (matchedSegments) {
      return matchedSegments.join("+")
    }
  }

  return ""
}

function buildSearchGroups(keyword) {
  const ageCriteria = parseAgeCriteria(keyword)
  const keywordWithoutAge = removeAgeCriteriaText(keyword, ageCriteria)
  return extractSearchTokens(keywordWithoutAge).map((token) => ({
    token,
    terms: expandSearchToken(token),
  }))
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

    for (const field of SEARCH_FIELD_DEFS) {
      const fieldText = normalizeSearchText(field.getValue(candidate))
      if (!fieldText) {
        continue
      }

      const matchedTerm = findMatchedSearchTerm(fieldText, group.terms)
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

function normalizeUser(user) {
  return {
    _id: user._id,
    nickname: user.nickname || "未命名用户",
    avatarUrl: user.avatarUrl || "",
    phone: user.phone || "",
    role: user.role || "viewer",
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  }
}

function normalizeCandidate(candidate) {
  return {
    _id: candidate._id,
    candidateCode: candidate.candidateCode || candidate._id,
    name: candidate.name || "",
    gender: candidate.gender || "",
    age: candidate.age || "",
    ancestralHome: candidate.ancestralHome || "",
    occupation: candidate.occupation || "",
    education: candidate.education || "",
    profileStatus: candidate.profileStatus || "",
    submitterName: candidate.submitter && candidate.submitter.nickname ? candidate.submitter.nickname : "",
    photoAssetIds: Array.isArray(candidate.photoAssetIds) ? candidate.photoAssetIds.slice(0, 1) : [],
  }
}

async function buildPhotoUrl(photoAssetIds) {
  if (!Array.isArray(photoAssetIds) || photoAssetIds.length === 0) {
    return ""
  }

  const result = await cloud.getTempFileURL({ fileList: [photoAssetIds[0]] })
  return result.fileList && result.fileList[0] ? result.fileList[0].tempFileURL || "" : ""
}

async function resolveCurrentUser(event = {}) {
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

  if (!OPENID) {
    return null
  }

  const result = await db.collection("users").where({ openid: OPENID }).limit(1).get()
  return result.data[0] || null
}

async function requireSuperAdmin(event = {}) {
  const currentUser = await resolveCurrentUser(event)
  if (!currentUser || currentUser.role !== "super_admin") {
    throw new Error("forbidden")
  }

  return currentUser
}

function matchesKeyword(values, keyword) {
  if (!keyword) {
    return true
  }

  return values.some((value) => String(value || "").includes(keyword))
}

async function listSettings() {
  const usersResult = await db.collection("users").limit(200).get()
  const scopesResult = await db.collection("candidate_manager_scopes").where({ status: "active" }).limit(500).get()
  const users = usersResult.data.map(normalizeUser)
  const superAdmins = users.filter((user) => user.role === "super_admin")
  const managers = users.filter((user) => user.role === "manager")
  const scopeCountByManager = scopesResult.data.reduce((result, item) => {
    result[item.managerUserId] = (result[item.managerUserId] || 0) + 1
    return result
  }, {})

  return {
    ok: true,
    superAdmins,
    managers: managers.map((manager) => ({
      ...manager,
      scopeCount: scopeCountByManager[manager._id] || 0,
    })),
  }
}

async function searchUsers(event = {}) {
  const keyword = compactString(event.keyword)
  const usersResult = await db.collection("users").limit(200).get()
  const users = usersResult.data
    .map(normalizeUser)
    .filter((user) => matchesKeyword([user.nickname, user.phone], keyword))
    .slice(0, 50)

  return { ok: true, users }
}

async function setSuperAdmin(event = {}, currentUser) {
  const userId = compactString(event.userId)
  if (!userId) {
    return { ok: false, error: "userId is required" }
  }

  const now = new Date()
  await db.collection("users").doc(userId).update({
    data: {
      role: "super_admin",
      roleUpdatedBy: currentUser._id,
      updatedAt: now,
    },
  })

  return { ok: true }
}

async function getScopeEditorData(event = {}) {
  const managerUserId = compactString(event.managerUserId)
  let manager = null
  let scopes = []

  if (managerUserId) {
    try {
      const managerResult = await db.collection("users").doc(managerUserId).get()
      manager = managerResult.data ? normalizeUser(managerResult.data) : null
    } catch (error) {
      manager = null
    }

    const scopesResult = await db.collection("candidate_manager_scopes").where({
      managerUserId,
      status: "active",
    }).limit(500).get()
    scopes = scopesResult.data
  }

  const candidateIds = scopes.map((item) => item.candidateId).filter(Boolean)
  let selectedCandidates = []
  if (candidateIds.length > 0) {
    const candidatesResult = await db.collection("candidates").where({
      _id: _.in(candidateIds),
    }).limit(100).get()

    selectedCandidates = await Promise.all(candidatesResult.data.map(async (item) => {
      const candidate = normalizeCandidate(item)
      return {
        ...candidate,
        photoUrl: await buildPhotoUrl(candidate.photoAssetIds),
      }
    }))
  }

  return {
    ok: true,
    manager,
    selectedCandidates,
  }
}

async function searchCandidates(event = {}) {
  const keyword = compactString(event.keyword)
  const gender = compactString(event.gender)
  const result = await db.collection("candidates").limit(200).get()
  const ageCriteria = parseAgeCriteria(keyword)
  const searchGroups = buildSearchGroups(keyword)
  const candidates = result.data
    .filter((item) => item.profileStatus !== "deleted")
    .filter((item) => !gender || gender === "ALL" || item.gender === gender)
    .map((item) => ({
      item,
      search: evaluateSearchCandidate(item, searchGroups, ageCriteria),
    }))
    .filter(({ search }) => search.matched)
    .sort((left, right) => {
      if (searchGroups.length > 0 && left.search.score !== right.search.score) {
        return right.search.score - left.search.score
      }

      return getSortTimestamp(right.item) - getSortTimestamp(left.item)
    })
    .slice(0, 80)

  const items = await Promise.all(candidates.map(async ({ item, search }) => {
    const candidate = normalizeCandidate(item)
    return {
      ...candidate,
      searchScore: search.score,
      hitReasons: search.hitReasons,
      photoUrl: await buildPhotoUrl(candidate.photoAssetIds),
    }
  }))

  return { ok: true, candidates: items }
}

async function saveManagerScope(event = {}, currentUser) {
  const managerUserId = compactString(event.managerUserId)
  const candidateIds = Array.isArray(event.candidateIds)
    ? Array.from(new Set(event.candidateIds.map(compactString).filter(Boolean)))
    : []

  if (!managerUserId) {
    return { ok: false, error: "managerUserId is required" }
  }

  const now = new Date()
  await db.collection("users").doc(managerUserId).update({
    data: {
      role: "manager",
      roleUpdatedBy: currentUser._id,
      updatedAt: now,
    },
  })

  const existingResult = await db.collection("candidate_manager_scopes").where({ managerUserId }).limit(500).get()
  const nextCandidateIdSet = candidateIds.reduce((result, candidateId) => {
    result[candidateId] = true
    return result
  }, {})

  await Promise.all(existingResult.data.map((item) => {
    if (nextCandidateIdSet[item.candidateId]) {
      return db.collection("candidate_manager_scopes").doc(item._id).update({
        data: {
          status: "active",
          updatedAt: now,
        },
      })
    }

    return db.collection("candidate_manager_scopes").doc(item._id).update({
      data: {
        status: "revoked",
        updatedAt: now,
      },
    })
  }))

  const existingCandidateIdSet = existingResult.data.reduce((result, item) => {
    result[item.candidateId] = true
    return result
  }, {})

  await Promise.all(candidateIds
    .filter((candidateId) => !existingCandidateIdSet[candidateId])
    .map((candidateId) => db.collection("candidate_manager_scopes").add({
      data: {
        managerUserId,
        candidateId,
        status: "active",
        grantedBy: currentUser._id,
        createdAt: now,
        updatedAt: now,
      },
    })))

  return { ok: true, scopeCount: candidateIds.length }
}

exports.main = async (event = {}) => {
  const currentUser = await requireSuperAdmin(event)
  const action = event.action || "listSettings"

  if (action === "listSettings") {
    return listSettings()
  }

  if (action === "searchUsers") {
    return searchUsers(event)
  }

  if (action === "setSuperAdmin") {
    return setSuperAdmin(event, currentUser)
  }

  if (action === "getScopeEditorData") {
    return getScopeEditorData(event)
  }

  if (action === "searchCandidates") {
    return searchCandidates(event)
  }

  if (action === "saveManagerScope") {
    return saveManagerScope(event, currentUser)
  }

  return { ok: false, error: "unknown action" }
}
