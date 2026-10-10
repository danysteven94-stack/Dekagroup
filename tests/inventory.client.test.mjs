// Inventory calculation (stock entries - delivery slips - damaged + returned) and expiry. Run: node --no-warnings tests/inventory.client.test.mjs
import assert from "assert";
import {
  computeInventory,
  daysUntil,
  expiryStatus,
  productKey,
  requestedByKey
} from "../public/js/inventory.js";

const results = [];
const test = (name, fn) => { try { fn(); results.push([true, name]); } catch (e) { results.push([false, name, e]); } };
const TODAY = "2026-10-09";
const bills = [{ id: "b1", numewo: "BL-1", product: "Diri" }, { id: "b2", numewo: "BL-2", product: "Sik" }];
const entry = (id, billId, description, quantity, unit, expiresOn, entryDate) => ({ id, billId, description, quantity, unit, expiresOn: expiresOn || null, entryDate: entryDate || "2026-09-01" });
const slip = (id, items) => ({ id, slipDate: "2026-10-05", items });
const find = (inv, billId, desc) => inv.find((r) => r.billId === billId && r.description === desc);

test("stock = entries - delivered", () => {
  const inv = computeInventory({ bills, stockEntries: [entry("1", "b1", "Diri", "1000", "sak")], slips: [slip("s", [{ billId: "b1", description: "Diri", unit: "sak", quantity: "300" }])] }, TODAY);
  const r = find(inv, "b1", "Diri");
  assert.strictEqual(r.entered, 1000); assert.strictEqual(r.delivered, 300); assert.strictEqual(r.current, 700);
});

test("several slips and several lines add up", () => {
  const inv = computeInventory({ bills, stockEntries: [entry("1", "b1", "Diri", "100", "sak")], slips: [
    slip("a", [{ billId: "b1", description: "Diri", unit: "sak", quantity: "10" }, { billId: "b1", description: "Diri", unit: "sak", quantity: "5.5" }]),
    slip("b", [{ billId: "b1", description: "Diri", unit: "sak", quantity: "20" }]),
  ] }, TODAY);
  assert.strictEqual(find(inv, "b1", "Diri").current, 64.5);
});

test("damaged goods leave the stock, returned goods come back", () => {
  const inv = computeInventory({ bills, stockEntries: [entry("1", "b1", "Diri", "100", "sak")], slips: [slip("a", [{ billId: "b1", description: "Diri", unit: "sak", quantity: "30" }])],
    goodsIncidents: [{ kind: "avarye", billId: "b1", description: "Diri", unit: "sak", quantity: "4" }, { kind: "retounen", billId: "b1", description: "Diri", unit: "sak", quantity: "10" }] }, TODAY);
  const r = find(inv, "b1", "Diri");
  assert.strictEqual(r.damaged, 4); assert.strictEqual(r.returned, 10); assert.strictEqual(r.current, 76);
});

test("old deliveries (goods kind livrezon) still count as delivered", () => {
  const inv = computeInventory({ bills, stockEntries: [entry("1", "b1", "Diri", "100", "sak")], goodsIncidents: [{ kind: "livrezon", billId: "b1", description: "Diri", unit: "sak", quantity: "25" }] }, TODAY);
  assert.strictEqual(find(inv, "b1", "Diri").current, 75);
});

test("product matching ignores case and extra spaces, but not the unit or the Bill", () => {
  assert.strictEqual(productKey("b1", " Diri  50LB ", "SAK"), productKey("b1", "diri 50lb", "sak"));
  assert.notStrictEqual(productKey("b1", "Diri", "sak"), productKey("b1", "Diri", "kolo"));
  assert.notStrictEqual(productKey("b1", "Diri", "sak"), productKey("b2", "Diri", "sak"));
  const inv = computeInventory({ bills, stockEntries: [entry("1", "b1", "Diri 50lb", "100", "sak")], slips: [slip("a", [{ billId: "b1", description: "diri  50LB", unit: "Sak", quantity: "10" }])] }, TODAY);
  assert.strictEqual(inv.length, 1); assert.strictEqual(inv[0].current, 90);
});

