const cloud = require("wx-server-sdk")
const https = require("node:https")
const {
  inferGenderFromText,
  normalizeMappedValue,
  normalizeWhitespace,
  replaceLabelAliases,
  splitListValue,
} = require("./fieldAliases")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const LLM_PROVIDER = (process.env.LLM_PROVIDER || "mimo").toLowerCase()
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || "https://api.mimo-v2.com/v1"
const MIMO_API_KEY = process.env.MIMO_API_KEY || ""
const MIMO_LLM_MODEL = process.env.MIMO_LLM_MODEL || process.env.MIMO_MODEL || "mimo-v2-pro"
const ARK_BASE_URL = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3"
const ARK_API_KEY = process.env.ARK_API_KEY || ""
const ARK_LLM_MODEL = process.env.ARK_LLM_MODEL || process.env.ARK_MODEL || ""
const ARK_VISION_MODEL = process.env.ARK_VISION_MODEL || ARK_LLM_MODEL
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""
const OPENAI_LLM_MODEL = process.env.OPENAI_LLM_MODEL || "gpt-4.1-mini"
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || OPENAI_LLM_MODEL
const MAX_RETRY_ATTEMPTS = Number(process.env.PARSE_MAX_RETRY_ATTEMPTS || 3)
const LLM_REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS || process.env.OPENAI_REQUEST_TIMEOUT_MS || 12000)

function buildJsonRequest(url, payload) {
  const { __apiKey, __authHeaderName, __authHeaderValuePrefix, ...requestPayload } = payload
  const body = JSON.stringify(requestPayload)
  const target = new URL(url)
  const authHeaderName = __authHeaderName || "Authorization"
  const authHeaderValuePrefix = __authHeaderValuePrefix == null ? "Bearer " : __authHeaderValuePrefix

  return new Promise((resolve, reject) => {
    let settled = false
    const hardTimeout = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error("LLM request timeout"))
    }, LLM_REQUEST_TIMEOUT_MS)

    function finish(callback, value) {
      if (settled) return
      settled = true
      clearTimeout(hardTimeout)
      callback(value)
    }

    const request = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        port: target.port || 443,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          [authHeaderName]: `${authHeaderValuePrefix}${__apiKey}`,
        },
      },
      (response) => {
        const chunks = []
        response.on("data", (chunk) => chunks.push(chunk))
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8")
          const parsed = raw ? JSON.parse(raw) : {}

          if (response.statusCode && response.statusCode >= 400) {
            finish(reject, new Error(parsed.error && parsed.error.message ? parsed.error.message : `LLM request failed with status ${response.statusCode}`))
            return
          }

          finish(resolve, parsed)
        })
      },
    )

    request.setTimeout(LLM_REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("LLM request timeout"))
    })
    request.on("error", (error) => finish(reject, error))
    request.write(body)
    request.end()
  })
}

