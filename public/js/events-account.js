// Event listeners for the account screen (password, 2FA) and the admin Users tab.
import {
  apiJson,
  showToast
} from "./api.js";
import { render } from "./render.js";
import { state } from "./state.js";
import { roleLabel } from "./utils.js";
import {
  finishAccountScreen,
  loadTwoFactor
} from "./views/account.js";import {
  loadUsers,
  userAction
} from "./views/users.js";

document.addEventListener("submit", function (event) {
  var id = event.target && event.target.id;
  if (id === "pw-form") {
    event.preventDefault();
    var f = state.pwf = state.pwf || {};
    var cur = document.getElementById("pw-cur").value;
    var nw = document.getElementById("pw-new").value;
    var n2 = document.getElementById("pw-new2").value;
    if (f.busy) {
      return;
    }
    if (nw !== n2) {
      f.err = "De nouvo modpass yo pa menm.";
      f.msg = "";
      render();
      return;
    }
    f.busy = true;
    f.err = "";
    f.msg = "";
    render();
    apiJson("/api/auth/password", {
      current: cur,
      next: nw
    }).then(function (d) {
      f.busy = false;
      var was = state.needs;
      state.needs = d.needs || null;
      f.msg = "Modpass la chanje.";
      if (state.needs === "2fa") {
        state.tf = null;
        render();
        loadTwoFactor();
      } else if (was && !state.needs) {
        finishAccountScreen();
      } else {
        render();
      }
    }).catch(function (er) {
      f.busy = false;
      f.err = er.message;
      render();
    });
  } else if (id === "tf-confirm-form") {
    event.preventDefault();
    var k = state.tf;
    var cd2 = document.getElementById("tf-code").value.trim();
    if (k.busy) {
      return;
    }
    k.busy = true;
    k.err = "";
    render();
    apiJson("/api/auth/2fa", {
      action: "confirm",
      code: cd2
    }).then(function (d) {
      k.busy = false;
      k.recovery = d.recoveryCodes;
      k.enabled = true;
      k.secret = "";
      state.needs = d.needs || null;
      state.acct = true;
      render();
    }).catch(function (er) {
      k.busy = false;
      k.err = er.message;
      render();
    });
  } else if (id === "tf-disable-form") {
    event.preventDefault();
    var k2 = state.tf;
    apiJson("/api/auth/2fa", {
      action: "disable",
      password: document.getElementById("tf-pw").value,
      code: document.getElementById("tf-code2").value.trim()
    }).then(function () {
      k2.enabled = false;
      k2.err = "";
      k2.msg = "2FA dezaktive.";
      render();
    }).catch(function (er) {
      k2.err = er.message;
      render();
    });
  } else if (id === "acct-email-form") {
    event.preventDefault();
    var ae = state.acctEmail = state.acctEmail || { loaded: true, input: "" };
    var val = document.getElementById("acct-email-input").value.trim();
    if (ae.busy) {
      return;
    }
    ae.busy = true;
    ae.err = "";
    ae.msg = "";
    render();
    apiJson("/api/auth/email", { email: val }).then(function (d) {
      ae.busy = false;
      ae.email = d.email || "";
      ae.input = d.email || "";
      ae.msg = d.email ? "Imèl la sove." : "Imèl la retire.";
      render();
    }).catch(function (er) {
      ae.busy = false;
      ae.err = er.message;
      render();
    });
  } else if (id === "usr-create-form") {
    event.preventDefault();
    var U = state.usr;
    var fm = U.form = U.form || {};
    fm.username = document.getElementById("usr-username").value.trim();
    fm.name = document.getElementById("usr-name").value.trim();
    fm.email = document.getElementById("usr-email").value.trim();
    fm.role = document.getElementById("usr-role").value;
    fm.err = "";
    apiJson("/api/users", {
      action: "create",
      username: fm.username,
      name: fm.name,
      email: fm.email,
      role: fm.role
    }).then(function (d) {
      U.temp = {
        username: d.user.username,
        pw: d.tempPassword
      };
      U.form = {
        username: "",
        name: "",
        email: "",
        role: fm.role,
        err: ""
      };
      loadUsers();
    }).catch(function (er) {
      fm.err = er.message;
      render();
    });
  }
});

