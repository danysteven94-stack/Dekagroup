"use strict";
// Logistic data helpers shared by every storage backend: validation, business rules, role views, backups and push.
const crypto = require("crypto");
const { redis } = require("./redis");
const { audit } = require("./auth");

const BACKUP_KEY = "dl:backups";
const BACKUP_EVERY_MS = 30 * 60 * 1000;
const BACKUP_KEEP = 12;

// Push notifications are optional: if the module cannot load, saving data still works.
let notifyNew = async function () {};
try {
  notifyNew = require("./push").notifyNew;
} catch (e) {
  console.error("push disabled:", e && e.message);
}

// Email notifications are optional too (active only with BREVO_API_KEY).
let notifyNewEmail = async function () {};
try {
  notifyNewEmail = require("./email").notifyNewEmail;
} catch (e) {
  console.error("email disabled:", e && e.message);
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function newId() {
  return crypto.randomBytes(6).toString("hex") + Date.now().toString(36);
}

function emptyData() {
  return { containers: [], bills: [], notifications: [], inventoryChecks: {} };
}

// ---- same status rules as the app
function statusOf(c) {
  return c.dateLeft ? "kite" : c.dateEmpty ? "vid" : c.dateEntered && c.dateVerified ? "full" : c.dateEntered ? "pokoverifye" : "disponib";
}

function billState(bill, containers) {
  const list = containers.filter(function (c) { return c.billId === bill.id; });
  if (list.length === 0) return "vid";
  if (list.every(function (c) { return !c.dateEntered; })) return "planifye";
  if (list.every(function (c) { return c.dateLeft; })) return "fini";
  return "aktif";
}

function addNotification(data, billNumewo, message) {
  data.notifications = [{ id: newId(), billNumewo: billNumewo || "", date: today(), message: message }].concat(data.notifications).slice(0, 200);
}

// Same rule as the app: a bill is completed when every container has left.
function recomputeBills(data) {
  data.bills = data.bills.map(function (b) {
    const st = billState(b, data.containers);
    if (st === "fini" && !b.completedAt) {
      addNotification(data, b.numewo, "Bill " + b.numewo + " fini \u2014 tout konten\u00E8 li yo kite.");
      return Object.assign({}, b, { completedAt: today() });
    }
    if (st !== "fini" && b.completedAt) return Object.assign({}, b, { completedAt: null });
    return b;
  });
}

// ---- validation of what the admin sends when saving everything
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function str(v, max, field, required) {
  if (v === null || v === undefined || v === "") {
    if (required) throw new ValidationError(field + " obligatwa");
    return v === undefined ? null : v;
  }
  if (typeof v !== "string") throw new ValidationError(field + " dwe se tèks");
  if (v.length > max) throw new ValidationError(field + " twò long");
  return v;
}

function dateOrNull(v, field) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !DATE_RE.test(v)) throw new ValidationError(field + " pa yon dat valid");
  return v;
}

function id(v, field) {
  if (typeof v !== "string" || !ID_RE.test(v)) throw new ValidationError(field + " pa valid");
  return v;
}

// Unknown extra fields are kept only when they are short primitives (so nothing legitimate is lost, nothing nested sneaks in).
function extras(src, known, out) {
  let n = 0;
  Object.keys(src).forEach(function (k) {
    if (known.indexOf(k) !== -1 || k === "__proto__" || k === "constructor" || k === "prototype") return;
    const v = src[k];
    if (n >= 10 || k.length > 40 || k.charAt(0) === "_") return;
    if (v === null || typeof v === "boolean" || typeof v === "number") { out[k] = v; n++; }
    else if (typeof v === "string" && v.length <= 200) { out[k] = v; n++; }
  });
  return out;
}

// "_h" is the fingerprint of the row as the server sent it; it lets the server tell rows the client did not touch.
function withHint(src, out) {
  if (typeof src._h === "string" && /^[a-f0-9]{8,64}$/.test(src._h)) out._h = src._h;
  return out;
}

function isObj(o) {
  return o && typeof o === "object" && !Array.isArray(o);
}

