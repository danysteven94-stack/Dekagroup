"use strict";
// Vercel Hobby plan limits a Deployment to 12 Serverless Functions, so the four
// Bill-linked record types (stock entries, invoices, goods incidents, deliveries)
// share one file here. /api/stock, /api/invoices, /api/goods and /api/deliveries
// are routed to this file via rewrites in vercel.json, so the browser paths,
// query params and behavior are all unchanged.
const A = require("./_lib/auth");
const S = require("./_lib/store");
const repo = require("./_lib/repo");
const StockEntries = require("./_lib/stockentries");
const Invoices = require("./_lib/invoices");
const Goods = require("./_lib/goods");
const Deliveries = require("./_lib/deliveries");
const { ApiError } = require("./_lib/errors");

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GOODS_KINDS = ["retounen", "avarye"];
const INVOICE_STATUSES = ["anrejistre", "fini"];
const MAX_ITEMS = 30;

function text(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function num(v) {
  var n = typeof v === "number" ? v : parseFloat(v);
  return isFinite(n) ? n : null;
}
function cleanItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) return null;
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var it = raw[i] || {};
    var description = text(it.description, 150);
    var qty = num(it.qty);
    var unitPrice = num(it.unitPrice);
    if (!description || qty === null || qty <= 0 || unitPrice === null || unitPrice < 0) return null;
    out.push({ description: description, qty: qty, unitPrice: unitPrice });
  }
  return out;
}
async function findBill(billId) {
  const r = await repo.readAll();
  const data = r.view || r.blob;
  return (data.bills || []).find(function (b) { return b.id === billId; });
}

