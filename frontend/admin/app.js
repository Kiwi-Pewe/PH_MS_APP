const ADMIN_TABS = [
  { id: "feedback", label: "Feedback" },
  { id: "users", label: "Users" },
  { id: "servers", label: "Servers" }
];

let adminUser = null;
let adminTab = "feedback";

function adminApi(path) {
  return fetch(`https://${API_HOST}${path}`, { credentials: "include" });
}

function setNote(text) {
  const main = document.getElementById("admin-main");
  main.innerHTML = "";
  const note = document.createElement("div");
  note.className = "admin-note";
  note.textContent = text;
  main.appendChild(note);
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

function paintTabs() {
  const host = document.getElementById("admin-tabs");
  host.innerHTML = "";
  ADMIN_TABS.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.label;
    if (adminTab === item.id) btn.className = "is-on";
    btn.addEventListener("click", () => {
      adminTab = item.id;
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

function searchRow(placeholder, onSubmit) {
  const row = document.createElement("form");
  row.className = "admin-search";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  const go = document.createElement("button");
  go.type = "submit";
  go.textContent = "Look up";
  row.appendChild(input);
  row.appendChild(go);
  row.addEventListener("submit", (e) => {
    e.preventDefault();
    onSubmit(input.value.trim());
  });
  return { row, input };
}

function paintFeedback(reports) {
  const main = document.getElementById("admin-main");
  main.innerHTML = "";
  if (!reports.length) {
    setNote("No feedback yet.");
    return;
  }
  reports.forEach((row) => {
    const card = document.createElement("div");
    card.className = "admin-card";
    card.tabIndex = 0;
    const head = document.createElement("div");
    head.className = "admin-card-head";
    head.textContent = row.feedback_label || row.feedback_type;
    const meta = document.createElement("div");
    meta.className = "admin-card-meta";
    const who = row.display_name || row.username || ("User " + row.user_id);
    meta.textContent = who + (row.created_at ? " · " + row.created_at : "");
    const body = document.createElement("div");
    body.className = "admin-card-body";
    body.appendChild(fieldRow("Report", row.report));
    const where = [];
    if (row.context_view) where.push(row.context_view);
    if (row.server_name) where.push(row.server_name);
    if (row.channel_name) where.push((row.channel_type ? row.channel_type + " " : "") + row.channel_name);
    if (where.length) body.appendChild(fieldRow("Where", where.join(" · ")));
    if (row.attachments && row.attachments.length) {
      const files = document.createElement("div");
      files.className = "admin-attach";
      row.attachments.forEach((att) => {
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
      files.addEventListener("click", (e) => e.stopPropagation());
      body.appendChild(files);
    }
    card.appendChild(head);
    card.appendChild(meta);
    card.appendChild(body);
    const toggle = () => card.classList.toggle("is-open");
    card.addEventListener("click", toggle);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
    main.appendChild(card);
  });
}

async function loadFeedback() {
  setNote("Loading…");
  try {
    const response = await adminApi("/admin/feedback");
    if (!response.ok) throw new Error("Could not load feedback.");
    const data = await response.json();
    paintFeedback(data.reports || []);
  } catch (e) {
    setNote(e.message || "Could not load feedback.");
  }
}

function paintUserList(users) {
  const main = document.getElementById("admin-main");
  const keep = main.querySelector(".admin-search");
  main.innerHTML = "";
  if (keep) main.appendChild(keep);
  if (!users.length) {
    const note = document.createElement("div");
    note.className = "admin-note";
    note.textContent = "No account found.";
    main.appendChild(note);
    return;
  }
  users.forEach((user) => {
    const card = document.createElement("div");
    card.className = "admin-card is-open";
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
    card.appendChild(fields);
    main.appendChild(card);
  });
}

function paintServerList(servers) {
  const main = document.getElementById("admin-main");
  const keep = main.querySelector(".admin-search");
  main.innerHTML = "";
  if (keep) main.appendChild(keep);
  if (!servers.length) {
    const note = document.createElement("div");
    note.className = "admin-note";
    note.textContent = "No server found.";
    main.appendChild(note);
    return;
  }
  servers.forEach((server) => {
    const card = document.createElement("div");
    card.className = "admin-card is-open";
    const fields = document.createElement("div");
    fields.className = "admin-fields";
    fields.appendChild(fieldRow("Id", server.id));
    fields.appendChild(fieldRow("Name", server.name));
    fields.appendChild(fieldRow("Owner", server.owner_display_name || server.owner_username));
    fields.appendChild(fieldRow("Members", server.member_count));
    fields.appendChild(fieldRow("Type", server.server_type));
    fields.appendChild(fieldRow("URL", server.url_slug ? "oneira.cc/" + server.url_slug : ""));
    fields.appendChild(fieldRow("About", server.about));
    fields.appendChild(fieldRow("Created", server.created_at));
    card.appendChild(fields);
    main.appendChild(card);
  });
}

function paintLookup(kind) {
  const main = document.getElementById("admin-main");
  main.innerHTML = "";
  const isUser = kind === "users";
  const search = searchRow(isUser ? "Username or id" : "Server name or id", async (value) => {
    if (!value) return;
    const path = isUser ? "/admin/user?q=" : "/admin/server?q=";
    try {
      const response = await adminApi(path + encodeURIComponent(value));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Nothing found.");
      if (isUser) paintUserList(data.users || []);
      else paintServerList(data.servers || []);
    } catch (e) {
      if (isUser) paintUserList([]);
      else paintServerList([]);
      const note = document.getElementById("admin-main").querySelector(".admin-note");
      if (note) note.textContent = e.message || "Nothing found.";
    }
  });
  main.appendChild(search.row);
  const note = document.createElement("div");
  note.className = "admin-note";
  note.textContent = isUser ? "Look up one account." : "Look up one server.";
  main.appendChild(note);
  search.input.focus();
}

function paintMain() {
  if (adminTab === "feedback") loadFeedback();
  else paintLookup(adminTab);
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

bootAdmin();
