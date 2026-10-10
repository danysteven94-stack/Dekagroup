// Web Push notifications (browser permission, subscription, the banner and card).
import {
  apiFetch,
  pollData
} from "./api.js";
import { COLORS } from "./constants.js";
import { icon } from "./icons.js";
import { render } from "./render.js";
import { state } from "./state.js";
import {
  escapeHtml,
  getDeviceId,
  storageSet
} from "./utils.js";

function base64ToUint8Array(base64) {
  var pad = "=".repeat((4 - base64.length % 4) % 4);
  var r = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  var o = new Uint8Array(r.length);
  for (var i = 0; i < r.length; i++) {
    o[i] = r.charCodeAt(i);
  }
  return o;
}

function sameKey(a2, b) {
  if (!a2 || !b) {
    return false;
  }
  var x2 = new Uint8Array(a2);
  if (x2.length !== b.length) {
    return false;
  }
  for (var i = 0; i < x2.length; i++) {
    if (x2[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isStandalonePwa() {
  return window.matchMedia && window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function pushErrorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function pushSend(action, sub, extra) {
  var body = Object.assign({
    action: action,
    deviceId: getDeviceId()
  }, extra || {});
  if (sub) {
    body.subscription = sub.toJSON ? sub.toJSON() : sub;
  }
  return apiFetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(function (r) {
    return r.json().catch(function () {
      return {};
    }).then(function (j) {
      if (!r.ok) {
        throw new Error(j.error || "HTTP " + r.status);
      }
      return j;
    });
  });
}

export function pushCheck() {
  var s = state.push;
  s.perm = "Notification" in window ? Notification.permission : "unsupported";
  s.supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  s.needsInstall = !s.supported && isIOS() && !isStandalonePwa();
  if (!s.supported) {
    render();
    return;
  }
  navigator.serviceWorker.ready.then(function (reg) {
    return reg.pushManager.getSubscription();
  }).then(function (sub) {
    s.subscribed = !!sub && s.perm === "granted";
    render();
    if (s.subscribed) {
      pushSend("subscribe", sub).catch(function () {
      });
    }
  }).catch(function () {
    render();
  });
}

function pushEnable() {
  var s = state.push;
  if (s.busy) {
    return;
  }
  s.busy = true;
  s.msg = "";
  render();
  Notification.requestPermission().then(function (r) {
    s.perm = r;
    if (r !== "granted") {
      throw new Error(r === "denied" ? "Notifikasyon yo bloke sou aparèy sa a. Ale nan paramèt navigatè a pou w otorize yo, epi rechaje paj la." : "Ou pa otorize notifikasyon yo.");
    }
    return apiFetch("/api/push").then(function (x) {
      if (!x.ok) {
        throw new Error(`Sèvè a pa reponn (HTTP ${ x.status }).`);
      }
      return x.json();
    });
  }).then(function (j) {
    if (!j.publicKey) {
      throw new Error("Sèvè a poko konfigire pou notifikasyon.");
    }
    var key = base64ToUint8Array(j.publicKey);
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (old) {
        if (old && sameKey(old.options && old.options.applicationServerKey, key)) {
          return old;
        }
        return (old ? old.unsubscribe() : Promise.resolve()).then(function () {
          return reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key
          });
        });
      });
    });
  }).then(function (sub) {
    return pushSend("subscribe", sub);
  }).then(function () {
    s.subscribed = true;
    s.busy = false;
    s.msg = "Notifikasyon aktive sou aparèy sa a.";
    render();
  }).catch(function (e) {
    s.busy = false;
    s.msg = pushErrorMessage(e);
    render();
  });
}

function pushDisable() {
  var s = state.push;
  if (s.busy) {
    return;
  }
  s.busy = true;
  s.msg = "";
  render();
  navigator.serviceWorker.ready.then(function (reg) {
    return reg.pushManager.getSubscription();
  }).then(function (sub) {
    if (!sub) {
      return;
    }
    return pushSend("unsubscribe", null, { endpoint: sub.endpoint }).catch(function () {
    }).then(function () {
      return sub.unsubscribe();
    });
  }).then(function () {
    s.subscribed = false;
    s.busy = false;
    s.msg = "Notifikasyon yo dezaktive sou aparèy sa a.";
    render();
  }).catch(function (e) {
    s.busy = false;
    s.msg = pushErrorMessage(e);
    render();
  });
}

