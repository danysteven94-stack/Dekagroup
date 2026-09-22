#!/usr/bin/env node
"use strict";
// Post-deployment smoke test: checks that a deployed URL is healthy AND still secure.
//     node tools/smoke.js https://your-app.vercel.app
// Exit code 1 if anything is wrong (the GitHub workflow then turns red and you get an e-mail).

const base = (process.argv[2] || "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node tools/smoke.js https://your-app.vercel.app");
  process.exit(2);
}

const results = [];
async function check(name, fn) {
  try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e.message]); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };

(async () => {
  let html = "", headers = {};

  await check("home page answers 200 with the security headers", async () => {
    const r = await fetch(base + "/", { redirect: "manual" });
    ok(r.status === 200, "GET / -> " + r.status);
    headers = Object.fromEntries(r.headers.entries());
    html = await r.text();
    ok(/content-security-policy/.test(Object.keys(headers).join(",")), "no Content-Security-Policy header");
    ok(headers["x-content-type-options"] === "nosniff", "X-Content-Type-Options missing");
    ok(headers["x-frame-options"] === "DENY", "X-Frame-Options missing");
    ok(headers["referrer-policy"], "Referrer-Policy missing");
    if (base.startsWith("https://")) ok(headers["strict-transport-security"], "HSTS missing");
  });

  await check("the CSP allows no inline script at all (the app is plain ES module files)", async () => {
    const csp = headers["content-security-policy"] || "";
    ok(/script-src[^;]*'self'/.test(csp), "script-src 'self' missing from the CSP");
    ok(!/script-src[^;]*(unsafe-inline|sha256-|nonce-)/.test(csp), "the CSP still allows inline scripts (script-src should be only 'self')");
    ok(!/<script(\s[^>]*)?>[^<]/.test(html.replace(/<script[^>]*\/>/g, "")), "the page has an inline script body");
  });

  await check("session endpoint says 'not logged in' and is never cached", async () => {
    const r = await fetch(base + "/api/auth/me");
    ok(r.status === 200, "/api/auth/me -> " + r.status);
    const j = await r.json();
    ok(j.authenticated === false, "expected authenticated:false");
    ok(/no-store/.test(r.headers.get("cache-control") || ""), "Cache-Control: no-store missing on the API");
  });

  await check("data and admin endpoints refuse anonymous visitors", async () => {
    for (const p of ["/api/data", "/api/audit", "/api/backup", "/api/health", "/api/daily", "/api/users", "/api/email"]) {
      const r = await fetch(base + p);
      ok(r.status === 401, p + " -> " + r.status + " (expected 401)");
    }
  });

  await check("a login attempt without the site's Origin header is refused (CSRF protection)", async () => {
    const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "x", password: "y" }) });
    ok(r.status === 403, "POST /api/auth/login without Origin -> " + r.status + " (expected 403)");
  });

  await check("source code, tests and configuration are NOT downloadable", async () => {
    for (const p of ["/package.json", "/vercel.json", "/SEKIRITE.md", "/DEPLOY.md", "/tests/security.test.js", "/api/_lib/auth.js", "/.vercelignore", "/.github/workflows/ci.yml"]) {
      const r = await fetch(base + p);
      ok(r.status === 404, p + " -> " + r.status + " (expected 404)");
    }
  });

  await check("service worker and manifest are served", async () => {
    const sw = await fetch(base + "/sw.js");
    ok(sw.status === 200, "/sw.js -> " + sw.status);
    ok(/no-cache|max-age=0/.test(sw.headers.get("cache-control") || ""), "sw.js must not be cached for long");
    const mf = await fetch(base + "/manifest.json");
    ok(mf.status === 200, "/manifest.json -> " + mf.status);
  });

  const bad = results.filter((r) => !r[0]);
  results.forEach((r) => console.log((r[0] ? "  PASS  " : "  FAIL  ") + r[1] + (r[0] ? "" : "\n        " + r[2])));
  console.log("\n" + (results.length - bad.length) + "/" + results.length + " passed  (" + base + ")");
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
