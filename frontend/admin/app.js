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
  userPreviewLists = null;
  closeAdminProfileOverlay();
  closeAdminModSubmenu();
  const card = document.getElementById("admin-card");
  const pane = document.getElementById("admin-preview");
  const rail = document.getElementById("admin-preview-rail");
  card.classList.remove("is-preview");
  pane.classList.remove("is-report");
  pane.hidden = true;
  if (rail) {
    rail.hidden = true;
    rail.classList.remove("is-user");
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
  rail.classList.remove("is-user");
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

const BAN_LENGTHS = [
  { seconds: 3600, label: "1 hour" },
  { seconds: 86400, label: "1 day" },
  { seconds: 604800, label: "1 week" },
  { seconds: 2592000, label: "30 days" },
  { seconds: 0, label: "Permanent" }
];

let userPreviewLists = null;

function applyUserUpdate(user) {
  if (!user || user.id == null) return;
  const state = tabState.users;
  const index = state.items.findIndex((row) => row.id === user.id);
  if (index >= 0) state.items[index] = Object.assign({}, state.items[index], user);
  if (adminTab === "users") {
    paintList();
    if (previewKey === "users:" + user.id) paintUserPreview(state.items[index] || user);
  }
}

function removeUserFromList(userId) {
  const state = tabState.users;
  state.items = state.items.filter((row) => row.id !== userId);
  if (previewKey === "users:" + userId) closePreview();
  if (adminTab === "users") paintList();
}

function userIdentitySection(user) {
  const account = reportSection();
  const who = document.createElement("div");
  who.className = "admin-report-who";
  const face = document.createElement("div");
  face.className = "admin-report-face";
  const shown = user.display_name || user.username || ("User " + user.id);
  paintFace(face, mediaUrl(user.avatar), firstLetters(shown));
  const text = document.createElement("div");
  text.className = "admin-report-who-text";
  const display = document.createElement("div");
  display.className = "admin-report-display";
  display.textContent = shown;
  const handle = document.createElement("div");
  handle.className = "admin-report-user";
  handle.textContent = user.username || "—";
  const joined = document.createElement("div");
  joined.className = "admin-report-joined";
  joined.textContent = "Joined " + formatDate(user.created_at);
  text.appendChild(display);
  text.appendChild(handle);
  text.appendChild(joined);
  who.appendChild(face);
  who.appendChild(text);
  account.appendChild(who);
  return account;
}

function paintMemberRow(host, name, url, letter, note) {
  const row = document.createElement("div");
  row.className = "admin-member-row";
  const face = document.createElement("div");
  face.className = "admin-member-face";
  paintFace(face, url, letter);
  const text = document.createElement("div");
  text.className = "admin-member-text";
  const title = document.createElement("div");
  title.className = "admin-member-name";
  title.textContent = name || "—";
  text.appendChild(title);
  if (note) {
    const sub = document.createElement("div");
    sub.className = "admin-member-note";
    sub.textContent = note;
    text.appendChild(sub);
  }
  row.appendChild(face);
  row.appendChild(text);
  host.appendChild(row);
}

function paintCollapseList(section, key, title, total, loadMore) {
  const wrap = document.createElement("div");
  wrap.className = "admin-collapse";
  const head = document.createElement("button");
  head.type = "button";
  head.className = "admin-collapse-head";
  const caret = document.createElement("span");
  caret.className = "admin-collapse-caret";
  caret.textContent = "▸";
  const label = document.createElement("span");
  label.textContent = title + " (" + (total == null ? "—" : total) + ")";
  head.appendChild(caret);
  head.appendChild(label);
  const body = document.createElement("div");
  body.className = "admin-collapse-body";
  body.hidden = true;
  const list = document.createElement("div");
  list.className = "admin-member-list";
  const more = document.createElement("button");
  more.type = "button";
  more.className = "admin-load-more";
  more.textContent = "Load More";
  more.hidden = true;
  body.appendChild(list);
  body.appendChild(more);
  head.addEventListener("click", async () => {
    const open = wrap.classList.toggle("is-open");
    caret.textContent = open ? "▾" : "▸";
    body.hidden = !open;
    if (open && userPreviewLists && !userPreviewLists[key].loaded) {
      await loadMore(true);
    }
  });
  more.addEventListener("click", () => loadMore(false));
  wrap.appendChild(head);
  wrap.appendChild(body);
  section.appendChild(wrap);
  return { list, more, wrap };
}

async function loadUserFriends(userId, reset) {
  if (!userPreviewLists || userPreviewLists.id !== userId) return;
  const state = userPreviewLists.friends;
  if (state.loading || (!reset && !state.hasMore)) return;
  if (reset) {
    state.offset = 0;
    state.items = [];
    state.hasMore = true;
  }
  state.loading = true;
  try {
    const response = await adminApi("/admin/user/" + userId + "/friends?offset=" + state.offset + "&limit=" + PAGE_SIZE);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Could not load friends.");
    if (!userPreviewLists || userPreviewLists.id !== userId) return;
    state.items = state.items.concat(data.friends || []);
    state.offset = state.items.length;
    state.hasMore = !!data.has_more;
    state.total = data.total;
    state.loaded = true;
    paintUserFriendRows();
  } catch (err) {
    if (userPreviewLists && userPreviewLists.id === userId && userPreviewLists.friends.list) {
      userPreviewLists.friends.list.textContent = err.message || "Could not load friends.";
    }
  } finally {
    if (userPreviewLists && userPreviewLists.id === userId) userPreviewLists.friends.loading = false;
  }
}

function paintUserFriendRows() {
  if (!userPreviewLists || !userPreviewLists.friends.list) return;
  const host = userPreviewLists.friends.list;
  host.innerHTML = "";
  userPreviewLists.friends.items.forEach((row) => {
    const shown = row.display_name || row.username || ("User " + row.id);
    paintMemberRow(host, shown, mediaUrl(row.avatar), firstLetters(shown), row.username || "");
  });
  if (userPreviewLists.friends.more) {
    userPreviewLists.friends.more.hidden = !userPreviewLists.friends.hasMore;
  }
}

async function loadUserServers(userId, reset) {
  if (!userPreviewLists || userPreviewLists.id !== userId) return;
  const state = userPreviewLists.servers;
  if (state.loading || (!reset && !state.hasMore)) return;
  if (reset) {
    state.offset = 0;
    state.items = [];
    state.hasMore = true;
  }
  state.loading = true;
  try {
    const response = await adminApi("/admin/user/" + userId + "/servers?offset=" + state.offset + "&limit=" + PAGE_SIZE);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Could not load servers.");
    if (!userPreviewLists || userPreviewLists.id !== userId) return;
    state.items = state.items.concat(data.servers || []);
    state.offset = state.items.length;
    state.hasMore = !!data.has_more;
    state.total = data.total;
    state.loaded = true;
    paintUserServerRows();
  } catch (err) {
    if (userPreviewLists && userPreviewLists.id === userId && userPreviewLists.servers.list) {
      userPreviewLists.servers.list.textContent = err.message || "Could not load servers.";
    }
  } finally {
    if (userPreviewLists && userPreviewLists.id === userId) userPreviewLists.servers.loading = false;
  }
}

function paintUserServerRows() {
  if (!userPreviewLists || !userPreviewLists.servers.list) return;
  const host = userPreviewLists.servers.list;
  host.innerHTML = "";
  userPreviewLists.servers.items.forEach((row) => {
    paintMemberRow(host, row.name || row.id, row.icon_url || "", firstLetters(row.name || "?"), row.owner ? "Owner" : "");
  });
  if (userPreviewLists.servers.more) {
    userPreviewLists.servers.more.hidden = !userPreviewLists.servers.hasMore;
  }
}

function paintReasonPanel(host, rows, emptyText) {
  host.innerHTML = "";
  if (!rows || !rows.length) {
    const empty = document.createElement("div");
    empty.className = "admin-reason-empty";
    empty.textContent = emptyText;
    host.appendChild(empty);
    return;
  }
  rows.forEach((row) => {
    const card = document.createElement("div");
    card.className = "admin-reason-row";
    const top = document.createElement("div");
    top.className = "admin-reason-top";
    top.textContent = (row.label ? row.label + " · " : "") + formatStamp(row.created_at);
    const reason = document.createElement("div");
    reason.className = "admin-reason-text";
    reason.textContent = row.reason || "(no reason)";
    const who = document.createElement("div");
    who.className = "admin-reason-actor";
    const bits = [];
    if (row.actor_username) bits.push("by " + row.actor_username);
    if (row.expires_at) bits.push("until " + formatStamp(row.expires_at));
    else if (row.kind === "site" && row.expires_at == null) bits.push("permanent");
    who.textContent = bits.join(" · ");
    card.appendChild(top);
    card.appendChild(reason);
    if (bits.length) card.appendChild(who);
    host.appendChild(card);
  });
}

function paintCountAction(section, label, count, onView) {
  const row = document.createElement("div");
  row.className = "admin-count-row";
  const text = document.createElement("div");
  text.className = "admin-count-label";
  text.textContent = label + ": " + (count == null ? "—" : count);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "admin-count-btn";
  btn.textContent = "View";
  const panel = document.createElement("div");
  panel.className = "admin-reason-panel";
  panel.hidden = true;
  btn.addEventListener("click", async () => {
    if (!panel.hidden) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    panel.textContent = "Loading…";
    try {
      await onView(panel);
    } catch (err) {
      panel.textContent = err.message || "Could not load.";
    }
  });
  row.appendChild(text);
  row.appendChild(btn);
  section.appendChild(row);
  section.appendChild(panel);
}

async function openAdminProfileOverlay(userId) {
  let overlay = document.getElementById("admin-profile-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "admin-profile-overlay";
    overlay.className = "admin-profile-overlay";
    overlay.innerHTML = '<button type="button" class="admin-profile-close" id="admin-profile-close">×</button><div class="admin-profile-inner" id="admin-profile-inner"></div>';
    document.getElementById("admin-preview").appendChild(overlay);
    overlay.querySelector("#admin-profile-close").addEventListener("click", closeAdminProfileOverlay);
  }
  const inner = overlay.querySelector("#admin-profile-inner");
  inner.innerHTML = "<div class=\"admin-note\">Loading…</div>";
  overlay.hidden = false;
  try {
    const response = await adminApi("/admin/user/" + userId + "/profile");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Could not load profile.");
    inner.innerHTML = "";
    const banner = document.createElement("div");
    banner.className = "admin-profile-banner";
    const ident = (data.identity || {});
    const user = data.user || {};
    paintBanner(banner, mediaUrl(ident.banner), "#1e6b8a");
    const face = document.createElement("div");
    face.className = "admin-profile-face";
    const shown = user.display_name || user.username || ("User " + userId);
    paintFace(face, mediaUrl(ident.avatar), firstLetters(shown));
    const name = document.createElement("div");
    name.className = "admin-profile-name";
    name.textContent = shown;
    const handle = document.createElement("div");
    handle.className = "admin-profile-user";
    handle.textContent = user.username || "—";
    const meta = document.createElement("div");
    meta.className = "admin-profile-meta";
    const bits = [];
    if (user.status) bits.push(user.status);
    if (user.pronouns) bits.push(user.pronouns);
    bits.push("Joined " + formatDate(user.member_since));
    meta.textContent = bits.join(" · ");
    const note = document.createElement("div");
    note.className = "admin-profile-note";
    note.textContent = "Read-only preview. Close with × to return to this user.";
    inner.appendChild(banner);
    inner.appendChild(face);
    inner.appendChild(name);
    inner.appendChild(handle);
    inner.appendChild(meta);
    inner.appendChild(note);
  } catch (err) {
    inner.innerHTML = "";
    const note = document.createElement("div");
    note.className = "admin-note";
    note.textContent = err.message || "Could not load profile.";
    inner.appendChild(note);
  }
}

function closeAdminProfileOverlay() {
  const overlay = document.getElementById("admin-profile-overlay");
  if (overlay) overlay.hidden = true;
}

let adminModDraft = null;

function closeAdminModSubmenu() {
  adminModDraft = null;
  const overlay = document.getElementById("admin-mod-overlay");
  if (overlay) overlay.hidden = true;
  const err = document.getElementById("admin-mod-error");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
}

function paintAdminModChips(host, selected, onPick) {
  host.innerHTML = "";
  host.className = "admin-mod-chips";
  BAN_LENGTHS.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "admin-mod-chip" + (selected === opt.seconds ? " is-on" : "");
    btn.textContent = opt.label;
    btn.addEventListener("click", () => onPick(opt.seconds));
    host.appendChild(btn);
  });
}

