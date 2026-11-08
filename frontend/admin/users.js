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
  completed: "Completed",
  open: "Open",
  followup: "Needs Followup",
  closed: "Closed"
};
const USERS_REPORT_KINDS = [
  { id: "general", label: "General" },
  { id: "moderation", label: "Moderation" },
  { id: "harassment", label: "Harassment" },
  { id: "privacy", label: "Privacy" },
  { id: "scam", label: "Scam" },
  { id: "inappropriate", label: "Inappropriate content" },
  { id: "other", label: "Other" }
];
const USERS_DURATION = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 5, label: "5 days" },
  { days: 7, label: "one week" }
];
const USERS_LOCKS = [
  { id: "post", label: "Can Post" },
  { id: "comment", label: "Can Comment" },
  { id: "rooms", label: "Can create/join Rooms" },
  { id: "phone", label: "Can use Phone" }
];

let usersBy = "id";
let usersQuery = "";
let usersFlaggedOnly = false;
let usersOffset = 0;
let usersHasMore = false;
let usersLoading = false;
let usersRows = [];
let usersSelectedId = 0;
let usersSelected = null;
let usersTimer = 0;
let usersReports = [];
let usersNoteText = "";
let usersOpenId = 0;
let usersEvents = [];
let usersProfileId = 0;

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

function usersWhen(raw) {
  if (!raw) return "—";
  const when = new Date(String(raw).replace(" ", "T") + "Z");
  if (Number.isNaN(when.getTime())) return "—";
  const time = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  const now = new Date();
  const sameDay = when.getFullYear() === now.getFullYear() && when.getMonth() === now.getMonth() && when.getDate() === now.getDate();
  if (sameDay) return time;
  const date = when.toLocaleDateString([], { month: "short", day: "numeric" });
  return time + " · " + date;
}

function usersHandle(row) {
  return (row && row.username) || "—";
}

function usersRowName(text, flagged) {
  const line = adminEl("div", "users-row-name-line");
  line.appendChild(adminEl("div", "users-row-name", text || "—"));
  if (flagged) line.appendChild(adminEl("span", "users-flag-pill", "FLAGGED"));
  return line;
}

function usersSearchFlagged(label, on, onChange) {
  const wrap = adminEl("div", "users-search-extra");
  wrap.appendChild(adminEl("div", "admin-report-rule"));
  const line = adminEl("div", "admin-report-check");
  line.appendChild(adminEl("span", "", label));
  const toggle = usersToggle(on);
  toggle.input.addEventListener("change", () => onChange(!!toggle.input.checked));
  line.appendChild(toggle.label);
  wrap.appendChild(line);
  return wrap;
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
  const pip = host.querySelector(".status-dot");
  host.innerHTML = "";
  host.style.backgroundImage = "";
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    host.appendChild(img);
  } else {
    host.textContent = usersLetter(letterName || (row && (row.username || row.display_name)));
  }
  if (pip) host.appendChild(pip);
}

function applyAdminProfilePayload(data) {
  profileUser = (data && data.user) || null;
  profileOwnerId = profileUser ? profileUser.id : null;
  profileIsOwn = false;
  profileEditing = false;
  profileLimited = false;
  profileFriends = (data && data.friends) || [];
  profileSavedLayout = (data && data.layout) || { pages: [] };
  if (typeof stampClockNamedTimezones === "function") stampClockNamedTimezones(profileSavedLayout);
  profileDraft = typeof cloneProfileLayout === "function" ? cloneProfileLayout(profileSavedLayout) : profileSavedLayout;
  const pages = (profileDraft && profileDraft.pages) || [];
  if (!pages.some((page) => page.id === profileActivePageId)) {
    profileActivePageId = pages[0] ? pages[0].id : "profile";
  }
  if (typeof clearProfileCommentCache === "function") clearProfileCommentCache();
}

