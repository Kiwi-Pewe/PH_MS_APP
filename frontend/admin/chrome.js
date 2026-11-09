const ADMIN_ICON = {
  chart: "M4 19V5 M4 19h16 M8 16v-5 M12 16V8 M16 16v-8",
  users: "M16 19v-1.2A2.8 2.8 0 0 0 13.2 15H6.8A2.8 2.8 0 0 0 4 17.8V19 M10 11.5A3.5 3.5 0 1 0 10 4.5a3.5 3.5 0 0 0 0 7z M20 19v-1.1A2.4 2.4 0 0 0 17.6 15.5h-.4 M16.5 4.7a3 3 0 0 1 0 5.6",
  flag: "M5 21V4 M5 4h10l-1.5 3.5L15 11H5",
  shield: "M12 3 5 6v6c0 4.2 2.8 7.2 7 9 4.2-1.8 7-4.8 7-9V6z",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  share: "M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M19 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M10.4 6.5 6.7 15.2 M13.6 6.5l3.7 8.7 M7 19h10",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z",
  down: "M6 9l6 6 6-6",
  right: "M9 6l6 6-6 6",
  check: "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3",
  plus: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M19 8v6 M16 11h6",
  activity: "M22 12h-4l-3 7L9 3 6 12H2",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",
  calendar: "M7 3v3 M17 3v3 M4 9h16 M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  lock: "M8 11V8a4 4 0 0 1 8 0v3 M7 11h10v10H7z"
};

const ADMIN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function adminNum(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function adminEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null && text !== "") node.textContent = text;
  return node;
}

function adminIcon(name, className) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  if (className) svg.setAttribute("class", className);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ADMIN_ICON[name] || ADMIN_ICON.grid);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.8");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}

function adminPad(n) {
  return n < 10 ? "0" + n : String(n);
}

function adminUtcStamp(date) {
  const when = date || new Date();
  return adminPad(when.getUTCDate()) + " " + ADMIN_MONTHS[when.getUTCMonth()] + " " + when.getUTCFullYear()
    + " · " + adminPad(when.getUTCHours()) + ":" + adminPad(when.getUTCMinutes()) + " UTC";
}

function adminEstStamp(date) {
  const when = date || new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).formatToParts(when);
  const pick = (type) => {
    const row = parts.find((item) => item.type === type);
    return row ? row.value : "";
  };
  const hour = pick("hour");
  const minute = pick("minute");
  const period = (pick("dayPeriod") || "AM").toUpperCase();
  return pick("day") + " " + pick("month") + " " + pick("year") + " · " + hour + ":" + minute + " " + period + " EST";
}

function adminPageHead(opts) {
  const wrap = adminEl("div", "admin-head");
  const left = adminEl("div", "admin-head-copy");
  const crumbs = adminEl("div", "admin-crumbs");
  (opts.crumbs || []).forEach((label, index) => {
    if (index) crumbs.appendChild(adminEl("span", "admin-crumb-sep", "/"));
    const bit = adminEl("span", "admin-crumb" + (index === opts.crumbs.length - 1 ? " is-on" : ""), label);
    crumbs.appendChild(bit);
  });
  left.appendChild(crumbs);
  left.appendChild(adminEl("h1", "admin-page-title", opts.title || ""));
  if (opts.note) left.appendChild(adminEl("p", "admin-page-note", opts.note));
  wrap.appendChild(left);
  const meta = adminEl("div", "admin-head-meta");
  if (opts.clock !== false) {
    const stamp = opts.clock === "est" ? adminEstStamp() : adminUtcStamp();
    meta.appendChild(adminEl("div", "admin-clock", stamp));
  }
  if (opts.filter) {
    const filter = adminEl("button", "admin-filter-pill");
    filter.type = "button";
    filter.disabled = true;
    filter.appendChild(adminEl("span", "", opts.filter));
    filter.appendChild(adminIcon("down"));
    meta.appendChild(filter);
  }
  if (opts.badge) {
    const badge = adminEl("div", "admin-badge");
    badge.appendChild(adminEl("span", "admin-badge-dot"));
    badge.appendChild(document.createTextNode(opts.badge));
    meta.appendChild(badge);
  }
  if (opts.range) meta.appendChild(adminEl("div", "admin-range", opts.range));
  wrap.appendChild(meta);
  return wrap;
}

function adminBanner(htmlLead, rest) {
  const bar = adminEl("div", "admin-banner");
  bar.appendChild(adminEl("span", "admin-banner-dot"));
  const lead = adminEl("strong", "", htmlLead);
  bar.appendChild(lead);
  if (rest) bar.appendChild(document.createTextNode(" · " + rest));
  return bar;
}

