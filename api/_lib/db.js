"use strict";
// PostgreSQL access (Neon / Vercel Postgres). Active only when DATABASE_URL (or POSTGRES_URL) is set.
// Without it the app keeps using the legacy Redis storage, so deploying before the database exists breaks nothing.
//
// Multi-division support: some divisions must never share a database with the others (see _lib/divisions.js).
// Each "pool" is a separate physical database, chosen with a named environment variable. "default" is the
// original DATABASE_URL / POSTGRES_URL, kept for full backward compatibility with existing deployments.
//
// A "driver" is { dialect, query(sql, params) -> rows, tx(fn, opts) } where fn receives a query function bound to one transaction.
// Tests plug an SQLite driver through setDriver() (one driver stands in for every pool).

const POOL_ENV = {
  default: ["DATABASE_URL", "POSTGRES_URL"],
  acs: ["DATABASE_URL_ACS"],
  mikado: ["DATABASE_URL_MIKADO"],
  lacollection: ["DATABASE_URL_LACOLLECTION"],
  dekatires: ["DATABASE_URL_DEKATIRES"],
};

let injected;
const pools = {}; // poolKey -> { url, driver }

function envUrlFor(poolKey) {
  const names = POOL_ENV[poolKey] || POOL_ENV.default;
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return "";
}

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

// poolKey defaults to "default" (the original single-database behaviour). Pass a division's pool
// key (see _lib/divisions.js) to reach its own separate database.
function getDriver(poolKey) {
  const key = poolKey || "default";
  if (injected !== undefined) return injected;
  const url = envUrlFor(key);
  if (!url) return null;
  const cur = pools[key];
  if (!cur || cur.url !== url) {
    pools[key] = { url: url, driver: makePgDriver(url) };
  }
  return pools[key].driver;
}

// Which pools currently have a database configured (used by health checks / diagnostics only).
function configuredPools() {
  return Object.keys(POOL_ENV).filter(function (k) { return !!envUrlFor(k); });
}

// Portable DDL (same statements run on PostgreSQL in production and on SQLite in the tests).
const SCHEMA_VERSION = 10;
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
  // Existing deployments already had a "containers" table before "chofer" (driver name) existed; add it if missing.
  "ALTER TABLE containers ADD COLUMN IF NOT EXISTS chofer TEXT",
  // Truck licence plate that carried the container out (archive).
  "ALTER TABLE containers ADD COLUMN IF NOT EXISTS plak TEXT",
  "CREATE TABLE IF NOT EXISTS users (" +
    "username TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, pass_hash TEXT NOT NULL, " +
    "active INTEGER NOT NULL DEFAULT 1, email TEXT, must_change INTEGER NOT NULL DEFAULT 1, " +
    "totp_secret TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0, totp_last BIGINT NOT NULL DEFAULT 0, recovery TEXT NOT NULL DEFAULT '[]', " +
    "created_by TEXT, created_at TEXT NOT NULL, last_login_at TEXT, pass_changed_at TEXT, updated_at TEXT NOT NULL)",
  // Existing deployments already had a "users" table before "email" existed; add it if missing (no-op otherwise).
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT",
  // Which divisions (see _lib/divisions.js) a personal account may work in. Accounts always live in the
  // "default" database only, even though the divisions they list may point at other pools.
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS divisions TEXT NOT NULL DEFAULT '[]'",
  // Truck licence plate for a driver (role "chofe"); auto-filled onto a container when that driver confirms departure.
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS plate TEXT",
  // Trucking company a driver works for (CFC, CTSA, MAD, DKN 001...); stamped onto every container he takes or sends out.
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS trucking TEXT",
  // Stock entries ("Antre Estòk"): goods registered into the depot, always tied to a Bill.
  "CREATE TABLE IF NOT EXISTS stock_entries (" +
    "id TEXT PRIMARY KEY, bill_id TEXT NOT NULL, entry_date TEXT NOT NULL, description TEXT NOT NULL, " +
    "quantity TEXT, unit TEXT, container_numewo TEXT, remarks TEXT, registered_by TEXT, " +
    "created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS stock_entries_bill_idx ON stock_entries (bill_id)",
  // Invoices ("Fakti"): registered as a draft ("anrejistre") against a Bill, then locked ("fini").
  "CREATE TABLE IF NOT EXISTS invoices (" +
    "id TEXT PRIMARY KEY, bill_id TEXT NOT NULL, invoice_number TEXT NOT NULL, invoice_date TEXT NOT NULL, " +
    "due_date TEXT, client_name TEXT, client_address TEXT, items TEXT NOT NULL, notes TEXT, " +
    "status TEXT NOT NULL DEFAULT 'anrejistre', created_by TEXT, created_at TEXT NOT NULL, " +
    "finished_by TEXT, finished_at TEXT)",
  "CREATE INDEX IF NOT EXISTS invoices_bill_idx ON invoices (bill_id)",
  "CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status)",
  // Goods incidents ("Machandiz Retounen" / "Machandiz Avarye" / "Livrezon"): returned goods, damaged goods,
  // or a delivery, tied to a Bill only. container_numewo is a legacy column, no longer written to.
  "CREATE TABLE IF NOT EXISTS goods_incidents (" +
    "id TEXT PRIMARY KEY, kind TEXT NOT NULL, bill_id TEXT NOT NULL, entry_date TEXT NOT NULL, " +
    "description TEXT NOT NULL, quantity TEXT, unit TEXT, container_numewo TEXT, reason TEXT, remarks TEXT, " +
    "registered_by TEXT, created_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS goods_incidents_bill_idx ON goods_incidents (bill_id)",
  "CREATE INDEX IF NOT EXISTS goods_incidents_kind_idx ON goods_incidents (kind)",
  "INSERT INTO meta (name, value) VALUES ('rev', 0) ON CONFLICT (name) DO NOTHING",
  "INSERT INTO meta (name, value) VALUES ('migrated', 0) ON CONFLICT (name) DO NOTHING",
];

module.exports = { setDriver, getDriver, configuredPools, DDL, SCHEMA_VERSION };
