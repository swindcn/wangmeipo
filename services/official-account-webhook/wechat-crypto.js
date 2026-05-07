const crypto = require("node:crypto")

const BLOCK_SIZE = 32

function decodeAesKey(encodingAesKey) {
  if (!encodingAesKey || encodingAesKey.length !== 43) {
    throw new Error("Invalid EncodingAESKey length")
  }

  const aesKey = Buffer.from(`${encodingAesKey}=`, "base64")
  if (aesKey.length !== 32) {
    throw new Error("Invalid EncodingAESKey value")
  }

  return aesKey
}

function sha1Sign(token, timestamp, nonce, encrypted) {
  return crypto
    .createHash("sha1")
    .update([token, timestamp, nonce, encrypted].sort().join(""))
    .digest("hex")
}

function pkcs7Pad(buffer) {
  const amountToPad = BLOCK_SIZE - (buffer.length % BLOCK_SIZE || BLOCK_SIZE)
  const pad = Buffer.alloc(amountToPad, amountToPad)
  return Buffer.concat([buffer, pad])
}

function pkcs7Unpad(buffer) {
  const pad = buffer[buffer.length - 1]
  if (pad < 1 || pad > BLOCK_SIZE) {
    throw new Error("Invalid PKCS7 padding")
  }
  return buffer.slice(0, buffer.length - pad)
}

function getMessageLength(buffer) {
  return buffer.readUInt32BE(16)
}

function decryptMessage(options) {
  const aesKey = decodeAesKey(options.encodingAesKey)
  const expectedSignature = sha1Sign(
    options.token,
    String(options.timestamp),
    String(options.nonce),
    options.encrypted,
  )

  if (expectedSignature !== options.msgSignature) {
    throw new Error("Invalid message signature")
  }

  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16))
  decipher.setAutoPadding(false)
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(options.encrypted, "base64")),
    decipher.final(),
  ])
  const plainBuffer = pkcs7Unpad(decrypted)
  const messageLength = getMessageLength(plainBuffer)
  const xml = plainBuffer.subarray(20, 20 + messageLength).toString("utf8")
  const appId = plainBuffer.subarray(20 + messageLength).toString("utf8")

  if (options.appId && appId !== options.appId) {
    throw new Error("AppID mismatch in decrypted message")
  }

  return {
    xml,
    appId,
  }
}

function encryptMessage(options) {
  const aesKey = decodeAesKey(options.encodingAesKey)
  const random16 = crypto.randomBytes(16)
  const msg = Buffer.from(options.xml, "utf8")
  const msgLength = Buffer.alloc(4)
  msgLength.writeUInt32BE(msg.length, 0)
  const appId = Buffer.from(options.appId, "utf8")
  const raw = Buffer.concat([random16, msgLength, msg, appId])
  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16))
  cipher.setAutoPadding(false)
  const encrypted = Buffer.concat([cipher.update(pkcs7Pad(raw)), cipher.final()]).toString("base64")
  const timestamp = String(options.timestamp || Math.floor(Date.now() / 1000))
  const nonce = String(options.nonce || crypto.randomBytes(8).toString("hex"))
  const msgSignature = sha1Sign(options.token, timestamp, nonce, encrypted)

  return {
    encrypted,
    timestamp,
    nonce,
    msgSignature,
  }
}

module.exports = {
  decryptMessage,
  encodeForSignature: sha1Sign,
  encryptMessage,
}
