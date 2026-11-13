let serverCustomSettingsId = "";
let serverCustomSettingsTab = "visibility";
let serverCustomSettingsRoleId = "";

function isServerCustomSettingsOpen() {
  const overlay = document.getElementById("server-custom-settings-overlay");
  return !!(overlay && !overlay.hidden);
}

function serverCustomSettingsRow() {
  if (!serverCustomSettingsId) return null;
  return serverCustomDraft.find((item) => item.id === serverCustomSettingsId) || null;
}

function paintServerCustomSettingsBtn() {
  const btn = document.getElementById("server-custom-page-settings");
  if (!btn) return;
  btn.disabled = !serverCustomDraft.length;
}

function closeServerCustomSettings() {
  const overlay = document.getElementById("server-custom-settings-overlay");
  if (overlay) overlay.hidden = true;
}

function openServerCustomSettings() {
  if (!isServerCustomSectionsOpen || !serverCustomDraft.length) return;
  if (serverCustomSelected && serverCustomSelected.kind === "custom" && serverCustomSelected.id) {
    serverCustomSettingsId = serverCustomSelected.id;
  }
  if (!serverCustomDraft.some((row) => row.id === serverCustomSettingsId)) {
    serverCustomSettingsId = serverCustomDraft[0].id;
  }
  const overlay = document.getElementById("server-custom-settings-overlay");
  if (overlay) overlay.hidden = false;
  if (typeof loadServerRoles === "function" && serverRolesLoadedFor !== currentServerId) {
    loadServerRoles().then(() => {
      if (isServerCustomSettingsOpen()) paintServerCustomSettingsOverlay();
    }).catch(() => {});
  }
  paintServerCustomSettingsOverlay();
}

function paintServerCustomSettingsOverlay() {
  if (!isServerCustomSettingsOpen()) return;
  if (!serverCustomDraft.length) {
    closeServerCustomSettings();
    return;
  }
  if (!serverCustomDraft.some((row) => row.id === serverCustomSettingsId)) {
    serverCustomSettingsId = serverCustomDraft[0].id;
  }
  paintServerCustomSettingsTabs();
  paintServerCustomSettingsNav();
  paintServerCustomSettingsPages();
}

function paintServerCustomSettingsTabs() {
  const host = document.getElementById("server-custom-settings-tabs");
  if (!host) return;
  host.replaceChildren();
  serverCustomDraft.forEach((row) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab" + (row.id === serverCustomSettingsId ? " active" : "");
    btn.textContent = row.title || "Section";
    btn.addEventListener("click", () => {
      serverCustomSettingsId = row.id;
      paintServerCustomSettingsOverlay();
    });
    host.appendChild(btn);
  });
}

function paintServerCustomSettingsNav() {
  const label = document.getElementById("server-custom-settings-index-label");
  const row = serverCustomSettingsRow();
  if (label) label.textContent = (row && row.title) || "Section";
  document.querySelectorAll("#server-custom-settings-nav [data-custom-settings-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-custom-settings-tab") === serverCustomSettingsTab);
  });
}

function paintServerCustomSettingsPages() {
  const vis = document.getElementById("server-custom-settings-visibility");
  const perms = document.getElementById("server-custom-settings-permissions");
  if (vis) vis.hidden = serverCustomSettingsTab !== "visibility";
  if (perms) perms.hidden = serverCustomSettingsTab !== "permissions";
  if (serverCustomSettingsTab === "permissions") paintServerCustomSettingsPermissions();
  else paintServerCustomSettingsVisibility();
}

function paintServerCustomSettingsVisibility() {
  const row = serverCustomSettingsRow();
  const host = document.getElementById("server-custom-settings-listed-host");
  if (!row || !host) return;
  host.replaceChildren();
  if (typeof settingsToggle === "function") {
    host.appendChild(settingsToggle(row.listed !== false, false, (on) => {
      row.listed = !!on;
      if (typeof markServerCustomDirty === "function") markServerCustomDirty();
    }));
  }
  const view = typeof serverCustomViewAccess === "function" ? serverCustomViewAccess(row) : "everyone";
  document.querySelectorAll("#server-custom-settings-view [data-view]").forEach((btn) => {
    const key = btn.getAttribute("data-view");
    btn.classList.toggle("is-on", key === view);
  });
}

