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
let serversLayoutId = "";
let serversLayoutChannelId = 0;
const SERVERS_LAYOUT_GAP = 5 * 60 * 1000;

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

function serversLayoutIcon(channelType) {
  const kind = String(channelType || "").toLowerCase();
  if (kind === "voice") return "\u{1F50A}";
  if (kind === "forums") return "\u{1F5C2}";
  if (kind === "announcements") return "\u{1F4E2}";
  if (kind === "doc") return "\u{1F4C4}";
  if (kind === "lists") return "\u2611";
  if (kind === "media") return "\u{1F5BC}";
  if (kind === "events") return "\u{1F4C5}";
  if (kind === "scheduling") return "\u{1F552}";
  if (kind === "docs") return "\u{1F4D5}";
  if (kind === "tournaments") return "\u{1F3C6}";
  if (kind === "watchparty") return "\u{1F3A6}";
  return "#";
}

function serversLayoutChat(channel) {
  const kind = String((channel && channel.channel_type) || "text").toLowerCase();
  return kind === "text";
}

function serversLayoutSeed(serverId) {
  const tracked = (typeof adminTrackedServers !== "undefined" ? adminTrackedServers : []).find((row) => row && row.id === serverId);
  return {
    id: serverId,
    name: (tracked && tracked.name) || "Server",
    icon_url: (tracked && tracked.icon_url) || "",
    banner_url: "",
    banner_color: "",
    discoverable: true,
    categories: []
  };
}

function closeServersLayout() {
  serversLayoutId = "";
  serversLayoutChannelId = 0;
  const main = document.getElementById("admin-main");
  if (main && adminPage === "servers" && adminSection === "layout") {
    main.innerHTML = "";
    paintServersLayout(main);
  }
}

function serversLayoutEmpty(title, sub) {
  const empty = document.getElementById("admin-layout-empty");
  const messages = document.getElementById("admin-layout-messages");
  const welcome = document.getElementById("admin-layout-empty-title");
  const note = document.getElementById("admin-layout-empty-sub");
  if (messages) {
    messages.innerHTML = "";
    messages.classList.remove("is-on");
  }
  if (empty) empty.hidden = false;
  if (welcome) welcome.textContent = title || "";
  if (note) note.textContent = sub || "";
}

function serversLayoutBanner(server) {
  const face = document.getElementById("admin-layout-face");
  const strip = document.getElementById("admin-layout-banner");
  if (!face || !strip) return;
  const url = (server && server.banner_url) || "";
  const color = (server && server.banner_color) || "";
  strip.style.backgroundImage = url ? "url(\"" + url + "\")" : "";
  strip.style.backgroundColor = (!url && color) ? color : "";
  face.classList.toggle("has-banner", !!(url || color));
}

function serversLayoutFace(host, row, letterName) {
  if (typeof usersFace === "function") {
    usersFace(host, row, letterName);
    return;
  }
  host.textContent = (letterName || "?").slice(0, 1).toUpperCase();
}

function serversLayoutLinkText(host, text) {
  const value = String(text || "");
  const parts = value.split(/(https?:\/\/[^\s]+)/gi);
  parts.forEach((part) => {
    if (/^https?:\/\//i.test(part)) {
      const link = document.createElement("a");
      link.href = part;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = part;
      host.appendChild(link);
    } else if (part) {
      host.appendChild(document.createTextNode(part));
    }
  });
}

function serversLayoutMedia(bubble, attachment) {
  const att = attachment && typeof attachment === "object" ? attachment : null;
  if (!att || !att.url) return;
  const wrap = adminEl("div", "admin-layout-media");
  if (att.kind === "video") {
    const vid = document.createElement("video");
    vid.src = att.url;
    vid.controls = true;
    vid.preload = "metadata";
    wrap.appendChild(vid);
  } else {
    const img = document.createElement("img");
    img.src = att.url;
    img.alt = att.name || "image";
    wrap.appendChild(img);
  }
  bubble.appendChild(wrap);
}

function serversLayoutReply(reply) {
  if (!reply) return null;
  const row = adminEl("div", "admin-layout-reply");
  row.appendChild(adminEl("span", "admin-layout-reply-name", reply.username || "user"));
  row.appendChild(adminEl("span", "", reply.deleted ? "Original message was deleted" : (reply.content || "")));
  return row;
}

