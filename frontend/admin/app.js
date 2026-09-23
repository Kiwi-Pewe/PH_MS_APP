const ADMIN_TABS = [
  { id: "feedback", label: "Feedback" },
  { id: "users", label: "Users" },
  { id: "servers", label: "Servers" }
];

const TAB_COLUMNS = {
  feedback: [
    { key: "id", label: "Id" },
    { key: "feedback_label", label: "Type" },
    { key: "username", label: "Username" },
    { key: "display_name", label: "Display name" },
    { key: "status", label: "Status" },
    { key: "server_name", label: "Server" },
    { key: "created_at", label: "Created" }
  ],
  users: [
    { key: "id", label: "Id" },
    { key: "username", label: "Username" },
    { key: "display_name", label: "Display name" },
    { key: "created_at", label: "Joined" },
    { key: "status", label: "Status" },
    { key: "pronouns", label: "Pronouns" },
    { key: "mfa_enabled", label: "Authenticator" },
    { key: "server_count", label: "Servers" }
  ],
  servers: [
    { key: "id", label: "Id" },
    { key: "name", label: "Name" },
    { key: "owner_display_name", label: "Owner" },
    { key: "member_count", label: "Members" },
    { key: "server_type", label: "Type" },
    { key: "url_slug", label: "URL" },
    { key: "about", label: "About" },
    { key: "created_at", label: "Created" }
  ]
};

const tabState = {
  feedback: { q: "", column: "id", order: "desc", items: [], hasMore: true, loading: false, offset: 0, seq: 0 },
  users: { q: "", column: "id", order: "asc", items: [], hasMore: true, loading: false, offset: 0, seq: 0 },
  servers: { q: "", column: "id", order: "asc", items: [], hasMore: true, loading: false, offset: 0, seq: 0 }
};

const PAGE_SIZE = 10;

let adminUser = null;
let adminTab = "feedback";
let previewKey = null;
let openFilter = null;
let searchTimer = null;

function adminApi(path) {
  return fetch(`https://${API_HOST}${path}`, { credentials: "include" });
}

