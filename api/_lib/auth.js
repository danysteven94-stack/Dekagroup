"use strict";
// Server-side authentication for DEKA LOG.
//  - Passwords are checked on the server only (scrypt hashes kept in environment variables).
//  - A successful login creates a random session id kept in an HttpOnly cookie; only its SHA-256 is stored in Redis.
//  - Logins are rate limited, every state-changing request is checked against CSRF, and important events are audited.
const crypto = require("crypto");
const { promisify } = require("util");
const { redis } = require("./redis");

// users.js is loaded lazily: it depends (indirectly) on this file.
const Users = function () { return require("./users"); };

const scrypt = promisify(crypto.scrypt);

const COOKIE = "__Host-dl_sid";
const IDLE_SEC = 12 * 3600; // a session dies after 12 h without activity
const ABS_SEC = { admin: 24 * 3600, depot: 14 * 86400, daily: 14 * 86400, chofe: 14 * 86400 }; // hard limit per role
const REFRESH_MS = 5 * 60 * 1000;

const LOGIN_WINDOW_SEC = 15 * 60;
const LIMIT_USER_IP = 5; // failed attempts per (username + IP) per window
const LIMIT_IP = 30; // failed attempts per IP per window
const LIMIT_USER = 40; // failed attempts per username per window (distributed attacks)
const WRITE_LIMIT = 120; // state-changing requests per user per minute

const ROLE_DEFS = [
  { role: "admin", key: "ADMIN", defaultUser: "logistic" },
  { role: "depot", key: "DEPOT", defaultUser: "depotnord" },
  { role: "daily", key: "DAILY", defaultUser: "logisticdepot" },
  { role: "chofe", key: "CHOFE", defaultUser: "chofe" },
];

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

// Accounts come from environment variables: AUTH_<ROLE>_HASH (preferred) or AUTH_<ROLE>_PASS, optional AUTH_<ROLE>_USER.
function accounts() {
  const out = [];
  if (process.env.AUTH_LEGACY_DISABLED === "1") return out; // shared accounts switched off
  ROLE_DEFS.forEach(function (d) {
    const secret = process.env["AUTH_" + d.key + "_HASH"] || process.env["AUTH_" + d.key + "_PASS"] || "";
    if (!secret) return;
    const username = String(process.env["AUTH_" + d.key + "_USER"] || d.defaultUser).trim().toLowerCase();
    out.push({ role: d.role, username: username, secret: secret });
  });
  return out;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(String(password), salt, 64);
  return "scrypt:" + salt.toString("hex") + ":" + hash.toString("hex");
}

async function verifyPassword(input, stored) {
  input = String(input);
  if (stored.indexOf("scrypt:") === 0) {
    const parts = stored.split(":");
    if (parts.length !== 3) return false;
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    if (!salt.length || !expected.length) return false;
    const derived = await scrypt(input, salt, expected.length);
    return crypto.timingSafeEqual(derived, expected);
  }
  // Plain-text value in the environment variable: still compared in constant time.
  const a = crypto.createHash("sha256").update(input).digest();
  const b = crypto.createHash("sha256").update(stored).digest();
  return crypto.timingSafeEqual(a, b);
}

// Used when the username does not exist, so the response time does not reveal which usernames are valid.
const DUMMY_HASH = "scrypt:" + "00".repeat(16) + ":" + "00".repeat(64);

