"use strict";
// Logistique Deka: reminder for the bills whose check was received 3 days ago (or more) and whose payment is
// still not confirmed. One push notification per day (the list of the late bills), sent ONLY to the devices of
// the Logistique Deka accounts. Triggered by the daily Vercel cron (/api/daily?action=reminders) and, as a safety
// net, by the first visit of a Logistique Deka account each day (see lgpayments.js). Both paths share the same
// once-a-day lock, so nobody gets it twice.
const Lg = require("./lgbills");
const Push = require("./push");

const OVERDUE_DAYS = 3;
const LOCK_TTL = 36 * 3600;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(date, todayStr) {
  return Math.floor((Date.parse((todayStr || today()) + "T00:00:00Z") - Date.parse(date + "T00:00:00Z")) / 86400000);
}

// Bills with a check received >= OVERDUE_DAYS ago and no confirmation yet (oldest first).
function overdue(bills, todayStr) {
  return (bills || []).filter(function (b) {
    return b && b.checkDate && !b.confirmedDate && daysSince(b.checkDate, todayStr) >= OVERDUE_DAYS;
  }).sort(function (a, b) { return a.checkDate.localeCompare(b.checkDate); });
}

function messageFor(list) {
  const names = list.slice(0, 3).map(function (b) { return b.numewo; }).join(", ");
  const more = list.length > 3 ? " +" + (list.length - 3) : "";
  const body = list.length === 1
    ? "Bill " + names + " gen " + OVERDUE_DAYS + " jou oswa plis depi chèk la rive san konfimasyon peman."
    : list.length + " bill gen " + OVERDUE_DAYS + " jou oswa plis depi chèk la rive san konfimasyon: " + names + more + ".";
  return { title: "DEKA LOG — Logistique", body: body, tag: "deka-lg-overdue", url: "/" };
}

// Sends the reminder once per day. bills: already loaded (optional).
async function run(host, bills) {
  const day = today();
  const list = overdue(bills || await Lg.list(), day);
  if (!list.length) return { sent: 0, late: 0 };
  const free = await Push.redis.set("dl:lgremind:" + day, "1", { nx: true, ex: LOCK_TTL });
  if (!free) return { sent: 0, late: list.length, already: true };
  const r = await Push.sendToRole(host, "logistique", [messageFor(list)]);
  return Object.assign({ late: list.length }, r);
}

// /api/daily?action=reminders — called by the Vercel cron (GET). When CRON_SECRET is set in Vercel, Vercel sends it
// as "Authorization: Bearer <secret>" and anything else is refused.
async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers.authorization || "") !== "Bearer " + secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const out = await run(req.headers.host);
    res.status(200).json(Object.assign({ ok: true }, out));
  } catch (err) {
    console.error("reminders error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè. Eseye ankò." });
  }
}

module.exports = { OVERDUE_DAYS, overdue, daysSince, run, handler };
