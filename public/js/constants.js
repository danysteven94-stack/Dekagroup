// Constants shared by the whole app: colors, labels, divisions, tabs, storage keys.
export const LOGO_URL = "/logo.jpg";

export const LS_ADMIN_UNLOCKED = "deka-log-unlocked";

export const LS_DEPOT_UNLOCKED = "deka-log-depot-unlocked";

export const LS_LAST_SEEN_NOTIFS = "deka-log-last-seen-notif-count";

export const COLORS = {
  disponib: "#2E6F9E",
  pran: "#0E7C86",
  pokoverifye: "#7C5CBF",
  full: "#D9531E",
  vid: "#F2A900",
  kite: "#1D7A5A",
  navy: "#0B2138",
  rust: "#D9531E",
  green: "#1D7A5A",
  teal: "#0E7C86",
  steel: "#3C5A73",
  urgent: "#C81E3A"
};

export const STATUS_LABELS = {
  disponib: "Disponib",
  pran: "Pran",
  pokoverifye: "Poko Verifye",
  full: "Full",
  vid: "Vid",
  kite: "Kite"
};

export const URGENT_AFTER_DAYS = 5;

export const TRUCKING_OPTIONS = [
  "CFC",
  "CTSA",
  "MAD"
];

export const DIVISIONS_GROUP_1 = [
  "CRISTO AL",
  "CRISTO COMM",
  "CONFIDEKA",
  "DEKAV"
];

export const DIVISIONS_GROUP_2 = [
  "ACS",
  "MIKADO",
  "LA COLLECTION",
  "DEKA TIRES"
];

export const ALL_DIVISIONS = DIVISIONS_GROUP_1.concat(DIVISIONS_GROUP_2);

// Which divisions to show an account in dividion-by-division screens (the Tablo Kontwôl cards, etc.):
// mirrors the server-side filtering in api/_lib/divisions.js so an account never even sees the card
// for a division it has no access to. A legacy/shared account (not "personal") is unrestricted, same
// as before. A personal account assigned any Group 1 division sees every Group 1 division (they share
// one database); a Group 2 division only ever shows that one division, never a sibling one.
export function visibleDivisionsForAccount(personal, divisions) {
  if (!personal) return ALL_DIVISIONS.slice();
  var list = Array.isArray(divisions) ? divisions : [];
  var seen = {};
  var out = [];
  function add(d) { if (!seen[d]) { seen[d] = true; out.push(d); } }
  list.forEach(function (d) {
    if (DIVISIONS_GROUP_1.indexOf(d) !== -1) DIVISIONS_GROUP_1.forEach(add);
    else if (ALL_DIVISIONS.indexOf(d) !== -1) add(d);
  });
  return out;
}

// Which database ("pool") each division lives in — must match api/_lib/divisions.js exactly.
// Group 1 always shares one database; every Group 2 division has its own, separate database.
export const POOL_OF_DIVISION = {
  "CRISTO AL": "default", "CRISTO COMM": "default", "CONFIDEKA": "default", "DEKAV": "default",
  "ACS": "acs", "MIKADO": "mikado", "LA COLLECTION": "lacollection", "DEKA TIRES": "dekatires"
};

// A short label for a pool, built from whichever of the account's own divisions live in it
// (so "default" shows only the Group 1 divisions the account actually has, not always all four).
export function poolLabel(pool, accountDivisions) {
  var list = (accountDivisions || []).filter(function (d) { return POOL_OF_DIVISION[d] === pool; });
  return list.length ? list.join(", ") : pool;
}

export const WEEKDAYS = [
  "Dimanch",
  "Lendi",
  "Madi",
  "Mèkredi",
  "Jedi",
  "Vandredi",
  "Samdi"
];

export const MONTHS = [
  "Janvye",
  "Fevriye",
  "Mas",
  "Avril",
  "Me",
  "Jen",
  "Jiyè",
  "Out",
  "Septanm",
  "Oktòb",
  "Novanm",
  "Desanm"
];

export const ADMIN_TABS = [
  {
    id: "dashboard",
    label: "Apèsi",
    icon: "grid"
  },
  {
    id: "add",
    label: "Ajoute",
    icon: "plus"
  },
  {
    id: "containers",
    label: "Kontenè",
    icon: "boxes"
  },
  {
    id: "trucking",
    label: "Trucking",
    icon: "truck"
  },
  {
    id: "pwodwi",
    label: "Pwodwi yo",
    icon: "clipboard"
  },
  {
    id: "inventory",
    label: "Envantè",
    icon: "check"
  },
  {
    id: "bills",
    label: "Bill",
    icon: "clipboard"
  },
  {
    id: "achiv",
    label: "Achiv",
    icon: "filetext"
  },
  {
    id: "rapo",
    label: "Rapò",
    icon: "download"
  },
  {
    id: "notifs",
    label: "Notifikasyon",
    icon: "bell"
  },
  {
    id: "sekirite",
    label: "Sekirite",
    icon: "alert"
  },
  {
    id: "itilizate",
    label: "Itilizatè",
    icon: "user"
  }
];

export const TAB_TITLES = {
  dashboard: "Tablo Kontwòl",
  add: "Ajoute yon Kontenè",
  containers: "Rejis Kontenè",
  trucking: "Kontenè pa Trucking",
  pwodwi: "Kontenè pa Pwodwi",
  inventory: "Envantè Jounalye",
  bills: "Rejis Bill",
  achiv: "Achiv Kontenè Kite",
  rapo: "Rapò",
  notifs: "Istwa Notifikasyon",
  sekirite: "Sekirite ak Aktivite",
  itilizate: "Itilizatè"
};

export const LS_DAILY_UNLOCKED = "deka-log-daily-unlocked";

export const DAILY_TRUCKING_BASE = [
  "CFC",
  "CTSA",
  "MAD"
];

export const DAILY_DKN_OPTIONS = [];

for (var dknNumber = 1; dknNumber <= 15; dknNumber++) {
  DAILY_DKN_OPTIONS.push("DKN " + ("00" + dknNumber).slice(-3));
}

export const AUDIT_LABELS = {
  login_ok_recovery_code: "Koneksyon (kòd sekou)",
  login_disabled: "Kont dezaktive eseye konekte",
  login_2fa_fail: "Echèk kòd 2FA",
  password_change: "Modpass chanje",
  password_change_fail: "Echèk chanjman modpass",
  "2fa_enabled": "2FA aktive",
  "2fa_disabled": "2FA dezaktive",
  user_create: "Itilizatè kreye",
  user_reset_password: "Modpass reyinisyalize",
  user_set_active: "Kont aktive/dezaktive",
  user_set_role: "Wòl chanje",
  user_reset_2fa: "2FA reyinisyalize",
  login_ok: "Koneksyon reyisi",
  login_fail: "Echèk koneksyon",
  login_blocked: "Kont bloke (twòp esè)",
  logout: "Dekoneksyon",
  forbidden: "Aksyon refize",
  data_write: "Done sove (admin)",
  data_write_blocked: "Sove bloke",
  act_markEmpty: "Konteneur make vid",
  act_transfer: "Transfè depo",
  act_depart: "Depa chofè",
  verify: "Konteneur verifye",
  backup_download: "Kopi telechaje",
  email_recipient_add: "Adrès imèl ajoute",
  email_recipient_remove: "Adrès imèl retire",
  email_test: "Tès imèl voye"
};

export const AUDIT_WARNINGS = {
  login_disabled: 1,
  login_2fa_fail: 1,
  password_change_fail: 1,
  login_fail: 1,
  login_blocked: 1,
  forbidden: 1,
  data_write_blocked: 1
};
