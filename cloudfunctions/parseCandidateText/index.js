const cloud = require("wx-server-sdk")
const https = require("node:https")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const LLM_PROVIDER = (process.env.LLM_PROVIDER || "mimo").toLowerCase()
const MIMO_BASE_URL = process.env.MIMO_BASE_URL || "https://api.mimo-v2.com/v1"
const MIMO_API_KEY = process.env.MIMO_API_KEY || ""
const MIMO_LLM_MODEL = process.env.MIMO_LLM_MODEL || process.env.MIMO_MODEL || "mimo-v2-pro"
const ARK_BASE_URL = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3"
const ARK_API_KEY = process.env.ARK_API_KEY || ""
const ARK_LLM_MODEL = process.env.ARK_LLM_MODEL || process.env.ARK_MODEL || ""
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""
const OPENAI_LLM_MODEL = process.env.OPENAI_LLM_MODEL || "gpt-4.1-mini"
const LLM_REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS || process.env.OPENAI_REQUEST_TIMEOUT_MS || 8000)

const zodiacList = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"]

function compactString(value) {
  return String(value || "").trim()
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

function normalizeText(text) {
  return compactString(text)
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
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
  const text = compactString(value)
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

function normalizeWeightKg(value) {
  const text = compactString(value)
  if (!text) return ""

  const matched = text.match(/\d+(\.\d+)?/)
  if (!matched) return ""

  const number = Number(matched[0])
  if (text.includes("斤") && number > 60) return String(Math.round(number / 2))
  if (number >= 30 && number <= 180) return String(Math.round(number))
  return ""
}

function inferAssets(text) {
  const labeled = extractValue(text, ["房产情况", "房产", "住房", "房子", "资产"])
  if (labeled) return labeled

  const line = normalizeText(text).split(/\n+/).find((item) => /房|套房|婚房|嫁妆/.test(item))
  return line ? cleanValue(line) : ""
}

function getCurrentYear() {
  return new Date().getFullYear()
}

function normalizeYear(value) {
  const matched = compactString(value).match(/\d{4}/)
  if (!matched) return ""
  const year = Number(matched[0])
  const currentYear = getCurrentYear()
  if (year < 1900 || year > currentYear) return ""
  return String(year)
}

function deriveAgeFromBirthYear(birthYear) {
  const year = Number(normalizeYear(birthYear))
  return year ? String(getCurrentYear() - year) : ""
}

function deriveZodiacFromBirthYear(birthYear) {
  const year = Number(normalizeYear(birthYear))
  return year ? zodiacList[(year - 4) % 12] : ""
}

function inferGender(text, explicitGender) {
  if (explicitGender.includes("男")) return "男"
  if (explicitGender.includes("女")) return "女"
  if (/男孩|男士|男生|小伙/.test(text)) return "男"
  if (/女孩|女士|女生|姑娘/.test(text)) return "女"
  return ""
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

function buildRuleProfile(rawText) {
  const text = normalizeText(rawText)
  const birthYear = normalizeYear(extractValue(text, ["出生", "出生年份", "出生年", "年份"])) || normalizeYear(text)
  const age = birthYear ? deriveAgeFromBirthYear(birthYear) : extractNumber(text, ["年龄", "年纪"])
  const explicitGender = extractValue(text, ["性别"])
  const zodiac = extractValue(text, ["属相", "生肖"]) || deriveZodiacFromBirthYear(birthYear)

  return {
    name: extractValue(text, ["姓名", "名字", "称呼"]),
    birthYear,
    age,
    gender: inferGender(text, explicitGender),
    zodiac,
    heightCm: normalizeHeightCm(extractValue(text, ["身高", "身长", "个子"])),
    weightKg: normalizeWeightKg(extractValue(text, ["体重", "重量"])),
    education: extractValue(text, ["学历", "文化", "文化程度"]),
    religion: extractValue(text, ["宗教", "信仰"]),
    ancestralHome: extractValue(text, ["祖籍", "老家", "籍贯"]),
    occupation: extractValue(text, ["职业", "工作", "岗位"]),
    personality: extractValue(text, ["性格", "性情"]),
    assets: inferAssets(text),
    familyBackground: extractValue(text, ["家庭成员", "家庭情况", "家庭", "家庭背景", "父母情况"]),
    currentAddress: extractValue(text, ["常住地址", "常住地", "现居", "现住址", "地址"]) || inferWorkLocation(text),
    matchRequirements: extractValue(text, ["相亲需求", "择偶要求", "择偶需求", "要求"]),
    phone: extractValue(text, ["联系电话", "电话", "联系方式", "手机号"]),
  }
}

function getProfileSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "name",
      "birthYear",
      "age",
      "gender",
      "zodiac",
      "heightCm",
      "weightKg",
      "education",
      "religion",
      "ancestralHome",
      "occupation",
      "personality",
      "assets",
      "familyBackground",
      "currentAddress",
      "matchRequirements",
      "phone",
      "confidence",
      "uncertainFields",
    ],
    properties: {
      name: { type: ["string", "null"] },
      birthYear: { type: ["integer", "null"] },
      age: { type: ["integer", "null"] },
      gender: { type: ["string", "null"], enum: ["男", "女", "未知", null] },
      zodiac: { type: ["string", "null"] },
      heightCm: { type: ["integer", "null"] },
      weightKg: { type: ["number", "null"] },
      education: { type: ["string", "null"] },
      religion: { type: ["string", "null"] },
      ancestralHome: { type: ["string", "null"] },
      occupation: { type: ["string", "null"] },
      personality: { type: ["string", "null"] },
      assets: { type: ["string", "null"] },
      familyBackground: { type: ["string", "null"] },
      currentAddress: { type: ["string", "null"] },
      matchRequirements: { type: ["string", "null"] },
      phone: { type: ["string", "null"] },
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
  const content = compactString(text)
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

function buildPrompt(rawText, ruleProfile) {
  return [
    "你是相亲资料结构化抽取器。",
    "只根据输入文本抽取字段，不要编造。",
    "如果出生年份和年龄冲突，优先出生年份，并按当前年份计算年龄。",
    "身高统一输出厘米整数，例如 1.73米 输出 173。",
    "体重统一输出公斤，例如 112斤 输出 56。",
    "无法确认的字段填 null。",
    "",
    "规则解析参考：",
    JSON.stringify(ruleProfile, null, 2),
    "",
    "待解析文本：",
    rawText,
  ].join("\n")
}

function buildChatJsonInstruction() {
  return [
    "输出 JSON 对象，字段固定为：",
    "name,birthYear,age,gender,zodiac,heightCm,weightKg,education,religion,ancestralHome,occupation,personality,assets,familyBackground,currentAddress,matchRequirements,phone,confidence,uncertainFields。",
    "birthYear/age/heightCm 为整数或 null，weightKg 为数字或 null。",
    "gender 只能是 男、女、未知 或 null。",
    "confidence 为对象，至少包含 overall 数字；uncertainFields 为字符串数组。",
    "不能确定的字段填 null，不能编造。",
  ].join("\n")
}

async function callLlm(rawText, ruleProfile) {
  const clients = getLlmClients()
  if (clients.length === 0) {
    return null
  }

  let lastError = null
  for (const client of clients) {
    try {
      const result = await callLlmClient(client, rawText, ruleProfile)
      if (result && result.profile) return result
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) throw lastError
  return null
}

async function callLlmClient(client, rawText, ruleProfile) {
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
          content: `${buildPrompt(rawText, ruleProfile)}\n\n${buildChatJsonInstruction()}`,
        },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
      stream: false,
      max_completion_tokens: 1600,
    })
    const message = response.choices && response.choices[0] && response.choices[0].message
      ? response.choices[0].message
      : {}
    const content = message.content || message.reasoning_content || ""
    const parsedProfile = content ? parseJsonObject(content) : null

    return parsedProfile
      ? {
        provider: client.provider,
        profile: parsedProfile,
      }
      : ""
  }

  const response = await buildJsonRequest(`${client.baseUrl}/responses`, {
    __apiKey: client.apiKey,
    model: client.model,
    input: buildPrompt(rawText, ruleProfile),
    text: {
      format: {
        type: "json_schema",
        name: "candidate_profile_parse",
        strict: true,
        schema: getProfileSchema(),
      },
    },
  })

  return response.output_text
    ? {
      provider: client.provider,
      profile: parseJsonObject(response.output_text),
    }
    : null
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

function getLlmClients() {
  const clients = []

  if (LLM_PROVIDER === "mimo" || LLM_PROVIDER === "xiaomi") {
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
        model: ARK_LLM_MODEL,
      })
    }
    return clients
  }

  if ((LLM_PROVIDER === "mimo" || LLM_PROVIDER === "xiaomi" || LLM_PROVIDER === "auto") && isArkConfigured()) {
    clients.push({
      provider: "volcengine",
      protocol: "responses",
      baseUrl: ARK_BASE_URL.replace(/\/$/, ""),
      apiKey: ARK_API_KEY,
      model: ARK_LLM_MODEL,
    })
  }

  if (isOpenAiConfigured()) {
    clients.push({
      provider: "openai",
      protocol: "responses",
      baseUrl: OPENAI_BASE_URL.replace(/\/$/, ""),
      apiKey: OPENAI_API_KEY,
      model: OPENAI_LLM_MODEL,
    })
  }

  return clients
}

