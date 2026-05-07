const cloud = require("wx-server-sdk")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function compactString(value) {
  return String(value || "").trim()
}

async function resolvePhoneNumber(phoneCode) {
  if (!phoneCode || !cloud.openapi || !cloud.openapi.phonenumber) {
    return ""
  }

  try {
    const result = await cloud.openapi.phonenumber.getPhoneNumber({
      code: phoneCode,
    })

    const phoneInfo = result.phoneInfo || {}
    return compactString(phoneInfo.phoneNumber || phoneInfo.purePhoneNumber)
  } catch (error) {
    return ""
  }
}

async function findExistingUser(openid) {
  if (!openid) {
    return null
  }

  const result = await db.collection("users").where({ openid }).limit(1).get()
  return result.data[0] || null
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const now = new Date()

  if (!OPENID) {
    return { ok: false, error: "openid is required" }
  }

  const profile = event.profile || {}
  const phoneFromCode = await resolvePhoneNumber(event.phoneCode)
  const existingUser = await findExistingUser(OPENID)

  const userPatch = {
    openid: OPENID,
    nickname: compactString(profile.nickname) || (existingUser && existingUser.nickname) || "",
    avatarUrl: compactString(profile.avatarUrl) || (existingUser && existingUser.avatarUrl) || "",
    phone: phoneFromCode || compactString(profile.phone) || (existingUser && existingUser.phone) || "",
    role: (existingUser && existingUser.role) || "viewer",
    updatedAt: now,
  }

  if (existingUser && existingUser._id) {
    await db.collection("users").doc(existingUser._id).update({
      data: userPatch,
    })

    return {
      ok: true,
      user: {
        _id: existingUser._id,
        ...existingUser,
        ...userPatch,
      },
    }
  }

  const addResult = await db.collection("users").add({
    data: {
      ...userPatch,
      createdAt: now,
    },
  })

  return {
    ok: true,
    user: {
      _id: addResult._id,
      ...userPatch,
      createdAt: now,
    },
  }
}
