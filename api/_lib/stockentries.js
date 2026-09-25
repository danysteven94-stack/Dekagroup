"use strict";
// Stock entries ("Antre Estòk"): goods registered into the depot, always tied to a Bill.
// Stored in PostgreSQL when it is configured, otherwise in Redis (same dual-backend pattern as users.js).
const crypto = require("crypto");
const DB = require("./db");
const pg = require("./pgrepo");
const { redis } = require("./redis");
const { ApiError } = require("./errors");

const REDIS_KEY = "dl:stock_entries";
const MAX_LEGACY = 20000;

const COLS = [
  ["id", "id"], ["billId", "bill_id"], ["entryDate", "entry_date"], ["description", "description"],
  ["quantity", "quantity"], ["unit", "unit"], ["containerNumewo", "container_numewo"], ["remarks", "remarks"],
  ["registeredBy", "registered_by"], ["createdAt", "created_at"],
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
  return o;
}

async function list(billId) {
  if (guard(false) === "skip") return [];
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    const rows = billId
      ? await d.query("SELECT * FROM stock_entries WHERE bill_id = $1 ORDER BY created_at DESC", [billId])
      : await d.query("SELECT * FROM stock_entries ORDER BY created_at DESC LIMIT 2000");
    return rows.map(fromSql);
  }
  const all = await redis.get(REDIS_KEY);
  const rows = Array.isArray(all) ? all : [];
  const filtered = billId ? rows.filter(function (e) { return e.billId === billId; }) : rows;
  return filtered.slice().sort(function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); });
}

async function create(fields) {
  guard(true);
  const row = Object.assign({ id: newId(), createdAt: new Date().toISOString() }, fields);
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    await d.query(
      "INSERT INTO stock_entries (id, bill_id, entry_date, description, quantity, unit, container_numewo, remarks, registered_by, created_at) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [row.id, row.billId, row.entryDate, row.description, row.quantity, row.unit, row.containerNumewo, row.remarks, row.registeredBy, row.createdAt]
    );
    return row;
  }
  const all = await redis.get(REDIS_KEY);
  const rows = Array.isArray(all) ? all : [];
  rows.unshift(row);
  await redis.set(REDIS_KEY, rows.slice(0, MAX_LEGACY));
  return row;
}

module.exports = { list, create };
