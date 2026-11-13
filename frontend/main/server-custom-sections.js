const SERVER_CUSTOM_SECTION_MAX = 3;

let isServerCustomSectionsOpen = false;
let serverCustomSaved = {};
let serverCustomDraft = [];
let serverCustomDirty = false;
let serverCustomSelected = { kind: "overview", id: "" };
let serverCustomLastTab = "overview";

function canOpenServerCustomSections() {
  return typeof canUpdateServer === "function" && canUpdateServer();
}

function serverCustomSavedList() {
  const id = currentServerId;
  if (!id) return [];
  const rows = serverCustomSaved[id];
  return Array.isArray(rows) ? rows.map((row) => Object.assign({}, row)) : [];
}

function cloneServerCustomRows(rows) {
  return (rows || []).map((row) => Object.assign({}, row));
}

function markServerCustomDirty() {
  serverCustomDirty = true;
}

function serverCustomNewId() {
  const alphabet = "234679ACDEFGHJKLMNPQRTUVWXYZ";
  let code = "S";
  for (let i = 0; i < 9; i++) code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return code;
}

function serverCustomBuiltinRows() {
  const rows = [{ kind: "overview", id: "overview", title: "Overview" }];
  if (currentServerData && currentServerData.show_members_in_channel_list) {
    rows.push({ kind: "members", id: "members", title: "Members" });
  }
  if (currentServerData && currentServerData.applications_enabled) {
    rows.push({ kind: "applications", id: "applications", title: "Applications" });
  }
  return rows;
}

function hideServerCustomSectionsChrome() {
  isServerCustomSectionsOpen = false;
  const overlay = document.getElementById("server-settings-overlay");
  if (overlay) overlay.classList.remove("is-custom-sections");
  const palette = document.getElementById("server-custom-palette");
  const pages = document.getElementById("server-custom-pages");
  const page = document.getElementById("server-settings-custom");
  if (palette) palette.hidden = true;
  if (pages) pages.hidden = true;
  if (page) page.hidden = true;
  closeServerCustomCreate();
}

function leaveServerCustomSections() {
  if (!isServerCustomSectionsOpen) return true;
  if (serverCustomDirty && !window.confirm("Discard section changes?")) return false;
  serverCustomDraft = serverCustomSavedList();
  serverCustomDirty = false;
  hideServerCustomSectionsChrome();
  if (typeof showServerSettingsTab === "function") showServerSettingsTab(serverCustomLastTab || "overview");
  return true;
}

function enterServerCustomSections() {
  if (!currentServerId || !canOpenServerCustomSections()) return;
  if (typeof closeContextMenu === "function") closeContextMenu();
  closeServerCustomCreate();
  serverCustomLastTab = "overview";
  const active = document.querySelector("#server-settings-nav .server-settings-nav-item.active[data-tab]");
  if (active) serverCustomLastTab = active.getAttribute("data-tab") || "overview";
  isServerCustomSectionsOpen = true;
  serverCustomDraft = serverCustomSavedList();
  serverCustomDirty = false;
  serverCustomSelected = { kind: "overview", id: "overview" };
  const overlay = document.getElementById("server-settings-overlay");
  if (overlay) overlay.classList.add("is-custom-sections");
  const palette = document.getElementById("server-custom-palette");
  const pages = document.getElementById("server-custom-pages");
  const page = document.getElementById("server-settings-custom");
  const overview = document.getElementById("server-settings-overview");
  const roles = document.getElementById("server-settings-roles");
  const members = document.getElementById("server-settings-members");
  const invites = document.getElementById("server-settings-invites");
  const bans = document.getElementById("server-settings-bans");
  const privacy = document.getElementById("server-settings-discovery");
  const emojis = document.getElementById("server-settings-emojis");
  const integrations = document.getElementById("server-settings-integrations");
  const audit = document.getElementById("server-settings-audit");
  if (overview) overview.hidden = true;
  if (roles) roles.hidden = true;
  if (members) members.hidden = true;
  if (invites) invites.hidden = true;
  if (bans) bans.hidden = true;
  if (privacy) privacy.hidden = true;
  if (emojis) emojis.hidden = true;
  if (integrations) integrations.hidden = true;
  if (audit) audit.hidden = true;
  if (palette) palette.hidden = false;
  if (pages) pages.hidden = false;
  if (page) page.hidden = false;
  document.querySelectorAll("#server-settings-nav .server-settings-nav-item[data-tab]").forEach((btn) => {
    btn.classList.remove("active");
  });
  paintServerCustomPalette();
  paintServerCustomPages();
  paintServerCustomMain();
}

