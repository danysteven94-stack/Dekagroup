"use strict";
// A person views or sets the email address their own account uses to receive 2-step verification codes.
// (The admin-only digest recipient list for inventory notifications is a separate thing — see /api/email.js.)
const A = require("../auth");
const Users = require("../users");
const Email = require("../email");
const { ApiError } = require("../errors");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const session = await A.requireSession(req, res);
    if (!session) return;
    if (session.src !== "db") {
      res.status(400).json({ error: "Kont pataje pa ka gen yon imèl pèsonèl.", code: "shared_account" });
      return;
    }
    const user = await Users.get(session.username);
    if (!user) { res.status(401).json({ error: "Ou dwe konekte.", code: "unauthenticated" }); return; }

    if (req.method === "GET") {
      res.status(200).json({ email: user.email || null, available: Email.available() });
      return;
    }

    const body = A.parseBody(req);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email && !Email.EMAIL_RE.test(email)) throw new ApiError(400, "invalid_email", "Adrès imèl la pa valid.");
    await Users.update(user.username, { email: email || null });
    await A.audit(req, "self_set_email", { hasEmail: !!email }, session);
    res.status(200).json({ ok: true, email: email || null });
  } catch (err) {
    if (err instanceof ApiError) { res.status(err.status).json({ error: err.message, code: err.code }); return; }
    console.error("email (self) error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