function adminStatCard(opts) {
  const tile = adminEl("div", "overview-tile");
  const top = adminEl("div", "overview-tile-top");
  top.appendChild(adminEl("div", "overview-tile-label", opts.label));
  if (opts.icon) top.appendChild(adminIcon(opts.icon, "overview-tile-icon"));
  tile.appendChild(top);
  tile.appendChild(adminEl("div", "overview-tile-value", opts.value));
  if (opts.detail) tile.appendChild(adminEl("div", "overview-tile-sub", opts.detail));
  if (opts.delta) {
    const delta = adminEl("div", "overview-delta is-" + (opts.tone || "up"), opts.delta);
    tile.appendChild(delta);
  }
  return tile;
}

function adminPanel(opts) {
  const panel = adminEl("div", "admin-panel" + (opts.className ? " " + opts.className : ""));
  const head = adminEl("div", "admin-panel-head");
  head.appendChild(adminEl("div", "admin-panel-title", opts.title || ""));
  if (opts.meta) head.appendChild(adminEl("div", "admin-panel-meta", opts.meta));
  panel.appendChild(head);
  const body = adminEl("div", "admin-panel-body");
  panel.appendChild(body);
  if (opts.foot) {
    const foot = adminEl("div", "admin-panel-foot");
    foot.appendChild(adminEl("span", "admin-panel-foot-dot"));
    foot.appendChild(document.createTextNode(opts.foot));
    panel.appendChild(foot);
  }
  return { panel: panel, body: body };
}

function adminMeterList(rows, note) {
  const wrap = adminEl("div", "admin-meters");
  rows.forEach((row) => {
    const total = Number(row.total) || 0;
    const value = Number(row.value) || 0;
    const pct = total > 0 ? Math.round((value * 1000) / total) / 10 : 0;
    const item = adminEl("div", "admin-meter");
    const top = adminEl("div", "admin-meter-top");
    top.appendChild(adminEl("div", "admin-meter-label", row.label));
    top.appendChild(adminEl("div", "admin-meter-n", adminNum(value) + " · " + pct.toFixed(1) + "%"));
    item.appendChild(top);
    const track = adminEl("div", "admin-meter-track");
    const fill = adminEl("div", "admin-meter-fill");
    fill.style.width = Math.min(100, pct) + "%";
    track.appendChild(fill);
    item.appendChild(track);
    wrap.appendChild(item);
  });
  if (note) wrap.appendChild(adminEl("div", "admin-meter-note", note));
  return wrap;
}

function adminBarChart(opts) {
  const wrap = adminEl("div", "overview-chart");
  const scale = adminEl("div", "overview-chart-scale");
  (opts.scale || []).forEach((label) => scale.appendChild(adminEl("span", "", label)));
  wrap.appendChild(scale);
  const cols = adminEl("div", "overview-chart-bars");
  const max = Number(opts.max) || 1;
  (opts.bars || []).forEach((bar) => {
    const col = adminEl("div", "overview-bar-col");
    col.appendChild(adminEl("div", "overview-bar-n", String(bar.value)));
    const track = adminEl("div", "overview-bar-track");
    const fill = adminEl("div", "overview-bar" + (bar.hot ? " is-hot" : ""));
    fill.style.height = Math.max(8, Math.round((Number(bar.value) / max) * 100)) + "%";
    track.appendChild(fill);
    col.appendChild(track);
    col.appendChild(adminEl("div", "overview-bar-k", bar.label));
    cols.appendChild(col);
  });
  wrap.appendChild(cols);
  return wrap;
}

