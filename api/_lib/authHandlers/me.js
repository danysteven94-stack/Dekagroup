"use strict";
const A = require("../auth");
const Users = require("../users");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const s = await A.getSession(req);
    // A driver account may be tied to one trucking company (set by the administrator): the driver page uses it instead of a dropdown.
    let trucking = null;
    if (s && s.role === "chofe" && s.src === "db") {
      const u = await Users.get(s.username);
      trucking = u && u.trucking ? u.trucking : null;
    }
    res.status(200).json(s ? {
      authenticated: true, role: s.role, username: s.username, name: s.name, personal: s.src === "db", needs: s.limited,
      divisions: s.divisions || [], pools: s.pools || ["default"], pool: s.pool || "default",
      ...(trucking ? { trucking: trucking } : {}),
    } : { authenticated: false });
  } catch (err) {
    console.error("me error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè.", code: "server_error" });
  }
};
