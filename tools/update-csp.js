#!/usr/bin/env node
"use strict";
// Rebuilds vercel.json (security headers + Content-Security-Policy) from index.html.
//
// The CSP only allows the exact inline scripts that are in index.html (by SHA-256 hash), so an injected script
// cannot run. THE HASHES CHANGE EVERY TIME index.html CHANGES: run this after every edit of index.html:
//     node tools/update-csp.js          (rewrites vercel.json)
//     node tools/update-csp.js --check  (only verifies, exit code 1 when vercel.json is out of date)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

// The HTML parser turns CRLF into LF before the browser hashes the script text, so do the same here.
const scripts = [];
const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(html))) {
  const attrs = m[1] || "";
  if (/\ssrc\s*=/i.test(attrs)) continue; // external scripts are covered by 'self'
  scripts.push(m[2].replace(/\r\n?/g, "\n"));
}
const hashes = scripts.map(function (s) {
  return "'sha256-" + crypto.createHash("sha256").update(s, "utf8").digest("base64") + "'";
});

const csp = [
  "default-src 'self'",
  "script-src 'self' " + hashes.join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const config = {
  headers: [
    {
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    },
    { source: "/api/(.*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
    { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
  ],
};

const out = JSON.stringify(config, null, 2) + "\n";
const file = path.join(root, "vercel.json");

if (process.argv.includes("--check")) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (cur !== out) {
    console.error("vercel.json is OUT OF DATE (index.html changed). Run: node tools/update-csp.js");
    process.exit(1);
  }
  console.log("vercel.json is up to date (" + hashes.length + " inline scripts allowed).");
} else {
  fs.writeFileSync(file, out);
  console.log("vercel.json written (" + hashes.length + " inline scripts allowed).");
}
