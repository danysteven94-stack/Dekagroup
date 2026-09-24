"use strict";
// Runs every test suite on both storage backends.   node tests/run-all.js   (or: npm test)
const { spawnSync } = require("child_process");
const path = require("path");

const runs = [
  ["security (Redis)", "security.test.js", {}],
  ["browser app (Redis)", "client.e2e.js", {}],
  ["security (PostgreSQL layer)", "security.test.js", { TEST_BACKEND: "pg" }],
  ["browser app (PostgreSQL layer)", "client.e2e.js", { TEST_BACKEND: "pg" }],
  ["accounts (Redis users)", "accounts.test.js", {}],
  ["accounts (PostgreSQL users)", "accounts.test.js", { TEST_BACKEND: "pg" }],
  ["email (Redis)", "email.test.js", {}],
  ["email (PostgreSQL layer)", "email.test.js", { TEST_BACKEND: "pg" }],
  ["database layer", "db.test.js", {}],
  ["archive + scan (Redis)", "archive.server.test.js", {}],
  ["archive + scan (PostgreSQL layer)", "archive.server.test.js", { TEST_BACKEND: "pg" }],
  ["archive (browser logic)", "archive.client.test.mjs", {}],
];
let bad = 0;
runs.forEach(function (r) {
  const p = spawnSync(process.execPath, ["--no-warnings", path.join(__dirname, r[1])], { env: Object.assign({}, process.env, r[2]), encoding: "utf8" });
  const last = (p.stdout || "").trim().split("\n").filter(function (l) { return /passed/.test(l); }).pop() || "no result";
  console.log((p.status === 0 ? "OK   " : "FAIL ") + r[0].padEnd(34) + last);
  if (p.status !== 0) { bad++; console.log(p.stdout.split("\n").filter(function (l) { return /FAIL|Error|at /.test(l); }).slice(0, 12).join("\n")); }
});
process.exit(bad ? 1 : 0);