function paintUsersProfilePages() {
  const host = document.getElementById("profile-page-list");
  if (!host) return;
  host.innerHTML = "";
  const layout = profileDraft || profileSavedLayout || { pages: [] };
  const ordered = typeof profileOrderedPages === "function"
    ? profileOrderedPages(layout.pages || [])
    : (layout.pages || []);
  const privateStart = ordered.findIndex((page) => page.visibility === "owner");
  ordered.forEach((page, index) => {
    if (index === privateStart && privateStart >= 0) {
      const line = adminEl("div", "profile-page-split");
      host.appendChild(line);
      host.appendChild(adminEl("div", "profile-page-group", "Private"));
    }
    const row = adminEl("button", "profile-page-item" + (page.id === profileActivePageId ? " is-on" : ""));
    row.type = "button";
    row.dataset.pageId = page.id;
    row.appendChild(adminEl("span", "", page.title || "Page"));
    row.addEventListener("click", () => {
      profileActivePageId = page.id;
      paintUsersProfilePages();
      if (typeof renderProfileBoard === "function") renderProfileBoard();
    });
    host.appendChild(row);
  });
}

function paintUsersProfileBoard() {
  if (typeof renderProfileBoard === "function") renderProfileBoard();
}

function loadUsersProfile(userId) {
  usersProfileId = userId;
  if (typeof adminSyncProfileOwner === "function") adminSyncProfileOwner();
  adminApi("/admin/user/" + userId + "/profile").then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    if (usersProfileId !== userId) return;
    if (!data) return;
    applyAdminProfilePayload(data);
    paintUsersProfilePages();
    paintUsersProfileBoard();
  }).catch(() => {});
}

