const crypto = require("node:crypto")
const http = require("node:http")
const cloudbase = require("@cloudbase/node-sdk")
const { XMLBuilder, XMLParser } = require("fast-xml-parser")
const { decryptMessage, encryptMessage } = require("./wechat-crypto")

const port = Number(process.env.PORT || 3000)
const officialToken = process.env.WECHAT_OFFICIAL_ACCOUNT_TOKEN || ""
const cloudbaseEnvId = process.env.CLOUDBASE_ENV_ID || ""
const officialAppId = process.env.WECHAT_OFFICIAL_ACCOUNT_APP_ID || ""
const officialEncodingAesKey = process.env.WECHAT_OFFICIAL_ACCOUNT_ENCODING_AES_KEY || ""

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
})
const builder = new XMLBuilder({
  ignoreAttributes: false,
  cdataPropName: "__cdata",
  format: false,
})

const app = cloudbase.init({
  env: cloudbaseEnvId,
})

function validateEnv() {
  const missing = []

  if (!officialToken) {
    missing.push("WECHAT_OFFICIAL_ACCOUNT_TOKEN")
  }

  if (!cloudbaseEnvId) {
    missing.push("CLOUDBASE_ENV_ID")
  }

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`)
  }
}

function validateAesEnv() {
  if (!officialAppId || !officialEncodingAesKey) {
    throw new Error("Missing AES env vars: WECHAT_OFFICIAL_ACCOUNT_APP_ID, WECHAT_OFFICIAL_ACCOUNT_ENCODING_AES_KEY")
  }
}

function parseQuery(urlString) {
  const query = {}
  const url = new URL(urlString, "http://localhost")

  for (const [key, value] of url.searchParams.entries()) {
    query[key] = value
  }

  return query
}

function verifySignature(signature, timestamp, nonce) {
  const digest = crypto
    .createHash("sha1")
    .update([officialToken, timestamp, nonce].sort().join(""))
    .digest("hex")

  return digest === signature
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on("data", (chunk) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

function buildTextReply(toUserName, fromUserName, content) {
  return builder.build({
    xml: {
      ToUserName: { __cdata: toUserName },
      FromUserName: { __cdata: fromUserName },
      CreateTime: Math.floor(Date.now() / 1000),
      MsgType: { __cdata: "text" },
      Content: { __cdata: content },
    },
  })
}

function buildEncryptedReplyEnvelope(toUserName, fromUserName, content, timestamp, nonce) {
  validateAesEnv()

  const plainReply = buildTextReply(toUserName, fromUserName, content)
  const encryptedReply = encryptMessage({
    token: officialToken,
    encodingAesKey: officialEncodingAesKey,
    appId: officialAppId,
    xml: plainReply,
    timestamp,
    nonce,
  })

  return builder.build({
    xml: {
      Encrypt: { __cdata: encryptedReply.encrypted },
      MsgSignature: { __cdata: encryptedReply.msgSignature },
      TimeStamp: encryptedReply.timestamp,
      Nonce: { __cdata: encryptedReply.nonce },
    },
  })
}

function normalizeIncomingMessage(xmlRoot) {
  const source = xmlRoot.xml || xmlRoot

  return {
    toUserName: source.ToUserName,
    fromUserName: source.FromUserName,
    msgType: source.MsgType,
    content: source.Content || "",
    picUrl: source.PicUrl || "",
    title: source.Title || "",
    description: source.Description || "",
    url: source.Url || "",
    msgId: source.MsgId || "",
    event: source.Event || "",
    encrypt: source.Encrypt || "",
  }
}

function parseIncomingMessage(query, body) {
  const parsedXml = parser.parse(body)
  const source = parsedXml.xml || parsedXml

  if (query.encrypt_type === "aes" || source.Encrypt) {
    validateAesEnv()
    const decrypted = decryptMessage({
      token: officialToken,
      encodingAesKey: officialEncodingAesKey,
      appId: officialAppId,
      encrypted: source.Encrypt,
      msgSignature: query.msg_signature,
      timestamp: query.timestamp,
      nonce: query.nonce,
    })

    return {
      message: normalizeIncomingMessage(parser.parse(decrypted.xml)),
      encrypted: true,
    }
  }

  return {
    message: normalizeIncomingMessage(parsedXml),
    encrypted: false,
  }
}

function buildIngestPayload(message) {
  if (message.msgType === "text") {
    return {
      sourceType: "official_account_text",
      sourceMessageId: String(message.msgId || Date.now()),
      rawText: message.content || "",
      createdBy: "official_account_webhook",
    }
  }

  if (message.msgType === "image") {
    return {
      sourceType: "official_account_image",
      sourceMessageId: String(message.msgId || Date.now()),
      rawText: "",
      remoteImageUrls: message.picUrl ? [message.picUrl] : [],
      createdBy: "official_account_webhook",
    }
  }

  if (message.msgType === "link") {
    return {
      sourceType: "chat_forward",
      sourceMessageId: String(message.msgId || Date.now()),
      rawText: `标题：${message.title}\n描述：${message.description}\n链接：${message.url}`,
      sourceUrl: message.url || "",
      createdBy: "official_account_webhook",
    }
  }

  return null
}

async function callCloudFunction(name, data) {
  const result = await app.callFunction({
    name,
    data,
  })

  return result.result || result
}

async function processMessage(message) {
  const payload = buildIngestPayload(message)
  if (!payload) {
    return
  }

  const ingestResult = await callCloudFunction("ingestOfficialAccountMessage", payload)
  if (ingestResult && ingestResult.sourceId && ingestResult.taskId) {
    await callCloudFunction("runParsePipeline", {
      sourceId: ingestResult.sourceId,
      taskId: ingestResult.taskId,
      createdBy: "official_account_webhook",
    })
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  const query = parseQuery(req.url || "/")

  if (req.method === "GET") {
    if (query.encrypt_type === "aes") {
      try {
        validateAesEnv()
        const decrypted = decryptMessage({
          token: officialToken,
          encodingAesKey: officialEncodingAesKey,
          appId: officialAppId,
          encrypted: query.echostr || "",
          msgSignature: query.msg_signature || "",
          timestamp: query.timestamp,
          nonce: query.nonce,
        })
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" })
        res.end(decrypted.xml)
        return
      } catch (error) {
        res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" })
        res.end("invalid aes signature")
        return
      }
    }

    if (!verifySignature(query.signature, query.timestamp, query.nonce)) {
      res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" })
      res.end("invalid signature")
      return
    }

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" })
    res.end(query.echostr || "")
    return
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" })
    res.end("method not allowed")
    return
  }

  if (!verifySignature(query.signature, query.timestamp, query.nonce)) {
    if (query.encrypt_type !== "aes") {
      res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" })
      res.end("invalid signature")
      return
    }
  }

  try {
    const body = await readBody(req)
    const parsed = parseIncomingMessage(query, body)
    const message = parsed.message

    if (message.msgType === "event" && String(message.event).toLowerCase() === "subscribe") {
      res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" })
      res.end(
        parsed.encrypted
          ? buildEncryptedReplyEnvelope(message.fromUserName, message.toUserName, "欢迎关注，发送文字、图片或链接即可自动进入相亲资料解析流程。", query.timestamp, query.nonce)
          : buildTextReply(message.fromUserName, message.toUserName, "欢迎关注，发送文字、图片或链接即可自动进入相亲资料解析流程。"),
      )
      return
    }

    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" })
    res.end(
      parsed.encrypted
        ? buildEncryptedReplyEnvelope(message.fromUserName, message.toUserName, "已收到，正在解析资料，请稍后到小程序后台查看。", query.timestamp, query.nonce)
        : buildTextReply(message.fromUserName, message.toUserName, "已收到，正在解析资料，请稍后到小程序后台查看。"),
    )

    processMessage(message).catch((error) => {
      console.error("Failed to process official account message", error)
    })
  } catch (error) {
    console.error(error)
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" })
    res.end("internal error")
  }
})

validateEnv()

server.listen(port, () => {
  console.log(`official-account-webhook listening on ${port}`)
})

function shutdown(signal) {
  console.log(`received ${signal}, shutting down`)
  server.close(() => {
    process.exit(0)
  })
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
