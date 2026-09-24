// ==================================================================
// server-members.js - Server Settings → Members roster (Discord-like
// table). Not the right-rail presence list (members.js). Column-header
// sort; Mod View placeholder + context-menu More; bulk kick when set.
// ==================================================================

let serverRosterMembers = [];
let serverRosterLoadedFor = null;
let serverRosterSelected = new Set();
let serverRosterSearch = "";
let serverRosterSortKey = "joined";
let serverRosterSortDir = "desc";
let serverRosterBusy = false;

function serverMembersPageOpen() {
  const page = document.getElementById("server-settings-members");
  return !!(typeof isServerSettingsOpen !== "undefined" && isServerSettingsOpen && page && !page.hidden);
}

function serverRosterDisplayName(member) {
  return (member && (member.display_name || member.username)) || "";
}

function serverRosterTsMs(value) {
  if (!value) return 0;
  const date = typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(value) : new Date(value);
  const ms = date && date.getTime ? date.getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function formatRosterAge(ts) {
  if (!ts) return "—";
  const date = typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(ts) : new Date(ts);
  if (!date || Number.isNaN(date.getTime())) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (sec < 60) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "1 minute ago" : min + " minutes ago";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? "1 hour ago" : hr + " hours ago";
  const day = Math.floor(hr / 24);
  if (day < 30) return day === 1 ? "1 day ago" : day + " days ago";
  const month = Math.floor(day / 30);
  if (month < 12) return month === 1 ? "1 month ago" : month + " months ago";
  const year = Math.floor(day / 365);
  return year <= 1 ? "1 year ago" : year + " years ago";
}

function serverRosterVisibleRoles(member) {
  return (member.roles || []).filter((role) => !role.is_members);
}

function serverRosterPrimaryRole(member) {
  const roles = serverRosterVisibleRoles(member);
  if (!roles.length) return null;
  if (member.highest_role && !member.highest_role.is_members) {
    const match = roles.find((role) => String(role.id) === String(member.highest_role.id));
    if (match) return match;
  }
  return roles.slice().sort((a, b) => {
    const ap = Number(a.position || 0);
    const bp = Number(b.position || 0);
    if (ap !== bp) return ap - bp;
    return Number(a.id || 0) - Number(b.id || 0);
  })[0];
}

function setServerMembersStatus(text) {
  const status = document.getElementById("server-members-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
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

  const byName = (a, b) => serverRosterDisplayName(a).localeCompare(
    serverRosterDisplayName(b),
    undefined,
    { sensitivity: "base" }
  ) || String(a.username || "").localeCompare(String(b.username || ""), undefined, { sensitivity: "base" });

  const primaryName = (member) => {
    const role = serverRosterPrimaryRole(member);
    return role ? String(role.name || "") : "";
  };

  rows.sort((a, b) => {
    let cmp = 0;
    if (serverRosterSortKey === "name") cmp = byName(a, b);
    else if (serverRosterSortKey === "joined") cmp = serverRosterTsMs(a.joined_at) - serverRosterTsMs(b.joined_at);
    else if (serverRosterSortKey === "account") cmp = serverRosterTsMs(a.created_at) - serverRosterTsMs(b.created_at);
    else if (serverRosterSortKey === "method") cmp = 0;
    else if (serverRosterSortKey === "roles") {
      cmp = primaryName(a).localeCompare(primaryName(b), undefined, { sensitivity: "base" });
    }
    if (cmp === 0) cmp = byName(a, b);
    return serverRosterSortDir === "asc" ? cmp : -cmp;
  });
  return rows;
}

function kickableRosterMembers(rows) {
  return rows.filter((member) => typeof canActOnMember === "function" && canActOnMember(member, "kick_members"));
}

function paintServerRosterSortHeads() {
  document.querySelectorAll(".server-members-sort-head").forEach((btn) => {
    const key = btn.getAttribute("data-sort");
    const active = key === serverRosterSortKey;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-sort", active
      ? (serverRosterSortDir === "asc" ? "ascending" : "descending")
      : "none");
  });
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

function buildServerRosterRoleCell(member) {
  const wrap = document.createElement("div");
  wrap.className = "server-members-roles";
  const roles = serverRosterVisibleRoles(member);
  const primary = serverRosterPrimaryRole(member);
  if (!primary) {
    wrap.classList.add("is-empty");
    return wrap;
  }
  wrap.appendChild(buildServerRosterRolePill(primary));
  const extra = Math.max(0, roles.length - 1);
  if (extra > 0) {
    const more = document.createElement("span");
    more.className = "server-members-role-more";
    more.textContent = "+" + extra;
    more.title = roles.slice(1).map((r) => r.name || "Role").join(", ");
    wrap.appendChild(more);
  }
  return wrap;
}

function buildServerRosterRolePill(role) {
  const pill = document.createElement("span");
  pill.className = "server-members-role-pill";
  if (role.color) pill.style.setProperty("--role-color", role.color);
  const name = document.createElement("span");
  name.textContent = role.name || "Role";
  pill.appendChild(name);
  return pill;
}

function buildServerRosterActions(member) {
  const wrap = document.createElement("div");
  wrap.className = "server-members-actions";

  const modBtn = document.createElement("button");
  modBtn.type = "button";
  modBtn.className = "server-members-icon-btn";
  modBtn.disabled = true;
  modBtn.title = "Mod View (coming later)";
  modBtn.setAttribute("aria-label", "Mod View (coming later)");
  modBtn.innerHTML = "<span class=\"server-members-mod-icon\" aria-hidden=\"true\"></span>";
  wrap.appendChild(modBtn);

  const moreBtn = document.createElement("button");
  moreBtn.type = "button";
  moreBtn.className = "server-members-icon-btn";
  moreBtn.title = "More";
  moreBtn.setAttribute("aria-label", "More");
  moreBtn.innerHTML = "&#8942;";
  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (typeof showMemberContextMenu === "function") showMemberContextMenu(e, member);
  });
  wrap.appendChild(moreBtn);

  return wrap;
}

