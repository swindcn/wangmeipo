const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function compactString(value) {
  return String(value || "").trim()
}

function toNumber(value) {
  const matched = String(value || "").match(/\d+(\.\d+)?/)
  return matched ? Number(matched[0]) : null
}

function getCurrentYear() {
  return new Date().getFullYear()
}

function normalizeBirthYear(value) {
  const year = toNumber(value)
  const currentYear = getCurrentYear()
  if (!year || year < 1900 || year > currentYear) {
    return null
  }
  return year
}

function deriveAgeFromBirthYear(birthYear) {
  const year = normalizeBirthYear(birthYear)
  return year ? getCurrentYear() - year : null
}

function deriveZodiacFromBirthYear(birthYear) {
  const zodiacs = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"]
  const year = normalizeBirthYear(birthYear)
  return year ? zodiacs[(year - 4) % 12] : ""
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function cleanValue(value) {
  return compactString(value)
    .replace(/^[：:\s]+/, "")
    .replace(/[。；;，,、\s]+$/, "")
    .trim()
}

function extractValue(text, aliases) {
  const normalized = compactString(text).replace(/\r/g, "\n")
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

function normalizeHeightCm(value) {
  const text = compactString(value)
  if (!text) return null

  const meterWithCm = text.match(/(\d)\s*米\s*(\d{1,2})/)
  if (meterWithCm) {
    return Number(meterWithCm[1]) * 100 + Number(meterWithCm[2].padEnd(2, "0"))
  }

  const meterValue = text.match(/(\d(?:\.\d+)?)\s*(米|m)\b/i)
  if (meterValue) {
    const meters = Number(meterValue[1])
    if (meters > 1 && meters < 3) return Math.round(meters * 100)
  }

  const number = toNumber(text)
  if (number && number > 1 && number < 3) return Math.round(number * 100)
  if (number && number >= 100 && number <= 230) return Math.round(number)
  return null
}

function normalizeWeightKg(value) {
  const text = compactString(value)
  if (!text) return null
  const number = toNumber(text)
  if (!number) return null
  if (text.includes("斤") && number > 60) return Math.round(number / 2)
  if (number >= 30 && number <= 180) return Math.round(number)
  return null
}

function inferAssetsFromText(rawText) {
  const labeled = extractValue(rawText, ["房产情况", "房产", "住房", "房子", "资产"])
  if (labeled) return labeled

  const line = compactString(rawText)
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .find((item) => /房|套房|婚房|嫁妆/.test(item))

  return line ? cleanValue(line) : ""
}

function buildCandidateCode() {
  const date = new Date()
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("")
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `WM-${stamp}-${suffix}`
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
      // Fall back to OPENID resolution.
    }
  }

  const userResult = await db.collection("users").where({ openid: OPENID }).limit(1).get()
  return userResult.data[0] || {
    _id: OPENID,
    openid: OPENID,
    nickname: "",
    avatarUrl: "",
    phone: "",
    role: "viewer",
  }
}

function buildSourceSummary(profile) {
  return [
    compactString(profile.ancestralHome),
    compactString(profile.occupation),
    compactString(profile.education),
    compactString(profile.personality),
  ].filter(Boolean).slice(0, 3).join("，")
}

exports.main = async (event = {}) => {
  const now = new Date()
  const profile = event.profile || {}
  const photoAssetIds = Array.isArray(event.photoAssetIds) ? event.photoAssetIds.slice(0, 3) : []
  const tags = Array.isArray(event.tags) ? event.tags.map(compactString).filter(Boolean).slice(0, 20) : []
  const rawText = compactString(event.rawText)
  const submitter = event.submitter || {}
  const currentUser = await resolveCurrentUser(event)
  const isManager = currentUser.role === "manager" || currentUser.role === "super_admin"
  const profileStatus = isManager ? "published" : "pending_review"
  const name = compactString(profile.name)
  const birthYear = normalizeBirthYear(profile.birthYear)
  const age = deriveAgeFromBirthYear(birthYear) || toNumber(profile.age)
  const zodiac = compactString(profile.zodiac) || deriveZodiacFromBirthYear(birthYear)
  const heightCm = normalizeHeightCm(profile.heightCm) || normalizeHeightCm(extractValue(rawText, ["身高", "身长", "个子"]))
  const weightKg = normalizeWeightKg(profile.weightKg) || normalizeWeightKg(extractValue(rawText, ["体重", "重量"]))
  const houseAssets = compactString(profile.assets) || inferAssetsFromText(rawText)

  if (!age) {
    return {
      ok: false,
      error: "age or birthYear is required",
    }
  }

  if (photoAssetIds.length === 0) {
    return {
      ok: false,
      error: "at least one photo is required",
    }
  }

  const submitterSnapshot = {
    userId: currentUser._id,
    openid: currentUser.openid || "",
    nickname: compactString(submitter.nickname) || currentUser.nickname || "",
    avatarUrl: compactString(submitter.avatarUrl) || currentUser.avatarUrl || "",
    phone: compactString(submitter.phone) || currentUser.phone || "",
    role: currentUser.role || "viewer",
  }

  const candidateRecord = {
    candidateCode: buildCandidateCode(),
    profileStatus,
    visibilityLevel: "text_only",
    name,
    gender: compactString(profile.gender),
    zodiac,
    birthYear,
    age,
    heightCm,
    weightKg,
    education: compactString(profile.education),
    personality: compactString(profile.personality),
    hobbies: Array.isArray(profile.hobbies) ? profile.hobbies.map(compactString).filter(Boolean) : [],
    religion: compactString(profile.religion),
    ancestralHome: compactString(profile.ancestralHome),
    occupation: compactString(profile.occupation),
    familyBackground: compactString(profile.familyBackground),
    assets: {
      house: houseAssets,
      car: "",
      other: "",
    },
    currentAddress: compactString(profile.currentAddress),
    matchRequirements: compactString(profile.matchRequirements),
    phone: compactString(profile.phone),
    tags,
    photosPresent: photoAssetIds.length > 0,
    photoAssetIds,
    sourceSummary: buildSourceSummary(profile),
    rawText,
    confidence: {
      overall: rawText ? 0.86 : 0.75,
    },
    uncertainFields: [],
    createdBy: currentUser._id,
    updatedBy: currentUser._id,
    submitter: submitterSnapshot,
    defaultPhotoVisible: false,
    createdAt: now,
    updatedAt: now,
    publishedAt: isManager ? now : null,
  }

  const addResult = await db.collection("candidates").add({ data: candidateRecord })

  await db.collection("raw_sources").add({
    data: {
      sourceType: "mini_program_manual_submit",
      sourceMessageId: "",
      rawText,
      photoAssetIds,
      remoteImageUrls: [],
      sourceUrl: "",
      parseStatus: "manual_submitted",
      parserVersion: "manual-v1",
      createdBy: currentUser._id,
      candidateId: addResult._id,
      submitter: submitterSnapshot,
      createdAt: now,
    },
  })

  await db.collection("audit_logs").add({
    data: {
      actorUserId: currentUser._id,
      targetType: "candidate",
      targetId: addResult._id,
      action: isManager ? "submit_candidate_published" : "submit_candidate_pending_review",
      metadata: {
        tags,
        photoCount: photoAssetIds.length,
        submitter: submitterSnapshot,
      },
      createdAt: now,
    },
  })

  return {
    ok: true,
    candidateId: addResult._id,
    profileStatus,
    needsReview: !isManager,
  }
}
