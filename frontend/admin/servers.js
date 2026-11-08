const SERVERS_PAGE = 25;
const SERVERS_BY = [
  { id: "id", label: "Server ID", hint: "Server ID" },
  { id: "name", label: "Name", hint: "Name" }
];
const SERVERS_LOCKS = [
  { id: "voice", label: "Allow Voice Chat" },
  { id: "images", label: "Allow Images" },
  { id: "joins", label: "Allow Joins" },
  { id: "discovery", label: "Allow Discovery" }
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
  stats.appendChild(usersStat("Currently Active Users", adminNum(row.online_count)));
  stats.appendChild(usersStat("Type", row.server_type_label || row.server_type || "—"));
  stats.appendChild(usersStat("URL", row.url_slug || "—"));
  stats.appendChild(usersStat("About", row.about || "—"));
  stats.appendChild(usersStat("Public", row.discoverable ? "True" : "False"));
  stats.appendChild(usersStat("Latest Activity", usersCreated(row.last_activity)));
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
  track.addEventListener("click", () => trackAdminServer(row));
  const report = adminEl("button", "users-btn-report", "Create Report");
  report.type = "button";
  report.addEventListener("click", () => openServersCreateReport(row));
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

function openServersCreateReport(row) {
  const overlay = document.getElementById("admin-report-overlay");
  const left = document.getElementById("admin-report-left");
  const body = document.getElementById("admin-report-body");
  const create = document.getElementById("admin-report-create");
  const cancel = document.getElementById("admin-report-cancel");
  if (!overlay || !left || !body) return;
  left.innerHTML = "";
  body.innerHTML = "";
  usersReportError("");
  const banner = adminEl("div", "users-banner");
  if (row.banner_url) banner.style.backgroundImage = "url(\"" + row.banner_url + "\")";
  else if (row.banner_color) banner.style.background = row.banner_color;
  left.appendChild(banner);
  const who = adminEl("div", "users-account-who");
  const face = adminEl("div", "users-account-face is-server");
  usersFace(face, { avatar: row.icon_url }, row.name);
  who.appendChild(face);
  const names = adminEl("div", "users-account-names");
  names.appendChild(adminEl("div", "users-account-display", row.name || "—"));
  names.appendChild(adminEl("div", "users-account-handle", row.id || "—"));
  who.appendChild(names);
  left.appendChild(who);
  left.appendChild(adminEl("div", "admin-report-rule"));
  const locks = SERVERS_LOCKS.map((item) => usersLockControl(item));
  locks.forEach((item) => left.appendChild(item.wrap));
  const modeSwitch = adminEl("div", "admin-report-switch is-wide");
  const generalBtn = adminEl("button", "is-on", "General");
  const modBtn = adminEl("button", "", "Moderation");
  generalBtn.type = "button";
  modBtn.type = "button";
  modeSwitch.appendChild(generalBtn);
  modeSwitch.appendChild(modBtn);
  body.appendChild(modeSwitch);
  body.appendChild(adminEl("div", "admin-report-rule"));
  const generalBox = adminEl("div", "admin-report-mode");
  const alertLine = adminEl("div", "admin-report-check");
  alertLine.appendChild(adminEl("span", "", "Alert Server Owner"));
  const alertToggle = usersToggle(false);
  alertLine.appendChild(alertToggle.label);
  const infoLine = adminEl("div", "admin-report-check");
  infoLine.appendChild(adminEl("span", "", "Requests Info From User"));
  const infoToggle = usersToggle(false);
  infoLine.appendChild(infoToggle.label);
  generalBox.appendChild(alertLine);
  generalBox.appendChild(infoLine);
  const modBox = adminEl("div", "admin-report-mode");
  modBox.hidden = true;
  const warnLine = adminEl("div", "admin-report-check");
  warnLine.appendChild(adminEl("span", "", "Warn Server Owner"));
  const warnToggle = usersToggle(false);
  warnLine.appendChild(warnToggle.label);
  const warnReason = adminEl("textarea", "admin-report-reason");
  warnReason.rows = 5;
  warnReason.placeholder = "Reason";
  warnReason.hidden = true;
  warnToggle.input.addEventListener("change", () => {
    warnReason.hidden = !warnToggle.input.checked;
  });
  const disbandLine = adminEl("div", "admin-report-check");
  disbandLine.appendChild(adminEl("span", "", "Disband Server"));
  const disbandToggle = usersToggle(false);
  disbandLine.appendChild(disbandToggle.label);
  const flagLine = adminEl("div", "admin-report-check");
  flagLine.appendChild(adminEl("span", "", "Flag Server"));
  const flagToggle = usersToggle(false);
  flagLine.appendChild(flagToggle.label);
  modBox.appendChild(warnLine);
  modBox.appendChild(warnReason);
  modBox.appendChild(disbandLine);
  modBox.appendChild(flagLine);
  body.appendChild(generalBox);
  body.appendChild(modBox);
  let mode = "general";
  function setMode(next) {
    mode = next;
    generalBtn.classList.toggle("is-on", next === "general");
    modBtn.classList.toggle("is-on", next === "moderation");
    generalBox.hidden = next !== "general";
    modBox.hidden = next !== "moderation";
  }
  generalBtn.addEventListener("click", () => setMode("general"));
  modBtn.addEventListener("click", () => setMode("moderation"));
  body.appendChild(adminEl("div", "admin-report-rule"));
  body.appendChild(adminEl("div", "admin-report-k", "Status"));
  const extra = adminEl("div", "admin-report-extra");
  const status = adminEl("select", "admin-report-input");
  [
    { id: "open", label: "Open" },
    { id: "followup", label: "Needs Followup" },
    { id: "closed", label: "Closed" }
  ].forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.label;
    status.appendChild(opt);
  });
  status.value = "open";
  status.addEventListener("change", () => {
    extra.hidden = status.value === "closed";
  });
  body.appendChild(status);
  extra.appendChild(adminEl("div", "admin-report-k", "Assign to"));
  const assign = adminEl("select", "admin-report-input");
  const everyone = document.createElement("option");
  everyone.value = "";
  everyone.textContent = "Everyone";
  assign.appendChild(everyone);
  const assignOpt = document.createElement("option");
  assignOpt.value = String((adminUser && adminUser.id) || "");
  assignOpt.textContent = (adminUser && (adminUser.display_name || adminUser.username)) || "kiwi";
  assign.appendChild(assignOpt);
  assign.value = "";
  extra.appendChild(assign);
  extra.appendChild(adminEl("div", "admin-report-k", "Urgency"));
  const urgency = adminEl("select", "admin-report-input");
  [
    { id: "high", label: "High" },
    { id: "medium", label: "Medium" },
    { id: "low", label: "Low" }
  ].forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.label;
    urgency.appendChild(opt);
  });
  urgency.value = "low";
  extra.appendChild(urgency);
  body.appendChild(extra);
  body.appendChild(adminEl("div", "admin-report-k", "Additional Information"));
  const info = adminEl("textarea", "admin-report-reason");
  info.rows = 5;
  body.appendChild(info);
  function submit() {
    usersReportError("");
    if (mode === "moderation" && warnToggle.input.checked && !String(warnReason.value || "").trim()) {
      usersReportError("Write a warn reason.");
      return;
    }
    if (!String(info.value || "").trim()) {
      usersReportError("Write additional information.");
      return;
    }
    adminApi("/admin/server/" + encodeURIComponent(row.id) + "/report", {
      method: "POST",
      body: {
        report: info.value,
        mode: mode,
        status: status.value,
        assign_id: status.value === "closed" ? null : Number(assign.value) || null,
        urgency: status.value === "closed" ? "" : urgency.value,
        alert_user: mode === "general" && alertToggle.input.checked,
        requests_info: mode === "general" && infoToggle.input.checked,
        warn: mode === "moderation" && warnToggle.input.checked,
        warn_reason: warnReason.value,
        disband: mode === "moderation" && disbandToggle.input.checked,
        flag: mode === "moderation" && flagToggle.input.checked,
        locks: locks.map((item) => item.read())
      }
    }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
      if (!result.ok) {
        const detail = result.data && result.data.detail;
        usersReportError(typeof detail === "string" ? detail : "Could not create the report.");
        return;
      }
      closeUsersReport();
      if (result.data && result.data.server) serversSelected = result.data.server;
      if (result.data && result.data.report) serversReports.unshift(result.data.report);
      const mid = document.getElementById("servers-reports");
      if (mid) paintServersReports(mid);
      const account = document.getElementById("servers-account");
      if (account && serversSelected) paintServersAccount(account, serversSelected);
    }).catch(() => usersReportError("Could not create the report."));
  }
  create.onclick = submit;
  cancel.onclick = closeUsersReport;
  overlay.hidden = false;
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

if (typeof registerAdminTrackedServerOpen === "function") {
  registerAdminTrackedServerOpen("servers", "search", (serverId) => {
    showAdminPage("servers", "search");
    selectServersRow(serverId);
  });
}