test("delivering more than the stock shows a negative stock", () => {
  const inv = computeInventory({ bills, stockEntries: [entry("1", "b1", "Diri", "10", "sak")], slips: [slip("a", [{ billId: "b1", description: "Diri", unit: "sak", quantity: "12" }])] }, TODAY);
  const r = find(inv, "b1", "Diri");
  assert.strictEqual(r.current, -2); assert.strictEqual(r.negative, true);
});

test("expiry: goods leave first-expiring-first, so the next expiry is of what is really left", () => {
  const stockEntries = [entry("1", "b1", "Diri", "100", "sak", "2026-10-20"), entry("2", "b1", "Diri", "50", "sak", "2027-03-01")];
  // 100 delivered: the whole first lot is gone, the next expiry is the second lot
  let inv = computeInventory({ bills, stockEntries, slips: [slip("a", [{ billId: "b1", description: "Diri", unit: "sak", quantity: "100" }])] }, TODAY);
  let r = find(inv, "b1", "Diri");
  assert.strictEqual(r.current, 50); assert.strictEqual(r.nextExpiry, "2027-03-01"); assert.strictEqual(r.nextExpiryQty, 50); assert.strictEqual(r.expiryStatus, "ok");
  // only 60 delivered: 40 of the first lot remain
  inv = computeInventory({ bills, stockEntries, slips: [slip("a", [{ billId: "b1", description: "Diri", unit: "sak", quantity: "60" }])] }, TODAY);
  r = find(inv, "b1", "Diri");
  assert.strictEqual(r.nextExpiry, "2026-10-20"); assert.strictEqual(r.nextExpiryQty, 40); assert.strictEqual(r.expiryStatus, "soon");
});

test("expiry: expired goods still in stock are flagged and counted", () => {
  const inv = computeInventory({ bills, stockEntries: [entry("1", "b2", "Sik", "50", "sak", "2026-09-30"), entry("2", "b2", "Sik", "10", "sak", "2027-01-01")], slips: [slip("a", [{ billId: "b2", description: "Sik", unit: "sak", quantity: "20" }])] }, TODAY);
  const r = find(inv, "b2", "Sik");
  assert.strictEqual(r.expiryStatus, "expired"); assert.strictEqual(r.expiredQty, 30); assert.strictEqual(r.nextExpiry, "2026-09-30");
});

test("expiry: no date known -> no status; a finished product has no expiry alarm", () => {
  let inv = computeInventory({ bills, stockEntries: [entry("1", "b1", "Lwil", "20", "bwat")] }, TODAY);
  assert.strictEqual(inv[0].expiryStatus, "none"); assert.strictEqual(inv[0].nextExpiry, null);
  inv = computeInventory({ bills, stockEntries: [entry("1", "b1", "Diri", "10", "sak", "2026-01-01")], slips: [slip("a", [{ billId: "b1", description: "Diri", unit: "sak", quantity: "10" }])] }, TODAY);
  assert.strictEqual(inv[0].current, 0); assert.strictEqual(inv[0].expiryStatus, "none");
});

test("expiryStatus thresholds and daysUntil", () => {
  assert.strictEqual(daysUntil("2026-10-10", TODAY), 1);
  assert.strictEqual(daysUntil("2026-10-08", TODAY), -1);
  assert.strictEqual(expiryStatus("2026-10-08", TODAY), "expired");
  assert.strictEqual(expiryStatus(TODAY, TODAY), "soon");
  assert.strictEqual(expiryStatus("2026-11-08", TODAY), "soon");
  assert.strictEqual(expiryStatus("2026-11-09", TODAY), "ok");
  assert.strictEqual(expiryStatus(null, TODAY), "none");
});

test("requestedByKey adds up two lines of the same product", () => {
  const k = productKey("b1", "Diri", "sak");
  assert.deepStrictEqual(requestedByKey([{ key: k, quantity: "10" }, { key: k, quantity: "2.5" }, { key: "", quantity: "9" }]), { [k]: 12.5 });
});

let fail = 0;
results.forEach((r) => { if (r[0]) console.log("  ok    " + r[1]); else { fail++; console.log("  FAIL  " + r[1] + "\n        " + (r[2] && r[2].stack || r[2])); } });
console.log(results.length - fail + "/" + results.length + " passed");
process.exit(fail ? 1 : 0);
