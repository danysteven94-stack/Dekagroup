"use strict";
// Personal accounts (one per person). Stored in PostgreSQL when it is configured, otherwise in Redis.
// The shared accounts from the environment variables (see auth.js) keep working next to them until you switch them off.
const crypto = require("crypto");
const DB = require("./db");
const pg = require("./pgrepo");
const { redis } = require("./redis");
const { ApiError } = require("./errors");

const ROLES = ["admin", "depot", "daily", "chofe"];
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

const COLS = [
  ["username", "username"], ["name", "name"], ["role", "role"], ["passHash", "pass_hash"], ["active", "active"],
  ["email", "email"], ["mustChange", "must_change"], ["totpSecretEnc", "totp_secret"], ["totpEnabled", "totp_enabled"], ["totpLast", "totp_last"],
  ["recovery", "recovery"], ["createdBy", "created_by"], ["createdAt", "created_at"], ["lastLoginAt", "last_login_at"],
  ["passChangedAt", "pass_changed_at"], ["updatedAt", "updated_at"],
];
const BOOLS = { active: 1, mustChange: 1, totpEnabled: 1 };

function guard(write) {
  if (DB.getDriver()) return;
  // A preview deployment without its own database must not read or change the production users.
  if (process.env.VERCEL_ENV === "preview") {
    if (write) throw new ApiError(503, "no_preview_db", "Preview sa a pa gen baz done pa li.");
    return "skip";
  }
}

function fromSql(r) {
  const u = {};
  COLS.forEach(function (c) {
    let v = r[c[1]];
    if (BOOLS[c[0]]) v = Number(v) === 1;
    else if (c[0] === "totpLast") v = Number(v) || 0;
    else if (c[0] === "recovery") { try { v = JSON.parse(v || "[]"); } catch (e) { v = []; } }
    else if (v === undefined) v = null;
    u[c[0]] = v;
  });
  return u;
}

function toSqlValue(key, v) {
  if (BOOLS[key]) return v ? 1 : 0;
  if (key === "recovery") return JSON.stringify(v || []);
  return v === undefined ? null : v;
}

async function get(username) {
  if (guard(false) === "skip") return null;
  username = String(username || "").toLowerCase();
  if (!USERNAME_RE.test(username)) return null;
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    const rows = await d.query("SELECT * FROM users WHERE username = $1", [username]);
    return rows[0] ? fromSql(rows[0]) : null;
  }
  const u = await redis.get("dl:user:" + username);
  return u && typeof u === "object" ? u : null;
}

async function list() {
  if (guard(false) === "skip") return [];
  const d = DB.getDriver();
  let out;
  if (d) {
    await pg.driver();
    out = (await d.query("SELECT * FROM users ORDER BY username")).map(fromSql);
  } else {
    const names = (await redis.lrange("dl:users", 0, 999)) || [];
    out = [];
    for (const n of names) { const u = await redis.get("dl:user:" + n); if (u) out.push(u); }
    out.sort(function (a, b) { return a.username < b.username ? -1 : 1; });
  }
  return out;
}

async function create(user) {
  guard(true);
  const d = DB.getDriver();
  const u = Object.assign({
    active: true, email: null, mustChange: true, totpSecretEnc: null, totpEnabled: false, totpLast: 0, recovery: [],
    createdBy: null, createdAt: new Date().toISOString(), lastLoginAt: null, passChangedAt: null, updatedAt: new Date().toISOString(),
  }, user);
  if (d) {
    await pg.driver();
    const params = COLS.map(function (c) { return toSqlValue(c[0], u[c[0]]); });
    try {
      await d.query("INSERT INTO users (" + COLS.map(function (c) { return c[1]; }).join(",") + ") VALUES (" + COLS.map(function (c, i) { return "$" + (i + 1); }).join(",") + ")", params);
    } catch (e) {
      if (await get(u.username)) throw new ApiError(409, "exists", "Non itilizatè sa a deja egziste.");
      throw e;
    }
    return u;
  }
  if (await get(u.username)) throw new ApiError(409, "exists", "Non itilizatè sa a deja egziste.");
  await redis.set("dl:user:" + u.username, u);
  await redis.lpush("dl:users", u.username);
  return u;
}

async function update(username, patch) {
  guard(true);
  const d = DB.getDriver();
  const p = Object.assign({}, patch, { updatedAt: new Date().toISOString() });
  if (d) {
    await pg.driver();
    const keys = Object.keys(p).filter(function (k) { return COLS.some(function (c) { return c[0] === k; }); });
    const params = [];
    const sets = keys.map(function (k) {
      params.push(toSqlValue(k, p[k]));
      return COLS.find(function (c) { return c[0] === k; })[1] + " = $" + params.length;
    });
    params.push(username);
    await d.query("UPDATE users SET " + sets.join(", ") + " WHERE username = $" + params.length, params);
    return get(username);
  }
  const cur = await get(username);
  if (!cur) return null;
  const next = Object.assign({}, cur, p);
  await redis.set("dl:user:" + username, next);
  return next;
}

// ---- password rules
const COMMON = ["password", "motdepasse", "modpass", "azerty", "qwerty", "123456", "12345678", "1234567890", "abcdefgh", "deka", "dekalog", "logistic", "depotnord", "haiti", "ayiti", "welcome", "admin123"];

// Returns an error message (Kreyòl) or "" when the password is acceptable.
function passwordProblem(pw, username) {
  pw = String(pw || "");
  if (pw.length < 10) return "Modpass la dwe gen omwen 10 karaktè.";
  if (pw.length > 128) return "Modpass la twò long (128 karaktè maksimòm).";
  const low = pw.toLowerCase();
  if (username && low.indexOf(String(username).toLowerCase()) !== -1) return "Modpass la pa dwe gen non itilizatè a ladan l.";
  if (/^(.)\1+$/.test(pw)) return "Modpass la twò senp.";
  // a common word with a few characters around it is still a weak password ("password2026")
  if (COMMON.some(function (c) { return low.indexOf(c) !== -1 && low.split(c).join("").length < 6; })) return "Modpass la twò komen. Chwazi yon lòt.";
  return "";
}

const TEMP_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
function tempPassword() {
  const g = function () { let s = ""; for (let i = 0; i < 4; i++) s += TEMP_ALPHA[crypto.randomInt(TEMP_ALPHA.length)]; return s; };
  return g() + "-" + g() + "-" + g();
}

module.exports = { ROLES, USERNAME_RE, get, list, create, update, passwordProblem, tempPassword };