function clientIp(req) {
  const h = req.headers || {};
  const real = h["x-real-ip"];
  if (real) return String(real).split(",")[0].trim().slice(0, 64);
  const xff = h["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim().slice(0, 64);
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach(function (p) {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}

function sessKey(token) {
  return "dl:sess:" + crypto.createHash("sha256").update(token).digest("hex");
}

function epoch() {
  return String(process.env.AUTH_SESSION_EPOCH || "0");
}

function cookieString(token, maxAge) {
  return COOKIE + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + maxAge;
}

const USESS_TTL = 15 * 86400;

async function createSession(req, res, account) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const key = sessKey(token);
  await redis.set(
    key,
    { u: account.username, n: account.name || null, src: account.src || "env", role: account.role, ct: now, ls: now, e: epoch(), ip: clientIp(req), ua: String((req.headers || {})["user-agent"] || "").slice(0, 160) },
    { ex: IDLE_SEC }
  );
  // index of the sessions of each person, so they can all be closed at once (password change, disabled account...)
  const h = {}; h[key] = now;
  await redis.hset("dl:usess:" + account.username, h);
  await redis.expire("dl:usess:" + account.username, USESS_TTL);
  res.setHeader("Set-Cookie", cookieString(token, ABS_SEC[account.role] || 86400));
  return token;
}

// Closes every session of a person (optionally keeping the current one). Returns how many were closed.
async function killUserSessions(username, exceptKey) {
  const idx = "dl:usess:" + username;
  const all = (await redis.hgetall(idx)) || {};
  let n = 0;
  for (const k of Object.keys(all)) {
    if (k === exceptKey) continue;
    await redis.del(k);
    await redis.hdel(idx, k);
    n++;
  }
  return n;
}

// What a person must do before using the app: change a temporary password / set up 2-step verification (admins).
function limitedFor(u) {
  if (!u) return null;
  if (u.mustChange) return "password";
  if (u.role === "admin" && !u.totpEnabled) return "2fa";
  return null;
}

async function getSession(req) {
  const token = parseCookies((req.headers || {}).cookie)[COOKIE];
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const key = sessKey(token);
  const s = await redis.get(key);
  if (!s || typeof s !== "object") return null;

  const now = Date.now();
  let user = null;
  let stillExists;
  if (s.src === "db") {
    user = await Users().get(s.u);
    stillExists = !!(user && user.active && user.role === s.role);
  } else {
    stillExists = accounts().some(function (a) { return a.username === s.u && a.role === s.role; });
  }
  const expired = now - s.ct > (ABS_SEC[s.role] || ABS_SEC.admin) * 1000;
  if (!stillExists || expired || s.e !== epoch()) {
    await redis.del(key);
    return null;
  }
  if (now - s.ls > REFRESH_MS) {
    s.ls = now;
    await redis.set(key, s, { ex: IDLE_SEC });
  }
  return { key: key, username: s.u, name: user ? user.name : s.n || null, role: s.role, src: s.src || "env", limited: limitedFor(user) };
}

async function destroySession(req, res) {
  const token = parseCookies((req.headers || {}).cookie)[COOKIE];
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    const key = sessKey(token);
    const s = await redis.get(key);
    await redis.del(key);
    if (s && s.u) await redis.hdel("dl:usess:" + s.u, key);
  }
  res.setHeader("Set-Cookie", cookieString("", 0));
}

// ---- CSRF: browsers always send Origin (or Sec-Fetch-Site) on state-changing fetches.
function sameOrigin(req) {
  const m = req.method;
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return true;
  const h = req.headers || {};
  const host = h["x-forwarded-host"] || h.host;
  if (h.origin) {
    try { return new URL(h.origin).host === host; } catch (e) { return false; }
  }
  if (h["sec-fetch-site"]) return h["sec-fetch-site"] === "same-origin";
  return false;
}

function isJson(req) {
  return String((req.headers || {})["content-type"] || "").toLowerCase().indexOf("application/json") === 0;
}

// ---- fixed-window counters
async function bump(key, windowSec) {
  const n = await redis.incr(key);
  if (n === 1) {
    await redis.expire(key, windowSec);
  } else {
    const left = await redis.ttl(key);
    if (left < 0) await redis.expire(key, windowSec);
  }
  return n;
}

async function count(key) {
  return Number(await redis.get(key)) || 0;
}

// ---- audit trail (last 2000 events)
async function audit(req, event, detail, session) {
  try {
    const h = (req && req.headers) || {};
    const entry = {
      t: new Date().toISOString(),
      ev: event,
      u: (session && session.username) || (detail && detail.username) || null,
      n: (session && session.name) || null,
      role: (session && session.role) || null,
      ip: req ? clientIp(req) : null,
      ua: String(h["user-agent"] || "").slice(0, 120),
      d: detail || null,
    };
    await redis.lpush("dl:audit", JSON.stringify(entry));
    await redis.ltrim("dl:audit", 0, 1999);
  } catch (e) {
    console.error("audit failed:", e && e.message);
  }
}

function fail(res, status, error, code) {
  res.status(status).json({ error: error, code: code });
  return null;
}

// Guards an API route. Returns the session or null (response already sent).
async function requireAuth(req, res, roles, opts) {
  res.setHeader("Cache-Control", "no-store");
  if (!sameOrigin(req)) return fail(res, 403, "Demann sa a pa soti nan sit la.", "bad_origin");
  const writes = req.method !== "GET" && req.method !== "HEAD";
  if (writes && !isJson(req)) return fail(res, 415, "Fòma demann nan pa valid.", "bad_content_type");

  const session = await getSession(req);
  if (!session) return fail(res, 401, "Ou dwe konekte.", "unauthenticated");
  if (session.limited && !(opts && opts.allowLimited)) {
    return session.limited === "password"
      ? fail(res, 403, "Ou dwe chanje modpass ou anvan w kontinye.", "must_change_password")
      : fail(res, 403, "Ou dwe aktive otantifikasyon 2 etap anvan w kontinye.", "must_enroll_2fa");
  }

  if (roles && roles.indexOf(session.role) === -1) {
    await audit(req, "forbidden", { path: req.url, method: req.method }, session);
    return fail(res, 403, "Ou pa gen dwa pou aksyon sa a.", "forbidden");
  }
  if (writes) {
    const n = await bump("dl:rl:w:" + session.username, 60);
    if (n > WRITE_LIMIT) return fail(res, 429, "Twòp aksyon nan yon ti tan. Tann yon minit.", "rate_limited");
  }
  return session;
}

// For the account endpoints: any logged-in person, even when they still have to change their password / enable 2FA.
function requireSession(req, res) {
  return requireAuth(req, res, null, { allowLimited: true });
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  return body && typeof body === "object" && !Array.isArray(body) ? body : {};
}

module.exports = {
  COOKIE, ROLE_DEFS, LOGIN_WINDOW_SEC, LIMIT_USER_IP, LIMIT_IP, LIMIT_USER, DUMMY_HASH,
  accounts, hashPassword, verifyPassword, clientIp, createSession, getSession, destroySession,
  sameOrigin, isJson, bump, count, audit, requireAuth, requireSession, parseBody, sleep, killUserSessions, limitedFor,
};