function parseJsonObject(text) {
  const content = String(text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim()

  try {
    return JSON.parse(content)
  } catch (error) {
    const start = content.indexOf("{")
    const end = content.lastIndexOf("}")
    if (start >= 0 && end > start) {
      return JSON.parse(content.slice(start, end + 1))
    }
    throw error
  }
}

function isMimoConfigured() {
  const key = String(MIMO_API_KEY || "").trim()
  const model = String(MIMO_LLM_MODEL || "").trim()
  if (!key || !model) return false
  if (key === "your-mimo-api-key" || model === "your-mimo-model") return false
  if (key.includes("{{") || model.includes("{{")) return false
  return true
}

function isOpenAiConfigured() {
  const key = String(OPENAI_API_KEY || "").trim()
  if (!key) return false
  if (key === "your-openai-api-key") return false
  if (key.includes("{{")) return false
  return key.startsWith("sk-") && key.length > 30
}

function isArkConfigured() {
  const key = String(ARK_API_KEY || "").trim()
  const model = String(ARK_LLM_MODEL || "").trim()
  if (!key || !model) return false
  if (key === "your-ark-api-key") return false
  if (key.includes("{{") || model.includes("{{")) return false
  return true
}

function getLlmClients(useVision = false) {
  const clients = []

  if ((LLM_PROVIDER === "mimo" || LLM_PROVIDER === "xiaomi") && !useVision) {
    if (isMimoConfigured()) {
      clients.push({
        provider: "mimo",
        protocol: "chat_completions",
        baseUrl: MIMO_BASE_URL.replace(/\/$/, ""),
        apiKey: MIMO_API_KEY,
        authHeaderName: "api-key",
        authHeaderValuePrefix: "",
        model: MIMO_LLM_MODEL,
      })
    }
  }

  if (LLM_PROVIDER === "volcengine" || LLM_PROVIDER === "ark") {
    if (isArkConfigured()) {
      clients.push({
        provider: "volcengine",
        protocol: "responses",
        baseUrl: ARK_BASE_URL.replace(/\/$/, ""),
        apiKey: ARK_API_KEY,
        model: useVision ? ARK_VISION_MODEL : ARK_LLM_MODEL,
      })
    }
    return clients
  }

  if (LLM_PROVIDER === "mimo" || LLM_PROVIDER === "xiaomi" || LLM_PROVIDER === "auto") {
    if (isArkConfigured()) {
      clients.push({
        provider: "volcengine",
        protocol: "responses",
        baseUrl: ARK_BASE_URL.replace(/\/$/, ""),
        apiKey: ARK_API_KEY,
        model: useVision ? ARK_VISION_MODEL : ARK_LLM_MODEL,
      })
    }
  }

  if (isOpenAiConfigured()) {
    clients.push({
      provider: "openai",
      protocol: "responses",
      baseUrl: OPENAI_BASE_URL.replace(/\/$/, ""),
      apiKey: OPENAI_API_KEY,
      model: useVision ? OPENAI_VISION_MODEL : OPENAI_LLM_MODEL,
    })
  }

  return clients
}

function getLlmClient(useVision = false) {
  return getLlmClients(useVision)[0] || null
}

function getProfileSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "name",
      "gender",
      "zodiac",
      "age",
      "heightCm",
      "weightKg",
      "education",
      "personality",
      "hobbies",
      "religion",
      "ancestralHome",
      "occupation",
      "familyBackground",
      "assets",
      "currentAddress",
      "matchRequirements",
      "phone",
      "photosPresent",
      "sourceSummary",
      "confidence",
      "uncertainFields",
    ],
    properties: {
      name: { type: ["string", "null"] },
      gender: { type: "string", enum: ["男", "女", "未知"] },
      zodiac: { type: ["string", "null"] },
      age: { type: ["integer", "null"] },
      heightCm: { type: ["integer", "null"] },
      weightKg: { type: ["number", "null"] },
      education: { type: ["string", "null"] },
      personality: { type: ["string", "null"] },
      hobbies: { type: "array", items: { type: "string" } },
      religion: { type: ["string", "null"] },
      ancestralHome: { type: ["string", "null"] },
      occupation: { type: ["string", "null"] },
      familyBackground: { type: ["string", "null"] },
      assets: {
        type: "object",
        additionalProperties: false,
        required: ["house", "car", "other"],
        properties: {
          house: { type: ["string", "null"] },
          car: { type: ["string", "null"] },
          other: { type: ["string", "null"] },
        },
      },
      currentAddress: { type: ["string", "null"] },
      matchRequirements: { type: ["string", "null"] },
      phone: { type: ["string", "null"] },
      photosPresent: { type: "boolean" },
      sourceSummary: { type: ["string", "null"] },
      confidence: {
        type: "object",
        additionalProperties: { type: "number" },
        required: ["overall"],
        properties: {
          overall: { type: "number" },
        },
      },
      uncertainFields: {
        type: "array",
        items: { type: "string" },
      },
    },
  }
}

function extractValue(rawText, labels) {
  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index]
    const pattern = new RegExp(`${label}\\s*[：:]\\s*([^\\n]+)`)
    const match = rawText.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }

  return null
}

function extractNumber(rawText, labels) {
  const value = extractValue(rawText, labels)
  if (!value) {
    return null
  }

  const matchedNumber = value.match(/\d+(\.\d+)?/)
  return matchedNumber ? Number(matchedNumber[0]) : null
}