function getLlmClient() {
  return getLlmClients()[0] || null
}

function valueToString(value) {
  if (value == null) return ""
  return String(value).trim()
}

function sanitizeProfile(profile, rawText) {
  const next = profile || buildRuleProfile(rawText)
  const birthYear = normalizeYear(next.birthYear)
  const age = birthYear ? deriveAgeFromBirthYear(birthYear) : valueToString(next.age)
  const zodiac = valueToString(next.zodiac) || deriveZodiacFromBirthYear(birthYear)
  const currentAddress = valueToString(next.currentAddress) || inferWorkLocation([
    rawText,
    next.occupation,
  ].filter(Boolean).join("\n"))

  return {
    name: valueToString(next.name),
    birthYear,
    age,
    gender: valueToString(next.gender === "未知" ? "" : next.gender),
    zodiac,
    heightCm: normalizeHeightCm(next.heightCm),
    weightKg: normalizeWeightKg(next.weightKg),
    education: valueToString(next.education),
    religion: valueToString(next.religion),
    ancestralHome: valueToString(next.ancestralHome),
    occupation: valueToString(next.occupation),
    personality: valueToString(next.personality),
    assets: valueToString(next.assets),
    familyBackground: valueToString(next.familyBackground),
    currentAddress,
    matchRequirements: valueToString(next.matchRequirements),
    phone: valueToString(next.phone),
  }
}

exports.main = async (event = {}) => {
  const rawText = normalizeText(event.rawText || "")

  if (!rawText) {
    return { ok: false, error: "rawText is required" }
  }

  const ruleProfile = buildRuleProfile(rawText)

  try {
    const llmResult = await callLlm(rawText, ruleProfile)
    if (llmResult && llmResult.profile) {
      return {
        ok: true,
        provider: llmResult.provider,
        profile: sanitizeProfile(llmResult.profile, rawText),
        confidence: llmResult.profile.confidence || { overall: 0.86 },
        uncertainFields: Array.isArray(llmResult.profile.uncertainFields) ? llmResult.profile.uncertainFields : [],
      }
    }
  } catch (error) {
    return {
      ok: true,
      provider: "rule_fallback",
      profile: sanitizeProfile(ruleProfile, rawText),
      confidence: { overall: 0.72 },
      uncertainFields: [],
      warning: error.message,
    }
  }

  return {
    ok: true,
    provider: "rule_only",
    profile: sanitizeProfile(ruleProfile, rawText),
    confidence: { overall: 0.72 },
    uncertainFields: [],
  }
}
