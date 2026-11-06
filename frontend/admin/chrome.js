const ADMIN_ICON = {
  chart: "M4 19V5 M4 19h16 M8 16v-5 M12 16V8 M16 16v-8",
  users: "M16 19v-1.2A2.8 2.8 0 0 0 13.2 15H6.8A2.8 2.8 0 0 0 4 17.8V19 M10 11.5A3.5 3.5 0 1 0 10 4.5a3.5 3.5 0 0 0 0 7z M20 19v-1.1A2.4 2.4 0 0 0 17.6 15.5h-.4 M16.5 4.7a3 3 0 0 1 0 5.6",
  flag: "M5 21V4 M5 4h10l-1.5 3.5L15 11H5",
  shield: "M12 3 5 6v6c0 4.2 2.8 7.2 7 9 4.2-1.8 7-4.8 7-9V6z",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  share: "M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M19 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M10.4 6.5 6.7 15.2 M13.6 6.5l3.7 8.7 M7 19h10",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z",
  down: "M6 9l6 6 6-6",
  right: "M9 6l6 6-6 6"
};

const ADMIN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  if (opts.clock !== false) meta.appendChild(adminEl("div", "admin-clock", adminUtcStamp()));
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

function adminTable(columns, rows) {
  const table = adminEl("table", "admin-table");
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