function setServerCustomSettingsView(view) {
  const row = serverCustomSettingsRow();
  if (!row || (view !== "everyone" && view !== "staff" && view !== "owner")) return;
  if (typeof applyServerCustomViewAccess === "function") applyServerCustomViewAccess(row, view);
  else row.view_access = view;
  if (typeof markServerCustomDirty === "function") markServerCustomDirty();
  paintServerCustomSettingsVisibility();
}

function serverCustomSettingsEditIds(row) {
  return Array.isArray(row && row.edit_role_ids) ? row.edit_role_ids.map((id) => String(id)) : [];
}

function paintServerCustomSettingsPermissions() {
  const row = serverCustomSettingsRow();
  const list = document.getElementById("server-custom-settings-perms-role-list");
  const body = document.getElementById("server-custom-settings-perms-body");
  const title = document.getElementById("server-custom-settings-perms-role-name");
  const enable = document.getElementById("server-custom-settings-perms-enable-all");
  const clear = document.getElementById("server-custom-settings-perms-clear-all");
  if (!row || !list || !body) return;
  const roles = typeof serverCustomRoleRows === "function" ? serverCustomRoleRows() : [];
  if (!roles.some((role) => String(role.id) === String(serverCustomSettingsRoleId))) {
    serverCustomSettingsRoleId = roles[0] ? String(roles[0].id) : "";
  }
  list.replaceChildren();
  if (!roles.length) {
    const empty = document.createElement("div");
    empty.className = "server-settings-help";
    empty.textContent = "No roles to pick yet.";
    list.appendChild(empty);
  }
  roles.forEach((role) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "channel-perms-role-row"
      + (String(role.id) === String(serverCustomSettingsRoleId) ? " is-active" : "");
    const swatch = document.createElement("span");
    swatch.className = "channel-perms-role-swatch";
    swatch.style.background = role.color || "#99aab5";
    const name = document.createElement("span");
    name.className = "channel-perms-role-name";
    name.textContent = role.name || "Role";
    btn.appendChild(swatch);
    btn.appendChild(name);
    btn.addEventListener("click", () => {
      serverCustomSettingsRoleId = String(role.id);
      paintServerCustomSettingsPermissions();
    });
    list.appendChild(btn);
  });
  const selected = roles.find((role) => String(role.id) === String(serverCustomSettingsRoleId));
  if (title) title.textContent = selected ? (selected.name || "Role") : "Role";
  if (enable) enable.disabled = !roles.length;
  if (clear) clear.disabled = !roles.length;
  body.replaceChildren();
  if (!selected) {
    const note = document.createElement("div");
    note.className = "placeholder-panel";
    note.textContent = "Add a role to set who can edit this section. The owner can always edit.";
    body.appendChild(note);
    return;
  }
  const picked = {};
  serverCustomSettingsEditIds(row).forEach((id) => { picked[id] = true; });
  const section = document.createElement("div");
  section.className = "channel-perms-section";
  const heading = document.createElement("div");
  heading.className = "channel-perms-section-title";
  heading.textContent = "General";
  section.appendChild(heading);
  const live = document.createElement("div");
  live.className = "channel-perms-row";
  const liveText = document.createElement("div");
  liveText.className = "channel-perms-row-text";
  const liveTitle = document.createElement("div");
  liveTitle.className = "channel-perms-row-title";
  liveTitle.textContent = "Edit widgets";
  const liveDesc = document.createElement("div");
  liveDesc.className = "channel-perms-row-desc";
  liveDesc.textContent = "Place, move, and edit widgets on this section.";
  liveText.appendChild(liveTitle);
  liveText.appendChild(liveDesc);
  live.appendChild(liveText);
  if (typeof settingsToggle === "function") {
    live.appendChild(settingsToggle(!!picked[String(selected.id)], false, (on) => {
      setServerCustomSettingsRoleEdit(String(selected.id), on);
    }));
  }
  section.appendChild(live);
  const later = document.createElement("div");
  later.className = "channel-perms-row is-later";
  const laterText = document.createElement("div");
  laterText.className = "channel-perms-row-text";
  const laterTitle = document.createElement("div");
  laterTitle.className = "channel-perms-row-title";
  laterTitle.textContent = "View when unlisted";
  const laterDesc = document.createElement("div");
  laterDesc.className = "channel-perms-row-desc";
  laterDesc.textContent = "Open this section even when it is not listed.";
  laterText.appendChild(laterTitle);
  laterText.appendChild(laterDesc);
  later.appendChild(laterText);
  if (typeof settingsToggle === "function") {
    later.appendChild(settingsToggle(false, true, null));
  }
  section.appendChild(later);
  body.appendChild(section);
}