function paintUsersProfiles(main) {
  main.className = "is-users is-users-profile";
  if (typeof renderProfileBoard !== "function" && typeof ensureAdminProfileLayer === "function") {
    main.appendChild(adminPageHead({
      crumbs: ["Admin", "Users", "Profile"],
      title: "Profile"
    }));
    main.appendChild(adminEl("div", "users-empty", usersProfileId ? "" : "Select a tracked user."));
    ensureAdminProfileLayer().then(() => {
      if (adminPage !== "users") return;
      if (adminSection !== "profile" && adminSection !== "profiles") return;
      paintAdminMain();
    });
    return;
  }
  if (typeof adminSyncProfileOwner === "function") adminSyncProfileOwner();
  main.appendChild(adminPageHead({
    crumbs: ["Admin", "Users", "Profile"],
    title: "Profile"
  }));
  if (!usersProfileId) {
    main.appendChild(adminEl("div", "users-empty", "Select a tracked user."));
    return;
  }
  const shell = adminEl("div", "users-profile");
  const rail = adminEl("div", "users-profile-rail");
  rail.appendChild(adminEl("div", "users-profile-rail-k", "Pages"));
  const list = adminEl("div", "");
  list.id = "profile-page-list";
  rail.appendChild(list);
  shell.appendChild(rail);
  const stage = adminEl("div", "users-profile-stage");
  const scroll = adminEl("div", "");
  scroll.id = "profile-board-scroll";
  const fit = adminEl("div", "");
  fit.id = "profile-board-fit";
  const board = adminEl("div", "");
  board.id = "profile-board";
  fit.appendChild(board);
  scroll.appendChild(fit);
  stage.appendChild(scroll);
  shell.appendChild(stage);
  main.appendChild(shell);
  loadUsersProfile(usersProfileId);
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

function usersReportCategory(row) {
  const mode = String(row.report_mode || row.report_kind || "").toLowerCase();
  if (mode === "general") return "General";
  if (mode === "moderation") return "Moderation";
  return row.feedback_label || "Report";
}

function usersReportSubject(row) {
  const kind = String(row.report_kind || "").toLowerCase();
  if (kind && kind !== "general" && kind !== "moderation") return usersKindLabel(kind) || kind;
  return row.feedback_label || "Report";
}

function usersUrgencyLabel(value) {
  const key = String(value || "low").toLowerCase();
  if (key === "high") return "High";
  if (key === "medium") return "Medium";
  return "Low";
}

function usersReportStamp(label, raw) {
  const wrap = adminEl("div", "users-entry-stamp");
  wrap.appendChild(adminEl("div", "users-entry-stamp-k", label));
  wrap.appendChild(adminEl("div", "users-entry-stamp-v", usersWhen(raw)));
  return wrap;
}

function usersReportRow(row, open, onOpen) {
  const status = String(row.status || "new").toLowerCase();
  const card = adminEl("div", "users-entry" + (open ? " is-open" : ""));
  const top = adminEl("div", "users-entry-top");
  const face = adminEl("div", "users-entry-face");
  usersFace(face, row, row.display_name || row.username);
  top.appendChild(face);
  const names = adminEl("div", "users-entry-copy");
  names.appendChild(adminEl("div", "users-entry-name", row.display_name || row.username || "—"));
  names.appendChild(usersReportStamp("Created", row.created_at));
  top.appendChild(names);
  const flags = adminEl("div", "users-entry-flags");
  flags.appendChild(adminEl("div", "users-entry-pill is-status is-" + status, usersStatusLabel(status)));
  flags.appendChild(adminEl("div", "users-entry-split", "|"));
  flags.appendChild(adminEl("div", "users-entry-pill is-urgency is-" + String(row.urgency || "low").toLowerCase(), usersUrgencyLabel(row.urgency)));
  top.appendChild(flags);
  card.appendChild(top);
  const bottom = adminEl("div", "users-entry-bottom");
  const pills = adminEl("div", "users-entry-pills");
  pills.appendChild(adminEl("div", "users-entry-pill", usersReportCategory(row)));
  pills.appendChild(adminEl("div", "users-entry-pill", usersReportSubject(row)));
  bottom.appendChild(pills);
  const post = adminEl("div", "users-entry-post");
  post.appendChild(adminEl("span", "users-entry-user", row.last_username || row.username || row.display_name || "—"));
  post.appendChild(document.createTextNode(" | "));
  post.appendChild(adminEl("span", "users-entry-when", usersWhen(row.last_interacted || row.created_at)));
  bottom.appendChild(post);
  const text = String(row.report || "").trim();
  bottom.appendChild(adminEl("div", "users-entry-text" + (text ? "" : " is-empty"), text || "No additional information"));
  bottom.appendChild(adminEl("div", "users-entry-updates", "Update: " + adminNum(row.update_count)));
  card.appendChild(bottom);
  if (!open) card.addEventListener("click", () => (onOpen || openUsersHistory)(row.id));
  return card;
}

function usersChangeLabel(change) {
  const names = {
    status: "Status",
    urgency: "Urgency",
    assign: "Assign to",
    alert_user: "Alert User",
    requests_info: "Requests Info From User"
  };
  const field = change.field;
  let from = change.from;
  let to = change.to;
  if (field === "status") {
    from = from ? usersStatusLabel(from) : "";
    to = usersStatusLabel(to);
  } else if (field === "urgency") {
    from = from ? usersUrgencyLabel(from) : "";
    to = usersUrgencyLabel(to);
  }
  const label = names[field] || field;
  if (from) return label + ": " + from + " > " + to;
  return label + ": " + to;
}

function usersHistoryItem(row) {
  const item = adminEl("div", "users-history-item");
  const face = adminEl("div", "users-history-face");
  usersFace(face, row, row.actor_username || row.actor_display_name);
  item.appendChild(face);
  const body = adminEl("div", "users-history-body");
  const top = adminEl("div", "users-history-top");
  top.appendChild(adminEl("span", "users-history-name", row.actor_display_name || row.actor_username || "—"));
  top.appendChild(document.createTextNode(" | "));
  top.appendChild(adminEl("span", "users-history-when", usersWhen(row.created_at)));
  body.appendChild(top);
  const message = String(row.message || "").trim();
  if (message) body.appendChild(adminEl("div", "users-history-text", message));
  if (row.changes && row.changes.length) {
    const panel = adminEl("div", "users-history-changes");
    row.changes.forEach((change) => panel.appendChild(adminEl("div", "", usersChangeLabel(change))));
    body.appendChild(panel);
  }
  item.appendChild(body);
  return item;
}

function paintUsersHistory(host, events) {
  host.innerHTML = "";
  (events || usersEvents).forEach((row) => host.appendChild(usersHistoryItem(row)));
  host.scrollTop = host.scrollHeight;
  window.requestAnimationFrame(() => {
    host.scrollTop = host.scrollHeight;
  });
}

function usersComposeGrow(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

function paintUsersUpdateForm(host, row, onSaved) {
  host.innerHTML = "";
  const extras = adminEl("div", "users-history-extras");
  extras.hidden = true;
  const alertLine = adminEl("div", "admin-report-check");
  alertLine.appendChild(adminEl("span", "", "Alert User"));
  const alertToggle = usersToggle(!!row.alert_user);
  alertLine.appendChild(alertToggle.label);
  const infoLine = adminEl("div", "admin-report-check");
  infoLine.appendChild(adminEl("span", "", "Requests Info From User"));
  const infoToggle = usersToggle(!!row.requests_info);
  infoLine.appendChild(infoToggle.label);
  extras.appendChild(alertLine);
  extras.appendChild(infoLine);
  extras.appendChild(adminEl("div", "admin-report-k", "Status"));
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
  const currentStatus = String(row.status || "open").toLowerCase();
  status.value = currentStatus === "new" ? "open" : (currentStatus === "review" ? "followup" : (currentStatus === "completed" ? "closed" : currentStatus));
  status.addEventListener("change", () => {
    extra.hidden = status.value === "closed";
  });
  extras.appendChild(status);
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
  assign.value = row.assign_id ? String(row.assign_id) : "";
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
  urgency.value = (row.urgency || "low").toLowerCase() || "low";
  extra.appendChild(urgency);
  extra.hidden = status.value === "closed";
  extras.appendChild(extra);
  host.appendChild(extras);
  const err = adminEl("p", "users-history-error");
  err.hidden = true;
  host.appendChild(err);
  const bar = adminEl("div", "users-history-compose");
  const plus = adminEl("button", "users-history-plus", "+");
  plus.type = "button";
  plus.title = "More options";
  plus.addEventListener("click", () => {
    extras.hidden = !extras.hidden;
    plus.classList.toggle("is-on", !extras.hidden);
  });
  const info = adminEl("textarea", "users-history-input");
  info.rows = 1;
  info.placeholder = "Additional Information";
  info.addEventListener("input", () => usersComposeGrow(info));
  bar.appendChild(plus);
  bar.appendChild(info);
  const save = adminEl("button", "users-history-save", "Update");
  save.type = "button";
  save.addEventListener("click", () => {
    err.hidden = true;
    adminApi("/admin/feedback/" + row.id + "/update", {
      method: "POST",
      body: {
        report: info.value,
        status: status.value,
        assign_id: status.value === "closed" ? null : Number(assign.value) || null,
        urgency: status.value === "closed" ? "" : urgency.value,
        alert_user: alertToggle.input.checked,
        requests_info: infoToggle.input.checked
      }
    }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
      if (!result.ok) {
        const detail = result.data && result.data.detail;
        err.textContent = typeof detail === "string" ? detail : "Could not update the report.";
        err.hidden = false;
        return;
      }
      if (onSaved) {
        onSaved(result.data);
        return;
      }
      if (result.data && result.data.report) {
        usersReports = usersReports.map((item) => item.id === result.data.report.id ? result.data.report : item);
      }
      usersEvents = (result.data && result.data.events) || [];
      const mid = document.getElementById("users-reports");
      if (mid) paintUsersReports(mid);
    }).catch(() => {
      err.textContent = "Could not update the report.";
      err.hidden = false;
    });
  });
  bar.appendChild(save);
  host.appendChild(bar);
  usersComposeGrow(info);
}

function openUsersHistory(reportId) {
  usersOpenId = reportId;
  usersEvents = [];
  const host = document.getElementById("users-reports");
  if (host) paintUsersReports(host);
  adminApi("/admin/feedback/" + reportId + "/events").then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    if (usersOpenId !== reportId) return;
    usersEvents = (data && data.events) || [];
    if (host) paintUsersReports(host);
  }).catch(() => {
    if (host) paintUsersReports(host);
  });
}

