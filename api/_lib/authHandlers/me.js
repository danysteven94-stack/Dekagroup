"use strict";
const A = require("../auth");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const s = await A.getSession(req);
    res.status(200).json(s ? { authenticated: true, role: s.role, username: s.username, name: s.name, personal: s.src === "db", needs: s.limited } : { authenticated: false });
  } catch (err) {
    console.error("me error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè.", code: "server_error" });
  }
};
