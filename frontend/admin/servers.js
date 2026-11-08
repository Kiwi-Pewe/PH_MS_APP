const SERVERS_PAGE = 25;
const SERVERS_BY = [
  { id: "id", label: "Server ID", hint: "Server ID" },
  { id: "name", label: "Name", hint: "Name" }
];

let serversBy = "id";
let serversQuery = "";
let serversOffset = 0;
let serversHasMore = false;
let serversLoading = false;
let serversRows = [];
let serversSelectedId = "";
let serversSelected = null;
let serversTimer = 0;
let serversReports = [];
let serversOpenId = 0;
let serversEvents = [];

function serversByMeta(id) {
  return SERVERS_BY.find((row) => row.id === id) || SERVERS_BY[0];
}

function serversSelectEmpty(host) {
  host.innerHTML = "";
  host.appendChild(adminEl("div", "users-empty", "Select a server."));
}

function serversReportView(host) {
  return {
    selected: !!serversSelectedId,
    reports: serversReports,
    openId: serversOpenId,
    events: serversEvents,
    empty: "Select a server.",
    onOpen: openServersHistory,
    onBack: () => {
      serversOpenId = 0;
      serversEvents = [];
      paintServersReports(host);
    },
    onSaved: (data) => {
      if (data && data.report) {
        serversReports = serversReports.map((item) => item.id === data.report.id ? data.report : item);
      }
      serversEvents = (data && data.events) || [];
      paintServersReports(host);
    }
  };
}

function paintServersReports(host) {
  if (typeof paintUsersReports !== "function") {
    serversSelectEmpty(host);
    return;
  }
  paintUsersReports(host, serversReportView(host));
}

function openServersHistory(reportId) {
  serversOpenId = reportId;
  serversEvents = [];
  const host = document.getElementById("servers-reports");
  if (host) paintServersReports(host);
  adminApi("/admin/feedback/" + reportId + "/events").then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    if (serversOpenId !== reportId) return;
    serversEvents = (data && data.events) || [];
    if (host) paintServersReports(host);
  }).catch(() => {
    if (host) paintServersReports(host);
  });
}

function paintServersAccount(host, row) {
  host.innerHTML = "";
  if (!row) {
    serversSelectEmpty(host);
    return;
  }
  const ident = usersCard({});
  const banner = adminEl("div", "users-banner");
  if (row.banner_url) banner.style.backgroundImage = "url(\"" + row.banner_url + "\")";
  else if (row.banner_color) banner.style.background = row.banner_color;
  ident.appendChild(banner);
  const who = adminEl("div", "users-account-who");
  const face = adminEl("div", "users-account-face is-server");
  usersFace(face, { avatar: row.icon_url }, row.name);
  who.appendChild(face);
  const names = adminEl("div", "users-account-names");
  names.appendChild(adminEl("div", "users-account-display", row.name || "—"));
  names.appendChild(adminEl("div", "users-account-handle", row.id || "—"));
  who.appendChild(names);
  ident.appendChild(who);
  const dates = adminEl("div", "users-account-dates");
  const created = adminEl("div", "");
  created.appendChild(adminEl("div", "users-account-date-k", "Created"));
  created.appendChild(adminEl("div", "users-account-date-v", usersCreated(row.created_at)));
  const owner = adminEl("div", "");
  owner.appendChild(adminEl("div", "users-account-date-k", "Owner"));
  owner.appendChild(adminEl("div", "users-account-date-v", row.owner_display_name || row.owner_username || "—"));
  dates.appendChild(created);
  dates.appendChild(owner);
  ident.appendChild(dates);
  host.appendChild(ident);
  const summary = usersCard({ title: "Server", className: "users-summary", fill: true });
  const stats = adminEl("div", "users-stats");
  stats.appendChild(usersStat("Members", adminNum(row.member_count)));
  stats.appendChild(usersStat("Type", row.server_type_label || row.server_type || "—"));
  stats.appendChild(usersStat("URL", row.url_slug || "—"));
  stats.appendChild(usersStat("About", row.about || "—"));
  stats.appendChild(usersStat("Finder", row.discoverable ? "On the finder" : "Not on the finder"));
  summary.appendChild(stats);
  host.appendChild(summary);
  const notes = usersCard({ title: "Server notes", className: "users-notes" });
  const area = adminEl("textarea", "users-note-input");
  area.rows = 5;
  area.placeholder = "Click to add a note";
  area.disabled = true;
  notes.appendChild(area);
  host.appendChild(notes);
  const foot = adminEl("div", "users-actions");
  const track = adminEl("button", "users-btn-track", "Track Server");
  track.type = "button";
  track.disabled = true;
  const report = adminEl("button", "users-btn-report", "Create Report");
  report.type = "button";
  report.disabled = true;
  foot.appendChild(track);
  foot.appendChild(report);
  host.appendChild(foot);
}

function paintServersRows(list) {
  list.innerHTML = "";
  serversRows.forEach((row) => {
    const btn = adminEl("button", "users-row" + (row.id === serversSelectedId ? " is-on" : ""));
    btn.type = "button";
    const face = adminEl("div", "users-face is-server");
    usersFace(face, { avatar: row.icon_url }, row.name);
    btn.appendChild(face);
    const text = adminEl("div", "users-row-text");
    text.appendChild(adminEl("div", "users-row-name", row.name || "—"));
    text.appendChild(adminEl("div", "users-row-handle", row.id || "—"));
    btn.appendChild(text);
    btn.addEventListener("click", () => selectServersRow(row.id));
    list.appendChild(btn);
  });
  if (serversHasMore) {
    const more = adminEl("button", "users-more", "Load more");
    more.type = "button";
    more.disabled = serversLoading;
    more.addEventListener("click", () => loadServersList(true));
    list.appendChild(more);
  }
}

