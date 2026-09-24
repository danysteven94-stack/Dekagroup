"use strict";
// Test-only "database driver" backed by SQLite (node:sqlite), same interface as the PostgreSQL driver in api/_lib/db.js.
// It lets the whole relational layer run in the tests without a PostgreSQL server.
// Writers are serialised like PostgreSQL row locks would do (one transaction at a time).
const { DatabaseSync } = require("node:sqlite");

function makeSqliteDriver() {
  const db = new DatabaseSync(":memory:");
  let chain = Promise.resolve();
  const toSqlite = (sql) => sql.replace(/\$(\d+)/g, "?$1");
  const run = (sql, params) => {
    // SQLite has no "ADD COLUMN IF NOT EXISTS": drop the clause and ignore "duplicate column name".
    if (/^\s*alter\s+table\s+\w+\s+add\s+column\s+if\s+not\s+exists/i.test(sql)) {
      try { db.exec(sql.replace(/if\s+not\s+exists\s+/i, "")); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
      return [];
    }
    const st = db.prepare(toSqlite(sql));
    const reads = /^\s*(select|with)\b/i.test(sql) || /\breturning\b/i.test(sql);
    if (reads) return st.all(...(params || [])).map((r) => Object.assign({}, r));
    st.run(...(params || []));
    return [];
  };
  return {
    dialect: "sqlite",
    db,
    async query(sql, params) { return run(sql, params); },
    async tx(fn, opts) {
      const before = chain;
      let release;
      chain = new Promise((r) => { release = r; });
      await before;
      try {
        db.exec("BEGIN");
        const out = await fn(async (sql, params) => run(sql, params));
        db.exec("COMMIT");
        return out;
      } catch (e) {
        try { db.exec("ROLLBACK"); } catch (e2) { /* nothing to roll back */ }
        throw e;
      } finally {
        release();
      }
    },
  };
}

module.exports = { makeSqliteDriver };
