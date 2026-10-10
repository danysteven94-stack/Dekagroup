"use strict";
// What the first-login guide has already shown to each account: one number per account, "the guide version I have seen".
// It lives on the server (not only in the browser) so an account sees the guide once, on whatever device it signs in from.
// The number only goes up. Accounts live in the "default" database (like users.js); Redis is the fallback.
const DB = require("./db");
const pg = require("./pgrepo");
const { redis } = require("./redis");
const { ApiError } = require("./errors");

const REDIS_KEY = "dl:tour_seen";
const MAX_VERSION = 100000;

function key(username) {
  return String(username || "").toLowerCase().slice(0, 64);
}

function guard(write) {
  if (DB.getDriver()) return "";
  if (process.env.VERCEL_ENV === "preview") {
    if (write) throw new ApiError(503, "no_preview_db", "Preview sa a pa gen baz done pa li.");
    return "skip";
  }
  return "";
}

async function get(username) {
  const k = key(username);
  if (!k || guard(false) === "skip") return 0;
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    const rows = await d.query("SELECT version FROM tour_seen WHERE username = $1", [k]);
    return rows[0] ? Number(rows[0].version) || 0 : 0;
  }
  const all = await redis.get(REDIS_KEY);
  return all && typeof all === "object" && Number(all[k]) > 0 ? Number(all[k]) : 0;
}

// Raises the seen version (never lowers it). Returns the version now stored.
async function raise(username, version) {
  const k = key(username);
  const v = Math.floor(Number(version));
  if (!k || !isFinite(v) || v < 1 || v > MAX_VERSION) return get(username);
  guard(true);
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    await d.query(
      "INSERT INTO tour_seen (username, version, updated_at) VALUES ($1, $2, $3) " +
      "ON CONFLICT (username) DO UPDATE SET version = CASE WHEN excluded.version > tour_seen.version THEN excluded.version ELSE tour_seen.version END, updated_at = excluded.updated_at",
      [k, v, new Date().toISOString()]
    );
    return get(username);
  }
  const all = await redis.get(REDIS_KEY);
  const map = all && typeof all === "object" ? all : {};
  if (!(Number(map[k]) >= v)) map[k] = v;
  await redis.set(REDIS_KEY, map);
  return Number(map[k]);
}

module.exports = { get, raise };
