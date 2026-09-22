"use strict";
// Personal accounts, forced password change, two-step verification, user management.
//   node tests/accounts.test.js            (Redis users)      TEST_BACKEND=pg node tests/accounts.test.js   (SQL users)
const assert = require("assert");
const H = require("./helpers");
const Totp = H.api("_lib/totp");
const Users = H.api("_lib/users");

const results = [];
async function test(name, fn) {
  try { H.reset(); H.env(); await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); }
}
const LEGACY = { admin: "Adm1n-Strong-Pass", depot: "Dep0t-Strong-Pass", daily: "Da1ly-Strong-Pass", chofe: "Chof3-Strong-Pass" };
H.env = () => {
  process.env.AUTH_ADMIN_PASS = LEGACY.admin; process.env.AUTH_DEPOT_PASS = LEGACY.depot;
  process.env.AUTH_DAILY_PASS = LEGACY.daily; process.env.AUTH_CHOFE_PASS = LEGACY.chofe;
  process.env.APP_SECRET = "unit-test-app-secret-0123456789abcdef";
  delete process.env.AUTH_LEGACY_DISABLED; delete process.env.AUTH_SESSION_EPOCH;
};

const A = () => ({
  login: H.api("auth/login"), me: H.api("auth/me"), logout: H.api("auth/logout"), password: H.api("auth/password"), tfa: H.api("auth/2fa"),
  users: H.api("users"), data: H.api("data"), audit: H.api("audit"),
});
const post = (b, h, body, extra) => b.call(h, Object.assign({ method: "POST", body }, extra || {}));
const code = (secret) => Totp.hotp(secret, Totp.counterAt(H.now()), 6);
const seed = () => ({ containers: [{ id: "c1", numewo: "NUM1", billId: null, size: "20", division: "ACS", dateEntered: "2026-09-01", dateVerified: "2026-09-02", depo: "D", trucking: "CFC", dateEmpty: null, dateLeft: null }], bills: [], notifications: [], inventoryChecks: {} });

async function legacyAdmin() {
  const b = H.browser();
  const r = await post(b, A().login, { username: "logistic", password: LEGACY.admin });
  assert.strictEqual(r.statusCode, 200);
  return b;
}
async function createUser(admin, username, role, name) {
  const r = await post(admin, A().users, { action: "create", username, role, name: name || "Test " + username });
  assert.strictEqual(r.statusCode, 200, "create " + username + ": " + JSON.stringify(r.body));
  return r.body.tempPassword;
}
// logs a personal user fully in (temp password -> new password) and returns the browser + final password
async function onboard(admin, username, role, newPw) {
  const temp = await createUser(admin, username, role);
  const b = H.browser("198.51.100." + (10 + Math.floor(Math.random() * 200)));
  let r = await post(b, A().login, { username, password: temp });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.needs, "password");
  r = await post(b, A().password, { current: temp, next: newPw });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  return { b, pw: newPw, temp };
}
async function enroll2fa(b) {
  let r = await post(b, A().tfa, { action: "begin" });
  assert.strictEqual(r.statusCode, 200);
  const secret = r.body.secret;
  r = await post(b, A().tfa, { action: "confirm", code: code(secret) });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  return { secret, recovery: r.body.recoveryCodes };
}

