export type CandidateFieldKey =
  | "name"
  | "gender"
  | "zodiac"
  | "age"
  | "heightCm"
  | "weightKg"
  | "education"
  | "personality"
  | "hobbies"
  | "religion"
  | "ancestralHome"
  | "occupation"
  | "familyBackground"
  | "assets.house"
  | "assets.car"
  | "assets.other"
  | "currentAddress"
  | "matchRequirements"
  | "phone"

export type VisibilityLevel = "text_only" | "partial" | "full"
export type ProfileStatus = "draft" | "pending_review" | "published" | "frozen"
export type Gender = "男" | "女" | "未知"

export interface CandidateAssets {
  house: string | null
  car: string | null
  other: string | null
}

export interface CandidateProfileStructuredData {
  profileStatus: ProfileStatus
  visibilityLevel: VisibilityLevel
  name: string
  gender: Gender
  zodiac: string | null
  age: number | null
  heightCm: number | null
  weightKg: number | null
  education: string | null
  personality: string | null
  hobbies: string[]
  religion: string | null
  ancestralHome: string | null
  occupation: string | null
  familyBackground: string | null
  assets: CandidateAssets
  currentAddress: string | null
  matchRequirements: string | null
  phone: string | null
  photosPresent: boolean
  photoAssetIds?: string[]
  sourceSummary?: string | null
  rawText: string
  confidence: {
    overall: number
  } & Partial<Record<CandidateFieldKey, number>>
  uncertainFields: CandidateFieldKey[]
}

export interface RawSourceInput {
  sourceId: string
  sourceType: "official_account_text" | "official_account_image" | "manual_entry" | "chat_forward"
  rawText: string
  photoAssetIds?: string[]
  sourceUrl?: string
  operatorUserId: string
}

export interface LlmParserRequest {
  taskId: string
  parserVersion: string
  source: RawSourceInput
  schemaVersion: string
}

export interface LlmParserResponse {
  taskId: string
  parserVersion: string
  profile: CandidateProfileStructuredData
  reviewRequired: boolean
  reviewReasons: string[]
}

export interface LlmModelAdapter {
  parseCandidateProfile(input: LlmParserRequest): Promise<LlmParserResponse>
}

export const CANDIDATE_PROFILE_SYSTEM_PROMPT = `
你是相亲资料结构化抽取器。

目标：
1. 从输入文本中提取候选人资料。
2. 只能依据输入内容，不允许编造。
3. 无法确认的字段返回 null 或空数组。
4. 输出必须是严格 JSON，不要添加 markdown。
5. 联系电话属于敏感字段，只有文本里明确出现时才填写。

字段规则：
- name: 候选人称呼或姓名。如果文本只有“女孩”“男孩”这类称呼，也可以保留原样。
- gender: 只能输出 男、女、未知。
- zodiac: 属相。
- age: 周岁整数。
- heightCm: 身高厘米整数。
- weightKg: 体重公斤数字。
- education: 学历。
- personality: 性格描述。
- hobbies: 爱好数组，去掉重复值。
- religion: 宗教。
- ancestralHome: 祖籍。
- occupation: 职业。
- familyBackground: 家庭成员和职业等背景描述。
- assets.house / assets.car / assets.other: 房产、车辆和其他资产信息。
- currentAddress: 常住地址。
- matchRequirements: 相亲需求、择偶要求。
- phone: 联系电话。
- photosPresent: 如果来源里有图片资产，填 true，否则按文本判断。
- sourceSummary: 用一句中文概括这份资料，不超过 40 字。
- confidence: 对整体和关键字段给出 0 到 1 的置信度。
- uncertainFields: 填写无法完全确认的字段路径。

禁止事项：
- 不要根据常识补全未出现的信息。
- 不要把父母职业误填成候选人职业。
- 不要把择偶要求误填成性格。
`.trim()

export function buildCandidateProfileUserPrompt(input: LlmParserRequest) {
  return JSON.stringify(
    {
      taskId: input.taskId,
      parserVersion: input.parserVersion,
      sourceType: input.source.sourceType,
      photoAssetIds: input.source.photoAssetIds ?? [],
      rawText: input.source.rawText,
      outputRequirements: {
        schemaVersion: input.schemaVersion,
        returnJsonOnly: true,
        reviewRequiredWhen: [
          "confidence.overall < 0.85",
          "phone appears incomplete",
          "gender cannot be confirmed",
          "occupation and familyBackground are ambiguous"
        ]
      }
    },
    null,
    2,
  )
}

export function shouldRequireManualReview(profile: CandidateProfileStructuredData) {
  if (profile.confidence.overall < 0.85) {
    return true
  }

  if (profile.uncertainFields.length > 0) {
    return true
  }

  if (profile.phone && profile.phone.length > 0 && profile.phone.length < 11) {
    return true
  }

  return false
}

export function sanitizeParsedProfile(
  rawText: string,
  partial: Partial<CandidateProfileStructuredData>,
): CandidateProfileStructuredData {
  return {
    profileStatus: "pending_review",
    visibilityLevel: "text_only",
    name: partial.name ?? "",
    gender: partial.gender ?? "未知",
    zodiac: partial.zodiac ?? null,
    age: partial.age ?? null,
    heightCm: partial.heightCm ?? null,
    weightKg: partial.weightKg ?? null,
    education: partial.education ?? null,
    personality: partial.personality ?? null,
    hobbies: partial.hobbies ?? [],
    religion: partial.religion ?? null,
    ancestralHome: partial.ancestralHome ?? null,
    occupation: partial.occupation ?? null,
    familyBackground: partial.familyBackground ?? null,
    assets: {
      house: partial.assets?.house ?? null,
      car: partial.assets?.car ?? null,
      other: partial.assets?.other ?? null,
    },
    currentAddress: partial.currentAddress ?? null,
    matchRequirements: partial.matchRequirements ?? null,
    phone: partial.phone ?? null,
    photosPresent: partial.photosPresent ?? false,
    photoAssetIds: partial.photoAssetIds ?? [],
    sourceSummary: partial.sourceSummary ?? null,
    rawText,
    confidence: {
      overall: partial.confidence?.overall ?? 0,
      ...partial.confidence,
    },
    uncertainFields: partial.uncertainFields ?? [],
  }
}