function sanitizeState(body) {
  if (!isObj(body)) throw new ValidationError("Done yo pa valid");
  if (!Array.isArray(body.containers) || !Array.isArray(body.bills)) throw new ValidationError("Done yo pa valid");
  if (body.containers.length > 20000 || body.bills.length > 20000) throw new ValidationError("Twòp done");

  const seenC = {};
  const containers = body.containers.map(function (c) {
    if (!isObj(c)) throw new ValidationError("Yon konteneur pa valid");
    const cid = id(c.id, "id konteneur");
    if (seenC[cid]) throw new ValidationError("id konteneur double");
    seenC[cid] = true;
    const known = ["id", "numewo", "billId", "size", "division", "dateEntered", "dateExpected", "dateVerified", "depo", "trucking", "chofer", "dateEmpty", "dateLeft"];
    return withHint(c, extras(c, known, {
      id: cid,
      numewo: str(c.numewo, 40, "numewo", true),
      billId: c.billId === null || c.billId === undefined || c.billId === "" ? null : id(c.billId, "billId"),
      size: str(c.size, 4, "size") || "",
      division: str(c.division, 40, "division"),
      dateEntered: dateOrNull(c.dateEntered, "dateEntered"),
      dateExpected: dateOrNull(c.dateExpected, "dateExpected"),
      dateVerified: dateOrNull(c.dateVerified, "dateVerified"),
      depo: str(c.depo, 80, "depo"),
      trucking: str(c.trucking, 40, "trucking"),
      chofer: str(c.chofer, 80, "chofer"),
      dateEmpty: dateOrNull(c.dateEmpty, "dateEmpty"),
      dateLeft: dateOrNull(c.dateLeft, "dateLeft"),
    }));
  });

  const seenB = {};
  const bills = body.bills.map(function (b) {
    if (!isObj(b)) throw new ValidationError("Yon bill pa valid");
    const bid = id(b.id, "id bill");
    if (seenB[bid]) throw new ValidationError("id bill double");
    seenB[bid] = true;
    return withHint(b, extras(b, ["id", "numewo", "product", "completedAt"], {
      id: bid,
      numewo: str(b.numewo, 60, "numewo bill", true),
      product: str(b.product, 120, "pwodwi"),
      completedAt: dateOrNull(b.completedAt, "completedAt"),
    }));
  });

  const rawN = Array.isArray(body.notifications) ? body.notifications : [];
  if (rawN.length > 200) throw new ValidationError("Twòp notifikasyon");
  const notifications = rawN.map(function (n) {
    if (!isObj(n)) throw new ValidationError("Yon notifikasyon pa valid");
    return extras(n, ["id", "billNumewo", "date", "message"], {
      id: id(n.id, "id notifikasyon"),
      billNumewo: str(n.billNumewo, 60, "billNumewo") || "",
      date: dateOrNull(n.date, "date notifikasyon"),
      message: str(n.message, 400, "mesaj", true),
    });
  });

  const rawI = isObj(body.inventoryChecks) ? body.inventoryChecks : {};
  const keys = Object.keys(rawI);
  if (keys.length > 50000) throw new ValidationError("Twòp verifikasyon");
  const inventoryChecks = {};
  keys.forEach(function (k) {
    if (!ID_RE.test(k)) return;
    inventoryChecks[k] = dateOrNull(rawI[k], "verifikasyon");
  });

  return { containers: containers, bills: bills, notifications: notifications, inventoryChecks: inventoryChecks };
}

// ---- backups: keep a rolling snapshot (at most every 30 minutes, last 12)
async function snapshotIfDue(prev) {
  try {
    const last = Number(await redis.get("dl:backup:last")) || 0;
    if (Date.now() - last < BACKUP_EVERY_MS) return;
    if (!prev || (!prev.containers.length && !prev.bills.length)) return;
    await redis.lpush(BACKUP_KEY, JSON.stringify({ ts: new Date().toISOString(), data: prev }));
    await redis.ltrim(BACKUP_KEY, 0, BACKUP_KEEP - 1);
    await redis.set("dl:backup:last", Date.now());
  } catch (e) {
    console.error("backup failed:", e && e.message);
  }
}

// After a successful save: keep a rolling backup and push/email the notifications that did not exist before.
async function afterCommit(prev, next, req) {
  await snapshotIfDue(prev);
  try {
    await notifyNew(prev, next, { host: req.headers.host, deviceId: (req.headers || {})["x-device-id"] });
  } catch (e) {
    console.error("push error:", e && e.message);
  }
  try {
    await notifyNewEmail(prev, next);
  } catch (e) {
    console.error("email error:", e && e.message);
  }
}

// What each role is allowed to read.
function viewFor(role, d) {
  if (role === "admin") return d;
  const out = { containers: d.containers, bills: d.bills, notifications: d.notifications, inventoryChecks: {} };
  if (role === "chofe") {
    out.containers = d.containers.filter(function (c) { return statusOf(c) === "vid"; });
    const ids = {};
    out.containers.forEach(function (c) { ids[c.billId] = true; });
    out.bills = d.bills.filter(function (b) { return ids[b.id]; });
    out.notifications = [];
  }
  return out;
}

module.exports = {
  BACKUP_KEY, ValidationError, today, newId, emptyData, statusOf, billState, addNotification, recomputeBills,
  sanitizeState, snapshotIfDue, afterCommit, viewFor, audit,
};