(async () => {
  await test("admin creates personal accounts: validation, reserved names, temporary password shown once, no secrets in the list", async () => {
    const admin = await legacyAdmin();
    const bad = async (body, status) => assert.strictEqual((await post(admin, A().users, Object.assign({ action: "create", name: "Jean Paul" }, body))).statusCode, status, JSON.stringify(body));
    await bad({ username: "AB", role: "depot" }, 400);
    await bad({ username: "jean paul", role: "depot" }, 400);
    await bad({ username: "logistic", role: "depot" }, 400); // reserved (shared account)
    await bad({ username: "chofe", role: "depot" }, 400);
    await bad({ username: "jean.paul", role: "boss" }, 400);
    assert.strictEqual((await post(admin, A().users, { action: "create", username: "jean.paul", role: "depot", name: "J" })).statusCode, 400, "name too short");
    const temp = await createUser(admin, "jean.paul", "depot", "Jean Paul");
    assert.ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(temp));
    assert.strictEqual((await post(admin, A().users, { action: "create", username: "jean.paul", role: "depot", name: "Jean Paul" })).statusCode, 409, "duplicate");
    const list = (await admin.call(A().users)).body;
    assert.strictEqual(list.users.length, 1);
    assert.deepStrictEqual(list.legacy.map((l) => l.username).sort(), ["chofe", "depotnord", "logistic", "logisticdepot"]);
    assert.ok(!JSON.stringify(list).includes("scrypt:") && !JSON.stringify(list).includes(temp), "no hash or password in the list");
    const stored = await Users.get("jean.paul");
    assert.ok(stored.passHash.startsWith("scrypt:") && stored.mustChange === true && stored.createdBy === "logistic");
  });

  await test("only admins can manage accounts (depot, a limited session and a stranger cannot)", async () => {
    const admin = await legacyAdmin();
    const temp = await createUser(admin, "marie", "depot");
    const limited = H.browser("198.51.100.90");
    await post(limited, A().login, { username: "marie", password: temp });
    assert.strictEqual((await limited.call(A().users)).statusCode, 403, "limited session");
    const depot = H.browser("198.51.100.91");
    await post(depot, A().login, { username: "depotnord", password: LEGACY.depot });
    assert.strictEqual((await depot.call(A().users)).statusCode, 403);
    assert.strictEqual((await H.browser().call(A().users)).statusCode, 401);
  });

  await test("a temporary password must be changed: everything else is refused until then; the rules are enforced", async () => {
    await H.setData(seed());
    const admin = await legacyAdmin();
    const temp = await createUser(admin, "marie", "depot", "Marie Claire");
    const b = H.browser("198.51.100.20");
    let r = await post(b, A().login, { username: "marie", password: temp });
    assert.deepStrictEqual([r.statusCode, r.body.role, r.body.name, r.body.needs], [200, "depot", "Marie Claire", "password"]);
    assert.strictEqual((await b.call(A().me)).body.needs, "password");
    const gd = await b.call(A().data);
    assert.deepStrictEqual([gd.statusCode, gd.body.code], [403, "must_change_password"]);
    assert.strictEqual((await post(b, H.api("act"), { action: "markEmpty", id: "c1" })).statusCode, 403);
    assert.strictEqual((await post(b, A().password, { current: "wrong-password-1", next: "Another-Strong-1" })).statusCode, 401);
    for (const [next, why] of [["short", "too short"], ["marie-password-1", "contains the username"], ["passwordpassword", "too common"], ["aaaaaaaaaaaa", "trivial"], [temp, "same as current"]]) {
      const x = await post(b, A().password, { current: temp, next });
      assert.strictEqual(x.statusCode, 400, why + ": " + JSON.stringify(x.body));
    }
    r = await post(b, A().password, { current: temp, next: "Sunrise-Harbor-42" });
    assert.deepStrictEqual([r.statusCode, r.body.needs], [200, null]);
    assert.strictEqual((await b.call(A().data)).statusCode, 200, "now the app works");
    const again = await post(H.browser("198.51.100.21"), A().login, { username: "marie", password: temp });
    assert.strictEqual(again.statusCode, 401, "the temporary password is dead");
    assert.strictEqual((await post(H.browser("198.51.100.22"), A().login, { username: "marie", password: "Sunrise-Harbor-42" })).statusCode, 200);
  });

  await test("changing the password logs the person out everywhere else", async () => {
    const admin = await legacyAdmin();
    const { b, pw } = await onboard(admin, "marie", "depot", "Sunrise-Harbor-42");
    const phone = H.browser("198.51.100.30");
    assert.strictEqual((await post(phone, A().login, { username: "marie", password: pw })).statusCode, 200);
    assert.strictEqual((await phone.call(A().data)).statusCode, 200);
    assert.strictEqual((await post(b, A().password, { current: pw, next: "Moonlight-River-77" })).statusCode, 200);
    assert.strictEqual((await phone.call(A().data)).statusCode, 401, "the other device was logged out");
    assert.strictEqual((await b.call(A().data)).statusCode, 200, "this device stays logged in");
  });

  await test("brute-forcing the current password is rate limited", async () => {
    const admin = await legacyAdmin();
    const { b, pw } = await onboard(admin, "marie", "depot", "Sunrise-Harbor-42");
    for (let i = 0; i < 5; i++) assert.strictEqual((await post(b, A().password, { current: "guess-number-" + i, next: "Moonlight-River-77" })).statusCode, 401);
    assert.strictEqual((await post(b, A().password, { current: pw, next: "Moonlight-River-77" })).statusCode, 429);
  });

  await test("personal admin: password change, then two-step verification is mandatory before anything works", async () => {
    await H.setData(seed());
    const admin = await legacyAdmin();
    const { b, pw } = await onboard(admin, "chef.admin", "admin", "Sunrise-Harbor-42");
    assert.strictEqual((await b.call(A().me)).body.needs, "2fa");
    const gd = await b.call(A().data);
    assert.deepStrictEqual([gd.statusCode, gd.body.code], [403, "must_enroll_2fa"]);
    assert.strictEqual((await b.call(A().users)).statusCode, 403);
    const begin = await post(b, A().tfa, { action: "begin" });
    assert.ok(/^[A-Z2-7]{32}$/.test(begin.body.secret) && begin.body.otpauth.startsWith("otpauth://totp/"));
    assert.ok(!(await Users.get("chef.admin")).totpSecretEnc.includes(begin.body.secret), "secret encrypted at rest");
    assert.strictEqual((await post(b, A().tfa, { action: "confirm", code: "000000" })).statusCode, 401);
    const ok = await post(b, A().tfa, { action: "confirm", code: code(begin.body.secret) });
    assert.strictEqual(ok.statusCode, 200);
    assert.strictEqual(ok.body.recoveryCodes.length, 8);
    assert.deepStrictEqual(ok.body.needs, null);
    assert.strictEqual((await b.call(A().data)).statusCode, 200);
    assert.strictEqual((await b.call(A().users)).statusCode, 200, "full admin now");
    const stored = await Users.get("chef.admin");
    assert.ok(stored.recovery.every((h) => /^[0-9a-f]{64}$/.test(h)) && !JSON.stringify(stored).includes(ok.body.recoveryCodes[0]), "recovery codes are stored hashed");
    // an admin cannot switch 2FA off for themselves
    assert.strictEqual((await post(b, A().tfa, { action: "disable", password: pw, code: "123456" })).statusCode, 403);
  });

  await test("login with 2FA: code required, wrong code counted, replay blocked, recovery code works once", async () => {
    const admin = await legacyAdmin();
    const { b, pw } = await onboard(admin, "chef.admin", "admin", "Sunrise-Harbor-42");
    const { secret, recovery } = await enroll2fa(b);

    const fresh = () => H.browser("198.51.100." + (100 + Math.floor(Math.random() * 100)));
    let x = fresh();
    let r = await post(x, A().login, { username: "chef.admin", password: pw });
    assert.deepStrictEqual([r.statusCode, r.body.needs2fa], [200, true]);
    assert.ok(!x.jar["__Host-dl_sid"], "no session before the code");
    r = await post(x, A().login, { username: "chef.admin", password: pw, code: "000000" });
    assert.strictEqual(r.statusCode, 401);
    r = await post(x, A().login, { username: "chef.admin", password: pw, code: code(secret) });
    assert.strictEqual(r.statusCode, 401, "the code used to enroll cannot be replayed in the same time step");
    H.advance(31000);
    r = await post(x, A().login, { username: "chef.admin", password: pw, code: code(secret) });
    assert.deepStrictEqual([r.statusCode, r.body.needs], [200, null]);
    const y = fresh();
    r = await post(y, A().login, { username: "chef.admin", password: pw, code: code(secret) });
    assert.strictEqual(r.statusCode, 401, "same code again = replay");
    // recovery code: once
    const z = fresh();
    r = await post(z, A().login, { username: "chef.admin", password: pw, code: recovery[0].toLowerCase() });
    assert.strictEqual(r.statusCode, 200, "recovery code accepted (case-insensitive)");
    const z2 = fresh();
    r = await post(z2, A().login, { username: "chef.admin", password: pw, code: recovery[0] });
    assert.strictEqual(r.statusCode, 401, "recovery code is single-use");
    assert.strictEqual((await Users.get("chef.admin")).recovery.length, 7);
  });

  await test("wrong 2FA codes lock the login like wrong passwords do", async () => {
    const admin = await legacyAdmin();
    const { b, pw } = await onboard(admin, "chef.admin", "admin", "Sunrise-Harbor-42");
    await enroll2fa(b);
    const x = H.browser("198.51.100.150");
    for (let i = 0; i < 5; i++) assert.strictEqual((await post(x, A().login, { username: "chef.admin", password: pw, code: "11111" + i })).statusCode, 401);
    assert.strictEqual((await post(x, A().login, { username: "chef.admin", password: pw, code: "000000" })).statusCode, 429);
  });

  await test("optional 2FA for other roles: enable, then required at login; disabling needs password + code", async () => {
    const admin = await legacyAdmin();
    const { b, pw } = await onboard(admin, "marie", "depot", "Sunrise-Harbor-42");
    const { secret } = await enroll2fa(b);
    const x = H.browser("198.51.100.160");
    assert.strictEqual((await post(x, A().login, { username: "marie", password: pw })).body.needs2fa, true);
    H.advance(31000);
    assert.strictEqual((await post(b, A().tfa, { action: "disable", password: "wrong-password-9", code: code(secret) })).statusCode, 401);
    assert.strictEqual((await post(b, A().tfa, { action: "disable", password: pw, code: code(secret) })).statusCode, 200);
    assert.strictEqual((await post(H.browser("198.51.100.161"), A().login, { username: "marie", password: pw })).body.ok, true, "no code needed any more");
  });

  await test("disable / enable an account: sessions closed, login refused with a clear message, then restored", async () => {
    const admin = await legacyAdmin();
    const { b, pw } = await onboard(admin, "marie", "depot", "Sunrise-Harbor-42");
    assert.strictEqual((await b.call(A().data)).statusCode, 200);
    assert.strictEqual((await post(admin, A().users, { action: "set_active", username: "marie", active: false })).statusCode, 200);
    assert.strictEqual((await b.call(A().data)).statusCode, 401, "existing session closed");
    const r = await post(H.browser("198.51.100.170"), A().login, { username: "marie", password: pw });
    assert.deepStrictEqual([r.statusCode, r.body.code], [403, "disabled"]);
    const wrong = await post(H.browser("198.51.100.171"), A().login, { username: "marie", password: "not-the-password" });
    assert.strictEqual(wrong.statusCode, 401, "a wrong password never reveals the state of the account");
    await post(admin, A().users, { action: "set_active", username: "marie", active: true });
    assert.strictEqual((await post(H.browser("198.51.100.172"), A().login, { username: "marie", password: pw })).statusCode, 200);
  });

  await test("admin resets a password: new temporary one, old one dead, sessions closed, change forced; role change closes sessions; self-protection", async () => {
    const admin = await legacyAdmin();
    const { b, pw } = await onboard(admin, "marie", "depot", "Sunrise-Harbor-42");
    const r = await post(admin, A().users, { action: "reset_password", username: "marie" });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual((await b.call(A().data)).statusCode, 401);
    assert.strictEqual((await post(H.browser("198.51.100.180"), A().login, { username: "marie", password: pw })).statusCode, 401);
    const l = await post(H.browser("198.51.100.181"), A().login, { username: "marie", password: r.body.tempPassword });
    assert.deepStrictEqual([l.statusCode, l.body.needs], [200, "password"]);
    await post(admin, A().users, { action: "set_role", username: "marie", role: "chofe" });
    const l2 = await post(H.browser("198.51.100.182"), A().login, { username: "marie", password: r.body.tempPassword });
    assert.strictEqual(l2.body.role, "chofe");
    // a personal admin cannot demote / disable / reset himself
    const boss = await onboard(admin, "boss", "admin", "Sunrise-Harbor-42");
    await enroll2fa(boss.b);
    for (const body of [{ action: "set_active", username: "boss", active: false }, { action: "set_role", username: "boss", role: "depot" }, { action: "reset_password", username: "boss" }]) {
      assert.strictEqual((await post(boss.b, A().users, body)).statusCode, 400, JSON.stringify(body));
    }
  });

  await test("another admin can reset someone's 2FA: they must enroll again", async () => {
    const admin = await legacyAdmin();
    const a1 = await onboard(admin, "admin.one", "admin", "Sunrise-Harbor-42");
    const s1 = await enroll2fa(a1.b);
    assert.strictEqual((await post(admin, A().users, { action: "reset_2fa", username: "admin.one" })).statusCode, 200);
    const x = H.browser("198.51.100.190");
    const r = await post(x, A().login, { username: "admin.one", password: a1.pw });
    assert.deepStrictEqual([r.statusCode, r.body.needs], [200, "2fa"], "no code asked any more, but enrollment is forced again");
    assert.strictEqual((await x.call(A().data)).statusCode, 403);
    assert.ok(s1.secret);
  });

  await test("shared accounts keep working, cannot use personal-account features, and can be switched off", async () => {
    const admin = await legacyAdmin();
    await onboard(admin, "marie", "depot", "Sunrise-Harbor-42");
    const shared = H.browser("198.51.100.200");
    await post(shared, A().login, { username: "depotnord", password: LEGACY.depot });
    const p = await post(shared, A().password, { current: LEGACY.depot, next: "Sunrise-Harbor-43" });
    assert.deepStrictEqual([p.statusCode, p.body.code], [400, "shared_account"]);
    assert.strictEqual((await shared.call(A().tfa)).statusCode, 400);
    process.env.AUTH_LEGACY_DISABLED = "1";
    assert.strictEqual((await shared.call(A().data)).statusCode, 401, "existing shared sessions stop working");
    assert.strictEqual((await post(H.browser("198.51.100.201"), A().login, { username: "depotnord", password: LEGACY.depot })).statusCode, 401);
    assert.strictEqual((await post(H.browser("198.51.100.202"), A().login, { username: "marie", password: "Sunrise-Harbor-42" })).statusCode, 200, "personal accounts unaffected");
  });

  await test("2FA and admin creation need APP_SECRET (clear error, nothing half-created)", async () => {
    const admin = await legacyAdmin();
    const temp = await createUser(admin, "marie", "depot");
    const b = H.browser("198.51.100.210");
    await post(b, A().login, { username: "marie", password: temp });
    await post(b, A().password, { current: temp, next: "Sunrise-Harbor-42" });
    delete process.env.APP_SECRET;
    const r = await post(b, A().tfa, { action: "begin" });
    assert.deepStrictEqual([r.statusCode, r.body.code], [503, "no_app_secret"]);
    const c = await post(admin, A().users, { action: "create", username: "new.admin", role: "admin", name: "New Admin" });
    assert.deepStrictEqual([c.statusCode, c.body.code], [503, "no_app_secret"]);
    assert.strictEqual(await Users.get("new.admin"), null);
    assert.strictEqual((await post(admin, A().users, { action: "create", username: "new.depot", role: "depot", name: "New Depot" })).statusCode, 200, "non-admin accounts do not need it");
  });

  await test("the activity log names the person and never contains secrets", async () => {
    const admin = await legacyAdmin();
    const { b, pw } = await onboard(admin, "marie", "depot", "Sunrise-Harbor-42");
    await enroll2fa(b);
    await post(admin, A().users, { action: "set_active", username: "marie", active: false });
    const ev = (await admin.call(A().audit)).body.events;
    const names = ev.map((e) => e.ev);
    for (const n of ["user_create", "password_change", "2fa_enabled", "user_set_active", "login_ok"]) assert.ok(names.includes(n), "missing " + n + " in " + names);
    assert.ok(ev.some((e) => e.ev === "password_change" && e.u === "marie" && e.n === "Test marie"), "name of the person recorded");
    const raw = JSON.stringify(ev);
    assert.ok(!raw.includes(pw) && !raw.includes("Sunrise") && !raw.includes("scrypt:"), "no password or hash in the log");
  });

  await test("a personal account with the same name as a shared one is impossible, and unknown usernames cannot be probed", async () => {
    const admin = await legacyAdmin();
    assert.strictEqual((await post(admin, A().users, { action: "create", username: "depotnord", role: "depot", name: "Dup Licate" })).statusCode, 400);
    const a = await post(H.browser("198.51.100.220"), A().login, { username: "nobody.here", password: "whatever-1234" });
    const c = await post(H.browser("198.51.100.221"), A().login, { username: "logistic", password: "whatever-1234" });
    assert.deepStrictEqual(a.body, c.body);
  });

  const failed = results.filter((r) => !r[0]);
  results.forEach((r) => console.log((r[0] ? "  PASS  " : "  FAIL  ") + r[1] + (r[0] ? "" : "\n        " + (r[2] && r[2].stack ? r[2].stack.split("\n").slice(0, 5).join("\n        ") : r[2]))));
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " passed");
  H.restoreClock();
  process.exit(failed.length ? 1 : 0);
})();