function openAdminModSubmenu(mode, user) {
  if (!user || user.protected) return;
  const overlay = document.getElementById("admin-mod-overlay");
  const title = document.getElementById("admin-mod-title");
  const body = document.getElementById("admin-mod-body");
  const confirm = document.getElementById("admin-mod-confirm");
  const err = document.getElementById("admin-mod-error");
  if (!overlay || !title || !body || !confirm) return;

  closeFilters();
  adminModDraft = {
    mode,
    user,
    seconds: 86400,
    reason: "",
    username: ""
  };
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }

  function paint() {
    body.innerHTML = "";
    const who = user.display_name || user.username || ("User " + user.id);
    const handle = user.username || "";

    if (mode === "ban") {
      title.textContent = "Ban Account";
      const copy = document.createElement("p");
      copy.className = "admin-mod-copy";
      copy.textContent = "Ban " + who + " from Oneira. They stay in the user list; login is blocked until the ban ends.";
      body.appendChild(copy);
      const durLabel = document.createElement("div");
      durLabel.className = "admin-mod-label";
      durLabel.textContent = "Duration";
      body.appendChild(durLabel);
      const chips = document.createElement("div");
      body.appendChild(chips);
      paintAdminModChips(chips, adminModDraft.seconds, (value) => {
        adminModDraft.seconds = value;
        paint();
      });
      const reasonLabel = document.createElement("label");
      reasonLabel.className = "admin-mod-label";
      reasonLabel.setAttribute("for", "admin-mod-reason");
      reasonLabel.textContent = "Reason (optional)";
      const reason = document.createElement("textarea");
      reason.id = "admin-mod-reason";
      reason.className = "admin-mod-reason";
      reason.rows = 3;
      reason.maxLength = 500;
      reason.placeholder = "Optional";
      reason.value = adminModDraft.reason;
      reason.addEventListener("input", () => { adminModDraft.reason = reason.value; });
      body.appendChild(reasonLabel);
      body.appendChild(reason);
      confirm.className = "admin-mod-confirm is-danger";
      confirm.textContent = "Ban Account";
    } else if (mode === "warn") {
      title.textContent = "Warn Account";
      const copy = document.createElement("p");
      copy.className = "admin-mod-copy";
      copy.textContent = "Warn " + who + ". A reason is required and is stored on their record.";
      body.appendChild(copy);
      const reasonLabel = document.createElement("label");
      reasonLabel.className = "admin-mod-label";
      reasonLabel.setAttribute("for", "admin-mod-reason");
      reasonLabel.textContent = "Reason (required)";
      const reason = document.createElement("textarea");
      reason.id = "admin-mod-reason";
      reason.className = "admin-mod-reason";
      reason.rows = 3;
      reason.maxLength = 500;
      reason.placeholder = "Reason";
      reason.value = adminModDraft.reason;
      reason.addEventListener("input", () => { adminModDraft.reason = reason.value; });
      body.appendChild(reasonLabel);
      body.appendChild(reason);
      confirm.className = "admin-mod-confirm";
      confirm.textContent = "Warn Account";
    } else {
      title.textContent = "Delete Account";
      const copy = document.createElement("p");
      copy.className = "admin-mod-copy";
      const display = user.display_name || "";
      const sameName = display && display.toLowerCase() === handle.toLowerCase();
      let text = "This permanently removes the account";
      if (handle) text += " \"" + handle + "\"";
      text += " from Oneira. Owned servers are wiped. Their chat messages become footer notices.";
      copy.textContent = text;
      body.appendChild(copy);
      const nameLabel = document.createElement("label");
      nameLabel.className = "admin-mod-label";
      nameLabel.setAttribute("for", "admin-mod-username");
      nameLabel.textContent = "Account username";
      const name = document.createElement("input");
      name.type = "text";
      name.id = "admin-mod-username";
      name.className = "admin-mod-input";
      name.autocomplete = "off";
      name.spellcheck = false;
      name.placeholder = handle ? ("Type " + handle + " to confirm") : "Account username";
      name.value = adminModDraft.username;
      name.addEventListener("input", () => { adminModDraft.username = name.value; });
      body.appendChild(nameLabel);
      body.appendChild(name);
      confirm.className = "admin-mod-confirm is-danger";
      confirm.textContent = "Delete Account";
    }
  }

  paint();
  overlay.hidden = false;
  const focusEl = document.getElementById(mode === "delete" ? "admin-mod-username" : "admin-mod-reason");
  if (focusEl) focusEl.focus();
}

