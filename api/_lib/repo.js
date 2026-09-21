"use strict";
// Picks the storage backend at call time: PostgreSQL when DATABASE_URL is set, otherwise the legacy Redis blob.
const DB = require("./db");
const legacy = require("./legacy");
const pg = require("./pgrepo");

function active() {
  return DB.getDriver() ? pg : legacy;
}

module.exports = {
  name: function () { return active().name; },
  readAll: function () { return active().readAll(); },
  writeClient: function (clean, opts) { return active().writeClient(clean, opts); },
  mutate: function (fn, opts) { return active().mutate(fn, opts); },
  health: function () { return active().health(); },
  _testLoad: function (blob) { return active()._testLoad(blob); },
};
