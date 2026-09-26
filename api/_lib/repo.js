"use strict";
// Picks the storage backend at call time: PostgreSQL when a pool's database is set, otherwise the legacy
// Redis blob (only for the "default" pool — a division with its own database has no legacy fallback:
// its data must not silently end up mixed into the shared Redis blob).
const DB = require("./db");
const legacy = require("./legacy");
const pg = require("./pgrepo");
const { ApiError } = require("./errors");

function active(poolKey) {
  const key = poolKey || "default";
  if (DB.getDriver(key)) return pg;
  // A preview deployment (pull request) must never touch the production Redis data: it needs its own database.
  if (process.env.VERCEL_ENV === "preview") {
    throw new ApiError(503, "no_preview_db", "Vèsyon preview sa a pa gen baz done pa li (DATABASE_URL). Li pa ka sèvi ak done pwodiksyon yo.");
  }
  if (key !== "default") {
    throw new ApiError(503, "no_division_db", "Baz done pou divizyon sa a poko konfigire sou sèvè a. Kontakte administratè a.");
  }
  return legacy;
}

module.exports = {
  name: function (poolKey) { try { return active(poolKey).name; } catch (e) { return "none"; } },
  readAll: function (poolKey) { return active(poolKey).readAll(poolKey); },
  writeClient: function (clean, opts) { opts = opts || {}; return active(opts.pool).writeClient(clean, opts); },
  mutate: function (fn, opts) { opts = opts || {}; return active(opts.pool).mutate(fn, opts); },
  health: function (poolKey) { return active(poolKey).health(poolKey); },
  _testLoad: function (blob, poolKey) { return active(poolKey)._testLoad(blob, poolKey); },
};
