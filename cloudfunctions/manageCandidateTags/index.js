const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const VALID_SCOPES = ["male", "female", "common"]
const DEFAULT_TAGS = [
  { name: "美女", scope: "female" },
  { name: "聘礼高", scope: "male" },
  { name: "帅哥", scope: "male" },
  { name: "谢媒费高", scope: "common" },
  { name: "离异", scope: "common" },
  { name: "家境好", scope: "common" },
  { name: "公务员", scope: "common" },
  { name: "事业单位", scope: "common" },
  { name: "要求多", scope: "common" },
]

function compactString(value) {
  return String(value || "").trim()
}

function normalizeScope(value) {
  const scope = compactString(value)
  return VALID_SCOPES.includes(scope) ? scope : "common"
}

function toTimestamp(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === "number") return value
  if (typeof value === "object" && value.$date) {
    const dateValue = typeof value.$date === "object" && value.$date.$numberLong
      ? Number(value.$date.$numberLong)
      : new Date(value.$date).getTime()
    return Number.isFinite(dateValue) ? dateValue : 0
  }
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

async function ensureCollection() {
  try {
    await db.createCollection("candidate_tags")
  } catch (error) {
    const message = String(error && (error.errMsg || error.message || error))
    if (!message.includes("already exists") && !message.includes("collection exists")) {
      try {
        await db.collection("candidate_tags").limit(1).get()
      } catch (innerError) {
        throw error
      }
    }
  }
}

async function resolveCurrentUser(event = {}) {
  const { OPENID } = cloud.getWXContext()
  const allowDebugViewerOverride = process.env.ALLOW_DEBUG_VIEWER_OVERRIDE === "true"

  if (allowDebugViewerOverride && event.debugViewerUserId) {
    try {
      const overrideResult = await db.collection("users").doc(event.debugViewerUserId).get()
      if (overrideResult.data) return overrideResult.data
    } catch (error) {
      // Ignore invalid debug viewer ids and fall back to OPENID resolution.
    }
  }

  if (!OPENID) return null
  const result = await db.collection("users").where({ openid: OPENID }).limit(1).get()
  return result.data[0] || null
}

function isAdmin(user) {
  return user && (user.role === "super_admin" || user.role === "manager")
}

function normalizeTag(tag) {
  return {
    _id: tag._id,
    name: tag.name || "",
    scope: normalizeScope(tag.scope),
    status: tag.status || "active",
    createdAt: tag.createdAt || null,
    updatedAt: tag.updatedAt || null,
  }
}

async function seedDefaultTags() {
  const now = new Date()
  const existingResult = await db.collection("candidate_tags").limit(200).get()
  const activeNames = existingResult.data
    .filter((item) => item.status !== "deleted")
    .reduce((result, item) => {
      result[item.name] = item
      return result
    }, {})

  await Promise.all(DEFAULT_TAGS.map((item, index) => {
    const existing = activeNames[item.name]
    if (existing) {
      const expectedScope = item.name === "美女"
        ? "female"
        : (item.name === "聘礼高" || item.name === "帅哥" ? "male" : existing.scope || item.scope)
      if (existing.scope === expectedScope && existing.status === "active") return null
      return db.collection("candidate_tags").doc(existing._id).update({
        data: {
          scope: expectedScope,
          status: "active",
          updatedAt: now,
        },
      })
    }

    return db.collection("candidate_tags").add({
      data: {
        name: item.name,
        scope: item.scope,
        status: "active",
        sortOrder: index + 1,
        createdAt: now,
        updatedAt: now,
      },
    })
  }).filter(Boolean))
}

async function listTags(event = {}) {
  await ensureCollection()
  await seedDefaultTags()

  const scope = compactString(event.scope)
  const where = { status: _.neq("deleted") }
  if (VALID_SCOPES.includes(scope)) where.scope = scope

  const result = await db.collection("candidate_tags").where(where).limit(200).get()
  const tags = result.data
    .map(normalizeTag)
    .filter((item) => item.name)
    .sort((left, right) => {
      const scopeWeight = { common: 1, female: 2, male: 3 }
      const leftWeight = scopeWeight[left.scope] || 9
      const rightWeight = scopeWeight[right.scope] || 9
      if (leftWeight !== rightWeight) return leftWeight - rightWeight
      return toTimestamp(left.createdAt) - toTimestamp(right.createdAt)
    })

  return { ok: true, tags }
}

async function saveTag(event = {}, currentUser) {
  if (!isAdmin(currentUser)) throw new Error("forbidden")

  await ensureCollection()
  const tagId = compactString(event.tagId || event._id)
  const name = compactString(event.name)
  const scope = normalizeScope(event.scope)
  if (!name) return { ok: false, error: "name is required" }
  if (name.length > 12) return { ok: false, error: "name is too long" }

  const now = new Date()
  const duplicateResult = await db.collection("candidate_tags").where({
    name,
    status: _.neq("deleted"),
  }).limit(10).get()
  const duplicate = duplicateResult.data.find((item) => item._id !== tagId)
  if (duplicate) return { ok: false, error: "标签已存在" }

  if (tagId) {
    await db.collection("candidate_tags").doc(tagId).update({
      data: {
        name,
        scope,
        updatedBy: currentUser._id,
        updatedAt: now,
      },
    })
    return { ok: true, tagId }
  }

  const addResult = await db.collection("candidate_tags").add({
    data: {
      name,
      scope,
      status: "active",
      sortOrder: 1000 + now.getTime(),
      createdBy: currentUser._id,
      updatedBy: currentUser._id,
      createdAt: now,
      updatedAt: now,
    },
  })

  return { ok: true, tagId: addResult._id }
}

async function deleteTag(event = {}, currentUser) {
  if (!isAdmin(currentUser)) throw new Error("forbidden")

  const tagId = compactString(event.tagId || event._id)
  if (!tagId) return { ok: false, error: "tagId is required" }

  await db.collection("candidate_tags").doc(tagId).update({
    data: {
      status: "deleted",
      deletedBy: currentUser._id,
      updatedAt: new Date(),
    },
  })

  return { ok: true }
}

exports.main = async (event = {}) => {
  const action = event.action || "listTags"
  const currentUser = await resolveCurrentUser(event)

  if (action === "listTags") {
    return listTags(event)
  }

  if (action === "saveTag") {
    return saveTag(event, currentUser)
  }

  if (action === "deleteTag") {
    return deleteTag(event, currentUser)
  }

  if (action === "seedDefaultTags") {
    if (!isAdmin(currentUser)) throw new Error("forbidden")
    await ensureCollection()
    await seedDefaultTags()
    return { ok: true }
  }

  return { ok: false, error: "unknown action" }
}
