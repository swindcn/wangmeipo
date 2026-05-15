const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const REQUIRED_COLLECTIONS = [
  "users",
  "candidates",
  "raw_sources",
  "parse_tasks",
  "candidate_permissions",
  "candidate_manager_scopes",
  "candidate_tags",
  "view_requests",
  "ask_matchmaker_chats",
  "share_tokens",
  "match_records",
  "match_logs",
  "audit_logs",
]

const DEFAULT_TAGS = [
  { _id: "tag-female-beauty", name: "美女", scope: "female", sortOrder: 1 },
  { _id: "tag-male-bride-price", name: "聘礼高", scope: "male", sortOrder: 2 },
  { _id: "tag-male-handsome", name: "帅哥", scope: "male", sortOrder: 3 },
  { _id: "tag-common-match-fee", name: "谢媒费高", scope: "common", sortOrder: 4 },
  { _id: "tag-common-divorced", name: "离异", scope: "common", sortOrder: 5 },
  { _id: "tag-common-family", name: "家境好", scope: "common", sortOrder: 6 },
  { _id: "tag-common-civil-servant", name: "公务员", scope: "common", sortOrder: 7 },
  { _id: "tag-common-public-institution", name: "事业单位", scope: "common", sortOrder: 8 },
  { _id: "tag-common-demanding", name: "要求多", scope: "common", sortOrder: 9 },
]

function buildNow() {
  return new Date()
}