async function confirmAdminModSubmenu() {
  if (!adminModDraft || !adminModDraft.user) return;
  const err = document.getElementById("admin-mod-error");
  const confirm = document.getElementById("admin-mod-confirm");
  const cancel = document.getElementById("admin-mod-cancel");
  const mode = adminModDraft.mode;
  const user = adminModDraft.user;
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  if (mode === "warn" && !String(adminModDraft.reason || "").trim()) {
    if (err) {
      err.hidden = false;
      err.textContent = "A reason is required.";
    }
    const reason = document.getElementById("admin-mod-reason");
    if (reason) reason.focus();
    return;
  }
  if (mode === "delete" && !String(adminModDraft.username || "").trim()) {
    if (err) {
      err.hidden = false;
      err.textContent = "Type the account username to confirm.";
    }
    const name = document.getElementById("admin-mod-username");
    if (name) name.focus();
    return;
  }
  if (confirm) confirm.disabled = true;
  if (cancel) cancel.disabled = true;
  try {
    if (mode === "ban") {
      const data = await adminSend("/admin/user/" + user.id + "/ban", {
        seconds: adminModDraft.seconds,
        reason: adminModDraft.reason || ""
      });
      closeAdminModSubmenu();
      applyUserUpdate(data.user);
    } else if (mode === "warn") {
      const data = await adminSend("/admin/user/" + user.id + "/warn", {
        reason: adminModDraft.reason
      });
      closeAdminModSubmenu();
      applyUserUpdate(data.user);
    }     else {
      const typed = String(adminModDraft.username || "").trim().replace(/^@+/, "");
      await adminSend("/admin/user/" + user.id + "/delete", {
        username: typed
      });
      closeAdminModSubmenu();
      removeUserFromList(user.id);
    }
  } catch (e) {
    if (err) {
      err.hidden = false;
      err.textContent = e.message || "Could not complete.";
    }
  } finally {
    if (confirm) confirm.disabled = false;
    if (cancel) cancel.disabled = false;
  }
}