function selectServersRow(serverId) {
  serversSelectedId = serverId;
  serversOpenId = 0;
  serversEvents = [];
  const list = document.getElementById("servers-search-list");
  if (list) paintServersRows(list);
  const mid = document.getElementById("servers-reports");
  const account = document.getElementById("servers-account");
  Promise.all([
    adminApi("/admin/server/" + encodeURIComponent(serverId)).then((response) => response.ok ? response.json() : null),
    adminApi("/admin/server/" + encodeURIComponent(serverId) + "/reports").then((response) => response.ok ? response.json() : null)
  ]).then((parts) => {
    if (serversSelectedId !== serverId) return;
    const detail = parts[0];
    const reports = parts[1];
    if (detail && detail.server) serversSelected = detail.server;
    serversReports = (reports && reports.reports) || [];
    if (account) paintServersAccount(account, serversSelected);
    if (mid) paintServersReports(mid);
  }).catch(() => {});
}

function loadServersList(more) {
  if (serversLoading) return;
  if (more && !serversHasMore) return;
  if (!more) {
    serversOffset = 0;
    serversRows = [];
    serversHasMore = false;
  }
  serversLoading = true;
  const params = new URLSearchParams();
  params.set("by", serversBy);
  params.set("q", serversQuery);
  params.set("offset", String(serversOffset));
  params.set("limit", String(SERVERS_PAGE));
  adminApi("/admin/server?" + params.toString()).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    serversLoading = false;
    const rows = (data && data.servers) || [];
    serversHasMore = !!(data && data.has_more);
    serversRows = more ? serversRows.concat(rows) : rows;
    serversOffset = serversRows.length;
    const list = document.getElementById("servers-search-list");
    if (list) paintServersRows(list);
  }).catch(() => {
    serversLoading = false;
  });
}

function queueServersSearch() {
  window.clearTimeout(serversTimer);
  serversTimer = window.setTimeout(() => loadServersList(false), 250);
}

function paintServersSearch(main) {
  main.className = "is-users is-servers";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Servers", "Search"],
    title: "Search",
    note: "Search for servers to review relative reports.",
    clock: "est"
  }));
  const board = adminEl("div", "users-search");
  const left = adminEl("div", "users-stack is-left");
  const search = usersCard({});
  const fields = adminEl("div", "users-search-fields");
  fields.appendChild(adminEl("div", "users-field-k", "Search by"));
  const select = adminEl("select", "users-search-by");
  SERVERS_BY.forEach((opt) => {
    const item = document.createElement("option");
    item.value = opt.id;
    item.textContent = opt.label;
    if (opt.id === serversBy) item.selected = true;
    select.appendChild(item);
  });
  fields.appendChild(select);
  fields.appendChild(adminEl("div", "users-field-k", "Query"));
  const input = adminEl("input", "users-search-q");
  input.type = "text";
  input.value = serversQuery;
  input.placeholder = serversByMeta(serversBy).hint;
  select.addEventListener("change", () => {
    serversBy = select.value || "id";
    input.placeholder = serversByMeta(serversBy).hint;
    queueServersSearch();
  });
  input.addEventListener("input", () => {
    serversQuery = input.value || "";
    queueServersSearch();
  });
  fields.appendChild(input);
  const filter = adminEl("button", "admin-filter-pill");
  filter.type = "button";
  filter.disabled = true;
  filter.appendChild(adminEl("span", "", "Filters"));
  filter.appendChild(adminIcon("down"));
  fields.appendChild(filter);
  search.appendChild(fields);
  left.appendChild(search);
  const entries = usersCard({ title: "Server entries", fill: true });
  const list = adminEl("div", "users-search-list");
  list.id = "servers-search-list";
  entries.appendChild(list);
  left.appendChild(entries);
  board.appendChild(left);
  const mid = adminEl("div", "users-stack is-mid");
  mid.id = "servers-reports";
  if (serversSelectedId) paintServersReports(mid);
  else serversSelectEmpty(mid);
  board.appendChild(mid);
  const right = adminEl("div", "users-stack is-right");
  right.id = "servers-account";
  if (serversSelected) paintServersAccount(right, serversSelected);
  else serversSelectEmpty(right);
  board.appendChild(right);
  main.appendChild(board);
  main.appendChild(adminEl("div", "overview-page-foot", "Snapshot data · Updates every 5 minutes"));
  if (serversRows.length) paintServersRows(list);
  else loadServersList(false);
}

function paintServers(main) {
  paintServersSearch(main);
}

registerAdminPage({
  id: "servers",
  label: "Servers",
  sections: [
    { id: "search", label: "Search", icon: "grid" },
    { id: "layout", label: "Layout", icon: "share", later: true },
    { id: "members", label: "Members", icon: "users", later: true },
    { id: "ownership", label: "Track Ownership", icon: "eye", later: true }
  ],
  paint: paintServers
});
