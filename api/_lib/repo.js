"use strict";
// Picks the storage backend at call time: PostgreSQL when DATABASE_URL is set, otherwise the legacy Redis blob.
const DB = require("./db");
const legacy = require("./legacy");
const pg = require("./pgrepo");
const { ApiError } = require("./errors");

function active() {
  if (DB.getDriver()) return pg;
  // A preview deployment (pull request) must never touch the production Redis data: it needs its own database.
  if (process.env.VERCEL_ENV === "preview") {
    throw new ApiError(503, "no_preview_db", "Vèsyon preview sa a pa gen baz done pa li (DATABASE_URL). Li pa ka sèvi ak done pwodiksyon yo.");
  }
  return legacy;
}

module.exports = {
  name: function () { try { return active().name; } catch (e) { return "none"; } },
  readAll: function () { return active().readAll(); },
  writeClient: function (clean, opts) { return active().writeClient(clean, opts); },
  mutate: function (fn, opts) { return active().mutate(fn, opts); },
  health: function () { return active().health(); },
  _testLoad: function (blob) { return active()._testLoad(blob); },
};