function paintUserRail(user) {
  const rail = document.getElementById("admin-preview-rail");
  if (!rail) return;
  rail.hidden = false;
  rail.classList.add("is-user");
  rail.innerHTML = "";
  if (user.protected) {
    const note = document.createElement("div");
    note.className = "admin-rail-note";
    note.textContent = "This account cannot be warned, banned, or deleted.";
    rail.appendChild(note);
    return;
  }

  const banBtn = document.createElement("button");
  banBtn.type = "button";
  banBtn.textContent = "Ban Account";
  banBtn.addEventListener("click", () => openAdminModSubmenu("ban", user));

  const warnBtn = document.createElement("button");
  warnBtn.type = "button";
  warnBtn.textContent = "Warn Account";
  warnBtn.addEventListener("click", () => openAdminModSubmenu("warn", user));

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "admin-preview-danger";
  deleteBtn.textContent = "Delete Account";
  deleteBtn.addEventListener("click", () => openAdminModSubmenu("delete", user));

  rail.appendChild(banBtn);
  rail.appendChild(warnBtn);
  rail.appendChild(deleteBtn);
}

function paintUserPreview(user) {
  const host = document.getElementById("admin-preview-inner");
  const pane = document.getElementById("admin-preview");
  pane.classList.add("is-report");
  closeAdminProfileOverlay();
  host.innerHTML = "";
  host.appendChild(userIdentitySection(user));

  const account = reportSection();
  const friendsUi = paintCollapseList(account, "friends", "Friends", user.friend_count, (reset) => loadUserFriends(user.id, reset));
  const serversUi = paintCollapseList(account, "servers", "Servers", user.server_count, (reset) => loadUserServers(user.id, reset));
  paintCountAction(account, "Warns", user.warn_count, async (panel) => {
    const response = await adminApi("/admin/user/" + user.id + "/warns");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Could not load warns.");
    paintReasonPanel(panel, data.warns || [], "No warns.");
  });
  paintCountAction(account, "Bans", user.ban_count, async (panel) => {
    const response = await adminApi("/admin/user/" + user.id + "/bans");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Could not load bans.");
    paintReasonPanel(panel, data.bans || [], "No bans.");
  });
  if (user.site_banned) {
    const banNote = document.createElement("div");
    banNote.className = "admin-site-ban-note";
    banNote.textContent = "Currently site-banned" + (user.banned_until ? " until " + formatStamp(user.banned_until) : "");
    account.appendChild(banNote);
  }
  const viewBtn = document.createElement("button");
  viewBtn.type = "button";
  viewBtn.className = "admin-view-profile";
  viewBtn.textContent = "View Profile";
  viewBtn.addEventListener("click", () => openAdminProfileOverlay(user.id));
  account.appendChild(viewBtn);
  host.appendChild(account);

  userPreviewLists = {
    id: user.id,
    friends: {
      items: [],
      offset: 0,
      hasMore: true,
      loaded: false,
      loading: false,
      total: user.friend_count,
      list: friendsUi.list,
      more: friendsUi.more
    },
    servers: {
      items: [],
      offset: 0,
      hasMore: true,
      loaded: false,
      loading: false,
      total: user.server_count,
      list: serversUi.list,
      more: serversUi.more
    }
  };
  paintUserRail(user);
}