function serversLayoutCluster(wrap, msg) {
  const cluster = adminEl("div", "admin-layout-msg" + (msg.isMine ? " is-self" : ""));
  const avatar = adminEl("div", "admin-layout-msg-face");
  serversLayoutFace(avatar, { avatar: msg.avatar }, msg.username);
  const body = adminEl("div", "admin-layout-msg-body");
  if (msg.replyTo) {
    const reply = serversLayoutReply(msg.replyTo);
    if (reply) body.appendChild(reply);
  }
  const header = adminEl("div", "admin-layout-msg-head");
  header.appendChild(adminEl("span", "admin-layout-msg-name", msg.nickname || msg.username || "user"));
  const time = adminEl("span", "admin-layout-msg-time");
  time.textContent = typeof formatClusterTime === "function" && msg.time ? formatClusterTime(msg.time) : "";
  header.appendChild(time);
  const bubble = adminEl("div", "admin-layout-bubble");
  if (msg.content) {
    const line = adminEl("div", "admin-layout-line");
    serversLayoutLinkText(line, msg.content);
    if (msg.edited) line.appendChild(adminEl("span", "admin-layout-edited", "edited"));
    bubble.appendChild(line);
  }
  serversLayoutMedia(bubble, msg.attachment);
  if (msg.reactions && msg.reactions.length) {
    const row = adminEl("div", "admin-layout-react");
    msg.reactions.forEach((item) => {
      const pill = adminEl("div", "admin-layout-pill");
      pill.appendChild(adminEl("span", "", item.emoji || ""));
      pill.appendChild(adminEl("span", "", String(item.count || 0)));
      row.appendChild(pill);
    });
    bubble.appendChild(row);
  }
  body.appendChild(header);
  body.appendChild(bubble);
  cluster.appendChild(avatar);
  cluster.appendChild(body);
  wrap.appendChild(cluster);
  return { username: msg.username, lastTime: msg.time, isMine: msg.isMine };
}

function serversLayoutPaintMessages(rows, channelName) {
  const empty = document.getElementById("admin-layout-empty");
  const wrap = document.getElementById("admin-layout-messages");
  const body = document.getElementById("admin-layout-body");
  if (!wrap) return;
  wrap.innerHTML = "";
  wrap.classList.add("is-on");
  if (empty) empty.hidden = true;
  const card = adminEl("div", "admin-layout-start");
  card.appendChild(adminEl("div", "admin-layout-start-mark", "#"));
  card.appendChild(adminEl("div", "admin-layout-start-name", "#" + (channelName || "channel")));
  card.appendChild(adminEl("div", "admin-layout-start-desc", "This is the start of #" + (channelName || "channel") + ". Welcome!"));
  wrap.appendChild(card);
  let open = null;
  const lastDate = { date: null };
  (rows || []).forEach((raw) => {
    const msg = {
      id: raw.id,
      senderId: raw.sender_id,
      username: raw.username || "",
      nickname: raw.nickname || "",
      content: raw.content || "",
      attachment: raw.attachment,
      time: raw.timestamp ? new Date(String(raw.timestamp).replace(" ", "T")) : null,
      edited: !!raw.edited,
      reactions: raw.reactions || [],
      replyTo: raw.reply_to,
      avatar: raw.avatar,
      isMine: !!(adminUser && raw.sender_id === adminUser.id),
      isWebhook: !!raw.is_webhook
    };
    if (msg.time && Number.isNaN(msg.time.getTime())) msg.time = new Date(raw.timestamp);
    if (raw.sender_id == null && !raw.is_webhook) {
      wrap.appendChild(adminEl("div", "admin-layout-system", msg.content || ""));
      open = null;
      return;
    }
    const when = msg.time;
    if (when && lastDate.date && typeof sameCalendarDay === "function" && !sameCalendarDay(lastDate.date, when)) {
      wrap.appendChild(adminEl("div", "admin-layout-date", when.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })));
      open = null;
    }
    if (when) lastDate.date = when;
    const same = open && open.isMine === msg.isMine && open.username === msg.username;
    const within = open && when && open.lastTime && (when - open.lastTime) <= SERVERS_LAYOUT_GAP;
    if (msg.replyTo || !(same && within)) {
      open = serversLayoutCluster(wrap, msg);
    } else if (open) {
      const bubble = wrap.lastChild && wrap.lastChild.querySelector(".admin-layout-bubble");
      if (msg.content && bubble) {
        const line = adminEl("div", "admin-layout-line");
        serversLayoutLinkText(line, msg.content);
        if (msg.edited) line.appendChild(adminEl("span", "admin-layout-edited", "edited"));
        bubble.appendChild(line);
      }
      if (bubble) serversLayoutMedia(bubble, msg.attachment);
      open.lastTime = when;
    }
  });
  if (body) body.scrollTop = body.scrollHeight;
}

