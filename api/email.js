"use strict";
// Admin only: manage the list of email addresses that receive a digest when a new notification happens
// (a bill finishing, a container leaving...), and send a test message.
const A = require("./_lib/auth");
const Email = require("./_lib/email");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const session = await A.requireAuth(req, res, ["admin"]);
    if (!session) return;

    if (req.method === "GET") {
      res.status(200).json({ available: Email.available(), recipients: await Email.listRecipients() });
      return;
    }

    if (req.method === "POST") {
      const body = A.parseBody(req);

      if (body.action === "add") {
        let list;
        try {
          list = await Email.addRecipient(body.email, session.username);
        } catch (e) {
          res.status(e.status || 400).json({ error: e.message });
          return;
        }
        await A.audit(req, "email_recipient_add", { email: String(body.email || "").trim().toLowerCase() }, session);
        res.status(200).json({ ok: true, recipients: list });
        return;
      }

      if (body.action === "remove") {
        const list = await Email.removeRecipient(body.email);
        await A.audit(req, "email_recipient_remove", { email: String(body.email || "").trim().toLowerCase() }, session);
        res.status(200).json({ ok: true, recipients: list });
        return;
      }

      if (body.action === "test") {
        if (!Email.available()) {
          res.status(503).json({ error: "BREVO_API_KEY manke sou sèvè a.", code: "not_configured" });
          return;
        }
        const free = await require("./_lib/redis").redis.set("deka-log-email-test-lock", "1", { nx: true, ex: 15 });
        if (!free) {
          res.status(429).json({ error: "Tann kèk segond anvan w eseye ank\u00f2." });
          return;
        }
        try {
          const result = await Email.sendEmail("DEKA LOG — Tès notifikasyon", "Tès notifikasyon \u2014 tout bagay ap mache.");
          await A.audit(req, "email_test", result, session);
          res.status(200).json(Object.assign({ ok: true }, result));
        } catch (e) {
          res.status(502).json({ error: "Pa t kapab voye imèl la: " + e.message });
        }
        return;
      }

      res.status(400).json({ error: "Aksyon pa valid." });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("email error:", err && err.message);
    res.status(500).json({ error: "Er\u00E8 s\u00E8v\u00E8. Eseye ank\u00F2.", code: "server_error" });
  }
};
