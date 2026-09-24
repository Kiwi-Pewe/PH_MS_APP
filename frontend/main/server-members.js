// ==================================================================
// server-members.js - Server Settings → Members roster table.
// Not the right-rail presence list (members.js). Search, sort, role
// filter, row Kick/Ban/Timeout via existing modals, bulk kick.
// ==================================================================

let serverRosterMembers = [];
let serverRosterRoleFilter = [];
let serverRosterLoadedFor = null;
let serverRosterSelected = new Set();
let serverRosterSearch = "";
let serverRosterRoleId = "";
let serverRosterSort = "joined_desc";
let serverRosterBusy = false;

function serverMembersPageOpen() {
  const page = document.getElementById("server-settings-members");
  return !!(typeof isServerSettingsOpen !== "undefined" && isServerSettingsOpen && page && !page.hidden);
}

function serverRosterDisplayName(member) {
  return (member && (member.display_name || member.username)) || "";
}

function serverRosterJoinedMs(member) {
  if (!member || !member.joined_at) return 0;
  const date = typeof parseUtcTimestamp === "function"
    ? parseUtcTimestamp(member.joined_at)
    : new Date(member.joined_at);
  const ms = date && date.getTime ? date.getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function formatServerRosterJoined(joinedAt) {
  if (!joinedAt) return "—";
  const date = typeof parseUtcTimestamp === "function"
    ? parseUtcTimestamp(joinedAt)
    : new Date(joinedAt);
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function setServerMembersStatus(text) {
  const status = document.getElementById("server-members-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function paintServerRosterRoleFilter() {
  const select = document.getElementById("server-members-role-filter");
  if (!select) return;
  const prev = serverRosterRoleId;
  select.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All roles";
  select.appendChild(all);
  (serverRosterRoleFilter || []).forEach((role) => {
    if (role.is_members) return;
    const opt = document.createElement("option");
    opt.value = String(role.id);
    opt.textContent = role.name || "Role";
    select.appendChild(opt);
  });
  select.value = prev && Array.from(select.options).some((o) => o.value === prev) ? prev : "";
  serverRosterRoleId = select.value;
}

function filteredServerRoster() {
  const needle = serverRosterSearch.trim().toLowerCase();
  let rows = serverRosterMembers.slice();
  if (needle) {
    rows = rows.filter((member) => {
      const name = serverRosterDisplayName(member).toLowerCase();
      const user = String(member.username || "").toLowerCase();
      const id = String(member.id || "");
      return name.includes(needle) || user.includes(needle) || id.includes(needle);
    });
  }
  if (serverRosterRoleId) {
    const rid = String(serverRosterRoleId);
    rows = rows.filter((member) => (member.roles || []).some((role) => String(role.id) === rid));
  }
  const byName = (a, b) => serverRosterDisplayName(a).localeCompare(
    serverRosterDisplayName(b),
    undefined,
    { sensitivity: "base" }
  ) || String(a.username || "").localeCompare(String(b.username || ""), undefined, { sensitivity: "base" });
  if (serverRosterSort === "name_asc") rows.sort(byName);
  else if (serverRosterSort === "name_desc") rows.sort((a, b) => byName(b, a));
  else if (serverRosterSort === "joined_asc") {
    rows.sort((a, b) => serverRosterJoinedMs(a) - serverRosterJoinedMs(b) || byName(a, b));
  } else {
    rows.sort((a, b) => serverRosterJoinedMs(b) - serverRosterJoinedMs(a) || byName(a, b));
  }
  return rows;
}

function kickableRosterMembers(rows) {
  return rows.filter((member) => typeof canActOnMember === "function" && canActOnMember(member, "kick_members"));
}

function paintServerRosterSelection() {
  const bulk = document.getElementById("server-members-bulk-kick");
  const selectAll = document.getElementById("server-members-select-all");
  const visible = filteredServerRoster();
  const kickable = kickableRosterMembers(visible);
  const selectedKickable = kickable.filter((m) => serverRosterSelected.has(String(m.id)));
  if (bulk) {
    const count = selectedKickable.length;
    bulk.hidden = count === 0 || !(typeof canServerPerm === "function" && canServerPerm("kick_members"));
    bulk.textContent = count <= 1 ? "Kick selected" : ("Kick " + count);
    bulk.disabled = serverRosterBusy || count === 0;
  }
  if (selectAll) {
    const allIds = kickable.map((m) => String(m.id));
    const allOn = allIds.length > 0 && allIds.every((id) => serverRosterSelected.has(id));
    selectAll.checked = allOn;
    selectAll.indeterminate = !allOn && allIds.some((id) => serverRosterSelected.has(id));
    selectAll.disabled = kickable.length === 0 || serverRosterBusy;
  }
}

function buildServerRosterRolePill(role) {
  const pill = document.createElement("span");
  pill.className = "server-members-role-pill";
  if (role.color) pill.style.setProperty("--role-color", role.color);
  const dot = document.createElement("span");
  dot.className = "server-members-role-dot";
  if (role.color) dot.style.background = role.color;
  const name = document.createElement("span");
  name.textContent = role.name || "Role";
  pill.appendChild(dot);
  pill.appendChild(name);
  return pill;
}

function buildServerRosterActions(member) {
  const wrap = document.createElement("div");
  wrap.className = "server-members-actions";

  const profileBtn = document.createElement("button");
  profileBtn.type = "button";
  profileBtn.className = "ghost-btn server-members-action";
  profileBtn.textContent = "Profile";
  profileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (typeof openMiniProfile === "function") openMiniProfile(member.id, profileBtn);
  });
  wrap.appendChild(profileBtn);

  const moreBtn = document.createElement("button");
  moreBtn.type = "button";
  moreBtn.className = "ghost-btn server-members-action";
  moreBtn.textContent = "More";
  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (typeof showMemberContextMenu === "function") showMemberContextMenu(e, member);
  });
  wrap.appendChild(moreBtn);

  if (typeof canActOnMember === "function") {
    if (canActOnMember(member, "timeout_members")) {
      const timeoutBtn = document.createElement("button");
      timeoutBtn.type = "button";
      timeoutBtn.className = "ghost-btn server-members-action";
      const timed = typeof memberTimeoutActive === "function" && memberTimeoutActive(member);
      timeoutBtn.textContent = timed ? "Timeout" : "Timeout";
      timeoutBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof openModerationModal === "function") {
          openModerationModal(timed ? "timeout-edit" : "timeout", member);
        }
      });
      wrap.appendChild(timeoutBtn);
    }
    if (canActOnMember(member, "kick_members")) {
      const kickBtn = document.createElement("button");
      kickBtn.type = "button";
      kickBtn.className = "deny-btn server-members-action";
      kickBtn.textContent = "Kick";
      kickBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof openModerationModal === "function") openModerationModal("kick", member);
      });
      wrap.appendChild(kickBtn);
    }
    if (canActOnMember(member, "ban_members")) {
      const banBtn = document.createElement("button");
      banBtn.type = "button";
      banBtn.className = "deny-btn server-members-action";
      banBtn.textContent = "Ban";
      banBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof openModerationModal === "function") openModerationModal("ban", member);
      });
      wrap.appendChild(banBtn);
    }
  }
  return wrap;
}

