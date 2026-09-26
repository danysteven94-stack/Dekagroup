"use strict";
// Vercel Hobby plan limits a Deployment to 12 Serverless Functions, so the two small
// notification-config endpoints (email recipients, push subscriptions) share one file here.
// /api/email and /api/push are routed to this file via rewrites in vercel.json,
// so the browser paths and behavior are unchanged.
const A = require("./_lib/auth");
const Email = require("./_lib/email");
const { redis, getVapid, saveSubscription, removeSubscription, sendToAll } = require("./_lib/push");

// Admin only: manage the list of email addresses that receive a digest when a new notification happens
// (a bill finishing, a container leaving...), and send a test message.
async function emailHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
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
      const free = await redis.set("deka-log-email-test-lock", "1", { nx: true, ex: 15 });
      if (!free) {
        res.status(429).json({ error: "Tann kèk segond anvan w eseye ankò." });
        return;
      }
      try {
        const result = await Email.sendEmail("DEKA LOG — Tès notifikasyon", "Tès notifikasyon — tout bagay ap mache.");
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
}

async function pushHandler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    const { publicKey } = await getVapid();
    res.status(200).json({ publicKey });
    return;
  }

  if (req.method === "POST") {
    const session = await A.requireAuth(req, res, ["admin", "depot", "daily", "chofe"]);
    if (!session) return;
    const body = A.parseBody(req);

    if (body.action === "subscribe") {
      await saveSubscription(body.subscription, body.deviceId, req.headers["user-agent"]);
      res.status(200).json({ ok: true });
      return;
    }

    if (body.action === "unsubscribe") {
      await removeSubscription(body.endpoint);
      res.status(200).json({ ok: true });
      return;
    }

    if (body.action === "test") {
      if (session.role !== "admin") {
        res.status(403).json({ error: "Ou pa gen dwa pou aksyon sa a.", code: "forbidden" });
        return;
      }
      // small lock so the test button can't be used to spam devices
      const free = await redis.set("deka-log-push-test-lock", "1", { nx: true, ex: 15 });
      if (!free) {
        res.status(429).json({ error: "Tann kek segond anvan w eseye ankò." });
        return;
      }
      const result = await sendToAll(req.headers.host, [{
        title: "DEKA LOG",
        body: "Tès notifikasyon — tout bagay ap mache ✓",
        tag: "deka-test-" + Date.now(),
        url: "/?tab=notifs",
      }]);
      res.status(200).json(Object.assign({ ok: true }, result));
      return;
    }

    res.status(400).json({ error: "Aksyon pa valid" });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

module.exports = async function handler(req, res) {
  try {
    const channel = req.query && req.query.channel;
    if (channel === "push") { await pushHandler(req, res); return; }
    if (channel === "email") { await emailHandler(req, res); return; }
    res.status(404).json({ error: "Not found" });
  } catch (err) {
    console.error("notify error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
