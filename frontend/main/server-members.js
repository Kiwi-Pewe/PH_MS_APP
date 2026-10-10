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
  modBtn.title = "Mod View";
  modBtn.setAttribute("aria-label", "Mod View");
  modBtn.innerHTML = "<span class=\"server-members-mod-icon\" aria-hidden=\"true\"></span>";
  modBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openServerMemberModView(member);
  });
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
    tr.addEventListener("contextmenu", (e) => {
      if (typeof showMemberContextMenu === "function") showMemberContextMenu(e, member);
    });

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
    paintServerMembersPruneButton();
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

const MOD_VIEW_NOTABLE = [
  "update_server", "manage_roles", "kick_members", "ban_members", "timeout_members",
  "manage_channels", "mention_everyone", "manage_messages", "manage_announcements", "create_events"
];

let memberPruneDays = 7;
let memberPruneRoles = new Set();
let memberPruneBusy = false;
let memberModUserId = null;
let memberModStats = null;
let memberModPermsOpen = false;
let memberModRolePick = false;
let memberModRoles = [];
let memberModBusy = false;

function paintServerMembersPruneButton() {
  const btn = document.getElementById("server-members-prune-btn");
  if (!btn) return;
  btn.disabled = !(typeof canServerPerm === "function" && canServerPerm("kick_members"));
}

function serverRosterRoleCatalog() {
  const byId = new Map();
  serverRosterMembers.forEach((member) => {
    serverRosterVisibleRoles(member).forEach((role) => {
      if (!byId.has(String(role.id))) byId.set(String(role.id), role);
    });
  });
  return Array.from(byId.values()).sort((a, b) => {
    const ap = Number(a.position || 0);
    const bp = Number(b.position || 0);
    if (ap !== bp) return ap - bp;
    return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
  });
}

function memberSeenMs(member) {
  if (!member || !member.last_active) return null;
  const ms = serverRosterTsMs(member.last_active);
  return ms > 0 ? ms : null;
}

function memberMatchesPrune(member, days, includedRoleIds) {
  if (!member) return false;
  if (!(typeof canActOnMember === "function" && canActOnMember(member, "kick_members"))) return false;
  const seen = memberSeenMs(member);
  const cutoff = Date.now() - days * 86400000;
  if (seen !== null && seen >= cutoff) return false;
  const extra = serverRosterVisibleRoles(member);
  if (!extra.length) return true;
  const included = includedRoleIds || new Set();
  return extra.every((role) => included.has(String(role.id)));
}

function pruneCandidateMembers() {
  return serverRosterMembers.filter((member) => memberMatchesPrune(member, memberPruneDays, memberPruneRoles));
}

function pruneSummary(count, days, rolesOn) {
  const people = count === 1 ? "1 member who has" : (count + " members who have");
  const windowLabel = days + " days";
  const rejoin = " They can rejoin the server using a new invite.";
  if (rolesOn) {
    return "Pruning will kick " + people + " not been seen on Oneira in " + windowLabel + ". Members assigned only to the selected roles are included." + rejoin;
  }
  return "Pruning will kick " + people + " not been seen on Oneira in " + windowLabel + " and are not assigned to any roles." + rejoin;
}

function closeMemberPrune() {
  const overlay = document.getElementById("member-prune-overlay");
  if (overlay) overlay.style.display = "none";
  memberPruneBusy = false;
}

function paintMemberPrune() {
  const body = document.getElementById("member-prune-body");
  const confirm = document.getElementById("member-prune-confirm");
  if (!body) return;
  body.innerHTML = "";
  const seenSection = document.createElement("div");
  seenSection.className = "member-prune-section";
  const seenLabel = document.createElement("div");
  seenLabel.className = "member-prune-label";
  seenLabel.textContent = "Last Seen";
  seenSection.appendChild(seenLabel);
  const options = document.createElement("div");
  options.className = "member-prune-options";
  [7, 30].forEach((days) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "member-prune-option" + (memberPruneDays === days ? " is-on" : "");
    btn.innerHTML = "<span class=\"member-prune-mark\" aria-hidden=\"true\"></span><span>more than " + days + " days ago</span>";
    btn.addEventListener("click", () => {
      memberPruneDays = days;
      paintMemberPrune();
    });
    options.appendChild(btn);
  });
  seenSection.appendChild(options);
  body.appendChild(seenSection);

  const roleSection = document.createElement("div");
  roleSection.className = "member-prune-section";
  const roleLabel = document.createElement("div");
  roleLabel.className = "member-prune-label";
  roleLabel.textContent = "Also include members with these roles";
  roleSection.appendChild(roleLabel);
  const catalog = serverRosterRoleCatalog();
  if (!catalog.length) {
    const empty = document.createElement("p");
    empty.className = "server-settings-help";
    empty.textContent = "No roles to include.";
    roleSection.appendChild(empty);
  } else {
    const list = document.createElement("div");
    list.className = "member-prune-roles";
    catalog.forEach((role) => {
      const row = document.createElement("label");
      row.className = "member-prune-role";
      const name = document.createElement("span");
      name.textContent = role.name || "Role";
      const toggle = document.createElement("span");
      toggle.className = "toggle-switch";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = memberPruneRoles.has(String(role.id));
      input.addEventListener("change", () => {
        const id = String(role.id);
        if (input.checked) memberPruneRoles.add(id);
        else memberPruneRoles.delete(id);
        paintMemberPrune();
      });
      const track = document.createElement("span");
      track.className = "toggle-track";
      track.innerHTML = "<span class=\"toggle-thumb\"></span>";
      toggle.appendChild(input);
      toggle.appendChild(track);
      row.appendChild(name);
      row.appendChild(toggle);
      list.appendChild(row);
    });
    roleSection.appendChild(list);
  }
  body.appendChild(roleSection);

  const count = pruneCandidateMembers().length;
  const copy = document.createElement("p");
  copy.className = "member-prune-copy";
  copy.textContent = pruneSummary(count, memberPruneDays, memberPruneRoles.size > 0);
  body.appendChild(copy);
  if (confirm) {
    confirm.disabled = memberPruneBusy || count === 0;
    confirm.textContent = "Prune";
  }
}

