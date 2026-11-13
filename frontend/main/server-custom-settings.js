let serverCustomSettingsId = "";
let serverCustomSettingsTab = "general";
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
  if (typeof loadServerRoles === "function") {
    const loaded = typeof serverRolesLoadedFor !== "undefined" && serverRolesLoadedFor === currentServerId;
    const hasRoles = (typeof serverRolesDraft !== "undefined" && serverRolesDraft && serverRolesDraft.length)
      || (typeof serverRolesSaved !== "undefined" && serverRolesSaved && serverRolesSaved.length);
    if (!loaded || !hasRoles) {
      loadServerRoles().then(() => {
        if (isServerCustomSettingsOpen()) paintServerCustomSettingsOverlay();
      }).catch(() => {});
    }
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
  document.querySelectorAll("#server-custom-settings-nav [data-custom-settings-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-custom-settings-tab") === serverCustomSettingsTab);
  });
}

function paintServerCustomSettingsPages() {
  const general = document.getElementById("server-custom-settings-general");
  const vis = document.getElementById("server-custom-settings-visibility");
  const perms = document.getElementById("server-custom-settings-permissions");
  if (general) general.hidden = serverCustomSettingsTab !== "general";
  if (vis) vis.hidden = serverCustomSettingsTab !== "visibility";
  if (perms) perms.hidden = serverCustomSettingsTab !== "permissions";
  if (serverCustomSettingsTab === "permissions") paintServerCustomSettingsPermissions();
  else if (serverCustomSettingsTab === "visibility") paintServerCustomSettingsVisibility();
  else paintServerCustomSettingsGeneral();
}

function paintServerCustomSettingsToggle(hostId, on, apply) {
  const host = document.getElementById(hostId);
  if (!host) return;
  host.replaceChildren();
  if (typeof settingsToggle !== "function") return;
  host.appendChild(settingsToggle(!!on, false, (next) => {
    apply(!!next);
    if (typeof markServerCustomDirty === "function") markServerCustomDirty();
  }));
}

function paintServerCustomSettingsGeneral() {
  const row = serverCustomSettingsRow();
  if (!row) return;
  paintServerCustomSettingsToggle("server-custom-settings-explicit-host", row.explicit, (on) => {
    row.explicit = on;
  });
  paintServerCustomSettingsToggle("server-custom-settings-admin-host", row.admin_only, (on) => {
    row.admin_only = on;
    row.view_access = row.private ? "owner" : (on ? "staff" : "everyone");
  });
  paintServerCustomSettingsToggle("server-custom-settings-private-host", row.private, (on) => {
    row.private = on;
    row.view_access = on ? "owner" : (row.admin_only ? "staff" : "everyone");
  });
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
}

const SERVER_CUSTOM_SETTINGS_PERMS = [
  {
    id: "view",
    field: "view_role_ids",
    title: "View this section",
    desc: "See this section on the Sections list and open the page."
  },
  {
    id: "interact",
    field: "interact_role_ids",
    title: "Interact",
    desc: "Use buttons, comments, Staff, and spoiler covers on this section."
  },
  {
    id: "edit",
    field: "edit_role_ids",
    title: "Edit widgets",
    desc: "Place, move, and edit widgets on this section."
  }
];

function serverCustomSettingsRoleChoices() {
  const source = (typeof serverRolesDraft !== "undefined" && serverRolesDraft && serverRolesDraft.length)
    ? serverRolesDraft
    : ((typeof serverRolesSaved !== "undefined" && serverRolesSaved) || []);
  const roles = [];
  let members = null;
  source.forEach((role) => {
    if (!role) return;
    const row = {
      id: String(role.id),
      name: role.name || (role.builtin || role.is_members ? "Members" : "Role"),
      color: role.color || "#99aab5"
    };
    if (role.builtin || role.is_members || String(role.id) === "members") {
      members = row;
      members.id = "members";
      members.name = role.name || "Members";
      return;
    }
    roles.push(row);
  });
  if (members) roles.unshift(members);
  else {
    roles.unshift({
      id: "members",
      name: "Members",
      color: "#99aab5"
    });
  }
  return roles;
}

