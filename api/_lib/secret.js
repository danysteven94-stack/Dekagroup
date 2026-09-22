"use strict";
// Encryption helpers for data that must be recoverable by the server (2FA secrets) or verified without storing it in
// clear (recovery codes). The key comes from the APP_SECRET environment variable (never stored in the database).
const crypto = require("crypto");
const { ApiError } = require("./errors");

let cachedFor = "";
let cachedKeys = null;

function keys() {
  const s = process.env.APP_SECRET || "";
  if (s.length < 24) {
    throw new ApiError(503, "no_app_secret", "APP_SECRET manke oswa twò kout (24 karaktè minimòm) sou sèvè a.");
  }
  if (cachedFor !== s) {
    cachedKeys = {
      enc: crypto.scryptSync(s, "deka-log/enc/v1", 32),
      mac: crypto.scryptSync(s, "deka-log/mac/v1", 32),
    };
    cachedFor = s;
  }
  return cachedKeys;
}

function available() {
  return (process.env.APP_SECRET || "").length >= 24;
}

// AES-256-GCM, output "v1.<iv>.<tag>.<cipher>" (base64url)
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keys().enc, iv);
  const enc = Buffer.concat([c.update(String(text), "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

function decrypt(payload) {
  const p = String(payload || "").split(".");
  if (p.length !== 4 || p[0] !== "v1") throw new Error("bad ciphertext");
  const d = crypto.createDecipheriv("aes-256-gcm", keys().enc, Buffer.from(p[1], "base64url"));
  d.setAuthTag(Buffer.from(p[2], "base64url"));
  return Buffer.concat([d.update(Buffer.from(p[3], "base64url")), d.final()]).toString("utf8");
}

// Keyed hash for high-entropy one-time values (recovery codes).
function mac(text) {
  return crypto.createHmac("sha256", keys().mac).update(String(text)).digest("hex");
}

module.exports = { available, encrypt, decrypt, mac };