function normalizeHeightCm(value) {
  const text = String(value || "").trim()
  if (!text) {
    return null
  }

  const meterWithCm = text.match(/(\d)\s*米\s*(\d{1,2})/)
  if (meterWithCm) {
    return Number(meterWithCm[1]) * 100 + Number(meterWithCm[2].padEnd(2, "0"))
  }

  const meterValue = text.match(/(\d(?:\.\d+)?)\s*(米|m)\b/i)
  if (meterValue) {
    const meters = Number(meterValue[1])
    if (meters > 1 && meters < 3) {
      return Math.round(meters * 100)
    }
  }

  const matchedNumber = text.match(/\d+(\.\d+)?/)
  if (!matchedNumber) {
    return null
  }

  const number = Number(matchedNumber[0])
  if (number > 1 && number < 3) {
    return Math.round(number * 100)
  }
  if (number >= 100 && number <= 230) {
    return Math.round(number)
  }

  return null
}

function extractHeightCm(rawText) {
  return normalizeHeightCm(extractValue(rawText, ["身高", "身长", "个子"]))
}

function normalizeWeightKg(value) {
  const text = String(value || "").trim()
  if (!text) {
    return null
  }

  const matchedNumber = text.match(/\d+(\.\d+)?/)
  if (!matchedNumber) {
    return null
  }

  const number = Number(matchedNumber[0])
  if (text.includes("斤") && number > 60) {
    return Math.round(number / 2)
  }
  if (number >= 30 && number <= 180) {
    return Math.round(number)
  }

  return null
}

function extractWeightKg(rawText) {
  return normalizeWeightKg(extractValue(rawText, ["体重", "重量"]))
}

function inferHouseValue(rawText) {
  const labeled = extractValue(rawText, ["房产", "住房", "房子"])
  if (labeled) {
    return labeled
  }

  const matchedLine = String(rawText || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => /房|套房|婚房|嫁妆/.test(line))

  return matchedLine || null
}

function buildRuleBasedProfile(source, combinedText) {
  const normalizedText = replaceLabelAliases(combinedText)
  const education = normalizeMappedValue("education", extractValue(normalizedText, ["学历", "文化程度"]))
  const religion = normalizeMappedValue("religion", extractValue(normalizedText, ["宗教", "信仰"]))
  const gender = normalizeMappedValue("gender", extractValue(normalizedText, ["性别"])) || inferGenderFromText(normalizedText)
  const hobbiesValue = extractValue(normalizedText, ["爱好", "兴趣爱好", "兴趣"])
  const houseValue = inferHouseValue(normalizedText)
  const carValue = extractValue(normalizedText, ["车辆", "车"])

  const uncertainFields = []
  if (!extractValue(normalizedText, ["姓名", "称呼", "名字"])) {
    uncertainFields.push("name")
  }
  if (!extractValue(normalizedText, ["家庭成员（包含职业）及房产情况", "家庭成员", "家庭情况", "家庭背景"])) {
    uncertainFields.push("familyBackground")
  }
  if (!extractValue(normalizedText, ["联系电话", "电话", "联系方式", "手机号"])) {
    uncertainFields.push("phone")
  }

  return {
    name: extractValue(normalizedText, ["姓名", "称呼", "名字"]) || "",
    gender,
    zodiac: extractValue(normalizedText, ["属相", "生肖"]),
    age: extractNumber(normalizedText, ["年龄", "年纪"]),
    heightCm: extractHeightCm(normalizedText),
    weightKg: extractWeightKg(normalizedText),
    education: education || null,
    personality: extractValue(normalizedText, ["性格", "性情"]),
    hobbies: hobbiesValue ? splitListValue(hobbiesValue) : [],
    religion: religion || null,
    ancestralHome: extractValue(normalizedText, ["祖籍", "籍贯", "老家"]),
    occupation: extractValue(normalizedText, ["职业", "工作", "岗位"]),
    familyBackground: extractValue(normalizedText, ["家庭成员（包含职业）及房产情况", "家庭成员", "家庭情况", "家庭背景", "父母情况"]),
    assets: {
      house: houseValue || null,
      car: carValue || null,
      other: null,
    },
    currentAddress: extractValue(normalizedText, ["常住地址", "现居", "现住址", "居住地"]),
    matchRequirements: extractValue(normalizedText, ["相亲需求", "择偶要求", "择偶需求", "要求"]),
    phone: extractValue(normalizedText, ["联系电话", "电话", "联系方式", "手机号"]),
    photosPresent: Array.isArray(source.photoAssetIds) && source.photoAssetIds.length > 0,
    sourceSummary: extractValue(normalizedText, ["职业", "工作"]) || "待补充摘要",
    confidence: {
      overall: uncertainFields.length === 0 ? 0.9 : 0.78,
      age: extractNumber(normalizedText, ["年龄", "年纪"]) ? 0.96 : 0,
      education: education ? 0.95 : 0,
      occupation: extractValue(normalizedText, ["职业", "工作", "岗位"]) ? 0.92 : 0,
    },
    uncertainFields,
  }
}