function paintServerPreview(server) {
  const host = document.getElementById("admin-preview-inner");
  const pane = document.getElementById("admin-preview");
  const rail = document.getElementById("admin-preview-rail");
  pane.classList.remove("is-report");
  if (rail) {
    rail.hidden = true;
    rail.classList.remove("is-user");
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
  if (adminTab === "users") {
    closeAdminModSubmenu();
    paintUserPreview(item);
    document.querySelectorAll(".admin-card").forEach((el) => {
      el.classList.toggle("is-on", el.dataset.key === previewKey);
    });
    try {
      const response = await adminApi("/admin/user/" + item.id);
      const data = await response.json().catch(() => ({}));
      if (previewKey !== "users:" + item.id) return;
      if (response.ok && data.user) paintUserPreview(data.user);
    } catch (e) {}
    return;
  }
  paintServerPreview(item);
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

document.getElementById("admin-mod-close").addEventListener("click", closeAdminModSubmenu);
document.getElementById("admin-mod-cancel").addEventListener("click", closeAdminModSubmenu);
document.getElementById("admin-mod-confirm").addEventListener("click", confirmAdminModSubmenu);
document.getElementById("admin-mod-overlay").addEventListener("click", (e) => {
  if (e.target.id === "admin-mod-overlay") closeAdminModSubmenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const overlay = document.getElementById("admin-mod-overlay");
  if (overlay && !overlay.hidden) closeAdminModSubmenu();
});

document.addEventListener("click", () => closeFilters());

bootAdmin();
