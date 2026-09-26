"use strict";
// Invoices ("Fakti"): registered as a draft ("anrejistre") against a Bill, then locked ("fini").
// Read: admin, depot, daily. Write (create / finish): admin, depot only.
const A = require("./_lib/auth");
const S = require("./_lib/store");
const repo = require("./_lib/repo");
const Invoices = require("./_lib/invoices");
const { ApiError } = require("./_lib/errors");

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ["anrejistre", "fini"];
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

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const session = await A.requireAuth(req, res, ["admin", "depot", "daily"]);
      if (!session) return;
      const q = req.query || {};
      const billId = typeof q.billId === "string" && ID_RE.test(q.billId) ? q.billId : null;
      const status = STATUSES.indexOf(q.status) !== -1 ? q.status : null;
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

      const r = await repo.readAll();
      const data = r.view || r.blob;
      const bill = (data.bills || []).find(function (b) { return b.id === billId; });
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
  } catch (err) {
    console.error("invoices error:", err && err.message);
    const busy = err instanceof ApiError && err.status === 503;
    res.status(busy ? 503 : 500).json({ error: busy ? err.message : "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