function paintServerMembersTable() {
  const body = document.getElementById("server-members-body");
  const empty = document.getElementById("server-members-empty");
  if (!body) return;
  body.innerHTML = "";
  const rows = filteredServerRoster();
  if (empty) empty.hidden = rows.length > 0;

  rows.forEach((member) => {
    const tr = document.createElement("tr");
    tr.className = "server-members-row";
    tr.dataset.memberId = String(member.id);

    const checkTd = document.createElement("td");
    checkTd.className = "server-members-col-check";
    const canKick = typeof canActOnMember === "function" && canActOnMember(member, "kick_members");
    if (canKick) {
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = serverRosterSelected.has(String(member.id));
      box.addEventListener("change", () => {
        if (box.checked) serverRosterSelected.add(String(member.id));
        else serverRosterSelected.delete(String(member.id));
        paintServerRosterSelection();
      });
      checkTd.appendChild(box);
    }
    tr.appendChild(checkTd);

    const userTd = document.createElement("td");
    userTd.className = "server-members-col-user";
    const user = document.createElement("div");
    user.className = "server-members-user";
    const face = document.createElement("div");
    face.className = "avatar-dot server-members-avatar";
    user.appendChild(face);
    const labels = document.createElement("div");
    labels.className = "server-members-user-labels";
    const display = document.createElement("div");
    display.className = "server-members-display";
    display.textContent = serverRosterDisplayName(member);
    if (member.name_role && member.name_role.color && typeof applyServerNameColor === "function") {
      applyServerNameColor(display, member.id, member.name_role);
    }
    if (member.is_owner) {
      const crown = document.createElement("span");
      crown.className = "server-members-owner";
      crown.title = "Owner";
      crown.textContent = "★";
      display.appendChild(document.createTextNode(" "));
      display.appendChild(crown);
    }
    const account = document.createElement("div");
    account.className = "server-members-username";
    account.textContent = "@" + (member.username || "");
    labels.appendChild(display);
    labels.appendChild(account);
    user.appendChild(labels);
    userTd.appendChild(user);
    tr.appendChild(userTd);

    const joinedTd = document.createElement("td");
    joinedTd.className = "server-members-col-joined";
    joinedTd.textContent = formatServerRosterJoined(member.joined_at);
    tr.appendChild(joinedTd);

    const rolesTd = document.createElement("td");
    rolesTd.className = "server-members-col-roles";
    const pills = document.createElement("div");
    pills.className = "server-members-roles";
    const roles = (member.roles || []).filter((role) => !role.is_members);
    if (!roles.length) {
      const none = document.createElement("span");
      none.className = "server-members-roles-empty";
      none.textContent = "—";
      pills.appendChild(none);
    } else {
      roles.forEach((role) => pills.appendChild(buildServerRosterRolePill(role)));
    }
    rolesTd.appendChild(pills);
    tr.appendChild(rolesTd);

    const actionsTd = document.createElement("td");
    actionsTd.className = "server-members-col-actions";
    actionsTd.appendChild(buildServerRosterActions(member));
    tr.appendChild(actionsTd);

    body.appendChild(tr);
    if (typeof paintUserFace === "function") {
      paintUserFace(face, member, { name: member.username, userId: member.id });
    }
  });

  paintServerRosterSelection();
}

