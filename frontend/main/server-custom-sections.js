const SERVER_CUSTOM_SECTION_MAX = 3;

let isServerCustomSectionsOpen = false;
let serverCustomSaved = {};
let serverCustomDraft = [];
let serverCustomDirty = false;
let serverCustomSelected = { kind: "overview", id: "" };
let serverCustomLastTab = "overview";
let serverCustomHostHomes = {};
let serverCustomOverviewToken = 0;
const SERVER_CUSTOM_HOST_IDS = {
  overview: "server-overview",
  members: "server-members-section",
  applications: "server-applications-section"
};

function canOpenServerCustomSections() {
  return typeof canUpdateServer === "function" && canUpdateServer();
}

function serverCustomSavedList() {
  const id = currentServerId;
  if (!id) return [];
  return cloneServerCustomRows(serverCustomSaved[id]);
}

function cloneServerCustomRows(rows) {
  return (rows || []).map((row) => {
    const copy = Object.assign({}, row);
    copy.tiles = (row.tiles || []).map((tile) => {
      const next = Object.assign({}, tile);
      try {
        next.props = tile.props ? JSON.parse(JSON.stringify(tile.props)) : {};
      } catch (e) {
        next.props = Object.assign({}, tile.props || {});
      }
      return next;
    });
    return copy;
  });
}

function currentServerCustomPage() {
  if (!serverCustomSelected || serverCustomSelected.kind !== "custom") return null;
  const row = serverCustomDraft.find((item) => item.id === serverCustomSelected.id);
  if (!row) return null;
  if (!Array.isArray(row.tiles)) row.tiles = [];
  return row;
}

const SERVER_CUSTOM_WIDGET_DROP = {
  display_server: true,
  chat_room: true,
  phone: true,
  connections: true,
  featured_friend: true,
  mutuals: true
};

function serverCustomWidgetAllowed(type) {
  if (!type || SERVER_CUSTOM_WIDGET_DROP[type]) return false;
  if (String(type).indexOf("steam_") === 0 || String(type).indexOf("youtube_") === 0) return false;
  return !!(typeof PROFILE_TILE_TYPES !== "undefined" && PROFILE_TILE_TYPES[type]);
}

function serverCustomWidgetLabel(type) {
  if (type === "member_since") return "Creation Date";
  if (type === "friends") return "Staff";
  return (typeof PROFILE_TILE_TYPES !== "undefined" && PROFILE_TILE_TYPES[type] && PROFILE_TILE_TYPES[type].label) || type;
}

function serverCustomRoleRows() {
  const rows = (typeof serverRolesSaved !== "undefined" && serverRolesSaved.length)
    ? serverRolesSaved
    : ((typeof serverRolesDraft !== "undefined" && serverRolesDraft) || []);
  return rows.slice().sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0) || String(a.id).localeCompare(String(b.id)));
}

function fillServerStaffRoleOptions(box, draft, onChange, hintEl) {
  const roles = serverCustomRoleRows();
  const picked = {};
  (Array.isArray(draft.role_ids) ? draft.role_ids : []).forEach((id) => { picked[String(id)] = true; });
  const label = document.createElement("div");
  label.className = "profile-opt-field-label";
  label.textContent = "Roles";
  box.appendChild(label);
  if (!roles.length) {
    const empty = document.createElement("div");
    empty.className = "settings-opt-desc";
    empty.textContent = "No roles to pick yet.";
    box.appendChild(empty);
    return;
  }
  roles.forEach((role) => {
    const id = String(role.id);
    const row = settingsOpt(
      role.name || "Role",
      "",
      settingsToggle(!!picked[id], false, (on) => {
        picked[id] = on;
        draft.role_ids = roles.map((item) => String(item.id)).filter((key) => picked[key]);
        onChange();
      })
    );
    if (hintEl && typeof profileOptHint === "function") {
      profileOptHint(row, "People with this role appear on Staff, in this list’s order.", hintEl);
    }
    box.appendChild(row);
  });
}