function setServerCustomSettingsRoleEdit(roleId, on) {
  const row = serverCustomSettingsRow();
  if (!row || !roleId) return;
  const next = serverCustomSettingsEditIds(row).filter((id) => id !== roleId);
  if (on) next.push(roleId);
  row.edit_role_ids = next;
  if (typeof markServerCustomDirty === "function") markServerCustomDirty();
  paintServerCustomSettingsPermissions();
}

function setServerCustomSettingsEditAll(on) {
  const row = serverCustomSettingsRow();
  if (!row) return;
  const roles = typeof serverCustomRoleRows === "function" ? serverCustomRoleRows() : [];
  row.edit_role_ids = on ? roles.map((role) => String(role.id)) : [];
  if (typeof markServerCustomDirty === "function") markServerCustomDirty();
  paintServerCustomSettingsPermissions();
}

const serverCustomSettingsBtn = document.getElementById("server-custom-page-settings");
if (serverCustomSettingsBtn) {
  serverCustomSettingsBtn.addEventListener("click", () => openServerCustomSettings());
}
const serverCustomSettingsOverlay = document.getElementById("server-custom-settings-overlay");
if (serverCustomSettingsOverlay) {
  serverCustomSettingsOverlay.addEventListener("mousedown", (e) => {
    if (e.target && e.target.id === "server-custom-settings-overlay") closeServerCustomSettings();
  });
}
const serverCustomSettingsCancel = document.getElementById("server-custom-settings-cancel");
if (serverCustomSettingsCancel) {
  serverCustomSettingsCancel.addEventListener("click", () => closeServerCustomSettings());
}
const serverCustomSettingsDone = document.getElementById("server-custom-settings-done");
if (serverCustomSettingsDone) {
  serverCustomSettingsDone.addEventListener("click", () => closeServerCustomSettings());
}
const serverCustomSettingsNav = document.getElementById("server-custom-settings-nav");
if (serverCustomSettingsNav) {
  serverCustomSettingsNav.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-custom-settings-tab]");
    if (!btn || !serverCustomSettingsNav.contains(btn)) return;
    serverCustomSettingsTab = btn.getAttribute("data-custom-settings-tab") || "visibility";
    paintServerCustomSettingsOverlay();
  });
}
const serverCustomSettingsView = document.getElementById("server-custom-settings-view");
if (serverCustomSettingsView) {
  serverCustomSettingsView.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn || btn.disabled || !serverCustomSettingsView.contains(btn)) return;
    setServerCustomSettingsView(btn.getAttribute("data-view"));
  });
}
const serverCustomSettingsEnable = document.getElementById("server-custom-settings-perms-enable-all");
if (serverCustomSettingsEnable) {
  serverCustomSettingsEnable.addEventListener("click", () => setServerCustomSettingsEditAll(true));
}
const serverCustomSettingsClear = document.getElementById("server-custom-settings-perms-clear-all");
if (serverCustomSettingsClear) {
  serverCustomSettingsClear.addEventListener("click", () => setServerCustomSettingsEditAll(false));
}