function paintServerCustomPalette() {
  const host = document.getElementById("server-custom-palette-body");
  if (!host) return;
  host.replaceChildren();
  const groups = typeof PROFILE_PALETTE !== "undefined" ? PROFILE_PALETTE : [];
  groups.forEach((group) => {
    if (group.id === "games") return;
    if (group.connection && typeof profileHasConnection === "function" && !profileHasConnection(group.connection)) return;
    const wrap = document.createElement("div");
    wrap.className = "profile-palette-group";
    const toggle = document.createElement("button");
    toggle.type = "button";
    const caret = document.createElement("span");
    caret.className = "profile-palette-caret";
    caret.textContent = "▾";
    toggle.appendChild(document.createTextNode(group.label));
    toggle.appendChild(caret);
    const items = document.createElement("div");
    items.className = "profile-palette-items";
    toggle.addEventListener("click", () => wrap.classList.toggle("is-open"));
    (group.items || []).forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "profile-palette-item is-later";
      btn.textContent = item.label;
      btn.disabled = true;
      items.appendChild(btn);
    });
    wrap.appendChild(toggle);
    wrap.appendChild(items);
    host.appendChild(wrap);
  });
}

function paintServerCustomPages() {
  const host = document.getElementById("server-custom-page-list");
  const add = document.getElementById("server-custom-page-add");
  if (!host) return;
  host.replaceChildren();
  const builtins = serverCustomBuiltinRows();
  builtins.forEach((row) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "profile-page-item is-later" + (serverCustomSelected.kind === row.kind ? " is-on" : "");
    const name = document.createElement("span");
    name.textContent = row.title;
    btn.appendChild(name);
    btn.addEventListener("click", () => {
      serverCustomSelected = { kind: row.kind, id: row.id };
      paintServerCustomPages();
      paintServerCustomMain();
    });
    host.appendChild(btn);
  });
  if (serverCustomDraft.length) {
    const line = document.createElement("div");
    line.className = "profile-page-split";
    host.appendChild(line);
  }
  serverCustomDraft.forEach((row) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "profile-page-item" + (serverCustomSelected.kind === "custom" && serverCustomSelected.id === row.id ? " is-on" : "");
    const name = document.createElement("span");
    name.textContent = row.title || "Section";
    btn.appendChild(name);
    btn.addEventListener("click", () => {
      serverCustomSelected = { kind: "custom", id: row.id };
      paintServerCustomPages();
      paintServerCustomMain();
    });
    host.appendChild(btn);
  });
  if (add) add.disabled = serverCustomDraft.length >= SERVER_CUSTOM_SECTION_MAX;
}

function paintServerCustomGrid(board) {
  board.replaceChildren();
  const rows = 18;
  const overlay = document.createElement("div");
  overlay.className = "profile-grid-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.gridTemplateRows = "repeat(" + rows + ", 36px)";
  const count = 32 * rows;
  for (let i = 0; i < count; i++) overlay.appendChild(document.createElement("div"));
  board.appendChild(overlay);
}

function paintServerCustomBuiltin(kind) {
  const preview = document.getElementById("server-custom-preview");
  if (!preview) return;
  preview.replaceChildren();
  const srcId = kind === "members"
    ? "server-members-section"
    : kind === "applications"
      ? "server-applications-section"
      : "server-overview";
  const src = document.getElementById(srcId);
  if (!src) return;
  const copy = src.cloneNode(true);
  copy.removeAttribute("id");
  copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  copy.style.display = "block";
  copy.style.pointerEvents = "none";
  preview.appendChild(copy);
}

