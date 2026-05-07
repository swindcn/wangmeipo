const cloud = require("wx-server-sdk")
const https = require("node:https")
const http = require("node:http")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https://") ? https : http
    client
      .get(url, (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Download failed with status ${response.statusCode}`))
          return
        }

        const chunks = []
        response.on("data", (chunk) => chunks.push(chunk))
        response.on("end", () => resolve(Buffer.concat(chunks)))
      })
      .on("error", reject)
  })
}

function getImageExtension(url) {
  const normalized = String(url || "").toLowerCase()
  if (normalized.includes(".png")) {
    return "png"
  }
  if (normalized.includes(".webp")) {
    return "webp"
  }
  return "jpg"
}

async function uploadRemoteImages(remoteImageUrls, sourceMessageId) {
  const fileIds = []

  for (let index = 0; index < remoteImageUrls.length; index += 1) {
    const remoteUrl = remoteImageUrls[index]
    const fileContent = await fetchBuffer(remoteUrl)
    const extension = getImageExtension(remoteUrl)
    const cloudPath = `official-account/${sourceMessageId || Date.now()}-${index}.${extension}`
    const uploadResult = await cloud.uploadFile({
      cloudPath,
      fileContent,
    })
    fileIds.push(uploadResult.fileID)
  }

  return fileIds
}

exports.main = async (event) => {
  const now = new Date()
  const sourceType = event.sourceType || "official_account_text"
  const rawText = event.rawText || ""
  const remoteImageUrls = Array.isArray(event.remoteImageUrls) ? event.remoteImageUrls : []
  const sourceMessageId = event.sourceMessageId || ""

  if (sourceMessageId) {
    const existingSourceResult = await db.collection("raw_sources").where({
      sourceMessageId,
    }).limit(1).get()

    if (existingSourceResult.data.length > 0) {
      const existingTaskResult = await db.collection("parse_tasks").where({
        sourceId: existingSourceResult.data[0]._id,
      }).limit(1).get()

      return {
        ok: true,
        deduplicated: true,
        sourceId: existingSourceResult.data[0]._id,
        taskId: existingTaskResult.data[0]?._id || "",
        photoAssetIds: existingSourceResult.data[0].photoAssetIds || [],
      }
    }
  }

  const uploadedPhotoAssetIds = remoteImageUrls.length > 0
    ? await uploadRemoteImages(remoteImageUrls, sourceMessageId)
    : []
  const photoAssetIds = [...(event.photoAssetIds || []), ...uploadedPhotoAssetIds]

  const sourceRecord = {
    sourceType,
    sourceMessageId,
    rawText,
    photoAssetIds,
    remoteImageUrls,
    sourceUrl: event.sourceUrl || "",
    parseStatus: "pending",
    parserVersion: "v2",
    createdBy: event.createdBy || "system",
    createdAt: now,
  }

  const sourceResult = await db.collection("raw_sources").add({ data: sourceRecord })
  const taskResult = await db.collection("parse_tasks").add({
    data: {
      sourceId: sourceResult._id,
      taskType: photoAssetIds.length > 0 ? "ocr_and_llm_parse" : "llm_parse",
      status: "queued",
      attemptCount: 0,
      parserVersion: "v2",
      maxRetryAttempts: Number(process.env.PARSE_MAX_RETRY_ATTEMPTS || 3),
      createdAt: now,
    },
  })

  return {
    ok: true,
    sourceId: sourceResult._id,
    taskId: taskResult._id,
    photoAssetIds,
  }
}
