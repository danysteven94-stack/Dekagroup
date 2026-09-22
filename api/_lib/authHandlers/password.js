"use strict";
// A person changes their own password (also used for the forced change of a temporary password).
const A = require("../auth");
const Users = require("../users");
const { redis } = require("../redis");
const { ApiError } = require("../errors");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const session = await A.requireSession(req, res);
    if (!session) return;
    if (session.src !== "db") {
      res.status(400).json({ error: "Kont pataje pa gen modpass pèsonèl. Mande administratè a kreye yon kont pèsonèl pou ou.", code: "shared_account" });
      return;
    }

    const body = A.parseBody(req);
    const current = typeof body.current === "string" ? body.current.slice(0, 200) : "";
    const next = typeof body.next === "string" ? body.next.slice(0, 200) : "";

    const rl = "dl:rl:pw:" + session.username;
    if ((await A.count(rl)) >= 5) {
      res.status(429).json({ error: "Twòp esè. Eseye ankò nan 15 minit.", code: "locked" });
      return;
    }
    const user = await Users.get(session.username);
    if (!user || !(await A.verifyPassword(current, user.passHash))) {
      await A.bump(rl, A.LOGIN_WINDOW_SEC);
      await A.audit(req, "password_change_fail", null, session);
      await A.sleep(300);
      res.status(401).json({ error: "Modpass aktyèl la pa bon.", code: "bad_current" });
      return;
    }
    if (next === current) {
      res.status(400).json({ error: "Nouvo modpass la dwe diferan de sa ki la a.", code: "same_password" });
      return;
    }
    const problem = Users.passwordProblem(next, user.username);
    if (problem) {
      res.status(400).json({ error: problem, code: "weak_password" });
      return;
    }

    const updated = await Users.update(user.username, { passHash: await A.hashPassword(next), mustChange: false, passChangedAt: new Date().toISOString() });
    await redis.del(rl);
    const closed = await A.killUserSessions(user.username, session.key); // every other device is logged out
    await A.audit(req, "password_change", { otherSessionsClosed: closed }, session);
    res.status(200).json({ ok: true, needs: A.limitedFor(updated) });
  } catch (err) {
    if (err instanceof ApiError) { res.status(err.status).json({ error: err.message, code: err.code }); return; }
    console.error("password error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
