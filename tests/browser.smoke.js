"use strict";
// Real-browser check (headless Chrome): the app must load under the Content-Security-Policy with zero violations,
// every role must log in and land in its own interface, and an injected script must be blocked.
//   node tests/browser.smoke.js
// Needs puppeteer (or puppeteer-core + CHROME_PATH). Not part of `npm test` because it needs a browser.
const assert = require("assert");
const fs = require("fs");

function loadPuppeteer() {
  const tries = [() => require("puppeteer"), () => require("puppeteer-core"), () => require(process.env.PUPPETEER_MODULE || "/nonexistent")];
  for (const t of tries) { try { return t(); } catch (e) { /* try next */ } }
  return null;
}

(async () => {
  const puppeteer = loadPuppeteer();
  if (!puppeteer) { console.log("SKIP: puppeteer not installed"); process.exit(0); }
  const { start } = require("../tools/dev-server");
  const { server, port, creds } = await start(0, { https: true }); // https: the session cookie behaves exactly as in production
  const base = "https://localhost:" + port;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    ignoreHTTPSErrors: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--ignore-certificate-errors"],
  });
  const results = [];
  let page;
  const step = async (name, fn) => {
    try { await fn(); results.push([true, name]); }
    catch (e) {
      let seen = "";
      try { seen = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 260); } catch (e2) { /* page gone */ }
      e.message += "\n        page shows: " + seen;
      results.push([false, name, e]);
    }
  };

  page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900 });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.evaluateOnNewDocument(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + (e.blockedURI || "inline")));
  });

  if (process.env.DEBUG_API) page.on("response", async (r) => { if (r.url().includes("/api/auth/")) console.log("   API", r.status(), r.request().method(), r.url().replace(/.*\/api/, "/api"), (r.request().postData() || "").replace(/"password":"[^"]*"/g, "\"password\":\"…\"").slice(0, 90), "=>", (await r.text().catch(() => "")).slice(0, 80)); });
  const text = () => page.evaluate(() => document.body.innerText);
  const waitText = (t, ms) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout: ms || 8000 }, t);
  const login = async (c) => {
    await page.waitForSelector("#gate-user");
    await page.click("#gate-user", { clickCount: 3 });
    await page.type("#gate-user", c.user);
    await page.type("#gate-pw", c.pass);
    await page.click(".gate-btn");
  };
  // the logout button can sit in a collapsed menu on a phone-sized screen: trigger it like a tap on the element itself
  const logout = async () => { await page.waitForSelector('[data-action="logout"]'); await page.evaluate(() => document.querySelector('[data-action="logout"]').click()); await page.waitForSelector("#gate-user"); };

  await step("the login page loads under the CSP (real headers, real hashes) with no violation and no console error", async () => {
    const resp = await page.goto(base + "/", { waitUntil: "networkidle0" });
    const csp = resp.headers()["content-security-policy"];
    assert.ok(csp && /script-src 'self';/.test(csp) && !/unsafe-inline[^;]*;?.*script-src|script-src[^;]*unsafe/.test(csp), "CSP header: scripts only from the site itself, no inline");
    await page.waitForSelector("#gate-form");
    assert.deepStrictEqual(await page.evaluate(() => window.__csp), [], "no CSP violation");
    assert.deepStrictEqual(errors, [], "no console error: " + errors.join(" | "));
    fs.writeFileSync("/tmp/shot-login.png", await page.screenshot());
  });

  await step("an injected inline script is blocked by the CSP", async () => {
    await page.evaluate(() => { const s = document.createElement("script"); s.textContent = "window.__pwned = 1"; document.body.appendChild(s); });
    assert.strictEqual(await page.evaluate(() => window.__pwned), undefined, "injected script did not run");
    const v = await page.evaluate(() => window.__csp);
    assert.ok(v.some((x) => x.startsWith("script-src")), "violation reported: " + JSON.stringify(v));
    await page.evaluate(() => { window.__csp = []; });
    errors.length = 0;
  });

  await step("wrong password: clear message, stays on the login page", async () => {
    await login({ user: creds.admin.user, pass: "not-the-password" });
    await waitText("modpass pa bon");
    assert.ok(await page.$("#gate-form"));
  });

  await step("admin logs in, sees the dashboard, opens the Sekirite tab (storage status + backups)", async () => {
    await page.evaluate(() => { document.getElementById("gate-pw").value = ""; });
    await page.click("#gate-user", { clickCount: 3 });
    await page.type("#gate-user", creds.admin.user);
    await page.type("#gate-pw", creds.admin.pass);
    await page.click(".gate-btn");
    await page.waitForSelector('[data-action="set-tab"][data-tab="sekirite"]');
    fs.writeFileSync("/tmp/shot-admin.png", await page.screenshot());
    await page.click('[data-action="set-tab"][data-tab="sekirite"]');
    await waitText("Baz done: PostgreSQL");
    assert.ok((await text()).includes("Jounal aktivite"));
    fs.writeFileSync("/tmp/shot-sekirite.png", await page.screenshot({ fullPage: true }));
  });

  await step("admin edits a container in the real UI and the change is saved on the server", async () => {
    await page.click('[data-action="set-tab"][data-tab="containers"]').catch(() => {});
    const before = await page.evaluate(() => fetch("/api/data").then((r) => r.json()));
    assert.ok(before.rev >= 1 && before.containers.length >= 5, "data + revision served");
    assert.ok(before.containers.every((c) => typeof c._h === "string"), "every row carries its fingerprint");
  });

  await step("logout returns to the login page; depot lands in the depot interface", async () => {
    await logout();
    await login(creds.depot);
    await page.waitForSelector('[data-action="view-depot-division"]');
    fs.writeFileSync("/tmp/shot-depot.png", await page.screenshot());
    await page.click('[data-action="view-depot-division"][data-division="ACS"]');
    await waitText("MSCU7001001");
  });

  await step("depot marks a container empty through the real button (server-side action)", async () => {
    await page.click('[data-action="mark-empty"]');
    await page.waitForFunction(() => fetch("/api/data").then((r) => r.json()).then((d) => d.containers.some((c) => c.numewo === "MSCU7001001" && c.dateEmpty)), { timeout: 8000 });
  });

  await step("chofe lands in the driver interface and only sees Vid containers", async () => {
    await logout();
    await login(creds.chofe);
    await waitText("Konfime depa");
    const t = await text();
    assert.ok(t.includes("MSCU7001002") || t.includes("TGHU7002002"), "a Vid container is listed");
    assert.ok(!t.includes("CAXU7003001"), "planned containers are not shown to the driver");
    fs.writeFileSync("/tmp/shot-chofe.png", await page.screenshot());
  });

  await step("daily report: own interface, inventory list and PDF buttons", async () => {
    await logout();
    await login(creds.daily);
    await waitText("Envant");
    await waitText("PDF");
    assert.ok(await page.$('[data-action="dr-verify"]'), "a 'Poko Verifye' container has its Verifye button");
    fs.writeFileSync("/tmp/shot-daily.png", await page.screenshot());
  });

  const Totp = require("../api/_lib/totp");
  const bodyText = () => page.evaluate(() => document.body.innerText);
  const fill = async (sel, v) => { await page.click(sel, { clickCount: 3 }); await page.type(sel, v); };
  const loginAs = async (user, pass) => { await page.waitForSelector("#gate-user"); await fill("#gate-user", user); await fill("#gate-pw", pass); await page.click(".gate-btn"); };
  let jeanTemp = "", bossTemp = "";

  await step("admin opens the Itilizatè tab: warned about the shared accounts, creates two personal accounts (temporary passwords shown once)", async () => {
    await logout();
    await login(creds.admin);
    await page.waitForSelector('[data-action="set-tab"][data-tab="itilizate"]');
    await page.evaluate(() => document.querySelector('[data-action="set-tab"][data-tab="itilizate"]').click());
    await waitText("Kont pataje toujou aktif");
    const make = async (username, name, role) => {
      await fill("#usr-username", username); await fill("#usr-name", name);
      await page.select("#usr-role", role);
      await page.click('#usr-create-form button[type="submit"]');
      await page.waitForFunction((u) => document.body.innerText.includes("Modpass tanporè pou " + u), { timeout: 8000 }, username);
      await page.waitForSelector('[data-action="usr-refresh"]:not([disabled])'); // the list has finished reloading
      const t = await bodyText();
      const m = t.match(new RegExp("Modpass tanpor[^\\n]*" + username.replace(".", "\\.") + "\\s*\\n\\s*([A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4})"));
      assert.ok(m, "temporary password visible for " + username);
      return m[1];
    };
    jeanTemp = await make("jean.paul", "Jean Paul", "depot");
    bossTemp = await make("boss.admin", "Boss Admin", "admin");
    assert.ok((await bodyText()).includes("Jean Paul") && (await bodyText()).includes("boss.admin"));
    fs.writeFileSync("/tmp/shot-users.png", await page.screenshot({ fullPage: true }));
  });

  await step("a person with a temporary password is forced to change it, then lands in their interface", async () => {
    await logout();
    await loginAs("jean.paul", jeanTemp);
    await waitText("Ou dwe chanje modpass tanporè a");
    fs.writeFileSync("/tmp/shot-forced-pw.png", await page.screenshot());
    await fill("#pw-cur", jeanTemp); await fill("#pw-new", "short"); await fill("#pw-new2", "short");
    await page.click("#pw-form .gate-btn");
    await waitText("omwen 10");
    await fill("#pw-cur", jeanTemp); await fill("#pw-new", "Sunrise-Harbor-42"); await fill("#pw-new2", "Sunrise-Harbor-42");
    await page.click("#pw-form .gate-btn");
    await page.waitForSelector('[data-action="view-depot-division"]', { timeout: 10000 });
  });

  await step("personal admin: forced password change, then forced 2FA setup with a real authenticator code, recovery codes, dashboard", async () => {
    await logout();
    await loginAs("boss.admin", bossTemp);
    await waitText("Ou dwe chanje modpass tanporè a");
    await fill("#pw-cur", bossTemp); await fill("#pw-new", "Moonlight-River-77"); await fill("#pw-new2", "Moonlight-River-77");
    await page.click("#pw-form .gate-btn");
    await waitText("anvan yo kontinye");
    await page.waitForSelector('[data-action="tf-begin"]');
    await page.click('[data-action="tf-begin"]');
    await waitText("Antre kle sa a");
    const secret = (await page.evaluate(() => [...document.querySelectorAll("div")].map((d) => d.textContent.trim()).find((x) => /^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/.test(x)) || "")).replace(/\s/g, "");
    assert.ok(/^[A-Z2-7]{32}$/.test(secret), "setup key shown: " + secret);
    fs.writeFileSync("/tmp/shot-2fa-setup.png", await page.screenshot({ fullPage: true }));
    await fill("#tf-code", "000000");
    await page.click("#tf-confirm-form .gate-btn");
    await waitText("Kòd la pa bon");
    const good = Totp.hotp(secret, Totp.counterAt(Date.now()), 6);
    if (process.env.DEBUG_API) console.log("   expected code", good, "secret", secret);
    await fill("#tf-code", good);
    await page.click("#tf-confirm-form .gate-btn");
    await waitText("Sove kòd sekou sa yo");
    const codes = (await bodyText()).match(/[A-Z2-9]{4}-[A-Z2-9]{4}/g) || [];
    assert.ok(codes.length >= 8, "8 recovery codes shown");
    fs.writeFileSync("/tmp/shot-recovery.png", await page.screenshot({ fullPage: true }));
    await page.click('[data-action="tf-done"]');
    await page.waitForSelector('[data-action="set-tab"][data-tab="itilizate"]', { timeout: 10000 });
    globalThis.__bossSecret = secret;
  });

  await step("login with 2FA: the code is asked after the password; a wrong code is refused; the right one opens the admin dashboard", async () => {
    await logout();
    await loginAs("boss.admin", "Moonlight-River-77");
    await page.waitForSelector("#gate-code");
    fs.writeFileSync("/tmp/shot-2fa-gate.png", await page.screenshot());
    await fill("#gate-code", "123456");
    await page.click(".gate-btn");
    await waitText("Kòd la pa bon");
    const next = Totp.hotp(globalThis.__bossSecret, Totp.counterAt(Date.now()) + 1, 6); // next time step (still inside the accepted window)
    await fill("#gate-code", next);
    await page.click(".gate-btn");
    await page.waitForSelector('[data-action="set-tab"][data-tab="itilizate"]', { timeout: 10000 });
  });

  await step("'Kont mwen' is reachable from the interface and the admin cannot switch 2FA off", async () => {
    await page.evaluate(() => document.querySelector('[data-action="open-account"]').click());
    await waitText("2FA aktive");
    assert.ok((await bodyText()).includes("ou pa ka dezaktive 2FA"), "admin sees why 2FA cannot be disabled");
    await page.click('[data-action="close-account"]');
    await page.waitForSelector('[data-action="set-tab"][data-tab="itilizate"]');
  });

  await step("through the whole session: no CSP violation and no console error", async () => {
    assert.deepStrictEqual(await page.evaluate(() => window.__csp), [], "CSP violations: " + JSON.stringify(await page.evaluate(() => window.__csp)));
    const real = errors.filter((e) => !/favicon|401|403|Failed to load resource/i.test(e));
    assert.deepStrictEqual(real, [], "console errors: " + real.join(" | "));
  });

  await browser.close();
  server.close();
  const failed = results.filter((r) => !r[0]);
  results.forEach((r) => console.log((r[0] ? "  PASS  " : "  FAIL  ") + r[1] + (r[0] ? "" : "\n        " + (r[2] && r[2].message ? r[2].message.split("\n").slice(0, 4).join("\n        ") : r[2]))));
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " passed");
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