function paintServerCustomMain() {
  const preview = document.getElementById("server-custom-preview");
  const scroll = document.getElementById("server-custom-board-scroll");
  const board = document.getElementById("server-custom-board");
  if (!preview || !scroll || !board) return;
  const custom = serverCustomSelected.kind === "custom";
  preview.hidden = custom;
  scroll.hidden = !custom;
  if (custom) paintServerCustomGrid(board);
  else paintServerCustomBuiltin(serverCustomSelected.kind);
}

function openServerCustomCreate() {
  if (serverCustomDraft.length >= SERVER_CUSTOM_SECTION_MAX) return;
  const overlay = document.getElementById("server-custom-create-overlay");
  const name = document.getElementById("server-custom-create-name");
  const about = document.getElementById("server-custom-create-about");
  const admin = document.getElementById("server-custom-create-admin");
  const priv = document.getElementById("server-custom-create-private");
  if (name) name.value = "";
  if (about) about.value = "";
  if (admin) admin.checked = false;
  if (priv) priv.checked = false;
  if (overlay) overlay.hidden = false;
  if (name) name.focus();
}

function closeServerCustomCreate() {
  const overlay = document.getElementById("server-custom-create-overlay");
  if (overlay) overlay.hidden = true;
}

function submitServerCustomCreate() {
  if (serverCustomDraft.length >= SERVER_CUSTOM_SECTION_MAX) return;
  const nameInput = document.getElementById("server-custom-create-name");
  const aboutInput = document.getElementById("server-custom-create-about");
  const admin = document.getElementById("server-custom-create-admin");
  const priv = document.getElementById("server-custom-create-private");
  const title = String((nameInput && nameInput.value) || "").trim();
  if (!title) {
    if (nameInput) nameInput.focus();
    return;
  }
  const row = {
    id: serverCustomNewId(),
    title,
    about: String((aboutInput && aboutInput.value) || "").trim(),
    admin_only: !!(admin && admin.checked),
    private: !!(priv && priv.checked)
  };
  serverCustomDraft.push(row);
  serverCustomSelected = { kind: "custom", id: row.id };
  markServerCustomDirty();
  closeServerCustomCreate();
  paintServerCustomPages();
  paintServerCustomMain();
}

function saveServerCustomSections() {
  if (!currentServerId) return;
  serverCustomSaved[currentServerId] = cloneServerCustomRows(serverCustomDraft);
  serverCustomDirty = false;
}

function cancelServerCustomSections() {
  if (serverCustomDirty && !window.confirm("Discard section changes?")) return;
  serverCustomDraft = serverCustomSavedList();
  serverCustomDirty = false;
  hideServerCustomSectionsChrome();
  if (typeof showServerSettingsTab === "function") showServerSettingsTab(serverCustomLastTab || "overview");
}

const serverCustomOpenBtn = document.getElementById("server-settings-custom-open");
if (serverCustomOpenBtn) {
  serverCustomOpenBtn.addEventListener("click", () => enterServerCustomSections());
}
const serverCustomAdd = document.getElementById("server-custom-page-add");
if (serverCustomAdd) {
  serverCustomAdd.addEventListener("click", () => openServerCustomCreate());
}
const serverCustomSave = document.getElementById("server-custom-save");
if (serverCustomSave) {
  serverCustomSave.addEventListener("click", () => saveServerCustomSections());
}
const serverCustomCancel = document.getElementById("server-custom-cancel");
if (serverCustomCancel) {
  serverCustomCancel.addEventListener("click", () => cancelServerCustomSections());
}
const serverCustomCreateCancel = document.getElementById("server-custom-create-cancel");
if (serverCustomCreateCancel) {
  serverCustomCreateCancel.addEventListener("click", () => closeServerCustomCreate());
}
const serverCustomCreateSave = document.getElementById("server-custom-create-save");
if (serverCustomCreateSave) {
  serverCustomCreateSave.addEventListener("click", () => submitServerCustomCreate());
}
const serverCustomCreateOverlay = document.getElementById("server-custom-create-overlay");
if (serverCustomCreateOverlay) {
  serverCustomCreateOverlay.addEventListener("mousedown", (e) => {
    if (e.target && e.target.id === "server-custom-create-overlay") closeServerCustomCreate();
  });
}
const serverCustomCreateName = document.getElementById("server-custom-create-name");
if (serverCustomCreateName) {
  serverCustomCreateName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitServerCustomCreate();
    }
  });
}