function serverCustomStaffPeople(tile) {
  const wanted = {};
  ((tile && tile.props && tile.props.role_ids) || []).forEach((id) => { wanted[String(id)] = true; });
  const keys = Object.keys(wanted);
  if (!keys.length) return [];
  const order = {};
  serverCustomRoleRows().forEach((role, index) => {
    order[String(role.id)] = index;
  });
  const members = typeof serverSectionMembersSource === "function" ? serverSectionMembersSource() : [];
  const seen = {};
  const people = [];
  members.forEach((member) => {
    const ids = (member.role_ids || []).map((id) => String(id));
    const hits = ids.filter((id) => wanted[id]);
    if (!hits.length) return;
    const key = String(member.id);
    if (seen[key]) return;
    seen[key] = true;
    let rank = 9999;
    hits.forEach((id) => {
      const n = order[id];
      if (n != null && n < rank) rank = n;
    });
    people.push({ member, rank });
  });
  people.sort((a, b) => a.rank - b.rank || String((a.member.display_name || a.member.username || "")).localeCompare(String(b.member.display_name || b.member.username || ""), undefined, { sensitivity: "base" }));
  return people.map((row) => row.member);
}

function serverCustomTransferTargets() {
  const rows = [];
  (typeof serverCustomBuiltinRows === "function" ? serverCustomBuiltinRows() : []).forEach((row) => {
    rows.push({ value: "section:" + row.id, label: row.title + (row.listed ? "" : " (not listed)") });
  });
  serverCustomDraft.forEach((row) => {
    rows.push({ value: "section:" + row.id, label: row.title || "Section" });
  });
  const cats = (currentServerData && currentServerData.categories) || [];
  cats.forEach((cat) => {
    (cat.channels || []).forEach((channel) => {
      rows.push({
        value: "channel:" + channel.id,
        label: (cat.name ? cat.name + " / " : "") + (channel.name || "Channel")
      });
    });
  });
  return rows;
}

function runServerCustomPageTransfer(target) {
  const raw = String(target || "");
  const split = raw.indexOf(":");
  if (split < 0) return;
  const kind = raw.slice(0, split);
  const id = raw.slice(split + 1);
  if (kind === "channel") {
    const cats = (currentServerData && currentServerData.categories) || [];
    let channel = null;
    cats.forEach((cat) => {
      (cat.channels || []).forEach((row) => {
        if (String(row.id) === String(id)) channel = row;
      });
    });
    if (channel && typeof selectChannel === "function") selectChannel(channel);
    return;
  }
  if (kind !== "section") return;
  if (id === "overview" && typeof openServerOverview === "function") openServerOverview();
  else if (id === "members" && typeof openServerMembersSection === "function") openServerMembersSection();
  else if (id === "applications" && typeof openServerApplicationsSection === "function") openServerApplicationsSection();
}

function markServerCustomDirty() {
  serverCustomDirty = true;
  paintServerCustomSave();
}

function paintServerCustomSave() {
  const btn = document.getElementById("server-custom-save");
  if (btn) btn.hidden = !serverCustomDirty;
}

function applyServerCustomSections(serverId, rows) {
  if (!serverId) return;
  serverCustomSaved[serverId] = cloneServerCustomRows(Array.isArray(rows) ? rows : []);
  if (String(currentServerId) === String(serverId) && isServerCustomSectionsOpen && !serverCustomDirty) {
    serverCustomDraft = serverCustomSavedList();
    paintServerCustomPages();
    paintServerCustomMain();
  }
}

function serverCustomNewId() {
  const alphabet = "234679ACDEFGHJKLMNPQRTUVWXYZ";
  let code = "S";
  for (let i = 0; i < 9; i++) code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return code;
}

function serverCustomBuiltinRows() {
  return [
    { kind: "overview", id: "overview", title: "Overview", listed: true },
    {
      kind: "members",
      id: "members",
      title: "Members",
      listed: !!(currentServerData && currentServerData.show_members_in_channel_list)
    },
    {
      kind: "applications",
      id: "applications",
      title: "Applications",
      listed: !!(currentServerData && currentServerData.applications_enabled)
    }
  ];
}

