// Detects when the browser loses or regains its network connection: shows a banner and resyncs automatically
// when the connection comes back, instead of leaving the person guessing why nothing is saving.
import { refreshData, saveData } from "./api.js";
import { render } from "./render.js";
import { state } from "./state.js";

export function initOffline() {
  window.addEventListener("online", function () {
    state.online = true;
    render();
    refreshData();
    if (state.saveErr) {
      saveData();
    }
  });
  window.addEventListener("offline", function () {
    state.online = false;
    render();
  });
}
