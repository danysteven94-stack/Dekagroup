#!/usr/bin/env node
"use strict";
// Usage:  node tools/hash-password.js "the-new-password"
// Prints the value to put in the AUTH_<ROLE>_HASH environment variable on Vercel.
const crypto = require("crypto");

const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error('Usage: node tools/hash-password.js "password-of-at-least-10-characters"');
  process.exit(1);
}
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(pw, salt, 64);
console.log("scrypt:" + salt.toString("hex") + ":" + hash.toString("hex"));
