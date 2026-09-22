"use strict";
const crypto = require("crypto");
const A = require("../auth");
const Users = require("../users");
const Secret = require("../secret");
const Totp = require("../totp");
const Email = require("../email");
const { redis } = require("../redis");
const { ApiError } = require("../errors");

const ROLE_LABEL = { admin: "Administratè Lojistik", depot: "Depo", daily: "Daily Report", chofe: "Chofè" };

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

    const body = A.parseBody(req);
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase().slice(0, 64) : "";
    const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
    const code = typeof body.code === "string" ? body.code.trim().slice(0, 40) : "";
    const ip = A.clientIp(req);

    const legacy = A.accounts();
    const dbUser = await Users.get(username);
    if (legacy.length === 0 && !dbUser && (await Users.list()).length === 0) {
      res.status(503).json({ error: "Sekirite a poko konfigire sou sèvè a (variab AUTH_* manke).", code: "not_configured" });
      return;
    }

    const kUI = "dl:rl:ui:" + username + ":" + ip;
    const kIP = "dl:rl:ip:" + ip;
    const kU = "dl:rl:u:" + username;
    const fail = async function (event, status, msg, codeName) {
      await Promise.all([A.bump(kUI, A.LOGIN_WINDOW_SEC), A.bump(kIP, A.LOGIN_WINDOW_SEC), A.bump(kU, A.LOGIN_WINDOW_SEC)]);
      await A.audit(req, event, { username: username });
      await A.sleep(300);
      res.status(status).json({ error: msg, code: codeName });
    };

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

    // Personal account first, otherwise a shared account from the environment.
    const legacyAcc = dbUser ? null : legacy.find(function (a) { return a.username === username; });
    const secret = dbUser ? dbUser.passHash : legacyAcc ? legacyAcc.secret : A.DUMMY_HASH;
    const ok = await A.verifyPassword(password, secret);
    if (!ok || (!dbUser && !legacyAcc)) {
      await fail("login_fail", 401, "Non itilizatè oswa modpass pa bon.", "bad_credentials");
      return;
    }

    if (dbUser && !dbUser.active) {
      await A.audit(req, "login_disabled", { username: username });
      res.status(403).json({ error: "Kont sa a dezaktive. Kontakte administratè a.", code: "disabled" });
      return;
    }

    // Two-step verification (personal accounts that enabled it, and always for admins once enrolled).
    let totpCounter = 0;
    let usedRecovery = null;
    let usedEmailCode = false;
    if (dbUser && dbUser.totpEnabled) {
      const rlEmail = "dl:rl:2fa-email:" + username;

      if (!code) {
        // The person can ask for the code by email instead of opening their authenticator app.
        if (body.sendEmailCode === true) {
          if (!dbUser.email) { res.status(400).json({ error: "Pa gen imèl konfigire pou kont sa a. Mande administratè a ajoute yon adrès imèl.", code: "no_email" }); return; }
          if (!Email.available()) { res.status(503).json({ error: "Sèvis imèl la pa konfigire sou sèvè a.", code: "email_not_configured" }); return; }
          if ((await A.count(rlEmail)) >= 3) { res.status(429).json({ error: "Twòp kòd mande. Tann 15 minit.", code: "locked" }); return; }
          await A.bump(rlEmail, A.LOGIN_WINDOW_SEC);
          const otp = String(crypto.randomInt(1000000)).padStart(6, "0");
          try {
            await redis.set("dl:2fa:email:" + username, Secret.mac(otp), { ex: 300 });
            await Email.sendEmail("DEKA LOG — Kòd verifikasyon", "Kòd verifikasyon ou se: " + otp + "\n\nKòd sa a bon pou 5 minit. Pa pataje l ak pesòn.", { also: [dbUser.email] });
          } catch (mailErr) {
            // Don't let a Resend/redis hiccup surface as an opaque 500 — tell the person clearly
            // and log the real reason server-side (check it in the Vercel function logs).
            console.error("2fa email send failed:", mailErr && mailErr.message);
            res.status(502).json({ error: "Pa t kapab voye imèl la. Verifye RESEND_API_KEY ak EMAIL_FROM sou sèvè a, oswa itilize kòd aplikasyon an olye.", code: "email_send_failed" });
            return;
          }
          await A.audit(req, "login_2fa_email_sent", { username: username });
          res.status(200).json({ needs2fa: true, emailSent: true });
          return;
        }
        res.status(200).json({ needs2fa: true, canEmail: !!dbUser.email });
        return;
      }
      if (!Secret.available()) throw new ApiError(503, "no_app_secret", "APP_SECRET manke sou sèvè a.");
      let secretPlain = "";
      try { secretPlain = Secret.decrypt(dbUser.totpSecretEnc); } catch (e) { secretPlain = ""; }
      totpCounter = secretPlain ? Totp.verify(secretPlain, code, dbUser.totpLast) : 0;
      if (!totpCounter) {
        const h = Secret.mac(code.toUpperCase().replace(/\s+/g, ""));
        if (dbUser.recovery.indexOf(h) !== -1) usedRecovery = h;
      }
      if (!totpCounter && !usedRecovery) {
        const emailKey = "dl:2fa:email:" + username;
        const stored = await redis.get(emailKey);
        if (stored && stored === Secret.mac(code.replace(/\s+/g, ""))) {
          usedEmailCode = true;
          await redis.del(emailKey);
        }
      }
      if (!totpCounter && !usedRecovery && !usedEmailCode) {
        await fail("login_2fa_fail", 401, "Kòd la pa bon.", "bad_code");
        return;
      }
    }

    await redis.del(kUI);
    await A.destroySession(req, res); // never reuse a previous session id

    let account;
    if (dbUser) {
      const patch = { lastLoginAt: new Date().toISOString() };
      if (totpCounter) patch.totpLast = totpCounter;
      if (usedRecovery) patch.recovery = dbUser.recovery.filter(function (x) { return x !== usedRecovery; });
      await Users.update(dbUser.username, patch);
      account = { username: dbUser.username, name: dbUser.name, role: dbUser.role, src: "db" };
    } else {
      account = { username: legacyAcc.username, name: null, role: legacyAcc.role, src: "env" };
    }
    await A.createSession(req, res, account);
    await A.audit(req, usedRecovery ? "login_ok_recovery_code" : usedEmailCode ? "login_ok_email_code" : "login_ok", { username: account.username }, { username: account.username, name: account.name, role: account.role });
    res.status(200).json({ ok: true, role: account.role, username: account.username, name: account.name, personal: account.src === "db", needs: A.limitedFor(dbUser), roleLabel: ROLE_LABEL[account.role] });
  } catch (err) {
    if (err instanceof ApiError) { res.status(err.status).json({ error: err.message, code: err.code }); return; }
    console.error("login error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