function paintUsersReports(host, view) {
  const selected = view ? view.selected : !!usersSelectedId;
  const list = view ? view.reports : usersReports;
  const openId = view ? view.openId : usersOpenId;
  const events = view ? view.events : usersEvents;
  const empty = (view && view.empty) || "Select a user.";
  const onOpen = (view && view.onOpen) || openUsersHistory;
  host.innerHTML = "";
  if (!selected) {
    host.appendChild(adminEl("div", "users-empty", empty));
    return;
  }
  const reports = usersCard({ title: "Reports", fill: true, className: "users-reports-card" + (openId ? " is-open" : "") });
  const head = reports.querySelector(".users-card-head");
  if (head) {
    head.classList.add("has-back");
    const back = adminEl("button", "users-reports-back", "Back");
    back.type = "button";
    back.disabled = !openId;
    back.addEventListener("click", () => {
      if (view && view.onBack) {
        view.onBack();
        return;
      }
      usersOpenId = 0;
      usersEvents = [];
      paintUsersReports(host);
    });
    head.insertBefore(back, head.firstChild);
  }
  const tickets = adminEl("div", "users-entry-list");
  const open = list.find((row) => row.id === openId);
  if (open) {
    tickets.appendChild(usersReportRow(open, true, onOpen));
    reports.appendChild(tickets);
    const history = adminEl("div", "users-history");
    paintUsersHistory(history, events);
    reports.appendChild(history);
    const form = adminEl("div", "users-history-form");
    paintUsersUpdateForm(form, open, view && view.onSaved);
    reports.appendChild(form);
  } else {
    list.slice().sort((a, b) => {
      const left = String(b.last_interacted || b.created_at || "");
      const right = String(a.last_interacted || a.created_at || "");
      if (left === right) return (b.id || 0) - (a.id || 0);
      return left > right ? 1 : -1;
    }).forEach((row) => tickets.appendChild(usersReportRow(row, false, onOpen)));
    reports.appendChild(tickets);
  }
  host.appendChild(reports);
}

