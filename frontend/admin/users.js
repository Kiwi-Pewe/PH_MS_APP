const USERS_PAGE = 25;
const USERS_BY = [
  { id: "id", label: "Account ID", hint: "Account ID" },
  { id: "username", label: "Username", hint: "Username" },
  { id: "display_name", label: "Display name", hint: "Display name" }
];
const USERS_REPORT_STATUS = {
  new: "New",
  viewed: "Viewed",
  review: "In Progress",
  completed: "Completed"
};
const USERS_REPORT_KINDS = [
  { id: "harassment", label: "Harassment" },
  { id: "privacy", label: "Privacy" },
  { id: "scam", label: "Scam" },
  { id: "inappropriate", label: "Inappropriate content" },
  { id: "other", label: "Other" }
];

let usersBy = "id";
let usersQuery = "";
let usersOffset = 0;
let usersHasMore = false;
let usersLoading = false;
let usersRows = [];
let usersSelectedId = 0;
let usersSelected = null;
let usersTimer = 0;
let usersReports = [];
let usersPinnedId = 0;
let usersEvents = [];
let usersNoteText = "";

function usersByMeta(id) {
  return USERS_BY.find((row) => row.id === id) || USERS_BY[0];
}

function usersMediaUrl(media) {
  if (!media) return "";
  if (typeof media === "string") return media;
  return media.url || "";
}

function usersLetter(name) {
  const text = String(name || "u").trim();
  return (text[0] || "u").toLowerCase();
}

function usersPresence(row) {
  const status = (row && row.presence) || "offline";
  if (status === "online" || status === "away" || status === "dnd") return status;
  return "offline";
}

function usersCreated(raw) {
  if (!raw) return "—";
  const when = new Date(String(raw).replace(" ", "T") + "Z");
  if (Number.isNaN(when.getTime())) return "—";
  return adminPad(when.getUTCDate()) + " " + ADMIN_MONTHS[when.getUTCMonth()] + " " + when.getUTCFullYear();
}

function usersClock(raw) {
  if (!raw) return "—";
  const when = new Date(String(raw).replace(" ", "T") + "Z");
  if (Number.isNaN(when.getTime())) return "—";
  return adminPad(when.getUTCHours()) + ":" + adminPad(when.getUTCMinutes()) + " UTC";
}

function usersWhen(raw) {
  if (!raw) return "—";
  const when = new Date(String(raw).replace(" ", "T") + "Z");
  if (Number.isNaN(when.getTime())) return "—";
  return usersCreated(raw) + ", " + adminPad(when.getUTCHours()) + ":" + adminPad(when.getUTCMinutes());
}

function usersHandle(row) {
  return (row && row.username) || "—";
}

function usersCard(opts) {
  const card = adminEl("div", "users-card" + (opts.fill ? " is-fill" : "") + (opts.className ? " " + opts.className : ""));
  if (opts.title || opts.meta) {
    const head = adminEl("div", "users-card-head");
    if (opts.title) head.appendChild(adminEl("div", "users-card-title", opts.title));
    if (opts.meta) head.appendChild(adminEl("div", "users-card-meta", opts.meta));
    card.appendChild(head);
  }
  return card;
}

function usersBanUntil(raw) {
  if (!raw) return "";
  const when = new Date(String(raw).replace(" ", "T") + "Z");
  if (Number.isNaN(when.getTime())) return "";
  if (when.getUTCFullYear() >= 9999) return "Permanent";
  return usersCreated(raw);
}

function usersStatusLabel(status) {
  const key = String(status || "new").toLowerCase();
  return USERS_REPORT_STATUS[key] || "New";
}

function usersKindLabel(kind) {
  const row = USERS_REPORT_KINDS.find((item) => item.id === kind);
  return row ? row.label : "";
}

function usersLine(raw, max) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return "—";
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "").trim() + "…";
}

