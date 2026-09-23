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
  feedback: { q: "", column: "id", order: "desc", items: [] },
  users: { q: "", column: "id", order: "asc", items: [] },
  servers: { q: "", column: "id", order: "asc", items: [] }
};

let adminUser = null;
let adminTab = "feedback";
let previewKey = null;
let openFilter = null;

function adminApi(path) {
  return fetch(`https://${API_HOST}${path}`, { credentials: "include" });
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
  const state = currentState();
  const q = state.q.trim().toLowerCase();
  return state.items
    .filter((item) => !q || currentColumns().some((col) => displayValue(item, col.key).toLowerCase().includes(q)))
    .sort((a, b) => compareItems(a, b, state.column, state.order));
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
  card.classList.remove("is-preview");
  pane.hidden = true;
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

function paintFeedbackPreview(row) {
  const host = document.getElementById("admin-preview-inner");
  host.innerHTML = "";
  const title = document.createElement("h2");
  title.className = "admin-preview-title";
  title.textContent = row.feedback_label || row.feedback_type;
  host.appendChild(title);
  const fields = document.createElement("div");
  fields.className = "admin-fields";
  fields.appendChild(fieldRow("Id", row.id));
  fields.appendChild(fieldRow("Type", row.feedback_label || row.feedback_type));
  fields.appendChild(fieldRow("Username", row.username));
  fields.appendChild(fieldRow("Display name", row.display_name));
  fields.appendChild(fieldRow("Status", row.status));
  fields.appendChild(fieldRow("Report", row.report));
  const where = [];
  if (row.context_view) where.push(row.context_view);
  if (row.server_name) where.push(row.server_name);
  if (row.channel_name) where.push((row.channel_type ? row.channel_type + " " : "") + row.channel_name);
  if (where.length) fields.appendChild(fieldRow("Where", where.join(" · ")));
  fields.appendChild(fieldRow("Created", row.created_at));
  host.appendChild(fields);
  paintAttachments(host, row.attachments);
}

function paintUserPreview(user) {
  const host = document.getElementById("admin-preview-inner");
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

function openPreview(item) {
  previewKey = itemKey(item);
  const card = document.getElementById("admin-card");
  const pane = document.getElementById("admin-preview");
  card.classList.add("is-preview");
  pane.hidden = false;
  if (adminTab === "feedback") paintFeedbackPreview(item);
  else if (adminTab === "users") paintUserPreview(item);
  else paintServerPreview(item);
  document.querySelectorAll(".admin-card").forEach((el) => {
    el.classList.toggle("is-on", el.dataset.key === previewKey);
  });
}

function cardCopy(item) {
  if (adminTab === "feedback") {
    const who = item.display_name || item.username || ("User " + item.user_id);
    return {
      head: item.feedback_label || item.feedback_type,
      meta: who + (item.created_at ? " · " + item.created_at : "")
    };
  }
  if (adminTab === "users") {
    return {
      head: item.username || ("User " + item.id),
      meta: "#" + item.id + (item.display_name && item.display_name !== item.username ? " · " + item.display_name : "")
    };
  }
  return {
    head: item.name || item.id,
    meta: "#" + item.id + (item.owner_display_name || item.owner_username ? " · " + (item.owner_display_name || item.owner_username) : "")
  };
}

function paintList() {
  const list = document.getElementById("admin-list");
  if (!list) return;
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
    const card = document.createElement("div");
    card.className = "admin-card";
    card.tabIndex = 0;
    card.dataset.key = itemKey(item);
    if (previewKey && card.dataset.key === previewKey) {
      card.classList.add("is-on");
      previewStillVisible = true;
    }
    const copy = cardCopy(item);
    const head = document.createElement("div");
    head.className = "admin-card-head";
    head.textContent = copy.head;
    const meta = document.createElement("div");
    meta.className = "admin-card-meta";
    meta.textContent = copy.meta;
    card.appendChild(head);
    card.appendChild(meta);
    const open = () => openPreview(item);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
    list.appendChild(card);
  });
  if (previewKey && !previewStillVisible) closePreview();
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
        paintList();
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
        paintList();
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
    paintList();
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

async function loadTab() {
  const state = currentState();
  const path = adminTab === "feedback" ? "/admin/feedback" : adminTab === "users" ? "/admin/user" : "/admin/server";
  try {
    const response = await adminApi(path);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Could not load this tab.");
    if (adminTab === "feedback") state.items = data.reports || [];
    else if (adminTab === "users") state.items = data.users || [];
    else state.items = data.servers || [];
    paintList();
  } catch (e) {
    const list = document.getElementById("admin-list");
    if (!list) return;
    list.innerHTML = "";
    const note = document.createElement("div");
    note.className = "admin-note";
    note.textContent = e.message || "Could not load this tab.";
    list.appendChild(note);
  }
}

function paintMain() {
  paintShell();
  loadTab();
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