function adminTable(columns, rows, className) {
  const table = adminEl("table", "admin-table" + (className ? " " + className : ""));
  const thead = adminEl("thead");
  const hr = adminEl("tr");
  columns.forEach((col) => hr.appendChild(adminEl("th", "", col)));
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = adminEl("tbody");
  rows.forEach((row) => {
    const tr = adminEl("tr");
    row.forEach((cell) => tr.appendChild(adminEl("td", "", cell)));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function adminPulse(rows, note) {
  const wrap = adminEl("div");
  rows.forEach((row) => {
    const line = adminEl("div", "admin-pulse-row");
    line.appendChild(adminEl("div", "admin-pulse-k", row.label));
    const value = adminEl("div", "admin-pulse-v");
    if (row.pill) value.appendChild(adminEl("span", "admin-pill", row.pill));
    if (row.value) value.appendChild(document.createTextNode(row.value));
    if (row.delta) value.appendChild(adminEl("span", "overview-delta is-" + (row.tone || "up"), row.delta));
    line.appendChild(value);
    wrap.appendChild(line);
  });
  if (note) wrap.appendChild(adminEl("p", "admin-pulse-note", note));
  return wrap;
}

function adminNotes(items) {
  const wrap = adminEl("div");
  items.forEach((item) => {
    const block = adminEl("div", "admin-note-block");
    block.appendChild(adminEl("div", "admin-note-title", item.title));
    block.appendChild(adminEl("p", "admin-note-copy", item.copy));
    wrap.appendChild(block);
  });
  return wrap;
}

function adminKpiRow(host, cards) {
  const grid = adminEl("div", "overview-kpis");
  if (cards.length !== 5) grid.className = "overview-kpis is-" + cards.length;
  cards.forEach((card) => grid.appendChild(adminStatCard(card)));
  host.appendChild(grid);
}

function adminPeopleList(rows) {
  const list = adminEl("div", "admin-people");
  if (!rows.length) {
    list.appendChild(adminEl("div", "admin-people-empty", "No recent signups."));
    return list;
  }
  rows.forEach((row) => {
    const item = adminEl("div", "admin-people-row");
    const shown = row.display_name || row.username || "Account";
    const face = adminEl("div", "admin-people-face", shown.slice(0, 1).toUpperCase());
    const text = adminEl("div", "admin-people-text");
    text.appendChild(adminEl("div", "admin-people-name", shown));
    text.appendChild(adminEl("div", "admin-people-sub", row.username ? "@" + row.username : ""));
    item.appendChild(face);
    item.appendChild(text);
    item.appendChild(adminEl("div", "admin-people-meta", row.meta || ""));
    list.appendChild(item);
  });
  return list;
}

function paintAdminPlaceholder(main, title, note) {
  const page = currentAdminPage();
  main.appendChild(adminPageHead({
    crumbs: ["Admin", page ? page.label : title, title],
    title: title,
    note: note,
    badge: "Read only"
  }));
}

let adminModConfirm = null;

function closeAdminMod() {
  const overlay = document.getElementById("admin-mod-overlay");
  if (overlay) overlay.hidden = true;
  adminModConfirm = null;
}

function adminModError(text) {
  const err = document.getElementById("admin-mod-error");
  if (!err) return;
  err.textContent = text || "";
  err.hidden = !text;
}

function openAdminMod(opts) {
  const overlay = document.getElementById("admin-mod-overlay");
  const title = document.getElementById("admin-mod-title");
  const body = document.getElementById("admin-mod-body");
  const confirm = document.getElementById("admin-mod-confirm");
  const cancel = document.getElementById("admin-mod-cancel");
  if (!overlay || !body) return;
  title.textContent = (opts && opts.title) || "";
  confirm.textContent = (opts && opts.confirm) || "Confirm";
  cancel.textContent = (opts && opts.cancel) || "Cancel";
  confirm.classList.toggle("is-danger", !!(opts && opts.danger));
  body.innerHTML = "";
  if (opts && opts.body) body.appendChild(opts.body);
  adminModError("");
  adminModConfirm = opts && opts.onConfirm;
  overlay.hidden = false;
}

function bindAdminMod() {
  const overlay = document.getElementById("admin-mod-overlay");
  if (!overlay || overlay.dataset.bound) return;
  overlay.dataset.bound = "1";
  const close = document.getElementById("admin-mod-close");
  const cancel = document.getElementById("admin-mod-cancel");
  const confirm = document.getElementById("admin-mod-confirm");
  if (close) close.addEventListener("click", closeAdminMod);
  if (cancel) cancel.addEventListener("click", closeAdminMod);
  if (confirm) confirm.addEventListener("click", () => {
    if (typeof adminModConfirm === "function") adminModConfirm();
  });
}

bindAdminMod();

function ensureAdminStylesheet(id, href) {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

function ensureAdminScript(src) {
  if (document.querySelector("script[src=\"" + src + "\"]")) return Promise.resolve();
  return new Promise((resolve) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => resolve();
    document.body.appendChild(el);
  });
}

function ensureAdminAppCss() {
  return ensureAdminStylesheet("admin-app-css", "../main/app.css?v=504");
}

function ensureAdminScripts(list) {
  return (list || []).reduce((chain, src) => chain.then(() => ensureAdminScript(src)), Promise.resolve());
}

function ensureAdminProfileLayer() {
  if (typeof renderProfileBoard === "function") return Promise.resolve();
  if (!window.__adminProfileLayer) {
    window.__adminProfileLayer = ensureAdminAppCss().then(() => ensureAdminScripts([
      "../shared/media-player.js?v=6",
      "../shared/music-player.js?v=2",
      "../shared/embed-frame.js?v=1",
      "../shared/gallery-frame.js?v=1",
      "profile-bridge.js?v=2",
      "../main/profile-identity.js?v=19",
      "../main/profile-comments.js?v=9",
      "../main/profile-board.js?v=137",
      "../main/mini-profile.js?v=45"
    ])).then(() => {
      if (typeof adminSyncProfileOwner === "function") adminSyncProfileOwner();
    });
  }
  return window.__adminProfileLayer;
}