function usersFace(host, row, letterName) {
  const url = usersMediaUrl(row && row.avatar);
  if (url) {
    host.style.backgroundImage = "url(\"" + url + "\")";
    host.textContent = "";
    return;
  }
  host.style.backgroundImage = "";
  host.textContent = usersLetter(letterName || (row && (row.username || row.display_name)));
}

function paintUsersProfiles(main) {
  main.className = "is-fit";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Users", "Profile"],
    title: "Profile"
  }));
}

function usersSelectEmpty(host) {
  host.innerHTML = "";
  host.appendChild(adminEl("div", "users-empty", "Select a user."));
}

function usersStat(label, value) {
  const row = adminEl("div", "users-stat");
  row.appendChild(adminEl("div", "users-stat-k", label));
  row.appendChild(adminEl("div", "users-stat-v", value));
  return row;
}

function usersNoteBox(placeholder, onSend) {
  const wrap = adminEl("div", "users-note-box");
  const area = adminEl("textarea", "users-note-input");
  area.rows = 5;
  area.placeholder = placeholder;
  area.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const text = area.value;
      if (!String(text || "").trim()) return;
      onSend(text, () => { area.value = ""; });
    }
  });
  wrap.appendChild(area);
  return wrap;
}

function paintUsersAccount(host, row) {
  host.innerHTML = "";
  if (!row) {
    usersSelectEmpty(host);
    return;
  }
  const ident = usersCard({});
  const banner = adminEl("div", "users-banner");
  const bannerUrl = usersMediaUrl(row.banner);
  if (bannerUrl) banner.style.backgroundImage = "url(\"" + bannerUrl + "\")";
  else if (row.banner_color) banner.style.background = row.banner_color;
  ident.appendChild(banner);
  const who = adminEl("div", "users-account-who");
  const face = adminEl("div", "users-account-face");
  usersFace(face, row, row.username || row.display_name);
  who.appendChild(face);
  const names = adminEl("div", "users-account-names");
  names.appendChild(adminEl("div", "users-account-display", row.display_name || row.username || "—"));
  names.appendChild(adminEl("div", "users-account-handle", usersHandle(row)));
  who.appendChild(names);
  if (usersPresence(row) === "online") who.appendChild(adminEl("div", "users-account-live", "Active"));
  ident.appendChild(who);
  const dates = adminEl("div", "users-account-dates");
  const created = adminEl("div", "");
  created.appendChild(adminEl("div", "users-account-date-k", "Created"));
  created.appendChild(adminEl("div", "users-account-date-v", usersCreated(row.created_at)));
  const last = adminEl("div", "");
  last.appendChild(adminEl("div", "users-account-date-k", "Last online"));
  last.appendChild(adminEl("div", "users-account-date-v", usersCreated(row.last_active)));
  dates.appendChild(created);
  dates.appendChild(last);
  ident.appendChild(dates);
  host.appendChild(ident);
  const banned = !!row.site_banned;
  const until = usersBanUntil(row.banned_until);
  const summary = usersCard({ title: "Moderation summary", className: "users-summary", fill: true });
  const stats = adminEl("div", "users-stats");
  stats.appendChild(usersStat("Friends", adminNum(row.friend_count)));
  stats.appendChild(usersStat("Warns", adminNum(row.warn_count)));
  stats.appendChild(usersStat("Blocked by", adminNum(row.blocked_by) + " users"));
  stats.appendChild(usersStat("Banned from", adminNum(row.server_ban_count) + " servers"));
  stats.appendChild(usersStat("Reports made", adminNum(row.reports_made)));
  stats.appendChild(usersStat("Reports about", adminNum(row.reports_about)));
  stats.appendChild(usersStat("Site bans", adminNum(row.site_ban_count)));
  stats.appendChild(usersStat("Ban", banned ? (until || "Banned") : "Not banned"));
  if (banned && row.ban_reason) stats.appendChild(usersStat("Ban reason", row.ban_reason));
  stats.appendChild(usersStat("Connected devices", adminNum(row.session_count)));
  stats.appendChild(usersStat("Servers", adminNum(row.server_count)));
  summary.appendChild(stats);
  host.appendChild(summary);
  const notes = usersCard({ title: "User notes", className: "users-notes" });
  const area = adminEl("textarea", "users-note-input");
  area.rows = 5;
  area.placeholder = "Click to add a note";
  area.value = usersNoteText;
  area.addEventListener("blur", () => {
    const text = area.value || "";
    if (text === usersNoteText) return;
    adminApi("/admin/user/" + row.id + "/notes", { method: "POST", body: { text: text } }).then((response) => {
      if (!response.ok) return null;
      return response.json();
    }).then((data) => {
      if (!data) return;
      usersNoteText = data.text || "";
    }).catch(() => {});
  });
  notes.appendChild(area);
  host.appendChild(notes);
  const foot = adminEl("div", "users-actions");
  const track = adminEl("button", "users-btn-track", "Track User");
  track.type = "button";
  track.addEventListener("click", () => trackAdminUser(row));
  const report = adminEl("button", "users-btn-report", "Create Report");
  report.type = "button";
  report.addEventListener("click", () => openUsersCreateReport(row));
  foot.appendChild(track);
  foot.appendChild(report);
  host.appendChild(foot);
}

