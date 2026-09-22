"use strict";
// Admin only: which storage is active and whether it answers (shown in the Sekirite tab).
const A = require("./_lib/auth");
const repo = require("./_lib/repo");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const session = await A.requireAuth(req, res, ["admin"]);
    if (!session) return;
    try {
      res.status(200).json(await repo.health());
    } catch (e) {
      console.error("health error:", e && e.message);
      res.status(200).json({ backend: repo.name(), ok: false, error: "Baz done a pa reponn." });
    }
  } catch (err) {
    console.error("health error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè.", code: "server_error" });
  }
};
