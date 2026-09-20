"use strict";
const A = require("../_lib/auth");
const { redis } = require("../_lib/redis");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    if (!A.sameOrigin(req)) { res.status(403).json({ error: "Demann sa a pa soti nan sit la.", code: "bad_origin" }); return; }
    if (!A.isJson(req)) { res.status(415).json({ error: "Fòma demann nan pa valid.", code: "bad_content_type" }); return; }

    const accounts = A.accounts();
    if (accounts.length === 0) {
      res.status(503).json({ error: "Sekirite a poko konfigire sou sèvè a (variab AUTH_* manke).", code: "not_configured" });
      return;
    }

    const body = A.parseBody(req);
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase().slice(0, 64) : "";
    const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
    const ip = A.clientIp(req);

    const kUI = "dl:rl:ui:" + username + ":" + ip;
    const kIP = "dl:rl:ip:" + ip;
    const kU = "dl:rl:u:" + username;

    // Blocked? (too many recent failures)
    const counts = await Promise.all([A.count(kUI), A.count(kIP), A.count(kU)]);
    if (counts[0] >= A.LIMIT_USER_IP || counts[1] >= A.LIMIT_IP || counts[2] >= A.LIMIT_USER) {
      const key = counts[0] >= A.LIMIT_USER_IP ? kUI : counts[1] >= A.LIMIT_IP ? kIP : kU;
      const left = Math.max(1, await redis.ttl(key));
      res.setHeader("Retry-After", String(left));
      await A.audit(req, "login_blocked", { username: username });
      res.status(429).json({ error: "Twòp esè ki pa reyisi. Eseye ankò nan " + Math.ceil(left / 60) + " minit.", code: "locked", retryAfter: left });
      return;
    }

    const account = accounts.find(function (a) { return a.username === username; });
    const ok = await A.verifyPassword(password, account ? account.secret : A.DUMMY_HASH);

    if (!account || !ok) {
      await Promise.all([A.bump(kUI, A.LOGIN_WINDOW_SEC), A.bump(kIP, A.LOGIN_WINDOW_SEC), A.bump(kU, A.LOGIN_WINDOW_SEC)]);
      await A.audit(req, "login_fail", { username: username });
      await A.sleep(300);
      res.status(401).json({ error: "Non itilizatè oswa modpass pa bon.", code: "bad_credentials" });
      return;
    }

    // The gate the person chose must match the account's role (no silent landing in another interface).
    const wanted = typeof body.role === "string" ? body.role : "";
    if (wanted && wanted !== account.role) {
      const labels = { admin: "Administratè Lojistik", depot: "Depo", daily: "Daily Report", chofe: "Chofè" };
      await A.audit(req, "login_wrong_role", { username: account.username, wanted: wanted });
      res.status(403).json({ error: "Kont sa a se pou " + (labels[account.role] || account.role) + ", pa pou " + (labels[wanted] || wanted) + ". Retounen epi chwazi bon wòl la.", code: "wrong_role", role: account.role });
      return;
    }

    await redis.del(kUI);
    await A.destroySession(req, res); // never reuse a previous session id
    await A.createSession(req, res, account);
    await A.audit(req, "login_ok", { username: account.username }, { username: account.username, role: account.role });
    res.status(200).json({ ok: true, role: account.role, username: account.username });
  } catch (err) {
    console.error("login error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