function hideServerCustomSectionsChrome() {
  isServerCustomSectionsOpen = false;
  restoreServerCustomHosts();
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
  paintServerCustomSave();
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
  paintServerCustomSave();
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
  if (typeof loadServerRoles === "function" && serverRolesLoadedFor !== currentServerId) loadServerRoles();
  if (typeof serverSectionMembersSource === "function" && !serverSectionMembersSource().length) {
    fetch(`https://${serverAddress}/get_server_members/${encodeURIComponent(currentServerId)}`, { credentials: "include" })
      .then((response) => response.json().catch(() => ({})))
      .then((data) => {
        if (typeof applyServerMembers === "function") applyServerMembers(currentServerId, data.members || []);
        if (isServerCustomSectionsOpen && typeof renderProfileBoard === "function") renderProfileBoard();
      })
      .catch(() => {});
  }
}

function paintServerCustomPalette() {
  const host = document.getElementById("server-custom-palette-body");
  if (!host) return;
  host.replaceChildren();
  const live = !!(serverCustomSelected && serverCustomSelected.kind === "custom");
  const groups = typeof PROFILE_PALETTE !== "undefined" ? PROFILE_PALETTE : [];
  groups.forEach((group) => {
    if (group.id === "games") return;
    if (group.connection) return;
    const kept = (group.items || []).filter((item) => serverCustomWidgetAllowed(item.type));
    if (!kept.length) return;
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
    kept.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "profile-palette-item" + (live ? "" : " is-later");
      btn.textContent = serverCustomWidgetLabel(item.type);
      btn.disabled = !live;
      if (live) {
        btn.addEventListener("click", () => {
          const page = currentServerCustomPage();
          if (!page || typeof placeProfileTile !== "function") return;
          placeProfileTile(page, item.type);
          markServerCustomDirty();
          if (typeof renderProfileBoard === "function") renderProfileBoard();
        });
      }
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
    btn.className = "profile-page-item" + (row.listed ? "" : " is-later") + (serverCustomSelected.kind === row.kind ? " is-on" : "");
    const name = document.createElement("span");
    name.textContent = row.title;
    btn.appendChild(name);
    btn.addEventListener("click", () => {
      serverCustomSelected = { kind: row.kind, id: row.id };
      paintServerCustomPalette();
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
      paintServerCustomPalette();
      paintServerCustomPages();
      paintServerCustomMain();
    });
    host.appendChild(btn);
  });
  if (add) add.disabled = serverCustomDraft.length >= SERVER_CUSTOM_SECTION_MAX;
}

function serverCustomCell() {
  return typeof PROFILE_ROW_H === "number" ? PROFILE_ROW_H : 36;
}

function serverCustomCols() {
  return typeof PROFILE_COLS === "number" ? PROFILE_COLS : 32;
}

function syncServerCustomBoardScale() {
  const scroll = document.getElementById("server-custom-board-scroll");
  const fit = document.getElementById("server-custom-board-fit");
  const board = document.getElementById("server-custom-board");
  if (!scroll || !board || !isServerCustomSectionsOpen) return;
  const cell = serverCustomCell();
  const cols = serverCustomCols();
  const padX = 40;
  const designW = cols * cell + padX;
  const designH = Math.max(board.offsetHeight, 1);
  const availW = Math.max(1, scroll.clientWidth);
  const scale = availW / designW;
  board.style.transformOrigin = "top left";
  board.style.transform = "scale(" + scale + ")";
  if (fit) {
    fit.style.width = Math.round(designW * scale) + "px";
    fit.style.height = Math.round(designH * scale) + "px";
  }
}

function bindServerCustomBoardScale() {
  const scroll = document.getElementById("server-custom-board-scroll");
  if (!scroll || scroll.dataset.scaleBound === "1") return;
  scroll.dataset.scaleBound = "1";
  if (typeof ResizeObserver === "undefined") {
    window.addEventListener("resize", () => syncServerCustomBoardScale());
    return;
  }
  const observer = new ResizeObserver(() => syncServerCustomBoardScale());
  observer.observe(scroll);
}

