"use strict";
// Administration DEKA — one READ-ONLY view over everything the logistic administrator and the depot enter
// (containers, bills/products, stock entries, delivery slips, returned / damaged goods, invoices), for EVERY division.
//
// The divisions live in several databases (see divisions.js): this reads each one and returns them side by side,
// every record staying in the database it came from. A database that is not reachable is reported ("ok": false)
// instead of breaking the whole screen. Nothing is ever written here, and only the "administration" role can read it.
const A = require("./auth");
const repo = require("./repo");
const DB = require("./db");
const Div = require("./divisions");
const StockEntries = require("./stockentries");
const Goods = require("./goods");
const Invoices = require("./invoices");
const Slips = require("./slips");
const { ApiError } = require("./errors");

const ROLES = ["administration"];

async function readPool(pool) {
  const divisions = Div.divisionsInPool(pool);
  // One driver object for two pools means ONE database (dev / test servers): reading it again would count everything twice.
  if (pool !== "default" && DB.getDriver(pool) && DB.getDriver(pool) === DB.getDriver("default")) {
    return { pool: pool, divisions: divisions, ok: false, error: "not_configured", containers: [], bills: [], stock: [], slips: [], goods: [], invoices: [] };
  }
  try {
    const r = await repo.readAll(pool);
    const data = r.view || r.blob || {};
    const parts = await Promise.all([
      StockEntries.list(null, pool),
      Slips.list(pool),
      Goods.list({}, pool),
      Invoices.list({}, pool),
    ]);
    return {
      pool: pool, divisions: divisions, ok: true,
      containers: data.containers || [], bills: data.bills || [],
      stock: parts[0] || [], slips: parts[1] || [], goods: parts[2] || [], invoices: parts[3] || [],
    };
  } catch (e) {
    const notConfigured = e instanceof ApiError && (e.code === "no_division_db" || e.code === "no_preview_db");
    if (!notConfigured) console.error("overview error (" + pool + "):", e && e.message);
    return {
      pool: pool, divisions: divisions, ok: false, error: notConfigured ? "not_configured" : "error",
      containers: [], bills: [], stock: [], slips: [], goods: [], invoices: [],
    };
  }
}

// The figures are EXACTLY what the logistic administrator and the depot enter: nothing is filtered out, merged or dropped.
// (Containers that already left and were added from the archive have no division: they are counted too.)
function counts(p) {
  if (!p.ok) return Object.assign(p, { total: 0, noDivision: 0 });
  return Object.assign(p, {
    total: p.containers.length,
    noDivision: p.containers.filter(function (c) { return !c.division; }).length,
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const session = await A.requireAuth(req, res, ROLES);
    if (!session) return;
    const pools = Div.poolsOf(Div.ALL);
    const out = (await Promise.all(pools.map(readPool))).map(counts);
    res.status(200).json({ pools: out, at: new Date().toISOString() });
  } catch (err) {
    console.error("overview error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
module.exports.ROLES = ROLES;