document.addEventListener("click", function (event) {
  var n = event.target && event.target.closest ? event.target.closest("[data-action]") : null;
  if (!n) {
    return;
  }
  var a = n.getAttribute("data-action");
  var u = n.getAttribute("data-user");
  if (a === "open-account") {
    state.acct = true;
    state.pwf = null;
    state.tf = null;
    render();
    loadTwoFactor();
  } else if (a === "close-account") {
    state.acct = false;
    render();
  } else if (a === "open-help") {
    state.help = true;
    render();
  } else if (a === "close-help") {
    state.help = false;
    render();
  } else if (a === "tf-begin") {
    var k = state.tf;
    k.busy = true;
    k.err = "";
    render();
    apiJson("/api/auth/2fa", { action: "begin" }).then(function (d) {
      k.busy = false;
      k.secret = d.secret;
      k.otpauth = d.otpauth;
      render();
    }).catch(function (er) {
      k.busy = false;
      k.err = er.message;
      render();
    });
  } else if (a === "tf-done") {
    state.tf.recovery = null;
    finishAccountScreen();
  } else if (a === "gate-back") {
    state.gate2fa = false;
    state.pendingGatePassword = "";
    state.gateError = false;
    state.gateMsg = "";
    state.gateCanEmail = false;
    state.gateEmailMsg = "";
    render();
  } else if (a === "gate-send-email-code") {
    state.gateEmailBusy = true;
    state.gateEmailMsg = "";
    render();
    fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: state.gateUser,
        password: state.pendingGatePassword,
        sendEmailCode: true
      })
    }).then(function (r) {
      return r.json().catch(function () {
        return {};
      }).then(function (d) {
        return { ok: r.ok, d: d };
      });
    }).then(function (x) {
      state.gateEmailBusy = false;
      state.gateEmailMsg = x.ok && x.d && x.d.emailSent ? "Kòd la voye sou imèl ou." : x.d && x.d.error ? x.d.error : "Pa t kapab voye imèl la.";
      render();
    }).catch(function () {
      state.gateEmailBusy = false;
      state.gateEmailMsg = "Pa ka konekte ak sèvè a.";
      render();
    });
  } else if (a === "usr-refresh") {
    loadUsers();
  } else if (a === "usr-dismiss-temp") {
    state.usr.temp = null;
    render();
  } else if (a === "usr-copy-temp") {
    var tp = state.usr.temp;
    if (tp && navigator.clipboard) {
      navigator.clipboard.writeText(tp.pw).then(function () {
        showToast("Modpass la kopye.");
      }).catch(function () {
      });
    }
  } else if (a === "usr-reset-pw") {
    if (window.confirm(`Reyinisyalize modpass ${ u }? Li ap dekonekte nan tout aparèy li yo.`)) {
      userAction({
        action: "reset_password",
        username: u
      }, function (d) {
        state.usr.temp = {
          username: u,
          pw: d.tempPassword
        };
      });
    }
  } else if (a === "usr-toggle") {
    var on = n.getAttribute("data-active") === "1";
    if (on || window.confirm(`Dezaktive ${ u }? Li ap dekonekte touswit.`)) {
      userAction({
        action: "set_active",
        username: u,
        active: on
      });
    }
  } else if (a === "usr-reset-2fa") {
    if (window.confirm(`Reyinisyalize 2FA ${ u }? Li pral dwe konfigire l ankò.`)) {
      userAction({
        action: "reset_2fa",
        username: u
      });
    }
  } else if (a === "usr-edit-email") {
    var current = n.getAttribute("data-email") || "";
    var next = window.prompt(`Imèl pou ${ u } (pou kòd 2FA). Kite l vid pou retire l.`, current);
    if (next === null) {
      return;
    }
    userAction({
      action: "set_email",
      username: u,
      email: next.trim()
    });
  }
});

document.addEventListener("change", function (event) {
  var el = event.target;
  if (el && el.classList && el.classList.contains("usr-role-select")) {
    var u = el.getAttribute("data-user");
    if (window.confirm(`Chanje wòl ${ u } an ${ roleLabel(el.value) }? Li ap dekonekte touswit.`)) {
      userAction({
        action: "set_role",
        username: u,
        role: el.value
      });
    } else {
      loadUsers();
    }
  }
});
