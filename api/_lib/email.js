"use strict";
// Email notifications via the Brevo API (https://www.brevo.com) — a plain HTTPS call, no SDK needed.
// Chosen over Resend because Brevo's free plan only requires verifying ONE sender address (any inbox
// you already own, e.g. a Gmail address — a confirmation link, no domain purchase or DNS records) and
// can then send to any recipient. Active only when BREVO_API_KEY is set; everything else keeps working
// without it.
const { redis } = require("./redis");

const LIST_KEY = "deka-log-email-recipients";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function available() {
  return !!process.env.BREVO_API_KEY;
}

// EMAIL_FROM is the verified sender, as "Name <address@example.com>" or a bare address.
function parseFrom() {
  const raw = String(process.env.EMAIL_FROM || "").trim();
  const m = raw.match(/^(.*)<([^>]+)>\s*$/);
  if (m) {
    const email = m[2].trim();
    if (!EMAIL_RE.test(email)) return null;
    return { name: m[1].trim().replace(/^"|"$/g, "") || "DEKA LOG", email: email };
  }
  if (EMAIL_RE.test(raw)) return { name: "DEKA LOG", email: raw };
  return null;
}

async function listRecipients() {
  const list = await redis.get(LIST_KEY);
  return Array.isArray(list) ? list : [];
}

async function addRecipient(email, addedBy) {
  email = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) {
    const e = new Error("Adrès imèl la pa valid.");
    e.status = 400;
    throw e;
  }
  const list = await listRecipients();
  if (list.some(function (r) { return r.email === email; })) return list;
  if (list.length >= 30) {
    const e = new Error("Gen twòp adrès deja (30 maksimòm).");
    e.status = 400;
    throw e;
  }
  const next = list.concat([{ email: email, addedBy: addedBy || null, addedAt: new Date().toISOString() }]);
  await redis.set(LIST_KEY, next);
  return next;
}

async function removeRecipient(email) {
  email = String(email || "").trim().toLowerCase();
  const list = await listRecipients();
  const next = list.filter(function (r) { return r.email !== email; });
  await redis.set(LIST_KEY, next);
  return next;
}

// One HTTPS call to Brevo. `to` is the verified sender itself (so recipients don't see each other in
// the To header); everyone else on the list is BCC'd.
async function sendEmail(subject, text, opts) {
  if (!available()) return { sent: 0, skipped: true };
  const recipients = (await listRecipients()).map(function (r) { return r.email; });
  const extra = (opts && opts.also) || [];
  const all = [...new Set(recipients.concat(extra))];
  if (!all.length) return { sent: 0, skipped: true };

  const from = parseFrom();
  if (!from) throw new Error("EMAIL_FROM pa konfigire byen. Egzanp: \"DEKA LOG <ou@gmail.com>\" — dwe menm adrès ou verifye sou Brevo.");
  const html = "<p>" + String(text).split("\n").map(escapeHtml).join("<br/>") + "</p>";
  const body = {
    sender: { name: from.name, email: from.email },
    to: [{ email: from.email }],
    bcc: all.map(function (email) { return { email: email }; }),
    subject: subject,
    textContent: text,
    htmlContent: html,
  };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": process.env.BREVO_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(function () { return ""; });
    throw new Error("Brevo HTTP " + res.status + (detail ? ": " + detail.slice(0, 200) : ""));
  }
  return { sent: all.length, skipped: false };
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Compare what was stored with what is being saved and email only the notifications that are new — same
// idea as push's notifyNew, but as a single digest (email is not meant for a burst of pings).
async function notifyNewEmail(prev, next) {
  if (!available()) return null;
  const prevIds = new Set(((prev && prev.notifications) || []).map(function (n) { return n && n.id; }));
  const since = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const fresh = ((next && next.notifications) || []).filter(function (n) {
    return n && n.id && typeof n.message === "string" && !prevIds.has(n.id) && (!n.date || n.date >= since);
  });
  if (!fresh.length) return null;
  const ordered = fresh.slice().reverse(); // oldest first, like they happened
  const subject = fresh.length === 1 ? "DEKA LOG — " + fresh[0].message.slice(0, 80) : "DEKA LOG — " + fresh.length + " nouvo notifikasyon";
  const text = ordered.map(function (n) { return "\u2022 " + n.message; }).join("\n");
  return sendEmail(subject, text);
}

module.exports = { available, listRecipients, addRecipient, removeRecipient, sendEmail, notifyNewEmail, EMAIL_RE };
