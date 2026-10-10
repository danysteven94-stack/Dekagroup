"use strict";
// Server copy of "which guide version this account has seen". Run: node tests/tour.test.js   (or TEST_BACKEND=pg ...)
const assert = require("assert");
const H = require("./helpers");

const results = [];
async function test(name, fn) { try { H.reset(); await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); } }
const PW = { admin: "Adm1n-Strong-Pass", depot: "Dep0t-Strong-Pass" };
async function login(user, role) {
  const b = H.browser();
  const r = await b.call(H.api("auth/login"), { method: "POST", body: { username: user, password: PW[role] } });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  return b;
}
const tour = () => H.api("auth/tour");
const get = async (b) => (await b.call(tour(), { method: "GET" }));
const post = async (b, version) => (await b.call(tour(), { method: "POST", body: { version } }));

(async () => {
  const A = H.api("_lib/auth");
  process.env.AUTH_ADMIN_HASH = await A.hashPassword(PW.admin);
  process.env.AUTH_DEPOT_PASS = PW.depot;
  delete process.env.AUTH_SESSION_EPOCH;

  await test("a new account has seen nothing; the version it posts is remembered", async () => {
    const depot = await login("depotnord", "depot");
    let r = await get(depot); assert.strictEqual(r.statusCode, 200); assert.strictEqual(r.body.version, 0);
    r = await post(depot, 2); assert.strictEqual(r.statusCode, 200); assert.strictEqual(r.body.version, 2);
    r = await get(depot); assert.strictEqual(r.body.version, 2);
  });

  await test("it is kept across devices: a second sign in of the same account sees it", async () => {
    const a = await login("depotnord", "depot"); await post(a, 2);
    const b = await login("depotnord", "depot");
    assert.strictEqual((await get(b)).body.version, 2);
  });

  await test("it only goes up, and nonsense is ignored", async () => {
    const depot = await login("depotnord", "depot");
    await post(depot, 3);
    for (const bad of [1, 0, -4, "abc", null, 2.5e9, {}]) {
      const r = await post(depot, bad); assert.strictEqual(r.statusCode, 200);
      assert.strictEqual(r.body.version, 3, "after posting " + JSON.stringify(bad));
    }
    assert.strictEqual((await post(depot, 4)).body.version, 4);
  });

  await test("each account has its own number", async () => {
    const depot = await login("depotnord", "depot"); const admin = await login("logistic", "admin");
    await post(depot, 2);
    assert.strictEqual((await get(admin)).body.version, 0);
    await post(admin, 1);
    assert.strictEqual((await get(depot)).body.version, 2);
    assert.strictEqual((await get(admin)).body.version, 1);
  });

  await test("not signed in: refused", async () => {
    const anon = H.browser();
    assert.strictEqual((await get(anon)).statusCode, 401);
    assert.strictEqual((await post(anon, 2)).statusCode, 401);
  });

  let fail = 0;
  results.forEach((r) => { if (r[0]) console.log("  ok    " + r[1]); else { fail++; console.log("  FAIL  " + r[1] + "\n        " + (r[2] && r[2].stack || r[2])); } });
  console.log(results.length - fail + "/" + results.length + " passed");
  process.exit(fail ? 1 : 0);
})();