function pushTest() {
  var s = state.push;
  if (s.busy) {
    return;
  }
  s.busy = true;
  s.msg = "";
  render();
  pushSend("test").then(function (r) {
    s.busy = false;
    s.msg = r && r.sent > 0 ? "Tès la voye \u2014 ou dwe wè yon notifikasyon nan kèk segond." : "Pa gen okenn aparèy ki resevwa tès la. Eseye dezaktive epi aktive notifikasyon yo ankò.";
    render();
  }).catch(function (e) {
    s.busy = false;
    s.msg = pushErrorMessage(e);
    render();
  });
}

export function pushCard() {
  var s = state.push;
  var txt;
  var btns = "";
  var ok = false;
  if (s.needsInstall) {
    txt = "Sou iPhone/iPad, notifikasyon mache sèlman si w ajoute app la sou ekran prensipal la (iOS 16.4 oswa pi nouvo). Louvri paj sa a nan Safari, peze bouton Pataje (kare ak flèch la), chwazi <strong>Sou Ekran Prensipal</strong> (Add to Home Screen), epi louvri DEKA LOG depi ikòn nan. Apre sa tounen isit la pou w aktive notifikasyon yo.";
  } else if (!s.supported) {
    txt = "Navigatè sa a pa sipòte notifikasyon push. Eseye Chrome, Edge, Firefox oswa Safari.";
  } else if (s.perm === "denied") {
    txt = "Notifikasyon yo bloke sou aparèy sa a. Ale nan paramèt sit la nan navigatè a (ikòn kadna a bò adrès la) pou w otorize yo, epi rechaje paj la.";
  } else if (s.subscribed) {
    ok = true;
    txt = `<strong style="color:${ COLORS.green }">Aktif.</strong> W ap resevwa yon notifikasyon sou aparèy sa a chak fwa gen yon nouvo aktivite (konteynè vid, bill fini, transfè depo, chofè kite), menm lè app la fèmen.`;
    btns = `<button class="btn small ghost" data-push="test"${ s.busy ? " disabled" : "" }>Voye yon tès</button><button class="btn small ghost" data-push="disable"${ s.busy ? " disabled" : "" }>Dezaktive</button>`;
  } else {
    txt = "Aktive notifikasyon pou w resevwa yon mesaj sou telefòn oswa laptòp ou chak fwa gen yon nouvo aktivite. Fè sa sou chak aparèy ou vle resevwa yo.";
    btns = `<button class="btn small teal" data-push="enable"${ s.busy ? " disabled" : "" }>${ s.busy ? "Tann..." : "Aktive notifikasyon" }</button>`;
  }
  return `<div class="card" style="margin-bottom:18px"><div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap"><div style="width:40px;height:40px;border-radius:9px;background:${ COLORS.teal }1A;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ icon("bell", 19, COLORS.teal) }</div><div style="flex:1;min-width:220px"><div class="h3" style="margin-bottom:4px">Notifikasyon sou aparèy ou</div><div style="font-size:12.5px;color:var(--muted);line-height:1.5">${ txt }</div>${ s.msg ? `<div style="font-size:12.5px;color:${ ok ? COLORS.green : COLORS.rust };margin-top:8px;font-weight:600">${ escapeHtml(s.msg) }</div>` : "" }</div>${ btns ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${ btns }</div>` : "" }</div></div>`;
}

export function pushBanner() {
  var s = state.push;
  if (s.subscribed || s.perm === "denied" || s.dismissed || !s.supported && !s.needsInstall) {
    return "";
  }
  return `<div class="card" style="margin-bottom:18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-left:4px solid ${ COLORS.teal }">${ icon("bell", 18, COLORS.teal) }<div style="flex:1;min-width:200px;font-size:13px;color:var(--ink)"><strong>Resevwa notifikasyon sou telefòn oswa laptòp ou.</strong> <span style="color:var(--muted)">Aktive yo pou w wè chak nouvo aktivite menm lè app la fèmen.</span></div><button class="btn small teal" data-action="set-tab" data-tab="notifs">Aktive</button><button class="linklike" data-push="dismiss" title="Kache" style="padding:4px 6px">✕</button></div>`;
}

export function pushInit() {
  document.addEventListener("click", function (event) {
    var n = event.target.closest("[data-push]");
    if (!n) {
      return;
    }
    var a = n.getAttribute("data-push");
    if (a === "enable") {
      pushEnable();
    } else if (a === "disable") {
      pushDisable();
    } else if (a === "test") {
      pushTest();
    } else if (a === "dismiss") {
      storageSet("deka-log-push-banner-off", "1");
      state.push.dismissed = true;
      render();
    }
  });
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (event) {
      if (event.data && event.data.type === "open-notifs" && state.unlocked) {
        state.tab = "notifs";
        render();
        pollData();
      }
    });
  }
  pushCheck();
}