async function loadServerMembersPage(force) {
  if (!currentServerId || typeof canOpenServerMembers === "function" && !canOpenServerMembers()) return;
  if (!force && serverRosterLoadedFor === currentServerId && serverRosterMembers.length) {
    paintServerMembersTable();
    return;
  }
  setServerMembersStatus("");
  serverRosterBusy = true;
  paintServerRosterSelection();
  try {
    const response = await fetch(
      `https://${serverAddress}/server_settings_members/${encodeURIComponent(currentServerId)}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not load members.");
    serverRosterMembers = data.members || [];
    serverRosterRoleFilter = data.role_filter || [];
    serverRosterLoadedFor = currentServerId;
    serverRosterSelected = new Set(
      Array.from(serverRosterSelected).filter((id) => serverRosterMembers.some((m) => String(m.id) === id))
    );
    serverRosterMembers.forEach((member) => {
      if (typeof rememberIdentityFace === "function") rememberIdentityFace(member.id, member && member.avatar);
    });
    paintServerRosterRoleFilter();
    paintServerMembersTable();
  } catch (e) {
    setServerMembersStatus(e.message || "Could not load members.");
    serverRosterMembers = [];
    paintServerMembersTable();
  } finally {
    serverRosterBusy = false;
    paintServerRosterSelection();
  }
}

function removeServerRosterMember(serverId, userId) {
  if (String(serverRosterLoadedFor) !== String(serverId)) return;
  serverRosterMembers = serverRosterMembers.filter((m) => String(m.id) !== String(userId));
  serverRosterSelected.delete(String(userId));
  if (serverMembersPageOpen()) paintServerMembersTable();
}

function patchServerRosterTimeout(serverId, userId, until, reason) {
  if (String(serverRosterLoadedFor) !== String(serverId)) return;
  const member = serverRosterMembers.find((m) => String(m.id) === String(userId));
  if (!member) return;
  if (until) {
    member.timeout_until = until;
    member.timeout_reason = reason || "";
  } else {
    delete member.timeout_until;
    delete member.timeout_reason;
  }
  if (serverMembersPageOpen()) paintServerMembersTable();
}

function patchServerRosterRoles(serverId, userId, roles, highestRole, hoistRole, nameRole) {
  if (String(serverRosterLoadedFor) !== String(serverId)) return;
  const member = serverRosterMembers.find((m) => String(m.id) === String(userId));
  if (!member) return;
  if (roles) member.roles = roles;
  if (highestRole !== undefined) member.highest_role = highestRole || null;
  if (hoistRole !== undefined) {
    if (hoistRole) member.hoist_role = hoistRole;
    else delete member.hoist_role;
  }
  if (nameRole !== undefined) {
    if (nameRole) member.name_role = nameRole;
    else delete member.name_role;
  }
  if (serverMembersPageOpen()) paintServerMembersTable();
}

function openServerRosterBulkKick() {
  const selected = kickableRosterMembers(filteredServerRoster())
    .filter((m) => serverRosterSelected.has(String(m.id)));
  if (!selected.length) return;
  if (typeof openBulkKickModal === "function") openBulkKickModal(selected);
}

(function bindServerMembersChrome() {
  const search = document.getElementById("server-members-search");
  if (search) {
    search.addEventListener("input", () => {
      serverRosterSearch = search.value || "";
      paintServerMembersTable();
    });
  }
  const roleFilter = document.getElementById("server-members-role-filter");
  if (roleFilter) {
    roleFilter.addEventListener("change", () => {
      serverRosterRoleId = roleFilter.value || "";
      paintServerMembersTable();
    });
  }
  const sort = document.getElementById("server-members-sort");
  if (sort) {
    sort.addEventListener("change", () => {
      serverRosterSort = sort.value || "joined_desc";
      paintServerMembersTable();
    });
  }
  const selectAll = document.getElementById("server-members-select-all");
  if (selectAll) {
    selectAll.addEventListener("change", () => {
      const kickable = kickableRosterMembers(filteredServerRoster());
      if (selectAll.checked) kickable.forEach((m) => serverRosterSelected.add(String(m.id)));
      else kickable.forEach((m) => serverRosterSelected.delete(String(m.id)));
      paintServerMembersTable();
    });
  }
  const bulk = document.getElementById("server-members-bulk-kick");
  if (bulk) bulk.addEventListener("click", openServerRosterBulkKick);
})();
