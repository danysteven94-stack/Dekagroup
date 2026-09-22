"use strict";
// Admin only: latest security/activity events (logins, failures, writes...). Open /api/audit in the browser while logged in as admin.
const A = require("./_lib/auth");
const { redis } = require("./_lib/redis");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const session = await A.requireAuth(req, res, ["admin"]);
    if (!session) return;
    const rows = await redis.lrange("dl:audit", 0, 299);
    const events = (rows || []).map(function (r) {
      if (typeof r !== "string") return r;
      try { return JSON.parse(r); } catch (e) { return { raw: r }; }
    });
    res.status(200).json({ count: events.length, events: events });
  } catch (err) {
    console.error("audit error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè.", code: "server_error" });
  }
};