function usersDateShift(days) {
  const when = new Date();
  when.setDate(when.getDate() + days);
  return usersDateKey(when);
}

function usersDateKey(when) {
  return when.getFullYear() + "-" + adminPad(when.getMonth() + 1) + "-" + adminPad(when.getDate());
}

function usersParseKey(key) {
  const bits = String(key || "").split("-");
  if (bits.length !== 3) return null;
  const when = new Date(Number(bits[0]), Number(bits[1]) - 1, Number(bits[2]));
  if (Number.isNaN(when.getTime())) return null;
  return when;
}

function usersDaysUntil(key) {
  const when = usersParseKey(key);
  if (!when) return 1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  when.setHours(0, 0, 0, 0);
  return Math.round((when.getTime() - today.getTime()) / 86400000);
}

function usersDurationLabel(days) {
  const count = Math.max(1, Number(days) || 1);
  if (count === 1) return "1 day";
  if (count === 7) return "one week";
  if (count % 7 === 0) return String(count / 7) + " weeks";
  return String(count) + " days";
}

function usersCloseCals(keep) {
  document.querySelectorAll(".admin-report-cal-pop").forEach((pop) => {
    if (pop !== keep) pop.hidden = true;
  });
}

function usersPaintCal(pop, view, selected, onPick) {
  pop.innerHTML = "";
  const head = adminEl("div", "admin-report-cal-head");
  const prev = adminEl("button", "admin-report-cal-nav", "‹");
  const next = adminEl("button", "admin-report-cal-nav", "›");
  prev.type = "button";
  next.type = "button";
  head.appendChild(prev);
  head.appendChild(adminEl("div", "admin-report-cal-month", ADMIN_MONTHS[view.getMonth()] + " " + view.getFullYear()));
  head.appendChild(next);
  pop.appendChild(head);
  const week = adminEl("div", "admin-report-cal-week");
  ["S", "M", "T", "W", "T", "F", "S"].forEach((day) => week.appendChild(adminEl("div", "", day)));
  pop.appendChild(week);
  const grid = adminEl("div", "admin-report-cal-grid");
  const start = new Date(view.getFullYear(), view.getMonth(), 1);
  const skip = start.getDay();
  const last = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedKey = selected;
  for (let i = 0; i < skip; i += 1) grid.appendChild(adminEl("div", "admin-report-cal-empty"));
  for (let day = 1; day <= last; day += 1) {
    const when = new Date(view.getFullYear(), view.getMonth(), day);
    const key = usersDateKey(when);
    const btn = adminEl("button", "admin-report-cal-day" + (key === selectedKey ? " is-on" : ""), String(day));
    btn.type = "button";
    if (when <= today) {
      btn.disabled = true;
    } else {
      btn.addEventListener("click", () => onPick(key));
    }
    grid.appendChild(btn);
  }
  pop.appendChild(grid);
  prev.addEventListener("click", () => {
    usersPaintCal(pop, new Date(view.getFullYear(), view.getMonth() - 1, 1), selected, onPick);
  });
  next.addEventListener("click", () => {
    usersPaintCal(pop, new Date(view.getFullYear(), view.getMonth() + 1, 1), selected, onPick);
  });
}

function usersToggle(on) {
  const label = adminEl("label", "toggle-switch");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = !!on;
  const track = adminEl("span", "toggle-track");
  track.appendChild(adminEl("span", "toggle-thumb"));
  label.appendChild(input);
  label.appendChild(track);
  return { label: label, input: input };
}