function usersReportRow(row) {
  const status = String(row.status || "new").toLowerCase();
  const btn = adminEl("button", "users-ticket" + (row.id === usersPinnedId ? " is-on" : ""));
  btn.type = "button";
  btn.appendChild(adminEl("div", "users-ticket-id", "R-" + row.id));
  btn.appendChild(adminEl("div", "users-ticket-subject", usersKindLabel(row.report_kind) || row.feedback_label || "Report"));
  btn.appendChild(adminEl("div", "users-ticket-state is-" + status, usersStatusLabel(status)));
  btn.addEventListener("click", () => pinUsersReport(row.id === usersPinnedId ? 0 : row.id));
  return btn;
}

function paintUsersTrail(host) {
  host.innerHTML = "";
  usersEvents.forEach((row) => {
    const item = adminEl("div", "users-trail-item");
    const top = adminEl("div", "users-trail-top");
    top.appendChild(adminEl("div", "users-trail-who", row.actor_username || "kiwi"));
    top.appendChild(adminEl("div", "users-trail-when", usersClock(row.created_at)));
    item.appendChild(top);
    const label = row.kind === "note" ? (row.text || "") : usersStatusLabel(row.text);
    if (label) item.appendChild(adminEl("div", "users-trail-text", label));
    host.appendChild(item);
  });
}

function paintUsersReports(host) {
  host.innerHTML = "";
  if (!usersSelectedId) {
    usersSelectEmpty(host);
    return;
  }
  const pinned = usersReports.find((row) => row.id === usersPinnedId);
  const reports = usersCard({ title: "Reports", fill: true, className: "users-reports-card" });
  const body = adminEl("div", "users-trail");
  paintUsersTrail(body);
  reports.appendChild(body);
  if (pinned) {
    reports.appendChild(usersNoteBox("Add internal note for the moderation team...", (text, done) => {
      adminApi("/admin/feedback/" + pinned.id + "/note", { method: "POST", body: { text: text } }).then((response) => {
        if (!response.ok) return null;
        return response.json();
      }).then((data) => {
        if (!data) return;
        usersEvents = data.events || [];
        paintUsersReports(host);
        done();
      }).catch(() => {});
    }));
  }
  host.appendChild(reports);
}

function pinUsersReport(reportId) {
  usersPinnedId = reportId;
  usersEvents = [];
  const host = document.getElementById("users-reports");
  if (!reportId) {
    if (host) paintUsersReports(host);
    return;
  }
  adminApi("/admin/feedback/" + reportId + "/events").then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    if (usersPinnedId !== reportId) return;
    usersEvents = (data && data.events) || [];
    if (host) paintUsersReports(host);
  }).catch(() => {
    if (host) paintUsersReports(host);
  });
}