function openMemberPrune() {
  if (!(typeof canServerPerm === "function" && canServerPerm("kick_members"))) return;
  const overlay = document.getElementById("member-prune-overlay");
  const title = document.getElementById("member-prune-title");
  const err = document.getElementById("member-prune-error");
  if (!overlay) return;
  memberPruneDays = 7;
  memberPruneRoles = new Set();
  memberPruneBusy = false;
  const serverName = typeof currentServerSettingsName === "function" ? currentServerSettingsName() : "";
  if (title) title.textContent = serverName ? ("Prune Members — " + serverName) : "Prune Members";
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  paintMemberPrune();
  overlay.style.display = "flex";
}

async function confirmMemberPrune() {
  if (memberPruneBusy) return;
  const targets = pruneCandidateMembers();
  const err = document.getElementById("member-prune-error");
  const confirm = document.getElementById("member-prune-confirm");
  if (!targets.length || !currentServerId) return;
  memberPruneBusy = true;
  if (confirm) confirm.disabled = true;
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  try {
    const ids = targets.map((member) => member.id);
    const kicked = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const response = await fetch(`https://${serverAddress}/bulk_kick_server_members`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          server_id: currentServerId,
          user_ids: chunk,
          reason: "",
          seconds: 0
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not prune those members.");
      (data.kicked || []).forEach((uid) => kicked.push(uid));
    }
    kicked.forEach((uid) => {
      if (typeof applyMemberLeft === "function") applyMemberLeft("server", currentServerId, uid);
      removeServerRosterMember(currentServerId, uid);
    });
    closeMemberPrune();
  } catch (e) {
    memberPruneBusy = false;
    if (err) {
      err.hidden = false;
      err.textContent = e.message || "Could not prune those members.";
    }
    paintMemberPrune();
  }
}