function paintServerMembersTable() {
  const body = document.getElementById("server-members-body");
  const empty = document.getElementById("server-members-empty");
  if (!body) return;
  body.innerHTML = "";
  const rows = filteredServerRoster();
  if (empty) empty.hidden = rows.length > 0;
  paintServerRosterSortHeads();

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
    account.textContent = member.username || "";
    labels.appendChild(display);
    labels.appendChild(account);
    user.appendChild(labels);
    userTd.appendChild(user);
    tr.appendChild(userTd);

    const joinedTd = document.createElement("td");
    joinedTd.className = "server-members-col-joined";
    joinedTd.textContent = formatRosterAge(member.joined_at);
    tr.appendChild(joinedTd);

    const accountTd = document.createElement("td");
    accountTd.className = "server-members-col-account";
    accountTd.textContent = formatRosterAge(member.created_at);
    tr.appendChild(accountTd);

    const methodTd = document.createElement("td");
    methodTd.className = "server-members-col-method";
    methodTd.textContent = "Unknown";
    tr.appendChild(methodTd);

    const rolesTd = document.createElement("td");
    rolesTd.className = "server-members-col-roles";
    rolesTd.appendChild(buildServerRosterRoleCell(member));
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
    serverRosterLoadedFor = currentServerId;
    serverRosterSelected = new Set(
      Array.from(serverRosterSelected).filter((id) => serverRosterMembers.some((m) => String(m.id) === id))
    );
    serverRosterMembers.forEach((member) => {
      if (typeof rememberIdentityFace === "function") rememberIdentityFace(member.id, member && member.avatar);
    });
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

function setServerRosterSort(key) {
  if (!key) return;
  if (serverRosterSortKey === key) {
    serverRosterSortDir = serverRosterSortDir === "asc" ? "desc" : "asc";
  } else {
    serverRosterSortKey = key;
    serverRosterSortDir = key === "name" || key === "roles" ? "asc" : "desc";
  }
  paintServerMembersTable();
}

(function bindServerMembersChrome() {
  const search = document.getElementById("server-members-search");
  if (search) {
    search.addEventListener("input", () => {
      serverRosterSearch = search.value || "";
      paintServerMembersTable();
    });
  }
  document.querySelectorAll(".server-members-sort-head").forEach((btn) => {
    btn.addEventListener("click", () => setServerRosterSort(btn.getAttribute("data-sort")));
  });
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