function openUsersCreateReport(row) {
  const body = adminEl("div", "");
  const kindLabel = adminEl("div", "admin-mod-label", "Type");
  const kind = adminEl("select", "admin-mod-input");
  USERS_REPORT_KINDS.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.label;
    kind.appendChild(opt);
  });
  const area = adminEl("textarea", "admin-mod-reason");
  area.rows = 5;
  body.appendChild(kindLabel);
  body.appendChild(kind);
  body.appendChild(area);
  openAdminMod({
    title: "Create report",
    confirm: "Create report",
    body: body,
    onConfirm: () => {
      adminModError("");
      adminApi("/admin/user/" + row.id + "/report", {
        method: "POST",
        body: { report_kind: kind.value, report: area.value }
      }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
        if (!result.ok) {
          const detail = result.data && result.data.detail;
          adminModError(typeof detail === "string" ? detail : "Could not create the report.");
          return;
        }
        closeAdminMod();
        if (result.data && result.data.report) usersReports.unshift(result.data.report);
        if (usersSelected) usersSelected.reports_about = (Number(usersSelected.reports_about) || 0) + 1;
        const mid = document.getElementById("users-reports");
        if (mid) paintUsersReports(mid);
        const account = document.getElementById("users-account");
        if (account && usersSelected) paintUsersAccount(account, usersSelected);
      }).catch(() => adminModError("Could not create the report."));
    }
  });
}

function paintUsersRows(list) {
  list.innerHTML = "";
  usersRows.forEach((row) => {
    const online = usersPresence(row);
    const btn = adminEl("button", "users-row" + (row.id === usersSelectedId ? " is-on" : "") + (online === "offline" && row.id !== usersSelectedId ? " is-off" : ""));
    btn.type = "button";
    const face = adminEl("div", "users-face");
    usersFace(face, row, row.username || row.display_name);
    face.appendChild(adminEl("div", "status-dot status-" + online));
    btn.appendChild(face);
    const text = adminEl("div", "users-row-text");
    text.appendChild(adminEl("div", "users-row-name", row.display_name || row.username || "—"));
    text.appendChild(adminEl("div", "users-row-handle", usersHandle(row)));
    btn.appendChild(text);
    btn.addEventListener("click", () => selectUsersRow(row.id));
    list.appendChild(btn);
  });
  if (usersHasMore) {
    const more = adminEl("button", "users-more", "Load more");
    more.type = "button";
    more.disabled = usersLoading;
    more.addEventListener("click", () => loadUsersList(true));
    list.appendChild(more);
  }
}

function selectUsersRow(userId) {
  usersSelectedId = userId;
  usersPinnedId = 0;
  usersEvents = [];
  const list = document.getElementById("users-search-list");
  if (list) paintUsersRows(list);
  const mid = document.getElementById("users-reports");
  const account = document.getElementById("users-account");
  Promise.all([
    adminApi("/admin/user/" + userId).then((response) => response.ok ? response.json() : null),
    adminApi("/admin/user/" + userId + "/reports").then((response) => response.ok ? response.json() : null),
    adminApi("/admin/user/" + userId + "/notes").then((response) => response.ok ? response.json() : null)
  ]).then((parts) => {
    if (usersSelectedId !== userId) return;
    const detail = parts[0];
    const reports = parts[1];
    const notes = parts[2];
    if (detail && detail.user) usersSelected = detail.user;
    usersReports = (reports && reports.reports) || [];
    usersNoteText = (notes && notes.text) || "";
    if (!usersPinnedId && usersReports.length) usersPinnedId = usersReports[0].id;
    if (account) paintUsersAccount(account, usersSelected);
    if (usersPinnedId) {
      adminApi("/admin/feedback/" + usersPinnedId + "/events").then((response) => response.ok ? response.json() : null).then((data) => {
        if (usersSelectedId !== userId) return;
        usersEvents = (data && data.events) || [];
        if (mid) paintUsersReports(mid);
      }).catch(() => {
        if (mid) paintUsersReports(mid);
      });
    } else if (mid) paintUsersReports(mid);
  }).catch(() => {});
}