function serversLayoutHeader(channel) {
  const title = document.getElementById("admin-layout-title");
  const desc = document.getElementById("admin-layout-desc");
  if (title) title.textContent = channel && channel.name ? "#" + channel.name : "No channel selected";
  if (desc) {
    const topic = channel && channel.topic ? channel.topic : "";
    desc.textContent = topic;
    desc.hidden = !topic;
  }
}

function paintServersLayoutHold(list) {
  if (!list) return;
  list.innerHTML = "";
  const hold = adminEl("div", "admin-layout-hold");
  ["is-wide", "is-mid", "is-short", "is-wide", "is-mid", "is-short", "is-wide", "is-mid"].forEach((size) => {
    hold.appendChild(adminEl("div", "admin-layout-hold-row " + size));
  });
  list.appendChild(hold);
}

function paintServersLayoutRail(server, live) {
  const name = document.getElementById("admin-layout-name");
  const stage = document.getElementById("admin-layout-stage");
  if (name) name.textContent = (server && server.name) || "—";
  if (stage) stage.classList.toggle("is-private", !live);
  serversLayoutBanner(server);
  const list = document.getElementById("admin-layout-cats");
  if (!list) return;
  list.innerHTML = "";
  const cats = (server && server.categories) || [];
  if (!cats.length) {
    paintServersLayoutHold(list);
    return;
  }
  cats.forEach((category) => {
    const block = adminEl("div", "admin-layout-cat");
    const header = adminEl("div", "admin-layout-cat-head");
    header.appendChild(adminEl("span", "admin-layout-cat-arrow", "\u25BE"));
    header.appendChild(adminEl("span", "admin-layout-cat-name", category.name || ""));
    if (live) {
      header.addEventListener("click", () => {
        block.classList.toggle("collapsed");
      });
    }
    block.appendChild(header);
    const channels = adminEl("div", "admin-layout-channels");
    (category.channels || []).forEach((channel) => {
      const row = adminEl("div", "admin-layout-channel" + (channel.id === serversLayoutChannelId ? " is-on" : ""));
      row.appendChild(adminEl("span", "admin-layout-channel-icon", serversLayoutIcon(channel.channel_type)));
      row.appendChild(adminEl("span", "admin-layout-channel-name", channel.name || ""));
      if (live) {
        row.addEventListener("click", () => openServersLayoutChannel(server, channel));
      }
      channels.appendChild(row);
    });
    block.appendChild(channels);
    list.appendChild(block);
  });
}

function openServersLayoutChannel(server, channel) {
  if (!server || !channel || !serversLayoutChat(channel)) {
    serversLayoutChannelId = channel && channel.id ? channel.id : 0;
    paintServersLayoutRail(server, true);
    serversLayoutHeader(channel);
    serversLayoutEmpty("#" + ((channel && channel.name) || "channel"), "Chat history is only available in text channels.");
    return;
  }
  serversLayoutChannelId = channel.id;
  paintServersLayoutRail(server, true);
  serversLayoutHeader(channel);
  const requestId = serversLayoutId;
  adminApi("/admin/server/" + encodeURIComponent(server.id) + "/channel/" + encodeURIComponent(channel.id) + "/history").then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    if (serversLayoutId !== requestId || serversLayoutChannelId !== channel.id) return;
    serversLayoutPaintMessages((data && data.messages) || [], channel.name);
  }).catch(() => {
    if (serversLayoutId !== requestId) return;
    serversLayoutEmpty("#" + (channel.name || "channel"), "Could not load messages.");
  });
}

function firstServersLayoutChat(server) {
  const cats = (server && server.categories) || [];
  for (let i = 0; i < cats.length; i++) {
    const channels = cats[i].channels || [];
    for (let n = 0; n < channels.length; n++) {
      if (serversLayoutChat(channels[n])) return channels[n];
    }
  }
  return (cats[0] && cats[0].channels && cats[0].channels[0]) || null;
}

