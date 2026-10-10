"use strict";
// /api/auth/tour — which version of the first-login guide this account has already seen.
//   GET  -> { version }            POST { version } -> { version }   (the stored number only ever goes up)
const A = require("../auth");
const Seen = require("../tourseen");
const { ApiError } = require("../errors");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const session = await A.requireAuth(req, res, null);
    if (!session) return;
    if (req.method === "GET") {
      res.status(200).json({ version: await Seen.get(session.username) });
      return;
    }
    const body = A.parseBody(req);
    res.status(200).json({ version: await Seen.raise(session.username, body.version) });
  } catch (err) {
    console.error("tour error:", err && err.message);
    const busy = err instanceof ApiError && err.status === 503;
    res.status(busy ? 503 : 500).json({ error: busy ? err.message : "Erè sèvè.", code: "server_error" });
  }
};