function usersFillDuration(days, until) {
  const select = days;
  const presets = USERS_DURATION.map((item) => String(item.days));
  Array.from(select.querySelectorAll("option[data-custom]")).forEach((row) => row.remove());
  const count = Math.max(1, Number(usersDaysUntil(until)) || 1);
  if (presets.indexOf(String(count)) < 0) {
    const opt = document.createElement("option");
    opt.value = String(count);
    opt.textContent = usersDurationLabel(count);
    opt.dataset.custom = "1";
    select.appendChild(opt);
  } else {
    const match = Array.from(select.options).find((row) => row.value === String(count));
    if (match) match.textContent = usersDurationLabel(count);
  }
  select.value = String(count);
}

function usersDurationControls() {
  const host = adminEl("div", "admin-report-duration");
  const mode = adminEl("div", "admin-report-switch");
  const durationBtn = adminEl("button", "is-on", "Duration");
  const permBtn = adminEl("button", "", "Permanent");
  durationBtn.type = "button";
  permBtn.type = "button";
  const days = adminEl("select", "admin-report-input");
  USERS_DURATION.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = String(item.days);
    opt.textContent = item.label;
    days.appendChild(opt);
  });
  days.value = "1";
  let until = usersDateShift(1);
  const calWrap = adminEl("div", "admin-report-cal-wrap");
  const calBtn = adminEl("button", "admin-report-cal");
  calBtn.type = "button";
  calBtn.appendChild(adminIcon("calendar"));
  const pop = adminEl("div", "admin-report-cal-pop");
  pop.hidden = true;
  calWrap.appendChild(calBtn);
  calWrap.appendChild(pop);
  let permanent = false;
  function setMode(on) {
    permanent = on;
    durationBtn.classList.toggle("is-on", !on);
    permBtn.classList.toggle("is-on", on);
    days.hidden = on;
    calWrap.hidden = on;
    if (on) pop.hidden = true;
  }
  function pickDate(key) {
    until = key;
    usersFillDuration(days, until);
    pop.hidden = true;
  }
  days.addEventListener("change", () => {
    until = usersDateShift(Number(days.value) || 1);
    Array.from(days.querySelectorAll("option[data-custom]")).forEach((row) => {
      if (row.value !== days.value) row.remove();
    });
  });
  calBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = pop.hidden;
    usersCloseCals();
    if (!open) return;
    const view = usersParseKey(until) || new Date();
    usersPaintCal(pop, new Date(view.getFullYear(), view.getMonth(), 1), until, pickDate);
    pop.hidden = false;
  });
  pop.addEventListener("click", (event) => event.stopPropagation());
  durationBtn.addEventListener("click", () => setMode(false));
  permBtn.addEventListener("click", () => setMode(true));
  mode.appendChild(durationBtn);
  mode.appendChild(permBtn);
  host.appendChild(mode);
  host.appendChild(days);
  host.appendChild(calWrap);
  return {
    host: host,
    read: () => ({
      permanent: permanent,
      days: usersDaysUntil(until),
      until: permanent ? "" : until
    })
  };
}

function usersLockControl(item) {
  const wrap = adminEl("div", "admin-report-lock");
  const line = adminEl("div", "admin-report-lock-line");
  line.appendChild(adminEl("span", "", item.label));
  const toggle = usersToggle(true);
  line.appendChild(toggle.label);
  wrap.appendChild(line);
  const duration = usersDurationControls();
  duration.host.hidden = true;
  wrap.appendChild(duration.host);
  toggle.input.addEventListener("change", () => {
    duration.host.hidden = toggle.input.checked;
    if (toggle.input.checked) usersCloseCals();
  });
  return {
    wrap: wrap,
    read: () => {
      const extra = duration.read();
      return {
        kind: item.id,
        allowed: toggle.input.checked,
        permanent: extra.permanent,
        days: extra.days,
        until: extra.until
      };
    }
  };
}

function closeUsersReport() {
  const overlay = document.getElementById("admin-report-overlay");
  if (overlay) overlay.hidden = true;
}

function usersReportError(text) {
  const err = document.getElementById("admin-report-error");
  if (!err) return;
  err.textContent = text || "";
  err.hidden = !text;
}

