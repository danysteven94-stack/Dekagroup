"use strict";
// Invoices ("Fakti"): registered as a draft ("anrejistre") against a Bill, then locked ("fini").
// Stored in PostgreSQL when it is configured, otherwise in Redis (same dual-backend pattern as stockentries.js).
const crypto = require("crypto");
const DB = require("./db");
const pg = require("./pgrepo");
const { redis } = require("./redis");
const { ApiError } = require("./errors");

const REDIS_KEY = "dl:invoices";
const MAX_LEGACY = 20000;

const COLS = [
  ["id", "id"], ["billId", "bill_id"], ["invoiceNumber", "invoice_number"], ["invoiceDate", "invoice_date"],
  ["dueDate", "due_date"], ["clientName", "client_name"], ["clientAddress", "client_address"],
  ["items", "items"], ["notes", "notes"], ["status", "status"], ["createdBy", "created_by"],
  ["createdAt", "created_at"], ["finishedBy", "finished_by"], ["finishedAt", "finished_at"],
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
  try {
    o.items = JSON.parse(o.items || "[]");
  } catch (e) {
    o.items = [];
  }
  return o;
}

function toRedisShape(row) {
  // Items already an array in the Redis path (no JSON round trip needed).
  return row;
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
    if (filter.status) { params.push(filter.status); clauses.push("status = $" + params.length); }
    const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
    const rows = await d.query("SELECT * FROM invoices" + where + " ORDER BY created_at DESC LIMIT 2000", params);
    return rows.map(fromSql);
  }
  const all = await redis.get(REDIS_KEY);
  let rows = Array.isArray(all) ? all : [];
  if (filter.billId) rows = rows.filter(function (e) { return e.billId === filter.billId; });
  if (filter.status) rows = rows.filter(function (e) { return e.status === filter.status; });
  return rows.slice().sort(function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); });
}

async function getById(id) {
  if (guard(false) === "skip") return null;
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    const rows = await d.query("SELECT * FROM invoices WHERE id = $1", [id]);
    return rows.length ? fromSql(rows[0]) : null;
  }
  const all = await redis.get(REDIS_KEY);
  const rows = Array.isArray(all) ? all : [];
  return rows.find(function (e) { return e.id === id; }) || null;
}

async function create(fields) {
  guard(true);
  const row = Object.assign({ id: newId(), status: "anrejistre", createdAt: new Date().toISOString(), finishedBy: null, finishedAt: null }, fields);
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    await d.query(
      "INSERT INTO invoices (id, bill_id, invoice_number, invoice_date, due_date, client_name, client_address, items, notes, status, created_by, created_at, finished_by, finished_at) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      [row.id, row.billId, row.invoiceNumber, row.invoiceDate, row.dueDate, row.clientName, row.clientAddress,
        JSON.stringify(row.items || []), row.notes, row.status, row.createdBy, row.createdAt, row.finishedBy, row.finishedAt]
    );
    return row;
  }
  const all = await redis.get(REDIS_KEY);
  const rows = Array.isArray(all) ? all : [];
  rows.unshift(toRedisShape(row));
  await redis.set(REDIS_KEY, rows.slice(0, MAX_LEGACY));
  return row;
}

async function finish(id, username) {
  guard(true);
  const finishedAt = new Date().toISOString();
  const d = DB.getDriver();
  if (d) {
    await pg.driver();
    const existing = await d.query("SELECT * FROM invoices WHERE id = $1", [id]);
    if (!existing.length) return null;
    if (existing[0].status === "fini") return fromSql(existing[0]);
    await d.query("UPDATE invoices SET status = 'fini', finished_by = $2, finished_at = $3 WHERE id = $1", [id, username, finishedAt]);
    const updated = await d.query("SELECT * FROM invoices WHERE id = $1", [id]);
    return fromSql(updated[0]);
  }
  const all = await redis.get(REDIS_KEY);
  const rows = Array.isArray(all) ? all : [];
  const row = rows.find(function (e) { return e.id === id; });
  if (!row) return null;
  if (row.status !== "fini") {
    row.status = "fini";
    row.finishedBy = username;
    row.finishedAt = finishedAt;
    await redis.set(REDIS_KEY, rows);
  }
  return row;
}

module.exports = { list, getById, create, finish };