function rememberServerCustomHost(el) {
  if (!el || serverCustomHostHomes[el.id]) return;
  serverCustomHostHomes[el.id] = {
    parent: el.parentNode,
    next: el.nextSibling,
    display: el.style.display
  };
}

function putServerCustomHostHome(el) {
  const home = el && serverCustomHostHomes[el.id];
  if (!el || !home || !home.parent) return;
  if (home.next && home.next.parentNode === home.parent) home.parent.insertBefore(el, home.next);
  else home.parent.appendChild(el);
}

function restoreServerCustomHosts() {
  Object.keys(SERVER_CUSTOM_HOST_IDS).forEach((kind) => {
    const el = document.getElementById(SERVER_CUSTOM_HOST_IDS[kind]);
    const home = el && serverCustomHostHomes[el.id];
    if (!el || !home) return;
    putServerCustomHostHome(el);
    el.style.display = home.display || "none";
  });
  serverCustomHostHomes = {};
  if (typeof overviewStopTick === "function") overviewStopTick();
}

function parkServerCustomHost(kind) {
  const preview = document.getElementById("server-custom-preview");
  const want = SERVER_CUSTOM_HOST_IDS[kind];
  if (!preview || !want) return;
  Object.keys(SERVER_CUSTOM_HOST_IDS).forEach((key) => {
    const el = document.getElementById(SERVER_CUSTOM_HOST_IDS[key]);
    if (el) rememberServerCustomHost(el);
  });
  Object.keys(SERVER_CUSTOM_HOST_IDS).forEach((key) => {
    const el = document.getElementById(SERVER_CUSTOM_HOST_IDS[key]);
    if (!el) return;
    if (SERVER_CUSTOM_HOST_IDS[key] === want) {
      preview.appendChild(el);
      el.style.display = "flex";
      return;
    }
    putServerCustomHostHome(el);
    el.style.display = "none";
  });
  if (kind !== "overview" && typeof overviewStopTick === "function") overviewStopTick();
}

async function fillServerCustomOverview() {
  if (!currentServerId || typeof overviewPaintPlaceholders !== "function") return;
  const token = ++serverCustomOverviewToken;
  const serverId = currentServerId;
  overviewPaintPlaceholders();
  const fetchJson = typeof overviewFetchJson === "function" ? overviewFetchJson : null;
  if (!fetchJson) return;
  const [membersPayload, rolesPayload, postsPayload, eventsPayload] = await Promise.all([
    fetchJson(`https://${serverAddress}/get_server_members/${serverId}`),
    fetchJson(`https://${serverAddress}/get_server_roles/${serverId}`),
    fetchJson(`https://${serverAddress}/server_overview/${serverId}`),
    fetchJson(`https://${serverAddress}/get_event_rows/${serverId}`)
  ]);
  if (token !== serverCustomOverviewToken) return;
  if (!isServerCustomSectionsOpen || serverCustomSelected.kind !== "overview") return;
  if (String(currentServerId) !== String(serverId)) return;
  const members = (membersPayload && membersPayload.members) || [];
  const roles = (rolesPayload && rolesPayload.roles) || [];
  const posts = (postsPayload && postsPayload.posts) || [];
  const events = (eventsPayload && eventsPayload.events) || [];
  const windows = typeof overviewEventWindows === "function" ? overviewEventWindows(events) : [];
  overviewPaintStaff(members, roles);
  overviewPaintMembers(members);
  overviewPaintTimezone();
  overviewPaintAbout();
  overviewPaintPost(posts);
  overviewPaintCurrentEvent(windows);
  overviewPaintUpcoming(windows);
  if (typeof overviewStartTick === "function") overviewStartTick();
}