function openUsersCreateReport(row) {
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
  const bannerUrl = usersMediaUrl(row.banner);
  if (bannerUrl) banner.style.backgroundImage = "url(\"" + bannerUrl + "\")";
  else if (row.banner_color) banner.style.background = row.banner_color;
  left.appendChild(banner);
  const who = adminEl("div", "users-account-who");
  const face = adminEl("div", "users-account-face");
  usersFace(face, row, row.username || row.display_name);
  who.appendChild(face);
  const names = adminEl("div", "users-account-names");
  names.appendChild(adminEl("div", "users-account-display", row.display_name || row.username || "—"));
  names.appendChild(adminEl("div", "users-account-handle", usersHandle(row)));
  who.appendChild(names);
  left.appendChild(who);
  left.appendChild(adminEl("div", "admin-report-rule"));
  const locks = USERS_LOCKS.map((item) => usersLockControl(item));
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
  alertLine.appendChild(adminEl("span", "", "Alert User"));
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
  warnLine.appendChild(adminEl("span", "", "Warn"));
  const warnToggle = usersToggle(false);
  warnLine.appendChild(warnToggle.label);
  const warnReason = adminEl("textarea", "admin-report-reason");
  warnReason.rows = 5;
  warnReason.placeholder = "Reason";
  warnReason.hidden = true;
  warnToggle.input.addEventListener("change", () => {
    warnReason.hidden = !warnToggle.input.checked;
  });
  const banLine = adminEl("div", "admin-report-check");
  banLine.appendChild(adminEl("span", "", "Ban"));
  const banToggle = usersToggle(false);
  banLine.appendChild(banToggle.label);
  const banDuration = usersDurationControls();
  banDuration.host.hidden = true;
  banToggle.input.addEventListener("change", () => {
    banDuration.host.hidden = !banToggle.input.checked;
  });
  const flagLine = adminEl("div", "admin-report-check");
  flagLine.appendChild(adminEl("span", "", "Flag User"));
  const flagToggle = usersToggle(false);
  flagLine.appendChild(flagToggle.label);
  modBox.appendChild(warnLine);
  modBox.appendChild(warnReason);
  modBox.appendChild(banLine);
  modBox.appendChild(banDuration.host);
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
    const ban = banDuration.read();
    adminApi("/admin/user/" + row.id + "/report", {
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
        ban: mode === "moderation" && banToggle.input.checked,
        ban_permanent: ban.permanent,
        ban_days: ban.days,
        ban_until: ban.until,
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
      if (result.data && result.data.user) usersSelected = result.data.user;
      else if (usersSelected) usersSelected.reports_about = (Number(usersSelected.reports_about) || 0) + 1;
      if (result.data && result.data.report) usersReports.unshift(result.data.report);
      const mid = document.getElementById("users-reports");
      if (mid) paintUsersReports(mid);
      const account = document.getElementById("users-account");
      if (account && usersSelected) paintUsersAccount(account, usersSelected);
      if (usersSelected && usersSelected.flagged) {
        usersRows = usersRows.map((item) => item.id === usersSelected.id ? Object.assign({}, item, { flagged: true }) : item);
      }
      const list = document.getElementById("users-search-list");
      if (usersFlaggedOnly) loadUsersList(false);
      else if (list) paintUsersRows(list);
    }).catch(() => usersReportError("Could not create the report."));
  }
  create.onclick = submit;
  cancel.onclick = closeUsersReport;
  overlay.hidden = false;
}

document.addEventListener("click", () => usersCloseCals());

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
    text.appendChild(usersRowName(row.display_name || row.username || "—", row.flagged));
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
  usersOpenId = 0;
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
    if (account) paintUsersAccount(account, usersSelected);
    if (mid) paintUsersReports(mid);
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
  params.set("flagged", usersFlaggedOnly ? "1" : "0");
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
    note: "Search for users to review relative reports.",
    clock: "est"
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
  fields.appendChild(usersSearchFlagged("Flagged Users", usersFlaggedOnly, (on) => {
    usersFlaggedOnly = on;
    loadUsersList(false);
  }));
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

if (typeof miniProfileDataFromOpenProfile === "function") {
  const usersMiniFromOpen = miniProfileDataFromOpenProfile;
  miniProfileDataFromOpenProfile = function () {
    const data = usersMiniFromOpen();
    if (data) data.is_self = false;
    return data;
  };
}

if (typeof registerAdminTrackedOpen === "function") {
  registerAdminTrackedOpen("users", "search", (userId) => {
    showAdminPage("users", "search");
    selectUsersRow(userId);
  });
  registerAdminTrackedOpen("users", "profile", (userId) => {
    usersProfileId = userId;
    showAdminPage("users", "profile");
  });
}