function paintServersLayoutView(main, seed) {
  main.className = "is-servers is-servers-layout";
  main.innerHTML = "";
  const close = adminEl("button", "", "Close");
  close.type = "button";
  close.id = "admin-layout-close";
  close.addEventListener("click", closeServersLayout);
  main.appendChild(close);
  const stage = adminEl("div", "");
  stage.id = "admin-layout-stage";
  const rail = adminEl("div", "");
  rail.id = "admin-layout-rail";
  const face = adminEl("div", "");
  face.id = "admin-layout-face";
  const banner = adminEl("div", "");
  banner.id = "admin-layout-banner";
  const head = adminEl("div", "");
  head.id = "admin-layout-head";
  const name = adminEl("span", "", (seed && seed.name) || "Server");
  name.id = "admin-layout-name";
  head.appendChild(name);
  face.appendChild(banner);
  face.appendChild(head);
  rail.appendChild(face);
  rail.appendChild(adminEl("div", "admin-layout-kicker", "Channels"));
  const cats = adminEl("div", "");
  cats.id = "admin-layout-cats";
  rail.appendChild(cats);
  const chat = adminEl("div", "");
  chat.id = "admin-layout-chat";
  const top = adminEl("div", "");
  top.id = "admin-layout-top";
  const titles = adminEl("div", "");
  const title = adminEl("div", "", "No channel selected");
  title.id = "admin-layout-title";
  const desc = adminEl("div", "");
  desc.id = "admin-layout-desc";
  desc.hidden = true;
  titles.appendChild(title);
  titles.appendChild(desc);
  const tools = adminEl("div", "");
  tools.id = "admin-layout-tools";
  const call = adminEl("button", "", "Call");
  call.type = "button";
  call.disabled = true;
  const pins = adminEl("button", "", "Pins");
  pins.type = "button";
  pins.disabled = true;
  const search = adminEl("input", "");
  search.type = "search";
  search.placeholder = "Search";
  search.disabled = true;
  const more = adminEl("button", "", "\u22EE");
  more.type = "button";
  more.disabled = true;
  tools.appendChild(call);
  tools.appendChild(pins);
  tools.appendChild(search);
  tools.appendChild(more);
  top.appendChild(titles);
  top.appendChild(tools);
  const body = adminEl("div", "");
  body.id = "admin-layout-body";
  const empty = adminEl("div", "");
  empty.id = "admin-layout-empty";
  const emptyTitle = adminEl("div", "");
  emptyTitle.id = "admin-layout-empty-title";
  const emptySub = adminEl("div", "");
  emptySub.id = "admin-layout-empty-sub";
  empty.appendChild(emptyTitle);
  empty.appendChild(emptySub);
  const messages = adminEl("div", "");
  messages.id = "admin-layout-messages";
  body.appendChild(empty);
  body.appendChild(messages);
  chat.appendChild(top);
  chat.appendChild(body);
  stage.appendChild(rail);
  stage.appendChild(chat);
  main.appendChild(stage);
  paintServersLayoutRail(seed, false);
  serversLayoutEmpty("", "Select a channel.");
}

function loadServersLayout(serverId) {
  adminApi("/admin/server/" + encodeURIComponent(serverId) + "/layout").then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    if (serversLayoutId !== serverId) return;
    const server = data && data.server;
    if (!server) {
      serversLayoutEmpty("", "Server not found.");
      return;
    }
    const live = !!server.discoverable;
    paintServersLayoutRail(server, live);
    if (!live) {
      serversLayoutHeader(null);
      const title = document.getElementById("admin-layout-title");
      if (title) title.textContent = server.name || "Server";
      serversLayoutEmpty("This server is private.", "");
      return;
    }
    const channel = firstServersLayoutChat(server);
    if (!channel) {
      serversLayoutEmpty("", "This server has no channels.");
      return;
    }
    openServersLayoutChannel(server, channel);
  }).catch(() => {
    if (serversLayoutId !== serverId) return;
    serversLayoutEmpty("", "Could not load this server.");
  });
}

function openServersLayout(serverId) {
  if (!serverId) return;
  serversLayoutId = serverId;
  serversLayoutChannelId = 0;
  if (adminPage !== "servers" || adminSection !== "layout") {
    showAdminPage("servers", "layout");
    return;
  }
  const main = document.getElementById("admin-main");
  if (!main) return;
  paintServersLayoutView(main, serversLayoutSeed(serverId));
  loadServersLayout(serverId);
}

function paintServersLayout(main) {
  if (serversLayoutId) {
    paintServersLayoutView(main, serversLayoutSeed(serversLayoutId));
    loadServersLayout(serversLayoutId);
    return;
  }
  main.className = "is-servers";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Servers", "Layout"],
    title: "Layout",
    clock: "est"
  }));
  if (!adminTrackedServers.length) {
    main.appendChild(adminEl("div", "users-empty", "Track a server from Search first."));
    return;
  }
  main.appendChild(adminEl("div", "users-empty", "Select a tracked server."));
}

function paintServers(main, sectionId) {
  if (sectionId === "layout") return paintServersLayout(main);
  paintServersSearch(main);
}

registerAdminPage({
  id: "servers",
  label: "Servers",
  sections: [
    { id: "search", label: "Search", icon: "grid" },
    { id: "layout", label: "Layout", icon: "share" },
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
  registerAdminTrackedServerOpen("servers", "layout", (serverId) => {
    openServersLayout(serverId);
  });
}