function getSeedCandidates(now) {
  return [
    {
      _id: "candidate-1",
      candidateCode: "WM-001",
      profileStatus: "published",
      visibilityLevel: "text_only",
      name: "女孩",
      gender: "女",
      zodiac: "龙",
      age: 27,
      heightCm: 158,
      weightKg: 56,
      education: "本科",
      personality: "随和且独立",
      hobbies: ["钢琴", "舞蹈"],
      religion: "佛",
      ancestralHome: "长乐",
      occupation: "教师",
      familyBackground: "父母体制内人员，家庭氛围稳定",
      assets: { house: "嫁妆一套", car: "车一部", other: null },
      currentAddress: "泰禾一期",
      matchRequirements: "工作稳定，性格随和",
      phone: "13900001111",
      photosPresent: false,
      photoAssetIds: [],
      sourceSummary: "福州教师，本科，性格独立",
      rawText: "姓名：女孩\n年龄：27\n职业：教师",
      confidence: { overall: 0.96, age: 0.98, occupation: 0.95 },
      uncertainFields: [],
      createdBy: "system",
      updatedBy: "system",
      defaultPhotoVisible: false,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
    {
      _id: "candidate-2",
      candidateCode: "WM-002",
      profileStatus: "pending_review",
      visibilityLevel: "text_only",
      name: "男孩",
      gender: "男",
      zodiac: "牛",
      age: 29,
      heightCm: 173,
      weightKg: 68,
      education: "硕士",
      personality: "务实，表达直接",
      hobbies: ["羽毛球", "自驾"],
      religion: null,
      ancestralHome: "闽侯",
      occupation: "算法工程师",
      familyBackground: "父亲个体经营，母亲退休教师",
      assets: { house: "婚房已备", car: null, other: "有稳定理财习惯" },
      currentAddress: "仓山",
      matchRequirements: "希望对方温和，愿意沟通",
      phone: "",
      photosPresent: false,
      photoAssetIds: [],
      sourceSummary: "技术岗，硕士，待补电话",
      rawText: "男孩 29 岁 算法工程师",
      confidence: { overall: 0.81, age: 0.93, occupation: 0.9 },
      uncertainFields: ["phone"],
      createdBy: "system",
      updatedBy: "system",
      defaultPhotoVisible: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: "candidate-3",
      candidateCode: "WM-003",
      profileStatus: "published",
      visibilityLevel: "partial",
      name: "女孩 C",
      gender: "女",
      zodiac: "猴",
      age: 26,
      heightCm: 162,
      weightKg: 50,
      education: "本科",
      personality: "有边界感，慢热",
      hobbies: ["烘焙", "徒步"],
      religion: null,
      ancestralHome: "福清",
      occupation: "品牌运营",
      familyBackground: "父母经商，家庭支持度高",
      assets: { house: null, car: null, other: null },
      currentAddress: "鼓楼",
      matchRequirements: "年龄相仿，三观一致",
      phone: "13800002222",
      photosPresent: false,
      photoAssetIds: [],
      sourceSummary: "品牌运营，慢热型",
      rawText: "品牌运营，慢热，爱烘焙",
      confidence: { overall: 0.92 },
      uncertainFields: [],
      createdBy: "system",
      updatedBy: "system",
      defaultPhotoVisible: false,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
  ]
}

async function upsertDocument(collectionName, docId, data) {
  const documentData = { ...data }
  delete documentData._id

  try {
    await db.collection(collectionName).doc(docId).get()
    await db.collection(collectionName).doc(docId).update({ data: documentData })
  } catch (error) {
    await db.collection(collectionName).doc(docId).set({ data: documentData })
  }
}

async function ensureCollections() {
  for (const collectionName of REQUIRED_COLLECTIONS) {
    try {
      await db.createCollection(collectionName)
    } catch (error) {
      const message = String(error && (error.errMsg || error.message || error))
      if (!message.includes("already exists") && !message.includes("collection exists")) {
        try {
          await db.collection(collectionName).limit(1).get()
        } catch (innerError) {
          throw error
        }
      }
    }
  }
}

exports.main = async () => {
  const now = buildNow()
  const { OPENID } = cloud.getWXContext()
  let existingManager = null

  await ensureCollections()

  try {
    const managerResult = await db.collection("users").doc("user-manager-1").get()
    existingManager = managerResult.data
  } catch (error) {
    existingManager = null
  }

  if (existingManager && existingManager.openid && existingManager.openid !== OPENID) {
    return {
      ok: false,
      error: "manager already bound to another openid",
    }
  }

  await upsertDocument("users", "user-manager-1", {
    _id: "user-manager-1",
    openid: existingManager && existingManager.openid ? existingManager.openid : OPENID,
    unionid: "",
    nickname: "云开发管理员",
    avatarUrl: "",
    role: "super_admin",
    status: "active",
    createdAt: now,
    updatedAt: now,
  })

  await upsertDocument("users", "user-viewer-1", {
    _id: "user-viewer-1",
    openid: "",
    unionid: "",
    nickname: "浏览者甲",
    avatarUrl: "",
    role: "viewer",
    status: "active",
    createdAt: now,
    updatedAt: now,
  })

  await upsertDocument("users", "user-viewer-2", {
    _id: "user-viewer-2",
    openid: "",
    unionid: "",
    nickname: "浏览者乙",
    avatarUrl: "",
    role: "viewer",
    status: "active",
    createdAt: now,
    updatedAt: now,
  })

  for (const tag of DEFAULT_TAGS) {
    await upsertDocument("candidate_tags", tag._id, {
      ...tag,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
  }

  for (const candidate of getSeedCandidates(now)) {
    await upsertDocument("candidates", candidate._id, candidate)
  }

  await upsertDocument("candidate_permissions", "perm-1", {
    _id: "perm-1",
    viewerUserId: "user-viewer-1",
    candidateId: "candidate-1",
    permissionLevel: "text_with_photo",
    grantedBy: "user-manager-1",
    reason: "正在推进初步了解",
    expiresAt: "2026-04-20",
    createdAt: now,
    updatedAt: now,
  })

  await upsertDocument("candidate_permissions", "perm-2", {
    _id: "perm-2",
    viewerUserId: "user-viewer-1",
    candidateId: "candidate-3",
    permissionLevel: "full_profile_no_contact",
    grantedBy: "user-manager-1",
    reason: "先看完整资料再决定",
    expiresAt: "2026-04-18",
    createdAt: now,
    updatedAt: now,
  })

  await upsertDocument("match_records", "match-1", {
    _id: "match-1",
    candidateAId: "candidate-1",
    candidateBId: "candidate-2",
    createdBy: "user-manager-1",
    status: "recommended",
    resultNote: "已推荐给双方，等待反馈",
    firstSharedAt: now,
    lastFollowUpAt: now,
    createdAt: now,
    updatedAt: now,
  })

  await upsertDocument("match_logs", "match-log-1", {
    _id: "match-log-1",
    matchRecordId: "match-1",
    actionType: "create",
    operatorUserId: "user-manager-1",
    content: "已推荐给双方，等待反馈",
    createdAt: now,
  })

  return {
    ok: true,
    managerOpenId: existingManager && existingManager.openid ? existingManager.openid : OPENID,
    seededCandidates: 3,
  }
}
