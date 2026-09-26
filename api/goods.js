"use strict";
// Goods incidents ("Machandiz Retounen" / "Machandiz Avarye"): returned or damaged goods, tied to a Bill.
// Read: admin, depot, daily. Write: admin, depot only.
const A = require("./_lib/auth");
const S = require("./_lib/store");
const repo = require("./_lib/repo");
const Goods = require("./_lib/goods");
const { ApiError } = require("./_lib/errors");

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ["retounen", "avarye"];

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
      const kind = KINDS.indexOf(q.kind) !== -1 ? q.kind : null;
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
      const kind = KINDS.indexOf(body.kind) !== -1 ? body.kind : null;
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

      const r = await repo.readAll();
      const data = r.view || r.blob;
      const bill = (data.bills || []).find(function (b) { return b.id === billId; });
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
  } catch (err) {
    console.error("goods error:", err && err.message);
    const busy = err instanceof ApiError && err.status === 503;
    res.status(busy ? 503 : 500).json({ error: busy ? err.message : "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