function serverCustomSettingsPermIds(row, field) {
  return Array.isArray(row && row[field]) ? row[field].map((id) => String(id)) : [];
}

function paintServerCustomSettingsPermissions() {
  const row = serverCustomSettingsRow();
  const list = document.getElementById("server-custom-settings-perms-role-list");
  const body = document.getElementById("server-custom-settings-perms-body");
  const title = document.getElementById("server-custom-settings-perms-role-name");
  const enable = document.getElementById("server-custom-settings-perms-enable-all");
  const clear = document.getElementById("server-custom-settings-perms-clear-all");
  if (!row || !list || !body) return;
  const roles = serverCustomSettingsRoleChoices();
  if (!roles.some((role) => String(role.id) === String(serverCustomSettingsRoleId))) {
    serverCustomSettingsRoleId = "members";
  }
  list.replaceChildren();
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
  const selected = roles.find((role) => String(role.id) === String(serverCustomSettingsRoleId)) || roles[0];
  if (title) title.textContent = selected ? (selected.name || "Role") : "Members";
  if (enable) enable.disabled = !selected;
  if (clear) clear.disabled = !selected;
  body.replaceChildren();
  if (!selected) return;
  const section = document.createElement("div");
  section.className = "channel-perms-section";
  const heading = document.createElement("div");
  heading.className = "channel-perms-section-title";
  heading.textContent = "General";
  section.appendChild(heading);
  SERVER_CUSTOM_SETTINGS_PERMS.forEach((perm) => {
    const line = document.createElement("div");
    line.className = "channel-perms-row";
    const text = document.createElement("div");
    text.className = "channel-perms-row-text";
    const name = document.createElement("div");
    name.className = "channel-perms-row-title";
    name.textContent = perm.title;
    const desc = document.createElement("div");
    desc.className = "channel-perms-row-desc";
    desc.textContent = perm.desc;
    text.appendChild(name);
    text.appendChild(desc);
    line.appendChild(text);
    const on = serverCustomSettingsPermIds(row, perm.field).indexOf(String(selected.id)) >= 0;
    if (typeof settingsToggle === "function") {
      line.appendChild(settingsToggle(on, false, (next) => {
        setServerCustomSettingsRolePerm(perm.field, String(selected.id), next);
      }));
    }
    section.appendChild(line);
  });
  body.appendChild(section);
}

function setServerCustomSettingsRolePerm(field, roleId, on) {
  const row = serverCustomSettingsRow();
  if (!row || !field || !roleId) return;
  const next = serverCustomSettingsPermIds(row, field).filter((id) => id !== roleId);
  if (on) next.push(roleId);
  row[field] = next;
  if (typeof markServerCustomDirty === "function") markServerCustomDirty();
  paintServerCustomSettingsPermissions();
}

function setServerCustomSettingsPermsAll(on) {
  const row = serverCustomSettingsRow();
  const roleId = String(serverCustomSettingsRoleId || "");
  if (!row || !roleId) return;
  SERVER_CUSTOM_SETTINGS_PERMS.forEach((perm) => {
    const next = serverCustomSettingsPermIds(row, perm.field).filter((id) => id !== roleId);
    if (on) next.push(roleId);
    row[perm.field] = next;
  });
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
    serverCustomSettingsTab = btn.getAttribute("data-custom-settings-tab") || "general";
    paintServerCustomSettingsOverlay();
  });
}
const serverCustomSettingsEnable = document.getElementById("server-custom-settings-perms-enable-all");
if (serverCustomSettingsEnable) {
  serverCustomSettingsEnable.addEventListener("click", () => setServerCustomSettingsPermsAll(true));
}
const serverCustomSettingsClear = document.getElementById("server-custom-settings-perms-clear-all");
if (serverCustomSettingsClear) {
  serverCustomSettingsClear.addEventListener("click", () => setServerCustomSettingsPermsAll(false));
}
