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

// ---- keeping the figures real --------------------------------------------------------------------------------------
// A division belongs to ONE database (divisions.js). If a database also holds records of another division (leftovers of an
// older shared database, or two divisions pointed at the same database by mistake) or the very same record twice, counting
// it would inflate every total. So, per database, this keeps only what belongs to it, drops exact duplicates, and says
// how many it left out ("foreign" / "duplicates") so the screen can show it. Nothing is deleted from any database.
const norm = (v) => String(v == null ? "" : v).trim().toUpperCase();
// a record with no division belongs to the shared database, or to a database that has a single division
const belongs = (division, pool) => (division ? Div.poolOf(division) === pool : pool === "default" || Div.divisionsInPool(pool).length === 1);

function clean(pools) {
  const seenBills = {};
  const seen = {}; // exact same container in two databases (the same database read twice) is counted once
  return pools.map(function (p) {
    if (!p.ok) return Object.assign(p, { raw: 0, foreign: 0, duplicates: 0 });
    const raw = p.containers.length;
    const rawBillIds = {};
    p.containers.forEach(function (c) { if (c.billId) rawBillIds[c.billId] = true; });
    // containers of this database only, and each exact record once
    let foreign = 0, duplicates = 0;
    const containers = p.containers.filter(function (c) {
      if (!belongs(c.division, p.pool)) { foreign++; return false; }
      const key = [c.numewo, c.billId, c.division, c.dateExpected, c.datePran, c.dateEntered, c.dateVerified, c.dateEmpty, c.dateLeft, c.trucking, c.depo].map(norm).join("|");
      if (seen[key]) { duplicates++; return false; }
      seen[key] = true;
      return true;
    });
    const used = {};
    containers.forEach(function (c) { if (c.billId) used[c.billId] = true; });
    // a bill stays if one of its containers stays; a bill with no container at all stays only if no earlier database has it
    const bills = p.bills.filter(function (b) {
      if (used[b.id]) { seenBills[norm(b.numewo)] = true; return true; }
      if (rawBillIds[b.id]) return false; // all of its containers belong to another division
      const k = norm(b.numewo);
      if (k && seenBills[k]) return false;
      if (k) seenBills[k] = true;
      return true;
    });
    const billIds = {};
    bills.forEach(function (b) { billIds[b.id] = true; });
    const ofBill = (x) => !x.billId || billIds[x.billId];
    return Object.assign(p, {
      containers: containers, bills: bills, raw: raw, foreign: foreign, duplicates: duplicates,
      stock: p.stock.filter(ofBill),
      goods: p.goods.filter(ofBill),
      invoices: p.invoices.filter(ofBill),
      slips: p.slips.filter(function (x) { return belongs(x.division, p.pool); }),
    });
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
    const out = clean(await Promise.all(pools.map(readPool)));
    res.status(200).json({ pools: out, at: new Date().toISOString() });
  } catch (err) {
    console.error("overview error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
module.exports.ROLES = ROLES;
