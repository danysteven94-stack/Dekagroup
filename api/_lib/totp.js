"use strict";
// Time-based one-time passwords (RFC 6238, HMAC-SHA1, 6 digits, 30 s) compatible with Google Authenticator, Microsoft
// Authenticator, Authy, 1Password...
const crypto = require("crypto");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP = 30;

function base32Encode(buf) {
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return out;
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of clean) bits += B32.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20)); // 160 bits, 32 characters
}

function counterAt(ms) {
  return Math.floor(ms / 1000 / STEP);
}

function hotp(secret, counter, digits) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % Math.pow(10, digits || 6)).padStart(digits || 6, "0");
}

// Returns the matching time counter (> 0) or 0. `lastUsed` blocks replaying a code that was already accepted.
function verify(secret, code, lastUsed, nowMs) {
  const c = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(c)) return 0;
  const now = counterAt(nowMs === undefined ? Date.now() : nowMs);
  for (let d = -1; d <= 1; d++) {
    const counter = now + d;
    const a = Buffer.from(hotp(secret, counter, 6));
    const b = Buffer.from(c);
    if (a.length === b.length && crypto.timingSafeEqual(a, b) && counter > (lastUsed || 0)) return counter;
  }
  return 0;
}

function otpauthUrl(secret, account, issuer) {
  return "otpauth://totp/" + encodeURIComponent(issuer + ":" + account) + "?secret=" + secret + "&issuer=" + encodeURIComponent(issuer) + "&algorithm=SHA1&digits=6&period=30";
}

module.exports = { generateSecret, verify, hotp, counterAt, otpauthUrl, base32Encode, base32Decode };
