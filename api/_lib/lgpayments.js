"use strict";
// Logistique Deka — its own bills and their payment steps ("Pèman Bill").
// ONLY the "logistique" role can read or write here (not even the administrator): the data belongs to the
// Logistique Deka people and has no link with the containers / bills / stock of the other interfaces.
// A logistique account always works on EVERY division (the division is just a field of each bill).
//
// GET  -> { bills: [ { id, division, numewo, product, amount, currency, checkDate, paidDate, confirmedDate, broker, reference, notes, ... } ] }
// POST { action: "create", division, numewo, product?, amount?, currency? }        — enter a new bill
// POST { action: "edit", billId, division?, numewo?, product? }                    — fix the identity of a bill
// POST { action: "delete", billId }                                                — remove a bill entered by mistake
// POST { action: "save", items: [{ billId, amount }], currency, checkDate, paidDate, confirmedDate, broker, reference, notes }
//   pays one or SEVERAL bills at once. Each date / text field that is sent (even "") is applied to every bill of the request;
//   a field that is left out is kept as it is. Dates are entered by hand (YYYY-MM-DD).
// POST { action: "clear", billId, stage: "confirmed" | "paid" | "check" } — undo a step entered by mistake.
const A = require("./auth");
const Div = require("./divisions");
const Lg = require("./lgbills");
const Reminders = require("./lgreminders");
const { ApiError } = require("./errors");

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCIES = ["HTG", "USD"];
const MAX_BILLS = 100;
const MAX_AMOUNT = 1e12;
const ROLES = ["logistique"];

