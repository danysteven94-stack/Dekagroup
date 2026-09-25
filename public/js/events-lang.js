// Click on the language button (Kreyòl <-> Français).
import { setLang } from "./i18n.js";
import { render } from "./render.js";

document.addEventListener("click", function (event) {
  var n = event.target.closest("[data-action=\"set-lang\"]");
  if (n) {
    setLang(n.getAttribute("data-lang"));
    render();
  }
});