function formatRosterStamp(ts) {
  if (!ts) return "—";
  const date = typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(ts) : new Date(ts);
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function memberModSubject() {
  return serverRosterMembers.find((member) => String(member.id) === String(memberModUserId)) || null;
}

function closeServerMemberModView() {
  const overlay = document.getElementById("member-mod-overlay");
  if (overlay) overlay.style.display = "none";
  memberModUserId = null;
  memberModStats = null;
  memberModRolePick = false;
  memberModBusy = false;
}

function memberModSection(title) {
  const section = document.createElement("section");
  section.className = "member-mod-section";
  const label = document.createElement("div");
  label.className = "member-mod-section-title";
  label.textContent = title;
  section.appendChild(label);
  return section;
}

function memberModStatRow(label, value) {
  const row = document.createElement("div");
  row.className = "member-mod-row";
  const name = document.createElement("span");
  name.textContent = label;
  const count = document.createElement("span");
  count.className = "member-mod-count";
  count.textContent = value === null || value === undefined ? "—" : String(value);
  row.appendChild(name);
  row.appendChild(count);
  return row;
}

function paintServerMemberModView() {
  const body = document.getElementById("member-mod-body");
  const nameEl = document.getElementById("member-mod-name");
  const userEl = document.getElementById("member-mod-user");
  const face = document.getElementById("member-mod-face");
  const member = memberModSubject();
  if (!body || !member) return;
  const display = serverRosterDisplayName(member);
  if (nameEl) nameEl.textContent = display;
  if (userEl) userEl.textContent = member.username || "";
  if (face && typeof paintUserFace === "function") {
    paintUserFace(face, member, { name: member.username, userId: member.id });
  }
  body.innerHTML = "";

  const activity = memberModSection("Server Activity");
  const stats = memberModStats;
  activity.appendChild(memberModStatRow("Messages", stats ? stats.messages : "—"));
  activity.appendChild(memberModStatRow("Links", stats ? stats.links : "—"));
  activity.appendChild(memberModStatRow("Media", stats ? stats.media : "—"));
  activity.appendChild(memberModStatRow("Audit Log", stats ? stats.audit : "—"));
  body.appendChild(activity);

  const permSection = memberModSection("Mod Permissions");
  const granted = (stats && stats.permissions) || [];
  const chips = document.createElement("div");
  chips.className = "member-mod-chips";
  MOD_VIEW_NOTABLE.forEach((id) => {
    if (granted.indexOf(id) === -1) return;
    const chip = document.createElement("span");
    chip.className = "member-mod-chip";
    chip.textContent = typeof permTitle === "function" ? permTitle(id) : id;
    chips.appendChild(chip);
  });
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "member-mod-chip is-button";
  allBtn.textContent = "ALL (" + granted.length + ")";
  allBtn.addEventListener("click", () => {
    memberModPermsOpen = !memberModPermsOpen;
    paintServerMemberModView();
  });
  chips.appendChild(allBtn);
  permSection.appendChild(chips);
  if (memberModPermsOpen) {
    const list = document.createElement("ul");
    list.className = "member-mod-perm-list";
    if (!granted.length) {
      const item = document.createElement("li");
      item.textContent = "No permissions";
      list.appendChild(item);
    } else {
      granted.forEach((id) => {
        const item = document.createElement("li");
        item.textContent = typeof permTitle === "function" ? permTitle(id) : id;
        list.appendChild(item);
      });
    }
    permSection.appendChild(list);
  }
  body.appendChild(permSection);

  const roleSection = memberModSection("Roles");
  const roleRow = document.createElement("div");
  roleRow.className = "member-mod-roles";
  const visible = serverRosterVisibleRoles(member);
  visible.forEach((role) => roleRow.appendChild(buildServerRosterRolePill(role)));
  const add = document.createElement("button");
  add.type = "button";
  add.className = "member-mod-add";
  add.textContent = "+";
  add.title = "Add role";
  add.setAttribute("aria-label", "Add role");
  const canManage = typeof canServerPerm === "function" && canServerPerm("manage_roles");
  add.disabled = !canManage || memberModBusy;
  add.addEventListener("click", () => {
    if (!canManage) return;
    memberModRolePick = !memberModRolePick;
    paintServerMemberModView();
  });
  roleRow.appendChild(add);
  roleSection.appendChild(roleRow);
  if (!visible.length) {
    const none = document.createElement("p");
    none.className = "server-settings-help";
    none.textContent = "No roles.";
    roleSection.appendChild(none);
  }
  if (memberModRolePick && canManage) {
    const held = new Set(visible.map((role) => String(role.id)));
    const openRoles = memberModRoles.filter((role) => !role.is_members && !held.has(String(role.id)));
    const pick = document.createElement("div");
    pick.className = "member-mod-role-pick";
    if (!openRoles.length) {
      const empty = document.createElement("p");
      empty.className = "server-settings-help";
      empty.textContent = "No other roles.";
      pick.appendChild(empty);
    } else {
      openRoles.forEach((role) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = role.name || "Role";
        btn.addEventListener("click", () => assignMemberModRole(member, role.id));
        pick.appendChild(btn);
      });
    }
    roleSection.appendChild(pick);
  }
  body.appendChild(roleSection);

  const account = memberModSection("Account");
  const verify = document.createElement("div");
  verify.className = "member-mod-row is-disabled";
  verify.textContent = "Passed Verification Level";
  account.appendChild(verify);
  account.appendChild(memberModStatRow("Joined Oneira", formatRosterStamp(member.created_at)));
  account.appendChild(memberModStatRow("Server Join Date", formatRosterStamp(member.joined_at)));
  account.appendChild(memberModStatRow("Join Method", member.is_owner ? "Owner" : "Unknown"));
  if (typeof memberTimeoutActive === "function" && memberTimeoutActive(member)) {
    const timeout = memberModStatRow(
      "Timed out",
      typeof remainingTimeoutLabel === "function" ? remainingTimeoutLabel(member.timeout_until) : "Active"
    );
    account.appendChild(timeout);
  }
  body.appendChild(account);

  const actions = document.createElement("div");
  actions.className = "member-mod-actions";
  const tools = [
    {
      show: typeof canActOnMember === "function" && canActOnMember(member, "timeout_members"),
      label: typeof memberTimeoutActive === "function" && memberTimeoutActive(member) ? "Show Timeout" : "Timeout",
      danger: false,
      run: () => openModerationModal(
        typeof memberTimeoutActive === "function" && memberTimeoutActive(member) ? "timeout-edit" : "timeout",
        member
      )
    },
    {
      show: typeof canActOnMember === "function" && canActOnMember(member, "kick_members"),
      label: "Kick",
      danger: true,
      run: () => openModerationModal("kick", member)
    },
    {
      show: typeof canActOnMember === "function" && canActOnMember(member, "ban_members"),
      label: "Ban",
      danger: true,
      run: () => openModerationModal("ban", member)
    }
  ];
  tools.forEach((tool) => {
    if (!tool.show || typeof openModerationModal !== "function") return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = tool.danger ? "deny-btn" : "ghost-btn";
    btn.textContent = tool.label;
    btn.addEventListener("click", tool.run);
    actions.appendChild(btn);
  });
  if (actions.childNodes.length) body.appendChild(actions);
}