async function adminSend(path, body) {
  const response = await fetch(`https://${API_HOST}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not update.");
  return data;
}

function currentState() {
  return tabState[adminTab];
}

function currentColumns() {
  return TAB_COLUMNS[adminTab];
}

function columnLabel(key) {
  const found = currentColumns().find((col) => col.key === key);
  return found ? found.label : key;
}

function displayValue(item, key) {
  if (key === "mfa_enabled") return item.mfa_enabled ? "On" : "Off";
  if (key === "url_slug") return item.url_slug ? "oneira.cc/" + item.url_slug : "";
  const value = item[key];
  return value == null ? "" : String(value);
}

function sortValue(item, key) {
  const value = item[key];
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  return displayValue(item, key).toLowerCase();
}

function compareItems(a, b, key, order) {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  let n = 0;
  if (typeof av === "number" && typeof bv === "number") n = av - bv;
  else n = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
  return order === "desc" ? -n : n;
}

function visibleItems() {
  return currentState().items;
}

const STATUS_LABELS = {
  new: "New",
  viewed: "Viewed",
  review: "Needs Review",
  completed: "Completed"
};

function statusKey(value) {
  const key = String(value || "new").trim().toLowerCase();
  return STATUS_LABELS[key] ? key : "new";
}

function statusLabel(value) {
  return STATUS_LABELS[statusKey(value)] || "New";
}

function statusPill(value) {
  const pill = document.createElement("span");
  const key = statusKey(value);
  pill.className = "admin-status is-" + key;
  pill.textContent = STATUS_LABELS[key];
  return pill;
}

function itemKey(item) {
  return adminTab + ":" + item.id;
}

function fieldRow(label, value) {
  const wrap = document.createElement("div");
  wrap.className = "admin-field";
  const name = document.createElement("div");
  name.className = "admin-field-label";
  name.textContent = label;
  const body = document.createElement("div");
  body.className = "admin-field-value";
  body.textContent = value == null || value === "" ? "—" : String(value);
  wrap.appendChild(name);
  wrap.appendChild(body);
  return wrap;
}

function closeFilters() {
  openFilter = null;
  document.querySelectorAll(".admin-filter-wrap").forEach((el) => el.classList.remove("is-open"));
  document.querySelectorAll(".admin-filter-menu").forEach((el) => el.remove());
}

function closePreview() {
  previewKey = null;
  const card = document.getElementById("admin-card");
  const pane = document.getElementById("admin-preview");
  const rail = document.getElementById("admin-preview-rail");
  card.classList.remove("is-preview");
  pane.classList.remove("is-report");
  pane.hidden = true;
  if (rail) {
    rail.hidden = true;
    rail.innerHTML = "";
  }
  document.getElementById("admin-preview-inner").innerHTML = "";
  document.querySelectorAll(".admin-card.is-on").forEach((el) => el.classList.remove("is-on"));
}

function paintAttachments(host, attachments) {
  if (!attachments || !attachments.length) return;
  const files = document.createElement("div");
  files.className = "admin-attach";
  attachments.forEach((att) => {
    if (att.kind === "video" || (att.mime || "").indexOf("video/") === 0) {
      const vid = document.createElement("video");
      vid.src = att.url;
      vid.controls = true;
      files.appendChild(vid);
    } else if (att.url) {
      const img = document.createElement("img");
      img.src = att.url;
      img.alt = att.name || "";
      files.appendChild(img);
    }
  });
  host.appendChild(files);
}

function formatDate(raw) {
  if (!raw) return "—";
  const date = new Date(raw);
  if (isNaN(date.getTime())) return String(raw);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function reportLocation(row) {
  const parts = [];
  if (row.context_view) parts.push(row.context_view);
  if (row.server_name) parts.push(row.server_name);
  if (row.channel_name) parts.push((row.channel_type ? row.channel_type + " " : "") + row.channel_name);
  return parts.join(" · ") || "—";
}

function reportSection() {
  const section = document.createElement("div");
  section.className = "admin-report-section";
  return section;
}

function applyFeedbackUpdate(report) {
  if (!report || report.id == null) return;
  const state = tabState.feedback;
  const index = state.items.findIndex((row) => row.id === report.id);
  if (index >= 0) state.items[index] = Object.assign({}, state.items[index], report);
  if (adminTab === "feedback") {
    paintList();
    if (previewKey === "feedback:" + report.id) paintFeedbackPreview(state.items[index] || report);
  }
}

function paintFeedbackRail(row) {
  const rail = document.getElementById("admin-preview-rail");
  if (!rail) return;
  rail.hidden = false;
  rail.innerHTML = "";
  const changeWrap = document.createElement("div");
  changeWrap.className = "admin-filter-wrap";
  const changeBtn = document.createElement("button");
  changeBtn.type = "button";
  changeBtn.className = "admin-filter-btn";
  changeBtn.textContent = "Change Status";
  changeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (openFilter === "status") closeFilters();
    else {
      closeFilters();
      openFilter = "status";
      changeWrap.classList.add("is-open");
      const menu = document.createElement("div");
      menu.className = "admin-filter-menu";
      [
        { key: "viewed", label: "Viewed" },
        { key: "review", label: "Needs Review" }
      ].forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = opt.label;
        if (statusKey(row.status) === opt.key) btn.className = "is-on";
        btn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          closeFilters();
          try {
            const data = await adminSend("/admin/feedback/" + row.id + "/status", { status: opt.key });
            applyFeedbackUpdate(data.report);
          } catch (err) {}
        });
        menu.appendChild(btn);
      });
      changeWrap.appendChild(menu);
    }
  });
  changeWrap.appendChild(changeBtn);
  const complete = document.createElement("button");
  complete.type = "button";
  complete.className = "admin-preview-complete";
  if (statusKey(row.status) === "completed") {
    complete.textContent = row.delete_after ? ("Deletes " + formatDate(row.delete_after)) : "Completed";
    complete.disabled = true;
  } else {
    complete.textContent = "Complete Report";
    complete.addEventListener("click", async () => {
      try {
        const data = await adminSend("/admin/feedback/" + row.id + "/complete", {});
        applyFeedbackUpdate(data.report);
      } catch (err) {}
    });
  }
  rail.appendChild(changeWrap);
  rail.appendChild(complete);
}

function paintFeedbackPreview(row) {
  const host = document.getElementById("admin-preview-inner");
  const pane = document.getElementById("admin-preview");
  pane.classList.add("is-report");
  host.innerHTML = "";
  const account = reportSection();
  const who = document.createElement("div");
  who.className = "admin-report-who";
  const face = document.createElement("div");
  face.className = "admin-report-face";
  const shown = row.display_name || row.username || ("User " + row.user_id);
  paintFace(face, mediaUrl(row.avatar), firstLetters(shown));
  const text = document.createElement("div");
  text.className = "admin-report-who-text";
  const display = document.createElement("div");
  display.className = "admin-report-display";
  display.textContent = shown;
  const user = document.createElement("div");
  user.className = "admin-report-user";
  user.textContent = row.username || "—";
  const joined = document.createElement("div");
  joined.className = "admin-report-joined";
  joined.textContent = "Joined " + formatDate(row.joined_at);
  text.appendChild(display);
  text.appendChild(user);
  text.appendChild(joined);
  who.appendChild(face);
  who.appendChild(text);
  account.appendChild(who);
  const report = reportSection();
  const type = document.createElement("h2");
  type.className = "admin-report-type";
  type.textContent = row.feedback_label || row.feedback_type || "Feedback";
  const body = document.createElement("div");
  body.className = "admin-report-body";
  body.textContent = row.report || "";
  report.appendChild(type);
  report.appendChild(body);
  paintAttachments(report, row.attachments);
  const meta = document.createElement("div");
  meta.className = "admin-report-meta";
  const bits = [String(row.id), null, formatDate(row.created_at), reportLocation(row)];
  bits.forEach((bit, index) => {
    if (index) {
      const sep = document.createElement("span");
      sep.className = "admin-report-sep";
      sep.textContent = "|";
      meta.appendChild(sep);
    }
    if (index === 1) meta.appendChild(statusPill(row.status));
    else {
      const piece = document.createElement("span");
      piece.textContent = bit;
      meta.appendChild(piece);
    }
  });
  report.appendChild(meta);
  const record = reportSection();
  const stats = document.createElement("div");
  stats.className = "admin-report-stats";
  stats.appendChild(fieldRow("Reports made", row.reports_made));
  stats.appendChild(fieldRow("Account score", "—"));
  stats.appendChild(fieldRow("Servers banned from", row.ban_count));
  record.appendChild(stats);
  host.appendChild(account);
  host.appendChild(report);
  host.appendChild(record);
  paintFeedbackRail(row);
}

function paintUserPreview(user) {
  const host = document.getElementById("admin-preview-inner");
  const pane = document.getElementById("admin-preview");
  const rail = document.getElementById("admin-preview-rail");
  pane.classList.remove("is-report");
  if (rail) {
    rail.hidden = true;
    rail.innerHTML = "";
  }
  host.innerHTML = "";
  const title = document.createElement("h2");
  title.className = "admin-preview-title";
  title.textContent = user.display_name || user.username;
  host.appendChild(title);
  const fields = document.createElement("div");
  fields.className = "admin-fields";
  fields.appendChild(fieldRow("Id", user.id));
  fields.appendChild(fieldRow("Username", user.username));
  fields.appendChild(fieldRow("Display name", user.display_name));
  fields.appendChild(fieldRow("Joined", user.created_at));
  fields.appendChild(fieldRow("Status", user.status));
  fields.appendChild(fieldRow("Pronouns", user.pronouns));
  fields.appendChild(fieldRow("Authenticator", user.mfa_enabled ? "On" : "Off"));
  fields.appendChild(fieldRow("Servers", user.server_count));
  host.appendChild(fields);
}

function paintServerPreview(server) {
  const host = document.getElementById("admin-preview-inner");
  const pane = document.getElementById("admin-preview");
  const rail = document.getElementById("admin-preview-rail");
  pane.classList.remove("is-report");
  if (rail) {
    rail.hidden = true;
    rail.innerHTML = "";
  }
  host.innerHTML = "";
  const title = document.createElement("h2");
  title.className = "admin-preview-title";
  title.textContent = server.name || server.id;
  host.appendChild(title);
  const fields = document.createElement("div");
  fields.className = "admin-fields";
  fields.appendChild(fieldRow("Id", server.id));
  fields.appendChild(fieldRow("Name", server.name));
  fields.appendChild(fieldRow("Owner", server.owner_display_name || server.owner_username));
  fields.appendChild(fieldRow("Owner username", server.owner_username));
  fields.appendChild(fieldRow("Members", server.member_count));
  fields.appendChild(fieldRow("Type", server.server_type));
  fields.appendChild(fieldRow("URL", server.url_slug ? "oneira.cc/" + server.url_slug : ""));
  fields.appendChild(fieldRow("About", server.about));
  fields.appendChild(fieldRow("Created", server.created_at));
  host.appendChild(fields);
}

async function openPreview(item) {
  previewKey = itemKey(item);
  const card = document.getElementById("admin-card");
  const pane = document.getElementById("admin-preview");
  card.classList.add("is-preview");
  pane.hidden = false;
  if (adminTab === "feedback") {
    paintFeedbackPreview(item);
    document.querySelectorAll(".admin-card").forEach((el) => {
      el.classList.toggle("is-on", el.dataset.key === previewKey);
    });
    if (statusKey(item.status) === "new") {
      try {
        const data = await adminSend("/admin/feedback/" + item.id + "/status", { status: "viewed" });
        applyFeedbackUpdate(data.report);
      } catch (e) {}
    }
    return;
  }
  if (adminTab === "users") paintUserPreview(item);
  else paintServerPreview(item);
  document.querySelectorAll(".admin-card").forEach((el) => {
    el.classList.toggle("is-on", el.dataset.key === previewKey);
  });
}

function mediaUrl(media) {
  return media && media.url ? media.url : "";
}

function firstLetters(name) {
  const words = String(name || "?").trim().split(/\s+/);
  if (words.length >= 2) return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  return (words[0] || "?").charAt(0).toUpperCase();
}

function formatStamp(raw) {
  if (!raw) return "—";
  const date = new Date(raw);
  if (isNaN(date.getTime())) return String(raw);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function paintFace(host, url, letter) {
  host.innerHTML = "";
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    host.appendChild(img);
    return;
  }
  host.textContent = letter || "?";
}

function paintBanner(host, url, color) {
  host.style.backgroundColor = color || "#1e6b8a";
  host.style.backgroundImage = url ? "url(" + JSON.stringify(url) + ")" : "none";
}

function whoBlock(name, time, url, letter) {
  const who = document.createElement("div");
  who.className = "admin-card-who";
  const face = document.createElement("div");
  face.className = "admin-card-face";
  paintFace(face, url, letter);
  const text = document.createElement("div");
  text.className = "admin-card-who-text";
  const title = document.createElement("div");
  title.className = "admin-card-name";
  title.textContent = name || "—";
  const stamp = document.createElement("div");
  stamp.className = "admin-card-time";
  stamp.textContent = formatStamp(time);
  text.appendChild(title);
  text.appendChild(stamp);
  who.appendChild(face);
  who.appendChild(text);
  return who;
}

function paintEntryCard(item) {
  const card = document.createElement("div");
  card.className = "admin-card";
  card.tabIndex = 0;
  card.dataset.key = itemKey(item);
  if (previewKey && card.dataset.key === previewKey) card.classList.add("is-on");
  if (adminTab === "feedback") {
    card.classList.add("is-feedback");
    const name = item.username || ("User " + item.user_id);
    card.appendChild(whoBlock(name, item.created_at, mediaUrl(item.avatar), firstLetters(name)));
    const copy = document.createElement("div");
    copy.className = "admin-card-copy";
    const type = document.createElement("div");
    type.className = "admin-card-type";
    type.textContent = item.feedback_label || item.feedback_type || "Feedback";
    const desc = document.createElement("div");
    desc.className = "admin-card-desc";
    desc.textContent = item.report || "";
    copy.appendChild(type);
    copy.appendChild(desc);
    card.appendChild(copy);
    const status = document.createElement("div");
    status.className = "admin-card-status";
    status.appendChild(statusPill(item.status));
    card.appendChild(status);
  } else if (adminTab === "users") {
    const name = item.username || ("User " + item.id);
    card.appendChild(whoBlock(name, item.created_at, mediaUrl(item.avatar), firstLetters(name)));
    const banner = document.createElement("div");
    banner.className = "admin-card-banner";
    paintBanner(banner, mediaUrl(item.banner), item.banner_color);
    card.appendChild(banner);
  } else {
    const name = item.name || item.id;
    card.appendChild(whoBlock(name, item.created_at, item.icon_url, firstLetters(name)));
    const banner = document.createElement("div");
    banner.className = "admin-card-banner";
    paintBanner(banner, item.banner_url, item.banner_color || "#8b5cf6");
    card.appendChild(banner);
  }
  const open = () => openPreview(item);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });
  return card;
}

function paintList() {
  const list = document.getElementById("admin-list");
  if (!list) return;
  const top = list.scrollTop;
  list.innerHTML = "";
  const rows = visibleItems();
  if (!rows.length) {
    const note = document.createElement("div");
    note.className = "admin-note";
    note.textContent = currentState().items.length ? "Nothing matches that filter." : (
      adminTab === "feedback" ? "No feedback yet." : adminTab === "users" ? "No accounts yet." : "No servers yet."
    );
    list.appendChild(note);
    if (previewKey) closePreview();
    return;
  }
  let previewStillVisible = false;
  rows.forEach((item) => {
    const card = paintEntryCard(item);
    if (card.classList.contains("is-on")) previewStillVisible = true;
    list.appendChild(card);
  });
  if (previewKey && !previewStillVisible) closePreview();
  list.scrollTop = top;
}

function showFilterMenu(wrap, kind) {
  closeFilters();
  openFilter = kind;
  wrap.classList.add("is-open");
  const menu = document.createElement("div");
  menu.className = "admin-filter-menu";
  const state = currentState();
  if (kind === "column") {
    currentColumns().forEach((col) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = col.label;
      if (state.column === col.key) btn.className = "is-on";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.column = col.key;
        closeFilters();
        paintToolbar();
        loadPage(true);
      });
      menu.appendChild(btn);
    });
  } else {
    [
      { key: "asc", label: "Ascending" },
      { key: "desc", label: "Descending" }
    ].forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = opt.label;
      if (state.order === opt.key) btn.className = "is-on";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.order = opt.key;
        closeFilters();
        paintToolbar();
        loadPage(true);
      });
      menu.appendChild(btn);
    });
  }
  wrap.appendChild(menu);
}

function paintToolbar() {
  const host = document.getElementById("admin-toolbar");
  if (!host) return;
  const state = currentState();
  const focusSearch = document.activeElement && document.activeElement.id === "admin-search-input";
  const caret = focusSearch ? document.activeElement.selectionStart : null;
  host.innerHTML = "";
  const search = document.createElement("form");
  search.className = "admin-search";
  const input = document.createElement("input");
  input.id = "admin-search-input";
  input.type = "text";
  input.autocomplete = "off";
  input.placeholder = adminTab === "feedback" ? "Search" : adminTab === "users" ? "Search users" : "Search servers";
  input.value = state.q;
  search.appendChild(input);
  search.addEventListener("submit", (e) => e.preventDefault());
  input.addEventListener("input", () => {
    state.q = input.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadPage(true), 200);
  });
  const filters = document.createElement("div");
  filters.className = "admin-filters";
  const colWrap = document.createElement("div");
  colWrap.className = "admin-filter-wrap";
  const colBtn = document.createElement("button");
  colBtn.type = "button";
  colBtn.className = "admin-filter-btn";
  colBtn.textContent = columnLabel(state.column);
  colBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (openFilter === "column") closeFilters();
    else showFilterMenu(colWrap, "column");
  });
  colWrap.appendChild(colBtn);
  const orderWrap = document.createElement("div");
  orderWrap.className = "admin-filter-wrap";
  const orderBtn = document.createElement("button");
  orderBtn.type = "button";
  orderBtn.className = "admin-filter-btn";
  orderBtn.textContent = state.order === "desc" ? "Desc" : "Asc";
  orderBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (openFilter === "order") closeFilters();
    else showFilterMenu(orderWrap, "order");
  });
  orderWrap.appendChild(orderBtn);
  filters.appendChild(colWrap);
  filters.appendChild(orderWrap);
  host.appendChild(search);
  host.appendChild(filters);
  if (focusSearch) {
    input.focus();
    if (caret != null) input.setSelectionRange(caret, caret);
  }
}

function paintShell() {
  const main = document.getElementById("admin-main");
  main.innerHTML = "";
  const toolbar = document.createElement("div");
  toolbar.className = "admin-toolbar";
  toolbar.id = "admin-toolbar";
  const list = document.createElement("div");
  list.className = "admin-list";
  list.id = "admin-list";
  const note = document.createElement("div");
  note.className = "admin-note";
  note.textContent = "Loading…";
  list.appendChild(note);
  main.appendChild(toolbar);
  main.appendChild(list);
  list.addEventListener("scroll", () => {
    if (list.scrollHeight - list.scrollTop - list.clientHeight < 40) loadPage(false);
  });
  paintToolbar();
}

function paintTabs() {
  const host = document.getElementById("admin-tabs");
  host.innerHTML = "";
  ADMIN_TABS.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.label;
    if (adminTab === item.id) btn.className = "is-on";
    btn.addEventListener("click", () => {
      if (adminTab === item.id) return;
      adminTab = item.id;
      closeFilters();
      closePreview();
      paintTabs();
      paintMain();
    });
    host.appendChild(btn);
  });
}

function paintTitle() {
  const name = (adminUser && (adminUser.display_name || adminUser.username)) || "";
  document.getElementById("admin-title").textContent = "Admin Panel: " + name;
}

function tabPath() {
  if (adminTab === "feedback") return "/admin/feedback";
  if (adminTab === "users") return "/admin/user";
  return "/admin/server";
}

function maybeFillMore() {
  const list = document.getElementById("admin-list");
  if (!list) return;
  if (list.scrollHeight <= list.clientHeight + 8) loadPage(false);
}

async function loadPage(reset) {
  const state = currentState();
  const tab = adminTab;
  if (reset) {
    state.seq += 1;
    state.items = [];
    state.offset = 0;
    state.hasMore = true;
    state.loading = false;
    const list = document.getElementById("admin-list");
    if (list) {
      list.innerHTML = "";
      const note = document.createElement("div");
      note.className = "admin-note";
      note.textContent = "Loading…";
      list.appendChild(note);
    }
  }
  if (state.loading || !state.hasMore) return;
  const seq = state.seq;
  state.loading = true;
  const params = new URLSearchParams({
    q: state.q.trim(),
    sort: state.column,
    order: state.order,
    offset: String(state.offset),
    limit: String(PAGE_SIZE)
  });
  try {
    const response = await adminApi(tabPath() + "?" + params.toString());
    const data = await response.json().catch(() => ({}));
    if (tab !== adminTab || state.seq !== seq) return;
    if (!response.ok) throw new Error(data.detail || "Could not load this tab.");
    const rows = adminTab === "feedback" ? (data.reports || []) : adminTab === "users" ? (data.users || []) : (data.servers || []);
    state.items = state.items.concat(rows);
    state.offset += rows.length;
    state.hasMore = !!data.has_more;
    state.loading = false;
    paintList();
    maybeFillMore();
  } catch (e) {
    if (tab !== adminTab || state.seq !== seq) return;
    state.loading = false;
    if (!state.items.length) {
      const list = document.getElementById("admin-list");
      if (!list) return;
      list.innerHTML = "";
      const note = document.createElement("div");
      note.className = "admin-note";
      note.textContent = e.message || "Could not load this tab.";
      list.appendChild(note);
    }
  }
}

function paintMain() {
  paintShell();
  loadPage(true);
}

async function bootAdmin() {
  try {
    const response = await adminApi("/admin/me");
    if (response.status === 401) {
      window.location.href = "../login.html?redirect=/admin/app.html";
      return;
    }
    if (!response.ok) {
      window.location.href = "../main/app.html";
      return;
    }
    adminUser = await response.json();
    paintTitle();
    paintTabs();
    document.getElementById("admin-card").hidden = false;
    paintMain();
  } catch (e) {
    window.location.href = "../login.html?redirect=/admin/app.html";
  }
}

document.getElementById("admin-back").addEventListener("click", () => {
  window.location.href = "../main/app.html";
});

document.getElementById("admin-preview-close").addEventListener("click", () => {
  closePreview();
});

document.addEventListener("click", () => closeFilters());

bootAdmin();
