"use strict";
// Email notifications via the Resend API (https://resend.com) — a plain HTTPS call, no SDK needed.
// Active only when RESEND_API_KEY is set; everything else keeps working without it.
const { redis } = require("./redis");

const LIST_KEY = "deka-log-email-recipients";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function available() {
  return !!process.env.RESEND_API_KEY;
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

// One HTTPS call to Resend. `to` is a single address the emails are formally addressed to (so recipients
// don't see each other in the To header); everyone else on the list is BCC'd.
async function sendEmail(subject, text, opts) {
  if (!available()) return { sent: 0, skipped: true };
  const recipients = (await listRecipients()).map(function (r) { return r.email; });
  const extra = (opts && opts.also) || [];
  const all = [...new Set(recipients.concat(extra))];
  if (!all.length) return { sent: 0, skipped: true };

  const from = process.env.EMAIL_FROM || "DEKA LOG <onboarding@resend.dev>";
  const html = "<p>" + String(text).split("\n").map(escapeHtml).join("<br/>") + "</p>";
  const body = { from: from, to: [from.replace(/^.*<([^>]+)>.*$/, "$1") || from], bcc: all, subject: subject, text: text, html: html };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.RESEND_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(function () { return ""; });
    throw new Error("Resend HTTP " + res.status + (detail ? ": " + detail.slice(0, 200) : ""));
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