async function openServerMemberModView(member) {
  if (!member || !currentServerId) return;
  const overlay = document.getElementById("member-mod-overlay");
  if (!overlay) return;
  memberModUserId = member.id;
  memberModStats = null;
  memberModPermsOpen = false;
  memberModRolePick = false;
  memberModRoles = [];
  memberModBusy = false;
  paintServerMemberModView();
  overlay.style.display = "flex";
  try {
    const [statsRes, rolesRes] = await Promise.all([
      fetch(`https://${serverAddress}/server_member_mod/${encodeURIComponent(currentServerId)}/${encodeURIComponent(member.id)}`, { credentials: "include" }),
      fetch(`https://${serverAddress}/get_server_roles/${encodeURIComponent(currentServerId)}`, { credentials: "include" })
    ]);
    const stats = await statsRes.json().catch(() => ({}));
    const roles = await rolesRes.json().catch(() => ({}));
    if (String(memberModUserId) !== String(member.id)) return;
    if (statsRes.ok) memberModStats = stats;
    if (rolesRes.ok) memberModRoles = roles.roles || [];
    paintServerMemberModView();
  } catch (e) {
    if (String(memberModUserId) === String(member.id)) paintServerMemberModView();
  }
}

async function assignMemberModRole(member, roleId) {
  if (!member || !currentServerId || memberModBusy) return;
  memberModBusy = true;
  paintServerMemberModView();
  try {
    const response = await fetch(`https://${serverAddress}/set_server_role_member`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        user_id: member.id,
        role_id: roleId,
        assigned: true
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not add that role.");
    patchServerRosterRoles(
      currentServerId,
      member.id,
      data.roles || null,
      data.highest_role,
      data.hoist_role || null,
      data.name_role || null
    );
    if (typeof applyMemberRolesUpdated === "function") {
      applyMemberRolesUpdated(currentServerId, member.id, data.hoist_role || null, data.name_role || null);
    }
    memberModRolePick = false;
  } catch (e) {
    window.alert(e.message || "Could not add that role.");
  } finally {
    memberModBusy = false;
    if (memberModUserId) paintServerMemberModView();
  }
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
  const prune = document.getElementById("server-members-prune-btn");
  if (prune) prune.addEventListener("click", openMemberPrune);
  const pruneClose = document.getElementById("member-prune-close");
  const pruneCancel = document.getElementById("member-prune-cancel");
  const pruneConfirm = document.getElementById("member-prune-confirm");
  const pruneOverlay = document.getElementById("member-prune-overlay");
  if (pruneClose) pruneClose.addEventListener("click", closeMemberPrune);
  if (pruneCancel) pruneCancel.addEventListener("click", closeMemberPrune);
  if (pruneConfirm) pruneConfirm.addEventListener("click", confirmMemberPrune);
  if (pruneOverlay) {
    pruneOverlay.addEventListener("click", (e) => {
      if (e.target.id === "member-prune-overlay") closeMemberPrune();
    });
  }
  const modClose = document.getElementById("member-mod-close");
  const modOverlay = document.getElementById("member-mod-overlay");
  if (modClose) modClose.addEventListener("click", closeServerMemberModView);
  if (modOverlay) {
    modOverlay.addEventListener("click", (e) => {
      if (e.target.id === "member-mod-overlay") closeServerMemberModView();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const moderation = document.getElementById("moderation-overlay");
    const bulkOverlay = document.getElementById("bulk-kick-overlay");
    if (moderation && moderation.style.display === "flex") return;
    if (bulkOverlay && bulkOverlay.style.display === "flex") return;
    const mod = document.getElementById("member-mod-overlay");
    const pruneCard = document.getElementById("member-prune-overlay");
    if (mod && mod.style.display === "flex") closeServerMemberModView();
    else if (pruneCard && pruneCard.style.display === "flex") closeMemberPrune();
  });
  paintServerMembersPruneButton();
})();