async function fillServerCustomMembers() {
  if (!currentServerId || typeof paintServerSectionMembersList !== "function") return;
  paintServerSectionMembersList();
  if (typeof serverSectionMembersSource === "function" && serverSectionMembersSource().length) return;
  try {
    const response = await fetch(
      `https://${serverAddress}/get_server_members/${encodeURIComponent(currentServerId)}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!isServerCustomSectionsOpen || serverCustomSelected.kind !== "members") return;
    if (!response.ok) return;
    if (typeof applyServerMembers === "function") applyServerMembers(currentServerId, data.members || []);
    paintServerSectionMembersList();
  } catch (e) {}
}

async function fillServerCustomApplications() {
  if (!currentServerId || typeof paintServerSectionApplicationsList !== "function") return;
  if (typeof serverSectionApplicationsLoadedFor !== "undefined" && serverSectionApplicationsLoadedFor !== currentServerId) {
    if (typeof resetServerSectionApplicationLists === "function") resetServerSectionApplicationLists();
  }
  paintServerSectionApplicationsList();
  if (typeof loadServerSectionApplications === "function") await loadServerSectionApplications(true);
}

function paintServerCustomGrid(board) {
  board.replaceChildren();
  board.style.transform = "none";
  const rows = 18;
  const cell = serverCustomCell();
  const cols = serverCustomCols();
  board.style.width = (cols * cell) + "px";
  board.style.minHeight = (16 + rows * cell + 48) + "px";
  const overlay = document.createElement("div");
  overlay.className = "profile-grid-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.gridTemplateColumns = "repeat(" + cols + ", " + cell + "px)";
  overlay.style.gridTemplateRows = "repeat(" + rows + ", " + cell + "px)";
  overlay.style.width = (cols * cell) + "px";
  overlay.style.height = (rows * cell) + "px";
  const count = cols * rows;
  for (let i = 0; i < count; i++) overlay.appendChild(document.createElement("div"));
  board.appendChild(overlay);
  const empty = document.createElement("div");
  empty.className = "profile-board-empty";
  empty.textContent = "Drop pieces from the palette onto this page.";
  board.appendChild(empty);
}

function paintServerCustomMain() {
  const scroll = document.getElementById("server-custom-board-scroll");
  const preview = document.getElementById("server-custom-preview");
  const board = document.getElementById("server-custom-board");
  const kind = serverCustomSelected.kind;
  if (kind === "overview" || kind === "members" || kind === "applications") {
    if (scroll) scroll.hidden = true;
    if (preview) preview.hidden = false;
    parkServerCustomHost(kind);
    if (kind === "overview") fillServerCustomOverview();
    else if (kind === "members") fillServerCustomMembers();
    else fillServerCustomApplications();
    return;
  }
  restoreServerCustomHosts();
  if (preview) preview.hidden = true;
  if (!scroll || !board) return;
  scroll.hidden = false;
  if (typeof renderProfileBoard === "function") renderProfileBoard();
  else {
    bindServerCustomBoardScale();
    paintServerCustomGrid(board);
    window.requestAnimationFrame(() => syncServerCustomBoardScale());
  }
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
    private: !!(priv && priv.checked),
    tiles: []
  };
  serverCustomDraft.push(row);
  serverCustomSelected = { kind: "custom", id: row.id };
  markServerCustomDirty();
  closeServerCustomCreate();
  paintServerCustomPalette();
  paintServerCustomPages();
  paintServerCustomMain();
}

async function saveServerCustomSections() {
  if (!currentServerId || !serverCustomDirty) return;
  const btn = document.getElementById("server-custom-save");
  if (btn) btn.disabled = true;
  try {
    const response = await fetch(`https://${serverAddress}/update_server_custom_sections`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        sections: cloneServerCustomRows(serverCustomDraft)
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save sections.");
    serverCustomSaved[currentServerId] = cloneServerCustomRows(data.custom_sections || serverCustomDraft);
    serverCustomDraft = serverCustomSavedList();
    serverCustomDirty = false;
    paintServerCustomSave();
    paintServerCustomPages();
    paintServerCustomMain();
  } catch (e) {
    window.alert(e.message || "Could not save sections.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function cancelServerCustomSections() {
  if (serverCustomDirty && !window.confirm("Discard section changes?")) return;
  serverCustomDraft = serverCustomSavedList();
  serverCustomDirty = false;
  paintServerCustomSave();
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
