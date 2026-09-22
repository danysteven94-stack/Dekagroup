"use strict";
// Bundles the browser app (public/js, native ES modules) into one script so tests can run it in a fake DOM.
const fs = require("fs");
const path = require("path");

function loadEsbuild() {
  const tries = [() => require("esbuild"), () => require(process.env.ESBUILD_MODULE || "/nonexistent")];
  for (const t of tries) { try { return t(); } catch (e) { /* try next */ } }
  throw new Error("esbuild not found: run `npm install` (or set ESBUILD_MODULE to its path)");
}

const root = path.join(__dirname, "..", "public");

function bundleClient() {
  const r = loadEsbuild().buildSync({ entryPoints: [path.join(root, "js", "main.js")], bundle: true, format: "iife", platform: "browser", write: false, logLevel: "silent" });
  return r.outputFiles[0].text;
}

// every source file of the browser app (for "no secrets in the page code" checks)
function clientSources() {
  const out = [fs.readFileSync(path.join(root, "index.html"), "utf8")];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (/\.(js|css|html)$/.test(e.name)) out.push(fs.readFileSync(p, "utf8"));
    });
  })(path.join(root, "js"));
  return out.join("\n");
}

module.exports = { bundleClient, clientSources };