function text(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isRealDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function bad(res, msg, code) {
  res.status(400).json({ error: msg, code: code || "invalid" });
}

// A date field of the request: undefined = not sent, "" = clear it, "YYYY-MM-DD" = set it.
function dateField(body, key, label) {
  if (!Object.prototype.hasOwnProperty.call(body, key) || body[key] === null) return { sent: false };
  const v = typeof body[key] === "string" ? body[key].trim() : "";
  if (v === "") return { sent: true, value: null };
  if (!isRealDate(v)) return { error: "Dat « " + label + " » la pa valid." };
  if (v > today()) return { error: "Dat « " + label + " » pa ka nan lavni." };
  return { sent: true, value: v };
}

function parseAmount(v) {
  if (v === undefined || v === null || String(v).trim() === "") return { none: true };
  const n = Math.round(parseFloat(String(v).replace(/,/g, "")) * 100) / 100;
  if (!isFinite(n) || n < 0 || n > MAX_AMOUNT) return { error: true };
  return { value: n };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const session = await A.requireAuth(req, res, ROLES);
      if (!session) return;
      const bills = await Lg.list();
      // safety net for the daily cron: the first visit of the day sends the reminder of the late bills (once a day)
      try { await Reminders.run(req.headers.host, bills); } catch (e) { console.error("reminder error:", e && e.message); }
      res.status(200).json({ bills: bills });
      return;
    }

    if (req.method === "POST") {
      const session = await A.requireAuth(req, res, ROLES);
      if (!session) return;
      const body = A.parseBody(req);
      const now = new Date().toISOString();
      const all = await Lg.list();
      const byId = {};
      all.forEach(function (b) { byId[b.id] = b; });

      // ---- a new bill
      if (body.action === "create") {
        const division = text(body.division, 40);
        const numewo = text(body.numewo, 60).toUpperCase();
        const product = text(body.product, 120);
        if (!Div.isValid(division)) return bad(res, "Chwazi yon divizyon valid.", "invalid_division");
        if (numewo.length < 2) return bad(res, "Ekri nimewo bill la.", "invalid_numewo");
        const amount = parseAmount(body.amount);
        if (amount.error) return bad(res, "Montan an pa valid.");
        let currency = "HTG";
        if (body.currency !== undefined && body.currency !== null && body.currency !== "") {
          if (CURRENCIES.indexOf(body.currency) === -1) return bad(res, "Lajan an pa valid (HTG oswa USD).");
          currency = body.currency;
        }
        const check0 = dateField(body, "checkDate", "Chèk resevwa");
        if (check0.error) return bad(res, check0.error);
        const rec = {
          id: Lg.newId(), division: division, numewo: numewo, product: product || null, amount: amount.none ? null : amount.value, currency: currency,
          checkDate: check0.sent ? check0.value : null, paidDate: null, confirmedDate: null, broker: null, reference: null, notes: null, batchId: null,
          createdBy: session.username, createdAt: now, updatedBy: session.username, updatedAt: now,
        };
        await Lg.insert(rec);
        await A.audit(req, "lgbill_create", { numewo: numewo, division: division }, session);
        res.status(200).json({ ok: true, bills: [rec] });
        return;
      }

      // ---- the identity of a bill
      if (body.action === "edit") {
        const billId = text(body.billId, 64);
        const cur = ID_RE.test(billId) ? byId[billId] : null;
        if (!cur) { res.status(404).json({ error: "Pa jwenn Bill sa a.", code: "not_found" }); return; }
        const next = Object.assign({}, cur, { updatedBy: session.username, updatedAt: now });
        if (Object.prototype.hasOwnProperty.call(body, "division")) {
          const division = text(body.division, 40);
          if (!Div.isValid(division)) return bad(res, "Chwazi yon divizyon valid.", "invalid_division");
          next.division = division;
        }
        if (Object.prototype.hasOwnProperty.call(body, "numewo")) {
          const numewo = text(body.numewo, 60).toUpperCase();
          if (numewo.length < 2) return bad(res, "Ekri nimewo bill la.", "invalid_numewo");
          next.numewo = numewo;
        }
        if (Object.prototype.hasOwnProperty.call(body, "product")) next.product = text(body.product, 120) || null;
        if (all.some(function (x) { return x.id !== cur.id && Lg.sameKey(x, next); })) {
          res.status(409).json({ error: "Bill sa a deja egziste nan divizyon sa a.", code: "exists" });
          return;
        }
        await Lg.saveMany([next]);
        await A.audit(req, "lgbill_edit", { numewo: next.numewo, division: next.division }, session);
        res.status(200).json({ ok: true, bills: [next] });
        return;
      }

      // ---- remove a bill
      if (body.action === "delete") {
        const billId = text(body.billId, 64);
        const cur = ID_RE.test(billId) ? byId[billId] : null;
        if (!cur) { res.status(404).json({ error: "Pa jwenn Bill sa a.", code: "not_found" }); return; }
        if (cur.confirmedDate) return bad(res, "Ou pa ka efase yon bill ki gen peman konfime. Defèt konfimasyon an dabò.", "confirmed");
        await Lg.remove(cur.id);
        await A.audit(req, "lgbill_delete", { numewo: cur.numewo, division: cur.division }, session);
        res.status(200).json({ ok: true, deleted: cur.id });
        return;
      }

      // ---- undo a step
      if (body.action === "clear") {
        const billId = text(body.billId, 64);
        const cur = ID_RE.test(billId) ? byId[billId] : null;
        if (!cur) { res.status(404).json({ error: "Pa jwenn Bill sa a.", code: "not_found" }); return; }
        const stage = body.stage;
        if (["confirmed", "paid", "check"].indexOf(stage) === -1) return bad(res, "Etap la pa valid.");
        const next = Object.assign({}, cur, { updatedBy: session.username, updatedAt: now });
        // undoing a step also undoes the ones that come after it (a payment cannot be confirmed without having been paid)
        if (stage === "check") { next.checkDate = null; next.paidDate = null; next.confirmedDate = null; }
        if (stage === "paid") { next.paidDate = null; next.confirmedDate = null; }
        if (stage === "confirmed") { next.confirmedDate = null; }
        await Lg.saveMany([next]);
        await A.audit(req, "payment_clear", { billNumewo: cur.numewo, stage: stage }, session);
        res.status(200).json({ ok: true, bills: [next] });
        return;
      }

      if (body.action !== "save") return bad(res, "Aksyon pa valid.", "invalid_action");

      // ---- the bills of this payment
      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (rawItems.length === 0) return bad(res, "Chwazi omwen yon Bill.");
      if (rawItems.length > MAX_BILLS) return bad(res, "Twòp Bill yon sèl kou (maksimòm " + MAX_BILLS + ").");
      const seen = {};
      const items = [];
      for (const it of rawItems) {
        const billId = text(it && it.billId, 64);
        if (!ID_RE.test(billId)) return bad(res, "ID Bill la pa valid.");
        if (!byId[billId]) return res.status(404).json({ error: "Pa jwenn yon Bill. Done yo rafrechi.", code: "not_found" });
        if (seen[billId]) return bad(res, "Yon Bill parèt de fwa.");
        seen[billId] = true;
        const amount = parseAmount(it.amount);
        if (amount.error) return bad(res, "Montan an pa valid (" + byId[billId].numewo + ").");
        items.push({ billId: billId, amount: amount.none ? null : amount.value, hasAmount: !amount.none });
      }

      // ---- the fields shared by every bill of the request
      const check = dateField(body, "checkDate", "Chèk resevwa");
      const paid = dateField(body, "paidDate", "Peye");
      const confirmed = dateField(body, "confirmedDate", "Konfime");
      for (const f of [check, paid, confirmed]) if (f.error) return bad(res, f.error);
      let currency = null;
      if (body.currency !== undefined && body.currency !== null && body.currency !== "") {
        if (CURRENCIES.indexOf(body.currency) === -1) return bad(res, "Lajan an pa valid (HTG oswa USD).");
        currency = body.currency;
      }
      const hasBroker = Object.prototype.hasOwnProperty.call(body, "broker");
      const hasRef = Object.prototype.hasOwnProperty.call(body, "reference");
      const hasNotes = Object.prototype.hasOwnProperty.call(body, "notes");
      const batchId = items.length > 1 ? Lg.newId() : null;

      const out = [];
      for (const it of items) {
        const old = byId[it.billId];
        const next = Object.assign({}, old, {
          amount: it.hasAmount ? it.amount : old.amount,
          currency: currency || old.currency || "HTG",
          checkDate: check.sent ? check.value : old.checkDate,
          paidDate: paid.sent ? paid.value : old.paidDate,
          confirmedDate: confirmed.sent ? confirmed.value : old.confirmedDate,
          broker: hasBroker ? (text(body.broker, 120) || null) : old.broker,
          reference: hasRef ? (text(body.reference, 80) || null) : old.reference,
          notes: hasNotes ? (text(body.notes, 300) || null) : old.notes,
          batchId: batchId || old.batchId,
          updatedBy: session.username,
          updatedAt: now,
        });
        // ---- order of the steps: check received → paid by the broker → confirmed
        const label = next.numewo;
        if (next.paidDate && !next.checkDate) return bad(res, "Bill " + label + ": mete dat ou resevwa chèk la anvan dat peman an.");
        if (next.confirmedDate && !next.paidDate) return bad(res, "Bill " + label + ": ou pa ka konfime yon bill ki poko peye. Mete dat peman an dabò.");
        if (next.checkDate && next.paidDate && next.paidDate < next.checkDate) return bad(res, "Bill " + label + ": dat peman an pa ka anvan dat ou resevwa chèk la.");
        if (next.paidDate && next.confirmedDate && next.confirmedDate < next.paidDate) return bad(res, "Bill " + label + ": dat konfimasyon an pa ka anvan dat peman an.");
        if (next.confirmedDate && !(next.amount > 0)) return bad(res, "Bill " + label + ": mete montan bill la anvan w konfime peman an.");
        out.push(next);
      }

      await Lg.saveMany(out);
      await A.audit(req, "payment_save", {
        bills: out.map(function (p) { return p.numewo; }),
        stage: out.map(function (p) { return Lg.stageOf(p); }).join(","),
        batchId: batchId,
      }, session);
      res.status(200).json({ ok: true, bills: out });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) { res.status(409).json({ error: err.message, code: err.code }); return; }
    console.error("payments error:", err && err.message);
    const busy = err instanceof ApiError && err.status === 503;
    res.status(busy ? 503 : 500).json({ error: busy ? err.message : "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
