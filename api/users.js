"use strict";
// Principal account only: create and manage every other personal account.
const A = require("./_lib/auth");
const Users = require("./_lib/users");
const Secret = require("./_lib/secret");
const Email = require("./_lib/email");
const { ApiError } = require("./_lib/errors");

function safe(u) {
  return {
    username: u.username, name: u.name, role: u.role, active: u.active, mustChange: u.mustChange, totpEnabled: u.totpEnabled,
    email: u.email || null, principal: u.username === A.principalUsername(),
    lastLoginAt: u.lastLoginAt, createdAt: u.createdAt, createdBy: u.createdBy, passChangedAt: u.passChangedAt,
  };
}

// Usernames of the shared accounts (environment variables) are reserved.
function reserved() {
  const set = {};
  A.ROLE_DEFS.forEach(function (d) {
    set[d.defaultUser] = true;
    const o = process.env["AUTH_" + d.key + "_USER"];
    if (o) set[String(o).trim().toLowerCase()] = true;
  });
  return set;
}

function clean(v, max) {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

// Refuse a change that would leave nobody able to administer the app.
async function wouldLockOut(target, afterActive, afterRole) {
  const users = await Users.list();
  const admins = users.filter(function (u) {
    const active = u.username === target ? afterActive : u.active;
    const role = u.username === target ? afterRole : u.role;
    return active && role === "admin";
  }).length;
  const legacyAdmin = A.accounts().some(function (a) { return a.role === "admin"; });
  return admins === 0 && !legacyAdmin;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const session = await A.requireAuth(req, res, ["admin"]);
    if (!session) return;
    if (!A.isPrincipal(session)) {
      res.status(403).json({ error: "Sèl kont prensipal la ka jere itilizatè yo.", code: "principal_required" });
      return;
    }

    if (req.method === "GET") {
      const users = await Users.list();
      res.status(200).json({
        users: users.map(safe),
        legacy: A.accounts().map(function (a) { return { username: a.username, role: a.role }; }),
        legacyDisabled: process.env.AUTH_LEGACY_DISABLED === "1",
        twoFactorAvailable: Secret.available(),
        me: session.username,
      });
      return;
    }

    const body = A.parseBody(req);
    const action = body.action;
    const target = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";

    if (action === "create") {
      const role = body.role;
      const name = clean(body.name, 60);
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!Users.USERNAME_RE.test(target)) throw new ApiError(400, "invalid_username", "Non itilizatè a dwe gen 3 a 32 karaktè (lèt ki piti, chif, pwen, tirè).");
      if (reserved()[target]) throw new ApiError(400, "reserved", "Non sa a rezève pou yon kont pataje. Chwazi yon lòt.");
      if (Users.ROLES.indexOf(role) === -1) throw new ApiError(400, "invalid_role", "Wòl la pa valid.");
      if (name.length < 2) throw new ApiError(400, "invalid_name", "Ekri non konplè moun nan.");
      if (email && !Email.EMAIL_RE.test(email)) throw new ApiError(400, "invalid_email", "Adrès imèl la pa valid.");
      if (role === "admin" && !Secret.available()) throw new ApiError(503, "no_app_secret", "Pou kreye yon administratè, APP_SECRET dwe konfigire sou sèvè a (2FA obligatwa). Gade SEKIRITE.md.");
      const temp = Users.tempPassword();
      const u = await Users.create({ username: target, name: name, role: role, email: email || null, passHash: await A.hashPassword(temp), mustChange: true, createdBy: session.username });
      await A.audit(req, "user_create", { username: target, role: role }, session);
      res.status(200).json({ ok: true, user: safe(u), tempPassword: temp });
      return;
    }

    const user = await Users.get(target);
    if (!user) throw new ApiError(404, "not_found", "Pa jwenn itilizatè a.");
    const self = user.username === session.username;

    if (action === "reset_password") {
      if (self) throw new ApiError(400, "self", "Chanje pwòp modpass ou nan \"Kont mwen\".");
      const temp = Users.tempPassword();
      await Users.update(user.username, { passHash: await A.hashPassword(temp), mustChange: true, passChangedAt: null });
      const closed = await A.killUserSessions(user.username);
      await A.audit(req, "user_reset_password", { username: user.username, sessionsClosed: closed }, session);
      res.status(200).json({ ok: true, tempPassword: temp });
      return;
    }

    if (action === "set_active") {
      const active = body.active === true;
      if (self) throw new ApiError(400, "self", "Ou pa ka dezaktive pwòp kont ou.");
      if (!active && user.username === A.principalUsername()) throw new ApiError(400, "principal", "Ou pa ka dezaktive kont prensipal la.");
      if (!active && (await wouldLockOut(user.username, false, user.role))) throw new ApiError(409, "last_admin", "Sa ta kite pa gen okenn administratè aktif.");
      await Users.update(user.username, { active: active });
      if (!active) await A.killUserSessions(user.username);
      await A.audit(req, "user_set_active", { username: user.username, active: active }, session);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "set_role") {
      const role = body.role;
      if (Users.ROLES.indexOf(role) === -1) throw new ApiError(400, "invalid_role", "Wòl la pa valid.");
      if (self) throw new ApiError(400, "self", "Ou pa ka chanje pwòp wòl ou.");
      if (user.username === A.principalUsername() && role !== "admin") throw new ApiError(400, "principal", "Ou pa ka retire wòl administratè kont prensipal la.");
      if (role === "admin" && !Secret.available()) throw new ApiError(503, "no_app_secret", "APP_SECRET dwe konfigire pou fè yon administratè (2FA obligatwa).");
      if (user.role === "admin" && role !== "admin" && (await wouldLockOut(user.username, user.active, role))) throw new ApiError(409, "last_admin", "Sa ta kite pa gen okenn administratè aktif.");
      await Users.update(user.username, { role: role });
      await A.killUserSessions(user.username);
      await A.audit(req, "user_set_role", { username: user.username, from: user.role, to: role }, session);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "set_email") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (email && !Email.EMAIL_RE.test(email)) throw new ApiError(400, "invalid_email", "Adrès imèl la pa valid.");
      await Users.update(user.username, { email: email || null });
      await A.audit(req, "user_set_email", { username: user.username, hasEmail: !!email }, session);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === "reset_2fa") {
      await Users.update(user.username, { totpEnabled: false, totpSecretEnc: null, totpLast: 0, recovery: [] });
      await A.killUserSessions(user.username, self ? session.key : undefined);
      await A.audit(req, "user_reset_2fa", { username: user.username }, session);
      res.status(200).json({ ok: true });
      return;
    }

    throw new ApiError(400, "invalid_action", "Aksyon pa valid.");
  } catch (err) {
    if (err instanceof ApiError) { res.status(err.status).json({ error: err.message, code: err.code }); return; }
    console.error("users error:", err && err.message);
    res.status(500).json({ error: "Erè sèvè. Eseye ankò.", code: "server_error" });
  }
};
