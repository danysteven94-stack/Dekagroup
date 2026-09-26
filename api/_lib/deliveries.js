"use strict";
// Deliveries ("Livrezon Jounalye" / "Rapò Livrezon"): goods delivered out of the depot to a client, tied to a Bill.
// Stored in PostgreSQL when it is configured, otherwise in Redis (same dual-backend pattern as goods.js).
const crypto = require("crypto");
const DB = require("./db");
const pg = require("./pgrepo");
const { redis } = require("./redis");
const { ApiError } = require("./errors");

const REDIS_KEY = "dl:deliveries";
const MAX_LEGACY = 20000;

const COLS = [
  ["id", "id"], ["billId", "bill_id"], ["entryDate", "entry_date"], ["clientName", "client_name"],
  ["description", "description"], ["quantity", "quantity"], ["unit", "unit"], ["containerNumewo", "container_numewo"],
  ["trucking", "trucking"], ["chofer", "chofer"], ["remarks", "remarks"], ["registeredBy", "registered_by"],
  ["createdAt", "created_at"],
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
    if (filter.from) { params.push(filter.from); clauses.push("entry_date >= $" + params.length); }
    if (filter.to) { params.push(filter.to); clauses.push("entry_date <= $" + params.length); }
    const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
    const rows = await d.query("SELECT * FROM deliveries" + where + " ORDER BY created_at DESC LIMIT 2000", params);
    return rows.map(fromSql);
  }
  const all = await redis.get(REDIS_KEY);
  let rows = Array.isArray(all) ? all : [];
  if (filter.billId) rows = rows.filter(function (e) { return e.billId === filter.billId; });
  if (filter.from) rows = rows.filter(function (e) { return (e.entryDate || "") >= filter.from; });
  if (filter.to) rows = rows.filter(function (e) { return (e.entryDate || "") <= filter.to; });
  return rows.slice().sort(function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); });
}

async function create(fields) {
  guard(true);
  const row = Object.assign({ id: newId(), createdAt: new Date().toISOString() }, fields);
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    await d.query(
      "INSERT INTO deliveries (id, bill_id, entry_date, client_name, description, quantity, unit, container_numewo, trucking, chofer, remarks, registered_by, created_at) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
      [row.id, row.billId, row.entryDate, row.clientName, row.description, row.quantity, row.unit, row.containerNumewo, row.trucking, row.chofer, row.remarks, row.registeredBy, row.createdAt]
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
