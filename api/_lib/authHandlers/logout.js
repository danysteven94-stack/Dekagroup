"use strict";
const A = require("../auth");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    if (!A.sameOrigin(req)) { res.status(403).json({ error: "Demann sa a pa soti nan sit la.", code: "bad_origin" }); return; }
    const s = await A.getSession(req);
    await A.destroySession(req, res);
    if (s) await A.audit(req, "logout", null, s);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("logout error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè.", code: "server_error" });
  }
};
