"use strict";
// Deliveries ("Livrezon Jounalye" / "Rapò Livrezon"): goods delivered out of the depot to a client, tied to a Bill.
// Read: admin, depot, daily. Write: admin, depot only.
const A = require("./_lib/auth");
const S = require("./_lib/store");
const repo = require("./_lib/repo");
const Deliveries = require("./_lib/deliveries");
const { ApiError } = require("./_lib/errors");

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

module.exports = async function handler(req, res) {
  try {
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

      const r = await repo.readAll();
      const data = r.view || r.blob;
      const bill = (data.bills || []).find(function (b) { return b.id === billId; });
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
  } catch (err) {
    console.error("deliveries error:", err && err.message);
    const busy = err instanceof ApiError && err.status === 503;
    res.status(busy ? 503 : 500).json({ error: busy ? err.message : "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
