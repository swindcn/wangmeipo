const LABEL_ALIASES = {
  name: ["姓名", "称呼", "名字"],
  gender: ["性别"],
  zodiac: ["属相", "生肖"],
  age: ["年龄", "年纪"],
  heightCm: ["身高"],
  weightKg: ["体重"],
  education: ["学历", "文化程度"],
  personality: ["性格", "性情"],
  hobbies: ["爱好", "兴趣爱好", "兴趣"],
  religion: ["宗教", "信仰"],
  ancestralHome: ["祖籍", "籍贯", "老家"],
  occupation: ["职业", "工作", "岗位"],
  familyBackground: [
    "家庭成员（包含职业）及房产情况",
    "家庭成员",
    "家庭情况",
    "家庭背景",
    "父母情况",
  ],
  currentAddress: ["常住地址", "现居", "现住址", "居住地"],
  matchRequirements: ["相亲需求", "择偶要求", "择偶需求", "要求"],
  phone: ["联系电话", "电话", "联系方式", "手机号"],
  assetsHouse: ["房产", "住房", "房子"],
  assetsCar: ["车辆", "车", "用车"],
}

const VALUE_ALIASES = {
  education: {
    本科: ["本科", "大学本科", "全日制本科"],
    硕士: ["硕士", "研究生", "硕士研究生"],
    博士: ["博士", "博士研究生"],
    大专: ["大专", "专科"],
    高中: ["高中", "中专"],
  },
  religion: {
    佛: ["佛", "佛教"],
    基督: ["基督", "基督教"],
    天主: ["天主", "天主教"],
    无: ["无", "无宗教", "无信仰"],
  },
  gender: {
    女: ["女", "女孩", "女生", "姑娘"],
    男: ["男", "男孩", "男生", "小伙"],
  },
}

function unique(list) {
  return Array.from(new Set(list.filter(Boolean)))
}

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function replaceLabelAliases(rawText) {
  let normalized = normalizeWhitespace(rawText)

  Object.entries(LABEL_ALIASES).forEach((entry) => {
    const canonical = entry[0]
    const aliases = entry[1]
    const anchor = aliases[0]

    aliases.forEach((alias) => {
      const pattern = new RegExp(`${alias}\\s*[：:]`, "g")
      normalized = normalized.replace(pattern, `${anchor}：`)
    })

    if (canonical === "assetsHouse") {
      normalized = normalized.replace(/婚房|房子|房产/g, "房产")
    }

    if (canonical === "assetsCar") {
      normalized = normalized.replace(/代步车|车辆/g, "车辆")
    }
  })

  return normalized
}

function normalizeMappedValue(field, value) {
  if (!value) {
    return value
  }

  const text = String(value).trim()
  const dictionary = VALUE_ALIASES[field]

  if (!dictionary) {
    return text
  }

  const found = Object.keys(dictionary).find((canonical) =>
    dictionary[canonical].some((alias) => text.includes(alias)),
  )

  return found || text
}

function splitListValue(value) {
  return unique(String(value || "").split(/[，,、/]/).map((item) => item.trim()))
}

function inferGenderFromText(text) {
  const normalized = String(text || "")

  if (VALUE_ALIASES.gender.女.some((alias) => normalized.includes(alias))) {
    return "女"
  }

  if (VALUE_ALIASES.gender.男.some((alias) => normalized.includes(alias))) {
    return "男"
  }

  return "未知"
}

module.exports = {
  LABEL_ALIASES,
  normalizeMappedValue,
  normalizeWhitespace,
  replaceLabelAliases,
  splitListValue,
  inferGenderFromText,
}
