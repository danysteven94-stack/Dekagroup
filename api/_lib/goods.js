"use strict";
// Goods incidents ("Machandiz Retounen" / "Machandiz Avarye" / "Livrezon"): returned goods, damaged goods,
// or a delivery — all tied only to a Bill (and, through it, the product). No link to any container: once
// stock has entered from a container (see stockentries.js), everything downstream tracks the product only.
const crypto = require("crypto");
const DB = require("./db");
const pg = require("./pgrepo");
const { redis } = require("./redis");
const { ApiError } = require("./errors");

const REDIS_KEY = "dl:goods_incidents";
const MAX_LEGACY = 20000;

const COLS = [
  ["id", "id"], ["kind", "kind"], ["billId", "bill_id"], ["entryDate", "entry_date"], ["description", "description"],
  ["quantity", "quantity"], ["unit", "unit"], ["reason", "reason"],
  ["remarks", "remarks"], ["registeredBy", "registered_by"], ["createdAt", "created_at"],
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

async function list(filter) {
  filter = filter || {};
  if (guard(false) === "skip") return [];
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    const clauses = [];
    const params = [];
    if (filter.billId) { params.push(filter.billId); clauses.push("bill_id = $" + params.length); }
    if (filter.kind) { params.push(filter.kind); clauses.push("kind = $" + params.length); }
    const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
    const rows = await d.query("SELECT * FROM goods_incidents" + where + " ORDER BY created_at DESC LIMIT 2000", params);
    return rows.map(fromSql);
  }
  const all = await redis.get(REDIS_KEY);
  let rows = Array.isArray(all) ? all : [];
  if (filter.billId) rows = rows.filter(function (e) { return e.billId === filter.billId; });
  if (filter.kind) rows = rows.filter(function (e) { return e.kind === filter.kind; });
  return rows.slice().sort(function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); });
}

async function create(fields) {
  guard(true);
  const row = Object.assign({ id: newId(), createdAt: new Date().toISOString() }, fields);
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    await d.query(
      "INSERT INTO goods_incidents (id, kind, bill_id, entry_date, description, quantity, unit, reason, remarks, registered_by, created_at) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [row.id, row.kind, row.billId, row.entryDate, row.description, row.quantity, row.unit, row.reason, row.remarks, row.registeredBy, row.createdAt]
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