function loadUsersList(more) {
  if (usersLoading) return;
  if (more && !usersHasMore) return;
  if (!more) {
    usersOffset = 0;
    usersRows = [];
    usersHasMore = false;
  }
  usersLoading = true;
  const params = new URLSearchParams();
  params.set("by", usersBy);
  params.set("q", usersQuery);
  params.set("offset", String(usersOffset));
  params.set("limit", String(USERS_PAGE));
  adminApi("/admin/user?" + params.toString()).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    usersLoading = false;
    const rows = (data && data.users) || [];
    usersHasMore = !!(data && data.has_more);
    usersRows = more ? usersRows.concat(rows) : rows;
    usersOffset = usersRows.length;
    const list = document.getElementById("users-search-list");
    if (list) paintUsersRows(list);
  }).catch(() => {
    usersLoading = false;
  });
}

function queueUsersSearch() {
  window.clearTimeout(usersTimer);
  usersTimer = window.setTimeout(() => loadUsersList(false), 250);
}

function paintUsersSearch(main) {
  main.className = "is-users";
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Users", "Search"],
    title: "Search",
    range: usersSelected ? ("Selected account: " + usersHandle(usersSelected)) : ""
  }));
  const board = adminEl("div", "users-search");
  const left = adminEl("div", "users-stack is-left");
  const search = usersCard({});
  const fields = adminEl("div", "users-search-fields");
  fields.appendChild(adminEl("div", "users-field-k", "Search by"));
  const select = adminEl("select", "users-search-by");
  USERS_BY.forEach((opt) => {
    const item = document.createElement("option");
    item.value = opt.id;
    item.textContent = opt.label;
    if (opt.id === usersBy) item.selected = true;
    select.appendChild(item);
  });
  fields.appendChild(select);
  fields.appendChild(adminEl("div", "users-field-k", "Query"));
  const input = adminEl("input", "users-search-q");
  input.type = "text";
  input.value = usersQuery;
  input.placeholder = usersByMeta(usersBy).hint;
  select.addEventListener("change", () => {
    usersBy = select.value || "id";
    input.placeholder = usersByMeta(usersBy).hint;
    queueUsersSearch();
  });
  input.addEventListener("input", () => {
    usersQuery = input.value || "";
    queueUsersSearch();
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
  const entries = usersCard({ title: "Account entries", fill: true });
  const list = adminEl("div", "users-search-list");
  list.id = "users-search-list";
  entries.appendChild(list);
  left.appendChild(entries);
  board.appendChild(left);
  const mid = adminEl("div", "users-stack is-mid");
  mid.id = "users-reports";
  if (usersSelectedId) paintUsersReports(mid);
  else usersSelectEmpty(mid);
  board.appendChild(mid);
  const right = adminEl("div", "users-stack is-right");
  right.id = "users-account";
  if (usersSelected) paintUsersAccount(right, usersSelected);
  else usersSelectEmpty(right);
  board.appendChild(right);
  main.appendChild(board);
  main.appendChild(adminEl("div", "overview-page-foot", "Snapshot data · Updates every 5 minutes"));
  if (usersRows.length) paintUsersRows(list);
  else loadUsersList(false);
}

function paintUsers(main, sectionId) {
  if (sectionId === "profile" || sectionId === "profiles") return paintUsersProfiles(main);
  paintUsersSearch(main);
}

registerAdminPage({
  id: "users",
  label: "Users",
  sections: [
    { id: "search", label: "Search", icon: "users" },
    { id: "profile", label: "Profile", icon: "eye" }
  ],
  paint: paintUsers
});
