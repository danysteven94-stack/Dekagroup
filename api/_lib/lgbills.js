"use strict";
// Logistique Deka: its OWN data. One record per Bill that the Logistique Deka people enter themselves
// (division, number, product, amount) together with the three manual payment dates
// (check received -> paid by the broker -> confirmed).
//
// This data has no link at all with the containers, bills, stock or invoices of the other interfaces:
// it is never read from them and never written to them. It lives in its own table (lg_bills) in the main
// database (one single place, whatever the division), or under its own Redis key when PostgreSQL is not set up.
const crypto = require("crypto");
const DB = require("./db");
const pg = require("./pgrepo");
const { redis } = require("./redis");
const { ApiError } = require("./errors");

// The divisions of Logistique Deka (same list as public/js/constants.js LOGISTIQUE_DIVISIONS).
const DIVISIONS = ["CRISTO S.A", "ACS", "MIKADO", "ENERSOL", "LA COLLECTION", "MOBILITY"];

function isDivision(d) {
  return DIVISIONS.indexOf(d) !== -1;
}

const REDIS_KEY = "dl:lgbills";
const MAX_LEGACY = 20000;

const COLS = [
  ["id", "id"], ["division", "division"], ["numewo", "numewo"], ["product", "product"], ["amount", "amount"], ["currency", "currency"],
  ["checkDate", "check_date"], ["paidDate", "paid_date"], ["confirmedDate", "confirmed_date"],
  ["broker", "broker"], ["reference", "reference"], ["notes", "notes"], ["batchId", "batch_id"],
  ["createdBy", "created_by"], ["createdAt", "created_at"], ["updatedBy", "updated_by"], ["updatedAt", "updated_at"],
];

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

// A preview deployment without its own database must not read or change production data.
function guard(write) {
  if (DB.getDriver()) return "";
  if (process.env.VERCEL_ENV === "preview") {
    if (write) throw new ApiError(503, "no_preview_db", "Preview sa a pa gen baz done pa li.");
    return "skip";
  }
  return "";
}

function fromSql(r) {
  const o = {};
  COLS.forEach(function (c) { o[c[0]] = r[c[1]] === undefined ? null : r[c[1]]; });
  o.amount = o.amount === null || o.amount === "" ? null : Number(o.amount);
  if (o.amount !== null && !isFinite(o.amount)) o.amount = null;
  return o;
}

// Which step a bill is at: "konfime" > "peye" > "chek" > "poko" (nothing yet).
function stageOf(p) {
  if (!p) return "poko";
  if (p.confirmedDate) return "konfime";
  if (p.paidDate) return "peye";
  if (p.checkDate) return "chek";
  return "poko";
}

async function list() {
  if (guard(false) === "skip") return [];
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    const rows = await d.query("SELECT * FROM lg_bills ORDER BY updated_at DESC LIMIT 5000", []);
    return rows.map(fromSql);
  }
  const all = await redis.get(REDIS_KEY);
  const rows = Array.isArray(all) ? all : [];
  return rows.slice().sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });
}

function sameKey(a, b) {
  return a.division === b.division && String(a.numewo).toLowerCase() === String(b.numewo).toLowerCase();
}

function params(r) {
  return [r.id, r.division, r.numewo, r.product, r.amount === null || r.amount === undefined ? null : String(r.amount), r.currency || "HTG",
    r.checkDate, r.paidDate, r.confirmedDate, r.broker, r.reference, r.notes, r.batchId, r.createdBy, r.createdAt, r.updatedBy, r.updatedAt];
}

// Insert a NEW bill. Refuses a second bill with the same number in the same division.
async function insert(rec) {
  guard(true);
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    try {
      await d.query("INSERT INTO lg_bills (" + COLS.map(function (c) { return c[1]; }).join(", ") + ") VALUES (" + COLS.map(function (c, i) { return "$" + (i + 1); }).join(", ") + ")", params(rec));
    } catch (e) {
      const dup = (await list()).some(function (x) { return sameKey(x, rec); });
      if (dup) throw new ApiError(409, "exists", "Bill sa a deja egziste nan divizyon sa a.");
      throw e;
    }
    return rec;
  }
  const rows = await list();
  if (rows.some(function (x) { return sameKey(x, rec); })) throw new ApiError(409, "exists", "Bill sa a deja egziste nan divizyon sa a.");
  rows.unshift(rec);
  await redis.set(REDIS_KEY, rows.slice(0, MAX_LEGACY));
  return rec;
}

// Replace complete, already validated records (payment steps, or the identity of a bill).
async function saveMany(records) {
  guard(true);
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    for (const r of records) {
      await d.query(
        "UPDATE lg_bills SET division = $2, numewo = $3, product = $4, amount = $5, currency = $6, check_date = $7, paid_date = $8, confirmed_date = $9, " +
        "broker = $10, reference = $11, notes = $12, batch_id = $13, updated_by = $16, updated_at = $17 WHERE id = $1",
        params(r)
      );
    }
    return records;
  }
  const byId = {};
  records.forEach(function (r) { byId[r.id] = r; });
  const rows = (await list()).map(function (e) { return byId[e.id] || e; });
  await redis.set(REDIS_KEY, rows.slice(0, MAX_LEGACY));
  return records;
}

async function remove(id) {
  guard(true);
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    await d.query("DELETE FROM lg_bills WHERE id = $1", [id]);
    return;
  }
  const rows = (await list()).filter(function (e) { return e.id !== id; });
  await redis.set(REDIS_KEY, rows);
}

module.exports = { DIVISIONS, isDivision, newId, stageOf, list, insert, saveMany, remove, sameKey };
