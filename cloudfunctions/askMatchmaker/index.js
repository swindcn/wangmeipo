const cloud = require("wx-server-sdk")
const https = require("node:https")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || "https://api.mimo-v2.com/v1"
const MIMO_API_KEY = process.env.MIMO_API_KEY || ""
const MIMO_LLM_MODEL = process.env.MIMO_LLM_MODEL || process.env.MIMO_MODEL || "mimo-v2-pro"
const LLM_REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS || process.env.OPENAI_REQUEST_TIMEOUT_MS || 8000)
const CHAT_COLLECTION = "ask_matchmaker_chats"

function compactString(value) {
  return String(value || "").trim()
}

function normalizePositiveNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null
}

function isMimoConfigured() {
  const key = compactString(MIMO_API_KEY)
  const model = compactString(MIMO_LLM_MODEL)
  if (!key || !model) return false
  if (key === "your-mimo-api-key" || model === "your-mimo-model") return false
  if (key.includes("{{") || model.includes("{{")) return false
  return true
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

function normalizeIntent(intent = {}, fallbackKeyword) {
  const keywordParts = []
  const pushText = (value) => {
    const text = compactString(value)
    if (text) keywordParts.push(text)
  }

  pushText(intent.gender)
  if (intent.ageMin && intent.ageMax) {
    pushText(`${intent.ageMin}-${intent.ageMax}岁`)
  } else if (intent.ageMin) {
    pushText(`${intent.ageMin}岁以上`)
  } else if (intent.ageMax) {
    pushText(`${intent.ageMax}岁以下`)
  }
  ;[
    intent.location,
    intent.ancestralHome,
    intent.education,
    intent.occupation,
    intent.jobType,
    intent.personality,
    intent.assets,
    intent.family,
  ].forEach(pushText)

  if (Array.isArray(intent.tags)) {
    intent.tags.forEach(pushText)
  }

  const normalizedAgeMin = normalizePositiveNumber(intent.ageMin)
  const normalizedAgeMax = normalizePositiveNumber(intent.ageMax)
  const keyword = Array.from(new Set(keywordParts)).join(" ") || fallbackKeyword
  const relaxedKeyword = buildRelaxedKeyword({
    ...intent,
    ageMin: normalizedAgeMin,
    ageMax: normalizedAgeMax,
    keyword,
  }, fallbackKeyword)

  return {
    gender: ["男", "女"].includes(intent.gender) ? intent.gender : "",
    ageMin: normalizedAgeMin,
    ageMax: normalizedAgeMax,
    location: compactString(intent.location),
    ancestralHome: compactString(intent.ancestralHome),
    education: compactString(intent.education),
    occupation: compactString(intent.occupation),
    jobType: compactString(intent.jobType),
    personality: compactString(intent.personality),
    assets: compactString(intent.assets),
    family: compactString(intent.family),
    tags: Array.isArray(intent.tags) ? intent.tags.map(compactString).filter(Boolean).slice(0, 8) : [],
    keyword,
    relaxedKeyword,
  }
}

function buildRelaxedKeyword(intent = {}, fallbackKeyword) {
  const parts = []
  const pushText = (value) => {
    const text = compactString(value)
    if (text) parts.push(text)
  }

  pushText(intent.gender)
  if (intent.ageMin && intent.ageMax) {
    pushText(`${intent.ageMin}-${intent.ageMax}岁`)
  } else if (/年轻/.test(fallbackKeyword)) {
    pushText("20-32岁")
  }

  ;[
    intent.location,
    intent.ancestralHome,
    intent.education,
    intent.occupation,
    intent.jobType,
  ].forEach(pushText)

  const tags = Array.isArray(intent.tags) ? intent.tags : []
  tags
    .filter((item) => !/美女|帅哥|年轻|性格|家境/.test(compactString(item)))
    .map((item) => (/体制内|公务员|事业单位|编制|国企|银行|工作稳定|稳定工作/.test(compactString(item)) ? "稳定工作" : item))
    .forEach(pushText)

  const text = fallbackKeyword || ""
  if (/美女|女/.test(text)) pushText("女")
  if (/帅哥|男/.test(text)) pushText("男")
  if (/体制内|公务员|事业单位|编制|国企|银行|稳定/.test(text)) pushText("稳定工作")

  return Array.from(new Set(parts)).join(" ") || fallbackKeyword
}

function buildRuleIntent(question) {
  const text = compactString(question)
  const intent = {
    gender: "",
    ageMin: null,
    ageMax: null,
    location: "",
    ancestralHome: "",
    education: "",
    occupation: "",
    jobType: "",
    personality: "",
    assets: "",
    family: "",
    tags: [],
  }

  if (/女|女生|女孩|女士/.test(text)) intent.gender = "女"
  if (/美女/.test(text)) intent.gender = "女"
  if (/男|男生|男孩|男士/.test(text)) intent.gender = "男"
  if (/帅哥/.test(text)) intent.gender = "男"

  const range = text.match(/(\d{2})(?:岁)?(?:-|~|到|至)(\d{2})(?:岁)?/)
  if (range) {
    intent.ageMin = Math.min(Number(range[1]), Number(range[2]))
    intent.ageMax = Math.max(Number(range[1]), Number(range[2]))
  }

  const minAge = text.match(/(\d{2})(?:岁)?(?:以上|及以上|起)/)
  if (minAge) intent.ageMin = Number(minAge[1])

  const maxAge = text.match(/(\d{2})(?:岁)?(?:以下|以内|内)/)
  if (maxAge) intent.ageMax = Number(maxAge[1])

  if (!intent.ageMin && !intent.ageMax && /年轻/.test(text)) {
    intent.ageMin = 20
    intent.ageMax = 32
  }

  ;["长乐", "福州", "闽侯", "福清", "仓山", "鼓楼"].forEach((item) => {
    if (text.includes(item)) {
      intent.location = item
      intent.ancestralHome = item
    }
  })

  ;["本科", "大专", "硕士", "研究生", "高中"].forEach((item) => {
    if (text.includes(item)) intent.education = item
  })

  ;["公务员", "体制内", "事业单位", "教师", "医生", "护士", "国企", "银行", "光大银行", "稳定工作", "程序员"].forEach((item) => {
    if (text.includes(item)) intent.tags.push(item)
  })

  return normalizeIntent(intent, text)
}

async function resolveCurrentUser(event = {}) {
  const { OPENID } = cloud.getWXContext()

  if (event.debugViewerUserId) {
    try {
      const overrideResult = await db.collection("users").doc(event.debugViewerUserId).get()
      if (overrideResult.data) {
        return overrideResult.data
      }
    } catch (error) {
      // Ignore invalid debug viewer ids and fall back to OPENID.
    }
  }

  if (!OPENID) {
    return null
  }

  const result = await db.collection("users").where({ openid: OPENID }).limit(1).get()
  return result.data[0] || null
}

function normalizeChatMessage(item = {}) {
  return {
    role: item.role === "user" ? "user" : "assistant",
    text: compactString(item.text).slice(0, 1000),
    pending: Boolean(item.pending),
  }
}

function normalizeChatCandidate(item = {}) {
  return {
    _id: compactString(item._id),
    title: compactString(item.title).slice(0, 80),
    code: compactString(item.code).slice(0, 40),
    summary: compactString(item.summary).slice(0, 120),
    tags: Array.isArray(item.tags) ? item.tags.map(compactString).filter(Boolean).slice(0, 5) : [],
    photoUrl: compactString(item.photoUrl),
    locked: Boolean(item.locked),
  }
}

async function loadChat(event = {}) {
  const currentUser = await resolveCurrentUser(event)
  if (!currentUser || !currentUser._id) {
    return { ok: true, messages: [], candidates: [] }
  }

  try {
    const result = await db.collection(CHAT_COLLECTION).doc(currentUser._id).get()
    const data = result.data || {}
    return {
      ok: true,
      messages: Array.isArray(data.messages) ? data.messages : [],
      candidates: Array.isArray(data.candidates) ? data.candidates : [],
      updatedAt: data.updatedAt || null,
    }
  } catch (error) {
    return { ok: true, messages: [], candidates: [] }
  }
}

async function saveChat(event = {}) {
  const currentUser = await resolveCurrentUser(event)
  if (!currentUser || !currentUser._id) {
    return { ok: false, error: "user is not registered" }
  }

  const now = new Date()
  const messages = Array.isArray(event.messages)
    ? event.messages.map(normalizeChatMessage).filter((item) => item.text).slice(-40)
    : []
  const candidates = Array.isArray(event.candidates)
    ? event.candidates.map(normalizeChatCandidate).filter((item) => item._id).slice(0, 30)
    : []

  const data = {
    userId: currentUser._id,
    openid: currentUser.openid || "",
    messages,
    candidates,
    updatedAt: now,
  }

  try {
    await db.collection(CHAT_COLLECTION).doc(currentUser._id).set({
      data: {
        ...data,
        createdAt: now,
      },
    })
  } catch (error) {
    await db.collection(CHAT_COLLECTION).doc(currentUser._id).update({ data })
  }

  return { ok: true, updatedAt: now }
}

async function parseIntentWithMimo(question) {
  if (!isMimoConfigured()) {
    return null
  }

  const response = await buildJsonRequest(`${MIMO_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    __apiKey: MIMO_API_KEY,
    __authHeaderName: "api-key",
    __authHeaderValuePrefix: "",
    model: MIMO_LLM_MODEL,
    messages: [
      {
        role: "system",
        content: "你是相亲需求解析器。只输出合法 JSON，不输出 Markdown，不解释。",
      },
      {
        role: "user",
        content: [
          "把用户相亲需求解析成 JSON。",
          "字段固定为：gender,ageMin,ageMax,location,ancestralHome,education,occupation,jobType,personality,assets,family,tags,summary。",
          "gender 只能是 男、女 或空字符串。",
          "ageMin/ageMax 是数字或 null。",
          "美女是宽泛概念，应理解为女性；帅哥是宽泛概念，应理解为男性；二者都不要作为必须命中的标签。",
          "只有用户明确说年轻、年轻点、小姑娘、小伙子时，才倾向加入年轻年龄段。",
          "体制内、公务员、事业单位、编制、国企、银行、工作稳定是相近概念。",
          "tags 是字符串数组，用于保留重要关键词，例如 公务员、体制内、银行、家境好、有房、长乐。",
          "不要编造用户没说的信息，不能确定则空字符串、null 或空数组。",
          `用户需求：${question}`,
        ].join("\n"),
      },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
    stream: false,
    max_completion_tokens: 900,
  })

  const message = response.choices && response.choices[0] && response.choices[0].message
    ? response.choices[0].message
    : {}
  const content = message.content || message.reasoning_content || ""
  return content ? parseJsonObject(content) : null
}

exports.main = async (event = {}) => {
  if (event.action === "loadChat") {
    return loadChat(event)
  }

  if (event.action === "saveChat") {
    return saveChat(event)
  }

  const question = compactString(event.question)
  if (!question) {
    return { ok: false, error: "question is required" }
  }

  try {
    const llmIntent = await parseIntentWithMimo(question)
    if (llmIntent) {
      const intent = normalizeIntent(llmIntent, question)
      return {
        ok: true,
        provider: "mimo",
        intent,
        keyword: intent.keyword,
        relaxedKeyword: intent.relaxedKeyword,
        reply: llmIntent.summary || `我先按“${intent.keyword}”帮你筛选会员。`,
      }
    }
  } catch (error) {
    const intent = buildRuleIntent(question)
    return {
      ok: true,
      provider: "rule_fallback",
      intent,
      keyword: intent.keyword,
      relaxedKeyword: intent.relaxedKeyword,
      reply: `MiMO 解析暂时失败，先按“${intent.keyword}”帮你筛选。`,
      warning: error.message,
    }
  }

  const intent = buildRuleIntent(question)
  return {
    ok: true,
    provider: "rule_only",
    intent,
    keyword: intent.keyword,
    relaxedKeyword: intent.relaxedKeyword,
    reply: `我先按“${intent.keyword}”帮你筛选会员。`,
  }
}
