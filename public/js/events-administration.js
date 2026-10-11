// Administration DEKA screen: clicks, search box, division picker, CSV downloads. Read-only: nothing here writes data.
import { downloadCsv } from "./csv.js";
import { loadOverview } from "./overview.js";
import { render } from "./render.js";
import { state } from "./state.js";
import { t } from "./i18n.js";
import {
  CONTAINER_STATUSES,
  MOVE_KINDS,
  filteredBills,
  filteredContainers,
  filteredInventoryAdm,
  moveTable
} from "./views/administration.js";
import { STATUS_LABELS } from "./constants.js";
import { formatDateShort } from "./utils.js";

var PAGE = 200;

function go(tab) {
  state.adm.tab = tab;
  state.adm.search = "";
  state.adm.limit = PAGE;
  state.navDrawerOpen = false;
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function divisionSuffix() {
  return state.adm.division ? "-" + state.adm.division.toLowerCase().replace(/[^a-z0-9]+/g, "-") : "";
}

// Downloads exactly what is on the screen (same division, same search and filter), not just the rows currently shown.
function exportCsv(kind) {
  var M = state.adm.model;
  if (!M) return;
  var name = "administration-deka-" + kind + divisionSuffix() + "-" + stamp() + ".csv";
  if (kind === "containers") {
    downloadCsv(name, ["Numewo", "Divizyon", "Estati", "Bill", "Pwodwi", "Gwosè", "Trucking", "Depo", "Chofè", "Plak", "Dat Prevwa", "Dat Antre", "Dat Vid", "Dat Kite"],
      filteredContainers(M).map(function (c) {
        return [c.numewo, c.division || "", t(STATUS_LABELS[c.status] || ""), c.billNumewo, c.product, c.size, c.trucking || "", c.depo || "", c.chofer || "", c.plak || "",
          formatDateShort(c.dateExpected), formatDateShort(c.dateEntered), formatDateShort(c.dateEmpty), formatDateShort(c.dateLeft)];
      }));
  } else if (kind === "products") {
    downloadCsv(name, ["Bill", "Pwodwi", "Divizyon", "Estati", "Kontenè", "Full", "Vid", "Kite", "Liy ann estòk"],
      filteredBills(M).map(function (b) {
        return [b.numewo, b.product || "", b.division || "", b.status, b.nTotal, b.nFull, b.nVid, b.nKite, b.nLines];
      }));
  } else if (kind === "stock") {
    downloadCsv(name, ["Pwodwi", "Divizyon", "Bill", "Inite", "Antre", "Livre", "Avarye", "Retounen", "Kounye a", "Pwochen ekspirasyon"],
      filteredInventoryAdm(M).map(function (r) {
        return [r.description, r.division || "", r.billNumewo, r.unit, r.entered, r.delivered, r.damaged, r.returned, r.current, r.nextExpiry || ""];
      }));
  } else if (kind === "moves") {
    var T = moveTable(M, state.adm.moveKind);
    var headers = T.cols.map(function (c) { return c.h; });
    downloadCsv(name, headers, T.rows.map(function (r) {
      return T.cols.map(function (c) {
        // cells are HTML: keep only their text
        return String(c.cell(r)).replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      });
    }));
  }
}

document.addEventListener("click", function (event) {
  var n = event.target.closest("[data-action]");
  if (!n) return;
  var a = n.getAttribute("data-action");
  if (a.indexOf("adm-") !== 0) return;
  var A = state.adm;
  if (a === "adm-tab") {
    go(n.getAttribute("data-tab"));
  } else if (a === "adm-go") {
    // a card of the overview: open its screen already filtered
    var tab = n.getAttribute("data-tab");
    go(tab);
    if (n.hasAttribute("data-status")) A.cStatus = n.getAttribute("data-status");
    A.bStatus = n.hasAttribute("data-bstatus") ? n.getAttribute("data-bstatus") : "";
    if (n.hasAttribute("data-filter")) A.invFilter = n.getAttribute("data-filter");
    if (n.hasAttribute("data-kind")) A.moveKind = n.getAttribute("data-kind");
    if (tab === "containers" && !n.hasAttribute("data-status")) A.cStatus = "";
    if (tab === "stock" && !n.hasAttribute("data-filter")) A.invFilter = "";
  } else if (a === "adm-status") {
    var s = n.getAttribute("data-status");
    A.cStatus = CONTAINER_STATUSES.indexOf(s) !== -1 ? s : "";
    A.limit = PAGE;
  } else if (a === "adm-bstatus") {
    A.bStatus = n.getAttribute("data-bstatus") || "";
    A.limit = PAGE;
  } else if (a === "adm-inv-filter") {
    A.invFilter = n.getAttribute("data-filter") || "";
    A.limit = PAGE;
  } else if (a === "adm-move") {
    var k = n.getAttribute("data-kind");
    if (MOVE_KINDS.some(function (m) { return m.id === k; })) A.moveKind = k;
    A.search = "";
    A.limit = PAGE;
  } else if (a === "adm-pick-div") {
    A.division = n.getAttribute("data-div") || "";
    A.limit = PAGE;
  } else if (a === "adm-more") {
    A.limit += PAGE;
  } else if (a === "adm-refresh") {
    loadOverview(false);
    return;
  } else if (a === "adm-csv") {
    exportCsv(n.getAttribute("data-kind"));
    return;
  } else {
    return;
  }
  render();
});

document.addEventListener("input", function (event) {
  var el = event.target;
  if (!el || el.id !== "adm-search") return;
  state.adm.search = el.value;
  state.adm.limit = PAGE;
  render();
  var box = document.getElementById("adm-search");
  if (box) {
    box.focus();
    var v = box.value;
    box.value = "";
    box.value = v;
  }
});

document.addEventListener("change", function (event) {
  var el = event.target;
  if (!el || el.id !== "adm-division") return;
  state.adm.division = el.value || "";
  state.adm.limit = PAGE;
  render();
});
