const crypto = require("node:crypto")
const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function compactString(value) {
  return String(value || "").trim()
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password || "")).digest("hex")
}

function maskPhone(phone) {
  const text = compactString(phone)
  if (text.length < 7) return text
  return `${text.slice(0, 3)}****${text.slice(-4)}`
}

function getRoleText(role) {
  if (role === "super_admin") return "超级管理员"
  if (role === "manager") return "子管理员"
  return "普通成员"
}

function normalizeUser(user) {
  if (!user) return null
  const phone = compactString(user.phone)
  return {
    _id: user._id,
    openid: user.openid || "",
    nickname: compactString(user.nickname) || "游客123456",
    avatarUrl: compactString(user.avatarUrl),
    phone,
    phoneText: phone ? maskPhone(phone) : "未绑定",
    role: user.role || "viewer",
    roleText: getRoleText(user.role),
    hasPassword: Boolean(user.passwordHash),
    registered: Boolean(user._id && phone),
  }
}

async function resolvePhoneNumber(phoneCode) {
  if (!phoneCode || !cloud.openapi || !cloud.openapi.phonenumber) {
    return ""
  }

  try {
    const result = await cloud.openapi.phonenumber.getPhoneNumber({ code: phoneCode })
    const phoneInfo = result.phoneInfo || {}
    return compactString(phoneInfo.phoneNumber || phoneInfo.purePhoneNumber)
  } catch (error) {
    console.error("resolve phone failed", error)
    return ""
  }
}

async function findUserByOpenid(openid) {
  if (!openid) return null
  const result = await db.collection("users").where({ openid }).limit(1).get()
  return result.data[0] || null
}

async function findUserByPhone(phone) {
  if (!phone) return null
  const result = await db.collection("users").where({ phone }).limit(1).get()
  return result.data[0] || null
}

async function findUserById(userId) {
  if (!userId) return null
  try {
    const result = await db.collection("users").doc(userId).get()
    return result.data || null
  } catch (error) {
    return null
  }
}

async function upsertUserByPhone({ openid, phone, profile = {}, patch = {} }) {
  const now = new Date()
  const userByPhone = await findUserByPhone(phone)
  const userByOpenid = await findUserByOpenid(openid)
  const existingUser = userByPhone || userByOpenid
  const nextPatch = {
    openid,
    phone,
    nickname: compactString(profile.nickname) || (existingUser && existingUser.nickname) || `用户${phone.slice(-4)}`,
    avatarUrl: compactString(profile.avatarUrl) || (existingUser && existingUser.avatarUrl) || "",
    role: (existingUser && existingUser.role) || "viewer",
    updatedAt: now,
    ...patch,
  }

  if (existingUser && existingUser._id) {
    await db.collection("users").doc(existingUser._id).update({ data: nextPatch })
    return normalizeUser({
      ...existingUser,
      ...nextPatch,
    })
  }

  const addResult = await db.collection("users").add({
    data: {
      ...nextPatch,
      createdAt: now,
    },
  })

  return normalizeUser({
    _id: addResult._id,
    ...nextPatch,
    createdAt: now,
  })
}

async function quickLogin(event, openid) {
  const existingUser = await findUserByOpenid(openid)
  const phone = await resolvePhoneNumber(event.phoneCode) || compactString(existingUser && existingUser.phone)
  if (!phone) {
    return { ok: false, error: "phone auth failed" }
  }

  const user = await upsertUserByPhone({
    openid,
    phone,
    profile: event.profile || {},
  })

  return { ok: true, user }
}

async function phoneLogin(event, openid) {
  const phone = compactString(event.phone)
  const password = compactString(event.password)
  if (!phone || !password) {
    return { ok: false, error: "phone and password are required" }
  }

  const existingUser = await findUserByPhone(phone)
  const passwordHash = hashPassword(password)

  if (existingUser && existingUser.passwordHash && existingUser.passwordHash !== passwordHash) {
    return { ok: false, error: "invalid credentials" }
  }

  const user = await upsertUserByPhone({
    openid,
    phone,
    profile: event.profile || {},
    patch: {
      passwordHash,
    },
  })

  return { ok: true, user }
}

async function updateProfile(event, openid) {
  const existingUser = await findUserByOpenid(openid) || await findUserById(event.userId || event.debugViewerUserId)
  if (!existingUser || !existingUser._id) {
    return { ok: false, error: "not logged in" }
  }

  const profile = event.profile || {}
  const patch = {
    openid: existingUser.openid || openid,
    updatedAt: new Date(),
  }

  if (Object.prototype.hasOwnProperty.call(profile, "nickname")) {
    patch.nickname = compactString(profile.nickname) || existingUser.nickname || ""
  }

  if (Object.prototype.hasOwnProperty.call(profile, "avatarUrl")) {
    patch.avatarUrl = compactString(profile.avatarUrl) || existingUser.avatarUrl || ""
  }

  if (Object.prototype.hasOwnProperty.call(profile, "password")) {
    const password = compactString(profile.password)
    if (password) {
      patch.passwordHash = hashPassword(password)
    }
  }

  await db.collection("users").doc(existingUser._id).update({ data: patch })
  return {
    ok: true,
    user: normalizeUser({
      ...existingUser,
      ...patch,
    }),
  }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    return { ok: false, error: "openid is required" }
  }

  const action = event.action || "quickLogin"

  if (action === "quickLogin") {
    return quickLogin(event, OPENID)
  }

  if (action === "phoneLogin") {
    return phoneLogin(event, OPENID)
  }

  if (action === "updateProfile") {
    return updateProfile(event, OPENID)
  }

  if (action === "getCurrent") {
    return { ok: true, user: normalizeUser(await findUserByOpenid(OPENID)) }
  }

  return { ok: false, error: "unknown action" }
}
