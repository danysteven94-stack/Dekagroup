"use strict";
// PostgreSQL access (Neon / Vercel Postgres). Active only when DATABASE_URL (or POSTGRES_URL) is set.
// Without it the app keeps using the legacy Redis storage, so deploying before the database exists breaks nothing.
//
// A "driver" is { dialect, query(sql, params) -> rows, tx(fn, opts) } where fn receives a query function bound to one transaction.
// Tests plug an SQLite driver through setDriver().

let injected;
let pgDriver = null;
let pgUrl = "";

function makePgDriver(url) {
  const { Pool } = require("pg");
  // One connection per serverless instance: the Neon pooler (host with "-pooler") multiplexes them.
  const pool = new Pool({ connectionString: url, max: 1, idleTimeoutMillis: 10000, connectionTimeoutMillis: 8000 });
  pool.on("error", function (e) { console.error("pg pool error:", e && e.message); });
  return {
    dialect: "pg",
    async query(sql, params) {
      const r = await pool.query(sql, params || []);
      return r.rows;
    },
    async tx(fn, opts) {
      const c = await pool.connect();
      try {
        await c.query(opts && opts.readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
        const out = await fn(async function (sql, params) {
          const r = await c.query(sql, params || []);
          return r.rows;
        });
        await c.query("COMMIT");
        return out;
      } catch (e) {
        try { await c.query("ROLLBACK"); } catch (e2) { /* connection already broken */ }
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

function setDriver(d) {
  injected = d;
}

function getDriver() {
  if (injected !== undefined) return injected;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  if (!url) return null;
  if (!pgDriver || pgUrl !== url) {
    pgDriver = makePgDriver(url);
    pgUrl = url;
  }
  return pgDriver;
}

// Portable DDL (same statements run on PostgreSQL in production and on SQLite in the tests).
const SCHEMA_VERSION = 1;
const DDL = [
  "CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, value BIGINT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS bills (" +
    "id TEXT PRIMARY KEY, numewo TEXT NOT NULL, product TEXT, completed_at TEXT, extra TEXT NOT NULL DEFAULT '{}', " +
    "ord BIGINT NOT NULL, rev BIGINT NOT NULL, writer TEXT, deleted INTEGER NOT NULL DEFAULT 0, " +
    "created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS containers (" +
    "id TEXT PRIMARY KEY, numewo TEXT NOT NULL, bill_id TEXT, size TEXT NOT NULL DEFAULT '', division TEXT, " +
    "date_entered TEXT, date_expected TEXT, date_verified TEXT, depo TEXT, trucking TEXT, date_empty TEXT, date_left TEXT, " +
    "extra TEXT NOT NULL DEFAULT '{}', ord BIGINT NOT NULL, rev BIGINT NOT NULL, writer TEXT, deleted INTEGER NOT NULL DEFAULT 0, " +
    "created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS containers_bill_idx ON containers (bill_id)",
  "CREATE INDEX IF NOT EXISTS containers_numewo_idx ON containers (numewo)",
  "CREATE TABLE IF NOT EXISTS notifications (" +
    "id TEXT PRIMARY KEY, seq BIGINT NOT NULL, bill_numewo TEXT NOT NULL DEFAULT '', notif_date TEXT, message TEXT NOT NULL, " +
    "extra TEXT NOT NULL DEFAULT '{}', rev BIGINT NOT NULL, writer TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS notifications_seq_idx ON notifications (seq)",
  "CREATE TABLE IF NOT EXISTS inventory_checks (container_id TEXT PRIMARY KEY, checked_on TEXT NOT NULL, rev BIGINT NOT NULL, writer TEXT)",
  "INSERT INTO meta (name, value) VALUES ('rev', 0) ON CONFLICT (name) DO NOTHING",
  "INSERT INTO meta (name, value) VALUES ('migrated', 0) ON CONFLICT (name) DO NOTHING",
];

module.exports = { setDriver, getDriver, DDL, SCHEMA_VERSION };
