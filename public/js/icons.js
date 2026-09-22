// SVG icon set (icon(name, size, color)).
export function icon(name, size, color) {
  size = size || 16;
  color = color || "currentColor";
  var o = `width="${ size }" height="${ size }" viewBox="0 0 24 24" fill="none" stroke="${ color }" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  var a = {
    user: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
    ship: `<path d="M2 21c1.6 0 2.4-.6 4-.6s2.4.6 4 .6 2.4-.6 4-.6 2.4.6 4 .6 2.4-.6 4-.6"/><path d="M4 18l-1-6 8-2 8 2-1 6"/><path d="M11 10V4h3l2 4"/>`,
    grid: `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`,
    boxes: `<path d="M3 8l6-3 6 3-6 3-6-3z"/><path d="M3 8v7l6 3 6-3V8"/><path d="M9 11v7"/>`,
    clipboard: `<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z"/><path d="M9 11h6M9 15h6M9 19h3"/>`,
    bell: `<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>`,
    plus: "<path d=\"M12 5v14M5 12h14\"/>",
    trash: `<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>`,
    check: `<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.3 2.3L16 10"/>`,
    circle: `<circle cx="12" cy="12" r="9"/>`,
    search: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>`,
    undo: `<path d="M3 11a9 9 0 1 1 2.6 6.3"/><path d="M3 5v6h6"/>`,
    alert: `<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 17.5v.1"/>`,
    arrow: `<path d="M5 12h14M13 6l6 6-6 6"/>`,
    download: `<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/>`,
    filetext: `<path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><path d="M9 13h6M9 17h6M9 9h2"/>`
  };
  return `<svg ${ o }>${ a[name] || "" }</svg>`;
}