async function getTempImageUrls(photoAssetIds) {
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

async function callOpenAiTextWithImages(imageUrls) {
  const client = getLlmClient(true)
  if (!client || imageUrls.length === 0) {
    return ""
  }

  const input = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: "请提取这些图片中的全部中文资料文本，按原意整理成纯文本，不要编造。",
        },
      ].concat(
        imageUrls.map((url) => ({
          type: "input_image",
          image_url: url,
        })),
      ),
    },
  ]

  const response = await buildJsonRequest(`${client.baseUrl}/responses`, {
    __apiKey: client.apiKey,
    model: client.model,
    input,
  })

  return response.output_text || ""
}

function buildStructuredPrompt(combinedText, hasPhotos, ruleBasedProfile) {
  return [
    "你是相亲资料结构化抽取器。",
    "只能根据输入内容提取，不要编造。",
    "无法确认的字段填 null 或空数组。",
    "联系电话只有文本明确出现时才填写。",
    "优先修正规则抽取结果中的缺失和歧义，不要无依据补全。",
    `来源是否含照片：${hasPhotos ? "是" : "否"}`,
    "",
    "规则抽取参考：",
    JSON.stringify(ruleBasedProfile, null, 2),
    "",
    "待处理文本：",
    combinedText,
  ].join("\n")
}

function buildChatJsonInstruction() {
  return [
    "输出 JSON 对象，字段固定为：",
    "name,gender,zodiac,age,heightCm,weightKg,education,personality,hobbies,religion,ancestralHome,occupation,familyBackground,assets,currentAddress,matchRequirements,phone,photosPresent,sourceSummary,confidence,uncertainFields。",
    "assets 为对象，包含 house,car,other。",
    "hobbies/uncertainFields 为字符串数组，photosPresent 为布尔值。",
    "age/heightCm 为整数或 null，weightKg 为数字或 null。",
    "gender 只能是 男、女、未知。",
    "confidence 为对象，至少包含 overall 数字。",
    "不能确定的字段填 null 或空数组，不能编造。",
  ].join("\n")
}

