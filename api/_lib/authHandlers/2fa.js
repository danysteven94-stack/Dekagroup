"use strict";
// Two-step verification (authenticator app). Mandatory for personal admin accounts, optional for the others.
const A = require("../auth");
const Users = require("../users");
const Secret = require("../secret");
const Totp = require("../totp");
const { redis } = require("../redis");
const { ApiError } = require("../errors");

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function recoveryCode() {
  const crypto = require("crypto");
  const g = function () { let s = ""; for (let i = 0; i < 4; i++) s += ALPHA[crypto.randomInt(ALPHA.length)]; return s; };
  return g() + "-" + g();
}

function status(u) {
  return { enabled: !!u.totpEnabled, pending: !u.totpEnabled && !!u.totpSecretEnc, required: u.role === "admin", recoveryLeft: (u.recovery || []).length, email: u.email || null };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const session = await A.requireSession(req, res);
    if (!session) return;
    if (session.src !== "db") {
      res.status(400).json({ error: "Kont pataje pa ka gen 2FA. Mande administratè a kreye yon kont pèsonèl pou ou.", code: "shared_account" });
      return;
    }
    const user = await Users.get(session.username);
    if (!user) { res.status(401).json({ error: "Ou dwe konekte.", code: "unauthenticated" }); return; }

    if (req.method === "GET") {
      res.status(200).json(Object.assign({ available: Secret.available() }, status(user)));
      return;
    }

    if (!Secret.available()) throw new ApiError(503, "no_app_secret", "APP_SECRET manke sou sèvè a (gade SEKIRITE.md).");
    const body = A.parseBody(req);
    const action = body.action;
    const rl = "dl:rl:2fa:" + user.username;

    if (action === "begin") {
      if (user.totpEnabled) { res.status(409).json({ error: "2FA a deja aktif.", code: "already_enabled" }); return; }
      const secret = Totp.generateSecret();
      await Users.update(user.username, { totpSecretEnc: Secret.encrypt(secret), totpEnabled: false, totpLast: 0, recovery: [] });
      res.status(200).json({ ok: true, secret: secret, otpauth: Totp.otpauthUrl(secret, user.username, "DEKA LOG") });
      return;
    }

    if (action === "confirm") {
      if (user.totpEnabled || !user.totpSecretEnc) { res.status(409).json({ error: "Kòmanse ankò: klike sou Aktive 2FA.", code: "not_pending" }); return; }
      if ((await A.count(rl)) >= 5) { res.status(429).json({ error: "Twòp esè. Eseye ankò nan 15 minit.", code: "locked" }); return; }
      const counter = Totp.verify(Secret.decrypt(user.totpSecretEnc), body.code, 0);
      if (!counter) {
        await A.bump(rl, A.LOGIN_WINDOW_SEC);
        await A.sleep(300);
        res.status(401).json({ error: "Kòd la pa bon. Verifye lè aparèy ou a epi eseye ankò.", code: "bad_code" });
        return;
      }
      const codes = [];
      for (let i = 0; i < 8; i++) codes.push(recoveryCode());
      const updated = await Users.update(user.username, { totpEnabled: true, totpLast: counter, recovery: codes.map(function (c) { return Secret.mac(c); }) });
      await redis.del(rl);
      await A.audit(req, "2fa_enabled", null, session);
      res.status(200).json({ ok: true, recoveryCodes: codes, needs: A.limitedFor(updated) });
      return;
    }

    if (action === "disable") {
      if (user.role === "admin") { res.status(403).json({ error: "Yon administratè pa ka dezaktive 2FA li menm. Yon lòt administratè ka reyinisyalize l.", code: "admin_required" }); return; }
      if (!user.totpEnabled) { res.status(409).json({ error: "2FA a pa aktif.", code: "not_enabled" }); return; }
      if ((await A.count(rl)) >= 5) { res.status(429).json({ error: "Twòp esè. Eseye ankò nan 15 minit.", code: "locked" }); return; }
      const okPw = typeof body.password === "string" && (await A.verifyPassword(body.password, user.passHash));
      const okCode = !!Totp.verify(Secret.decrypt(user.totpSecretEnc), body.code, user.totpLast);
      if (!okPw || !okCode) {
        await A.bump(rl, A.LOGIN_WINDOW_SEC);
        await A.sleep(300);
        res.status(401).json({ error: "Modpass oswa kòd la pa bon.", code: "bad_credentials" });
        return;
      }
      await Users.update(user.username, { totpEnabled: false, totpSecretEnc: null, totpLast: 0, recovery: [] });
      await redis.del(rl);
      await A.audit(req, "2fa_disabled", null, session);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: "Aksyon pa valid.", code: "invalid_action" });
  } catch (err) {
    if (err instanceof ApiError) { res.status(err.status).json({ error: err.message, code: err.code }); return; }
    console.error("2fa error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