// ---- Stock entries ("Antre Estòk"): goods registered into the depot, tied to an existing Bill. ----
// Read: admin, depot, daily. Write: admin, depot only.
async function stockHandler(req, res) {
  if (req.method === "GET") {
    const session = await A.requireAuth(req, res, ["admin", "depot", "daily"]);
    if (!session) return;
    const qBillId = req.query && req.query.billId;
    const billId = typeof qBillId === "string" && ID_RE.test(qBillId) ? qBillId : null;
    const entries = await StockEntries.list(billId);
    res.status(200).json({ entries: entries });
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

    const billId = text(body.billId, 64);
    if (!billId || !ID_RE.test(billId)) {
      res.status(400).json({ error: "Chwazi yon Bill.", code: "invalid" });
      return;
    }
    const description = text(body.description, 200);
    if (!description) {
      res.status(400).json({ error: "Deskripsyon an obligatwa.", code: "invalid" });
      return;
    }
    const unit = text(body.unit, 20);
    if (!unit) {
      res.status(400).json({ error: "Inite a (egz. sak, kolo) obligatwa.", code: "invalid" });
      return;
    }
    const quantityRaw = text(body.quantity, 20);
    if (!quantityRaw || !/^\d+(\.\d{1,2})?$/.test(quantityRaw) || Number(quantityRaw) <= 0) {
      res.status(400).json({ error: "Kantite a dwe yon nonm ki pi gran pase 0.", code: "invalid" });
      return;
    }
    const entryDate = DATE_RE.test(body.entryDate || "") ? body.entryDate : S.today();
    const containerNumewo = text(body.containerNumewo, 40) || null;
    const remarks = text(body.remarks, 300) || null;

    const bill = await findBill(billId);
    if (!bill) {
      res.status(404).json({ error: "Pa jwenn Bill sa a. Done yo rafrechi.", code: "not_found" });
      return;
    }

    const entry = await StockEntries.create({
      billId: billId,
      entryDate: entryDate,
      description: description,
      quantity: quantityRaw,
      unit: unit,
      containerNumewo: containerNumewo,
      remarks: remarks,
      registeredBy: session.username,
    });

    await A.audit(req, "stock_entry_create", { billId: billId, billNumewo: bill.numewo, description: description }, session);
    res.status(200).json({ ok: true, entry: entry });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method not allowed" });
}

// ---- Goods incidents ("Machandiz Retounen" / "Machandiz Avarye"): returned or damaged goods, tied to a Bill. ----
// Read: admin, depot, daily. Write: admin, depot only.
async function goodsHandler(req, res) {
  if (req.method === "GET") {
    const session = await A.requireAuth(req, res, ["admin", "depot", "daily"]);
    if (!session) return;
    const q = req.query || {};
    const billId = typeof q.billId === "string" && ID_RE.test(q.billId) ? q.billId : null;
    const kind = GOODS_KINDS.indexOf(q.kind) !== -1 ? q.kind : null;
    const incidents = await Goods.list({ billId: billId, kind: kind });
    res.status(200).json({ incidents: incidents });
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
    const kind = GOODS_KINDS.indexOf(body.kind) !== -1 ? body.kind : null;
    if (!kind) {
      res.status(400).json({ error: "Tip la dwe 'retounen' oswa 'avarye'.", code: "invalid" });
      return;
    }
    const billId = text(body.billId, 64);
    if (!billId || !ID_RE.test(billId)) {
      res.status(400).json({ error: "Chwazi yon Bill.", code: "invalid" });
      return;
    }
    const description = text(body.description, 200);
    if (!description) {
      res.status(400).json({ error: "Deskripsyon an obligatwa.", code: "invalid" });
      return;
    }
    const unit = text(body.unit, 20);
    if (!unit) {
      res.status(400).json({ error: "Inite a (egz. sak, kolo) obligatwa.", code: "invalid" });
      return;
    }
    const quantityRaw = text(body.quantity, 20);
    if (!quantityRaw || !/^\d+(\.\d{1,2})?$/.test(quantityRaw) || Number(quantityRaw) <= 0) {
      res.status(400).json({ error: "Kantite a dwe yon nonm ki pi gran pase 0.", code: "invalid" });
      return;
    }
    const reason = text(body.reason, 200);
    if (!reason) {
      res.status(400).json({ error: kind === "avarye" ? "Kòz avari a obligatwa." : "Rezon retou a obligatwa.", code: "invalid" });
      return;
    }
    const entryDate = DATE_RE.test(body.entryDate || "") ? body.entryDate : S.today();
    const containerNumewo = text(body.containerNumewo, 40) || null;
    const remarks = text(body.remarks, 300) || null;

    const bill = await findBill(billId);
    if (!bill) {
      res.status(404).json({ error: "Pa jwenn Bill sa a. Done yo rafrechi.", code: "not_found" });
      return;
    }

    const incident = await Goods.create({
      kind: kind,
      billId: billId,
      entryDate: entryDate,
      description: description,
      quantity: quantityRaw,
      unit: unit,
      containerNumewo: containerNumewo,
      reason: reason,
      remarks: remarks,
      registeredBy: session.username,
    });

    await A.audit(req, "goods_incident_create", { kind: kind, billId: billId, billNumewo: bill.numewo, description: description }, session);
    res.status(200).json({ ok: true, incident: incident });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method not allowed" });
}

// ---- Invoices ("Fakti"): registered as a draft ("anrejistre") against a Bill, then locked ("fini"). ----
// Read: admin, depot, daily. Write (create / finish): admin, depot only.
async function invoicesHandler(req, res) {
  if (req.method === "GET") {
    const session = await A.requireAuth(req, res, ["admin", "depot", "daily"]);
    if (!session) return;
    const q = req.query || {};
    const billId = typeof q.billId === "string" && ID_RE.test(q.billId) ? q.billId : null;
    const status = INVOICE_STATUSES.indexOf(q.status) !== -1 ? q.status : null;
    const invoices = await Invoices.list({ billId: billId, status: status });
    res.status(200).json({ invoices: invoices });
    return;
  }

  if (req.method === "POST") {
    const session = await A.requireAuth(req, res, ["admin", "depot"]);
    if (!session) return;
    const body = A.parseBody(req);

    if (body.action === "finish") {
      const id = text(body.id, 64);
      if (!id || !ID_RE.test(id)) {
        res.status(400).json({ error: "ID fakti a pa valid.", code: "invalid" });
        return;
      }
      const existing = await Invoices.getById(id);
      if (!existing) {
        res.status(404).json({ error: "Pa jwenn fakti sa a.", code: "not_found" });
        return;
      }
      if (existing.status === "fini") {
        res.status(200).json({ ok: true, invoice: existing });
        return;
      }
      const invoice = await Invoices.finish(id, session.username);
      await A.audit(req, "invoice_finish", { billId: existing.billId, invoiceNumber: existing.invoiceNumber }, session);
      res.status(200).json({ ok: true, invoice: invoice });
      return;
    }

    if (body.action !== "create") {
      res.status(400).json({ error: "Aksyon pa valid.", code: "invalid_action" });
      return;
    }

    const billId = text(body.billId, 64);
    if (!billId || !ID_RE.test(billId)) {
      res.status(400).json({ error: "Chwazi yon Bill.", code: "invalid" });
      return;
    }
    const items = cleanItems(body.items);
    if (!items) {
      res.status(400).json({ error: "Ajoute omwen yon liy ak deskripsyon, kantite ak pri ki valid.", code: "invalid" });
      return;
    }
    const clientName = text(body.clientName, 150);
    if (!clientName) {
      res.status(400).json({ error: "Non kliyan an obligatwa.", code: "invalid" });
      return;
    }

    const bill = await findBill(billId);
    if (!bill) {
      res.status(404).json({ error: "Pa jwenn Bill sa a. Done yo rafrechi.", code: "not_found" });
      return;
    }

    const invoiceDate = DATE_RE.test(body.invoiceDate || "") ? body.invoiceDate : S.today();
    const dueDate = DATE_RE.test(body.dueDate || "") ? body.dueDate : null;
    const invoiceNumber = text(body.invoiceNumber, 40) || ("FACT-" + bill.numewo.replace(/[^A-Za-z0-9]/g, "") + "-" + invoiceDate.replace(/-/g, ""));

    const invoice = await Invoices.create({
      billId: billId,
      invoiceNumber: invoiceNumber,
      invoiceDate: invoiceDate,
      dueDate: dueDate,
      clientName: clientName,
      clientAddress: text(body.clientAddress, 200) || null,
      items: items,
      notes: text(body.notes, 300) || null,
      createdBy: session.username,
    });

    await A.audit(req, "invoice_create", { billId: billId, billNumewo: bill.numewo, invoiceNumber: invoiceNumber }, session);
    res.status(200).json({ ok: true, invoice: invoice });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method not allowed" });
}

// ---- Deliveries ("Livrezon Jounalye" / "Rapò Livrezon"): goods delivered out of the depot to a client, tied to a Bill. ----
// Read: admin, depot, daily. Write: admin, depot only.
async function deliveriesHandler(req, res) {
  if (req.method === "GET") {
    const session = await A.requireAuth(req, res, ["admin", "depot", "daily"]);
    if (!session) return;
    const q = req.query || {};
    const billId = typeof q.billId === "string" && ID_RE.test(q.billId) ? q.billId : null;
    const from = DATE_RE.test(q.from || "") ? q.from : null;
    const to = DATE_RE.test(q.to || "") ? q.to : null;
    const deliveries = await Deliveries.list({ billId: billId, from: from, to: to });
    res.status(200).json({ deliveries: deliveries });
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
    const billId = text(body.billId, 64);
    if (!billId || !ID_RE.test(billId)) {
      res.status(400).json({ error: "Chwazi yon Bill.", code: "invalid" });
      return;
    }
    const description = text(body.description, 200);
    if (!description) {
      res.status(400).json({ error: "Deskripsyon an obligatwa.", code: "invalid" });
      return;
    }
    const unit = text(body.unit, 20);
    if (!unit) {
      res.status(400).json({ error: "Inite a (egz. sak, kolo) obligatwa.", code: "invalid" });
      return;
    }
    const quantityRaw = text(body.quantity, 20);
    if (!quantityRaw || !/^\d+(\.\d{1,2})?$/.test(quantityRaw) || Number(quantityRaw) <= 0) {
      res.status(400).json({ error: "Kantite a dwe yon nonm ki pi gran pase 0.", code: "invalid" });
      return;
    }
    const entryDate = DATE_RE.test(body.entryDate || "") ? body.entryDate : S.today();
    const clientName = text(body.clientName, 120) || null;
    const containerNumewo = text(body.containerNumewo, 40) || null;
    const trucking = text(body.trucking, 40) || null;
    const chofer = text(body.chofer, 80) || null;
    const remarks = text(body.remarks, 300) || null;

    const bill = await findBill(billId);
    if (!bill) {
      res.status(404).json({ error: "Pa jwenn Bill sa a. Done yo rafrechi.", code: "not_found" });
      return;
    }

    const delivery = await Deliveries.create({
      billId: billId,
      entryDate: entryDate,
      clientName: clientName,
      description: description,
      quantity: quantityRaw,
      unit: unit,
      containerNumewo: containerNumewo,
      trucking: trucking,
      chofer: chofer,
      remarks: remarks,
      registeredBy: session.username,
    });

    await A.audit(req, "delivery_create", { billId: billId, billNumewo: bill.numewo, description: description }, session);
    res.status(200).json({ ok: true, delivery: delivery });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method not allowed" });
}

const HANDLERS = { stock: stockHandler, goods: goodsHandler, invoices: invoicesHandler, deliveries: deliveriesHandler };

module.exports = async function handler(req, res) {
  let type;
  try {
    type = req.query && req.query.type;
    const fn = HANDLERS[type];
    if (!fn) { res.status(404).json({ error: "Not found" }); return; }
    await fn(req, res);
  } catch (err) {
    console.error((type || "records") + " error:", err && err.message);
    const busy = err instanceof ApiError && err.status === 503;
    res.status(busy ? 503 : 500).json({ error: busy ? err.message : "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
