"use strict";
// Delivery slips ("Fich Livrezon"): the paper slip a client signs when goods leave the depot.
// One slip = Bon #, division, date, client, facture #, several product lines, magasinier, chauffeur, reçu par.
// Each line names a Bill (so, its product), a description, a unit and a quantity: those lines are what the
// inventory subtracts from the stock entries. No link to any container.
// Stored in PostgreSQL when it is configured, otherwise in Redis (same dual-backend pattern as goods.js).
// Read: admin, depot, daily. Write: admin, depot only.
const crypto = require("crypto");
const A = require("./auth");
const S = require("./store");
const DB = require("./db");
const pg = require("./pgrepo");
const repo = require("./repo");
const { redis } = require("./redis");
const { ApiError } = require("./errors");

const REDIS_KEY = "dl:delivery_slips";
const MAX_LEGACY = 20000;
const MAX_LINES = 30;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// The divisions of the app (same names as _lib/divisions.js): one box may be ticked at the top of the slip.
const COMPANIES = ["CRISTO AL", "CRISTO COMM", "CONFIDEKA", "DEKAV", "ACS", "MIKADO", "LA COLLECTION", "MOBILITY", "ENERSOL"];

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

// A real calendar day: "2026-02-31" has the right shape but does not exist.
function isRealDate(v) {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function text(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// A preview deployment without its own database must not read or change production data.
function guard(write, poolKey) {
  if (DB.getDriver(poolKey)) return "";
  if (process.env.VERCEL_ENV === "preview") {
    if (write) throw new ApiError(503, "no_preview_db", "Preview sa a pa gen baz done pa li.");
    return "skip";
  }
  return "";
}

const COLS = [
  ["id", "id"], ["slipNumber", "slip_number"], ["division", "division"], ["slipDate", "slip_date"], ["clientName", "client_name"],
  ["invoiceNumber", "invoice_number"], ["items", "items"], ["storekeeper", "storekeeper"], ["driver", "driver"],
  ["receivedBy", "received_by"], ["deliveredOn", "delivered_on"], ["remarks", "remarks"], ["registeredBy", "registered_by"],
  ["createdAt", "created_at"],
];

function fromSql(r) {
  const o = {};
  COLS.forEach(function (c) { o[c[0]] = r[c[1]] === undefined ? null : r[c[1]]; });
  try { o.items = JSON.parse(o.items || "[]"); } catch (e) { o.items = []; }
  return o;
}

function markDup(row) { Object.defineProperty(row, "duplicate", { value: true, enumerable: false }); return row; }

async function list(poolKey) {
  if (guard(false, poolKey) === "skip") return [];
  const d = DB.getDriver(poolKey);
  if (d) {
    await pg.driver(poolKey);
    const rows = await d.query("SELECT * FROM delivery_slips ORDER BY slip_date DESC, created_at DESC LIMIT 3000");
    return rows.map(fromSql);
  }
  const all = await redis.get(REDIS_KEY);
  const rows = Array.isArray(all) ? all : [];
  return rows.slice().sort(function (a, b) {
    return (b.slipDate || "").localeCompare(a.slipDate || "") || (b.createdAt || "").localeCompare(a.createdAt || "");
  });
}

async function create(fields, poolKey) {
  guard(true, poolKey);
  const row = Object.assign({ id: newId(), createdAt: new Date().toISOString() }, fields);
  const d = DB.getDriver(poolKey);
  if (d) {
    await pg.driver(poolKey);
    const have = await d.query("SELECT * FROM delivery_slips WHERE id = $1", [row.id]);
    if (have.length) return markDup(fromSql(have[0]));
    await d.query(
      "INSERT INTO delivery_slips (id, slip_number, division, slip_date, client_name, invoice_number, items, storekeeper, driver, received_by, delivered_on, remarks, registered_by, created_at) " +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      [row.id, row.slipNumber, row.division, row.slipDate, row.clientName, row.invoiceNumber, JSON.stringify(row.items), row.storekeeper, row.driver, row.receivedBy, row.deliveredOn, row.remarks, row.registeredBy, row.createdAt]
    );
    return row;
  }
  const all = await redis.get(REDIS_KEY);
  const rows = Array.isArray(all) ? all : [];
  const dup = rows.find(function (e) { return e.id === row.id; });
  if (dup) return markDup(Object.assign({}, dup));
  rows.unshift(row);
  await redis.set(REDIS_KEY, rows.slice(0, MAX_LEGACY));
  return row;
}

function bad(res, msg) {
  res.status(400).json({ error: msg, code: "invalid" });
}

// Router target: /api/slips is rewritten to /api/goods?action=slips (Vercel Hobby allows 12 functions only).
async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const session = await A.requireAuth(req, res, ["admin", "depot", "daily"]);
      if (!session) return;
      res.status(200).json({ slips: await list(session.pool) });
      return;
    }

    if (req.method === "POST") {
      const session = await A.requireAuth(req, res, ["admin", "depot"]);
      if (!session) return;
      const body = A.parseBody(req);
      if (body.action !== "create") {
        res.status(400).json({ error: "Aksyon pa valid.", code: "invalid_action" });
        return;
      }

      const clientName = text(body.clientName, 120);
      if (!clientName) return bad(res, "Non kliyan an obligatwa.");
      const division = text(body.division, 40);
      if (division && COMPANIES.indexOf(division) === -1) return bad(res, "Konpayi a pa valid.");
      const slipDate = isRealDate(body.slipDate) ? body.slipDate : S.today();
      const deliveredOn = isRealDate(body.deliveredOn) ? body.deliveredOn : slipDate;

      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (!rawItems.length) return bad(res, "Ajoute omwen yon pwodwi sou fich la.");
      if (rawItems.length > MAX_LINES) return bad(res, "Twòp liy sou yon sèl fich (" + MAX_LINES + " maksimòm).");

      const r = await repo.readAll(session.pool);
      const data = r.view || r.blob;
      const items = [];
      for (let i = 0; i < rawItems.length; i++) {
        const it = rawItems[i] || {};
        const billId = text(it.billId, 64);
        if (!billId || !ID_RE.test(billId)) return bad(res, "Liy " + (i + 1) + ": chwazi yon pwodwi.");
        if (!(data.bills || []).some(function (b) { return b.id === billId; })) {
          res.status(404).json({ error: "Pa jwenn Bill sa a. Done yo rafrechi.", code: "not_found" });
          return;
        }
        const description = text(it.description, 200);
        if (!description) return bad(res, "Liy " + (i + 1) + ": deskripsyon an obligatwa.");
        const unit = text(it.unit, 20);
        if (!unit) return bad(res, "Liy " + (i + 1) + ": inite a obligatwa.");
        const qty = text(String(it.quantity === undefined || it.quantity === null ? "" : it.quantity), 20);
        if (!qty || !/^\d+(\.\d{1,2})?$/.test(qty) || Number(qty) <= 0) return bad(res, "Liy " + (i + 1) + ": kantite a dwe yon nonm ki pi gran pase 0.");
        items.push({ billId: billId, description: description, unit: unit, quantity: qty });
      }

      const clientId = /^[A-Za-z0-9]{8,40}$/.test(typeof body.clientId === "string" ? body.clientId : "") ? body.clientId : null;
      const slip = await create({
        ...(clientId ? { id: clientId } : {}),
        slipNumber: text(body.slipNumber, 40) || null,
        division: division || null,
        slipDate: slipDate,
        clientName: clientName,
        invoiceNumber: text(body.invoiceNumber, 60) || null,
        items: items,
        storekeeper: text(body.storekeeper, 80) || null,
        driver: text(body.driver, 80) || null,
        receivedBy: text(body.receivedBy, 80) || null,
        deliveredOn: deliveredOn,
        remarks: text(body.remarks, 300) || null,
        registeredBy: session.username,
      }, session.pool);
      if (slip.duplicate) {
        // A replay of a request that was already saved (network dropped after the save): return it, do not repeat side effects.
        if (slip.registeredBy !== session.username) { res.status(409).json({ error: "Idantifyan an deja itilize.", code: "id_taken" }); return; }
        res.status(200).json({ ok: true, slip: slip, duplicate: true });
        return;
      }
      await A.audit(req, "delivery_slip_create", { slipNumber: slip.slipNumber, clientName: clientName, lines: items.length }, session);
      res.status(200).json({ ok: true, slip: slip });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("slips error:", err && err.message);
    const busy = err instanceof ApiError && err.status === 503;
    res.status(busy ? 503 : 500).json({ error: busy ? err.message : "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
}

module.exports = handler;
module.exports.list = list;
module.exports.create = create;
module.exports.COMPANIES = COMPANIES;
