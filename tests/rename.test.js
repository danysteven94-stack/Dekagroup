"use strict";
// DEKA TIRES was renamed MOBILITY: what is already stored follows the new name. Run:  node tests/rename.test.js
const assert = require("assert");
const DB = require("../api/_lib/db");
const { makeSqliteDriver } = require("./sqlite-driver");

const results = [];
async function test(name, fn) { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); } }
const MIGRATION = DB.DDL.filter((s) => /^(UPDATE (meta|containers|lg_bills|delivery_slips|users))/.test(s));

async function fresh() {
  const d = makeSqliteDriver();
  for (const sql of DB.DDL) await d.query(sql); // a database as the new code creates it (the rename statements find nothing yet)
  const c = (id, num, division) => d.query("INSERT INTO containers (id, numewo, bill_id, size, division, ord, rev) VALUES ($1,$2,'b1','40',$3,1,5)", [id, num, division]);
  await c("c1", "AAAA0000001", "DEKA TIRES"); await c("c2", "AAAA0000002", "MOBILITY"); await c("c3", "AAAA0000003", "ACS");
  await d.query("UPDATE meta SET value = 5 WHERE name = 'rev'");
  await d.query("INSERT INTO users (username, name, role, pass_hash, divisions, created_at, updated_at) VALUES ('u1','U','depot','x','[\"ACS\",\"DEKA TIRES\"]','t','t')");
  await d.query("INSERT INTO users (username, name, role, pass_hash, divisions, created_at, updated_at) VALUES ('u2','V','depot','x','[\"ACS\"]','t','t')");
  await d.query("INSERT INTO lg_bills (id, division, numewo, created_at, updated_at) VALUES ('l1','DEKA TIRES','N-1','t','t')");
  await d.query("INSERT INTO lg_bills (id, division, numewo, created_at, updated_at) VALUES ('l2','DEKA TIRES','N-2','t','t')");
  await d.query("INSERT INTO lg_bills (id, division, numewo, created_at, updated_at) VALUES ('l3','MOBILITY','N-2','t','t')");
  await d.query("INSERT INTO delivery_slips (id, division, slip_date, client_name, items, created_at) VALUES ('s1','DEKA TIRES','2026-10-01','K','[]','t')");
  return d;
}
const run = async (d) => { for (const sql of MIGRATION) await d.query(sql); };

(async () => {
  assert.strictEqual(MIGRATION.length, 5, "the five rename statements are in the schema");

  await test("containers: renamed, stamped with a newer revision, others untouched", async () => {
    const d = await fresh(); await run(d);
    const rows = await d.query("SELECT id, division, rev FROM containers ORDER BY id");
    assert.deepStrictEqual(rows.map((r) => r.division), ["MOBILITY", "MOBILITY", "ACS"]);
    assert.strictEqual(Number(rows[0].rev), 6); assert.strictEqual(Number(rows[1].rev), 5);
    assert.strictEqual(Number((await d.query("SELECT value FROM meta WHERE name='rev'"))[0].value), 6);
  });

  await test("no DEKA TIRES container: the data revision does not move", async () => {
    const d = await fresh(); await run(d); await run(d); // second run: nothing left to rename
    assert.strictEqual(Number((await d.query("SELECT value FROM meta WHERE name='rev'"))[0].value), 6);
  });

  await test("accounts: the division is renamed inside the list, other divisions kept", async () => {
    const d = await fresh(); await run(d);
    const u = await d.query("SELECT username, divisions FROM users ORDER BY username");
    assert.deepStrictEqual(u.map((r) => JSON.parse(r.divisions)), [["ACS", "MOBILITY"], ["ACS"]]);
  });

  await test("Logistique Deka bills and delivery slips follow; a bill number already in MOBILITY is not duplicated", async () => {
    const d = await fresh(); await run(d);
    const b = await d.query("SELECT id, division FROM lg_bills ORDER BY id");
    assert.deepStrictEqual(b.map((r) => r.division), ["MOBILITY", "DEKA TIRES", "MOBILITY"]);
    assert.strictEqual((await d.query("SELECT division FROM delivery_slips"))[0].division, "MOBILITY");
  });

  let fail = 0;
  results.forEach((r) => { if (r[0]) console.log("  ok    " + r[1]); else { fail++; console.log("  FAIL  " + r[1] + "\n        " + (r[2] && r[2].stack || r[2])); } });
  console.log(results.length - fail + "/" + results.length + " passed");
  process.exit(fail ? 1 : 0);
})();