async function callOpenAiStructuredProfile(combinedText, hasPhotos, ruleBasedProfile) {
  const clients = getLlmClients(false)
  if (clients.length === 0) {
    return null
  }

  let lastError = null
  for (const client of clients) {
    try {
      const result = await callStructuredProfileClient(client, combinedText, hasPhotos, ruleBasedProfile)
      if (result) return result
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) throw lastError
  return null
}

async function callStructuredProfileClient(client, combinedText, hasPhotos, ruleBasedProfile) {
  if (client.protocol === "chat_completions") {
    const response = await buildJsonRequest(`${client.baseUrl}/chat/completions`, {
      __apiKey: client.apiKey,
      __authHeaderName: client.authHeaderName,
      __authHeaderValuePrefix: client.authHeaderValuePrefix,
      model: client.model,
      messages: [
        {
          role: "system",
          content: "你是相亲资料结构化抽取器。只输出一个合法 JSON 对象，不要输出 Markdown，不要解释。",
        },
        {
          role: "user",
          content: `${buildStructuredPrompt(combinedText, hasPhotos, ruleBasedProfile)}\n\n${buildChatJsonInstruction()}`,
        },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
      stream: false,
      max_completion_tokens: 2000,
    })
    const message = response.choices && response.choices[0] && response.choices[0].message
      ? response.choices[0].message
      : {}
    const content = message.content || message.reasoning_content || ""
    return content ? parseJsonObject(content) : null
  }

  const response = await buildJsonRequest(`${client.baseUrl}/responses`, {
    __apiKey: client.apiKey,
    model: client.model,
    input: buildStructuredPrompt(combinedText, hasPhotos, ruleBasedProfile),
    text: {
      format: {
        type: "json_schema",
        name: "candidate_profile",
        strict: true,
        schema: getProfileSchema(),
      },
    },
  })

  const outputText = response.output_text || ""
  return outputText ? parseJsonObject(outputText) : null
}

function mergeProfiles(ruleBasedProfile, structuredProfile) {
  if (!structuredProfile) {
    return ruleBasedProfile
  }

  return {
    ...ruleBasedProfile,
    ...structuredProfile,
    assets: {
      house: structuredProfile.assets && structuredProfile.assets.house != null ? structuredProfile.assets.house : ruleBasedProfile.assets.house,
      car: structuredProfile.assets && structuredProfile.assets.car != null ? structuredProfile.assets.car : ruleBasedProfile.assets.car,
      other: structuredProfile.assets && structuredProfile.assets.other != null ? structuredProfile.assets.other : ruleBasedProfile.assets.other,
    },
    hobbies: Array.isArray(structuredProfile.hobbies) && structuredProfile.hobbies.length > 0
      ? structuredProfile.hobbies
      : ruleBasedProfile.hobbies,
    uncertainFields: Array.isArray(structuredProfile.uncertainFields)
      ? structuredProfile.uncertainFields
      : ruleBasedProfile.uncertainFields,
    confidence: structuredProfile.confidence && typeof structuredProfile.confidence.overall === "number"
      ? structuredProfile.confidence
      : ruleBasedProfile.confidence,
  }
}

function sanitizeStructuredProfile(profile, source, combinedText) {
  const safeProfile = profile || buildRuleBasedProfile(source, combinedText)
  const overallConfidence = safeProfile.confidence && typeof safeProfile.confidence.overall === "number"
    ? safeProfile.confidence.overall
    : 0.78
  const sourceType = String(source.sourceType || "")
  const requiresReview = sourceType.startsWith("official_account") || sourceType === "chat_forward"

  return {
    profileStatus: requiresReview || overallConfidence < 0.85 ? "pending_review" : "published",
    visibilityLevel: "text_only",
    name: safeProfile.name || "",
    gender: safeProfile.gender || "未知",
    zodiac: safeProfile.zodiac || null,
    age: typeof safeProfile.age === "number" ? safeProfile.age : null,
    heightCm: typeof safeProfile.heightCm === "number" ? safeProfile.heightCm : null,
    weightKg: typeof safeProfile.weightKg === "number" ? safeProfile.weightKg : null,
    education: safeProfile.education || null,
    personality: safeProfile.personality || null,
    hobbies: Array.isArray(safeProfile.hobbies) ? safeProfile.hobbies : [],
    religion: safeProfile.religion || null,
    ancestralHome: safeProfile.ancestralHome || null,
    occupation: safeProfile.occupation || null,
    familyBackground: safeProfile.familyBackground || null,
    assets: {
      house: safeProfile.assets && safeProfile.assets.house ? safeProfile.assets.house : null,
      car: safeProfile.assets && safeProfile.assets.car ? safeProfile.assets.car : null,
      other: safeProfile.assets && safeProfile.assets.other ? safeProfile.assets.other : null,
    },
    currentAddress: safeProfile.currentAddress || null,
    matchRequirements: safeProfile.matchRequirements || null,
    phone: safeProfile.phone || null,
    photosPresent: Array.isArray(source.photoAssetIds) && source.photoAssetIds.length > 0,
    photoAssetIds: source.photoAssetIds || [],
    sourceSummary: safeProfile.sourceSummary || null,
    rawText: combinedText,
    confidence: safeProfile.confidence && typeof safeProfile.confidence.overall === "number"
      ? safeProfile.confidence
      : { overall: 0.78 },
    uncertainFields: Array.isArray(safeProfile.uncertainFields) ? safeProfile.uncertainFields : [],
  }
}

async function syncCandidateAssets(candidateId, photoAssetIds, now) {
  if (!Array.isArray(photoAssetIds) || photoAssetIds.length === 0) {
    return
  }

  for (let index = 0; index < photoAssetIds.length; index += 1) {
    const fileId = photoAssetIds[index]
    const existingResult = await db.collection("candidate_assets").where({
      candidateId,
      fileId,
    }).limit(1).get()

    if (existingResult.data.length === 0) {
      await db.collection("candidate_assets").add({
        data: {
          candidateId,
          fileId,
          assetType: "photo",
          isPrimary: index === 0,
          visibilityLevel: "private",
          uploadedBy: "system",
          createdAt: now,
        },
      })
    }
  }
}

async function readTask(taskId) {
  if (!taskId) {
    return null
  }

  try {
    const result = await db.collection("parse_tasks").doc(taskId).get()
    return result.data
  } catch (error) {
    return null
  }
}

async function markTaskRunning(taskId, now) {
  if (!taskId) {
    return
  }

  await db.collection("parse_tasks").doc(taskId).update({
    data: {
      status: "running",
      startedAt: now,
      lastAttemptAt: now,
    },
  })
}

async function markTaskSuccess(taskId, profileStatus, now) {
  if (!taskId) {
    return
  }

  await db.collection("parse_tasks").doc(taskId).update({
    data: {
      status: profileStatus === "pending_review" ? "review_required" : "success",
      attemptCount: _.inc(1),
      finishedAt: now,
      nextRetryAt: "",
      errorMessage: "",
    },
  })
}

async function markTaskRetryOrFailure(taskId, task, error, now) {
  if (!taskId) {
    return
  }

  const currentAttempts = task && typeof task.attemptCount === "number" ? task.attemptCount : 0
  const nextAttempt = currentAttempts + 1

  if (nextAttempt < MAX_RETRY_ATTEMPTS) {
    await db.collection("parse_tasks").doc(taskId).update({
      data: {
        status: "queued",
        attemptCount: _.inc(1),
        errorMessage: error.message,
        finishedAt: now,
        nextRetryAt: new Date(now.getTime() + nextAttempt * 60 * 1000),
      },
    })
    return "queued"
  }

  await db.collection("parse_tasks").doc(taskId).update({
    data: {
      status: "failed",
      attemptCount: _.inc(1),
      errorMessage: error.message,
      finishedAt: now,
      nextRetryAt: "",
    },
  })

  return "failed"
}

exports.main = async (event) => {
  const now = new Date()
  const taskId = event.taskId || ""
  const sourceId = event.sourceId || ""

  if (!sourceId) {
    return { ok: false, error: "sourceId is required" }
  }

  const task = await readTask(taskId)
  await markTaskRunning(taskId, now)

  try {
    const sourceResult = await db.collection("raw_sources").doc(sourceId).get()
    const source = sourceResult.data
    const imageUrls = await getTempImageUrls(source.photoAssetIds || [])
    const configuredLlmClient = getLlmClient(false)
    const ocrText = imageUrls.length > 0 ? await callOpenAiTextWithImages(imageUrls) : ""
    const combinedText = normalizeWhitespace([source.rawText || "", ocrText].filter(Boolean).join("\n\n"))
    const ruleBasedProfile = buildRuleBasedProfile(source, combinedText)
    const structuredProfile = await callOpenAiStructuredProfile(combinedText, imageUrls.length > 0, ruleBasedProfile)
    const mergedProfile = mergeProfiles(ruleBasedProfile, structuredProfile)
    const profile = sanitizeStructuredProfile(mergedProfile, source, combinedText)

    const candidatePayload = {
      ...profile,
      createdBy: event.createdBy || "system",
      updatedBy: event.createdBy || "system",
      defaultPhotoVisible: false,
      candidateCode: source.candidateCode || `C${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    }

    let candidateId = source.candidateId || ""

    if (candidateId) {
      await db.collection("candidates").doc(candidateId).update({
        data: {
          ...candidatePayload,
          updatedAt: now,
        },
      })
    } else {
      const candidateResult = await db.collection("candidates").add({
        data: candidatePayload,
      })
      candidateId = candidateResult._id
    }

    await syncCandidateAssets(candidateId, source.photoAssetIds || [], now)

    await db.collection("raw_sources").doc(sourceId).update({
      data: {
        candidateId,
        parseStatus: "parsed",
        parserVersion: "v3",
        ocrText,
        combinedText,
        normalizedText: replaceLabelAliases(combinedText),
        llmProvider: configuredLlmClient ? configuredLlmClient.provider : "rule_only",
      },
    })

    await markTaskSuccess(taskId, profile.profileStatus, new Date())

    return {
      ok: true,
      candidateId,
      profileStatus: profile.profileStatus,
      llmProvider: configuredLlmClient ? configuredLlmClient.provider : "rule_only",
      retryScheduled: false,
    }
  } catch (error) {
    const finalStatus = await markTaskRetryOrFailure(taskId, task, error, new Date())

    return {
      ok: false,
      error: error.message,
      retryScheduled: finalStatus === "queued",
      finalStatus,
    }
  }
}
