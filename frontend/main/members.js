// ==================================================================
// members.js - Right-rail member list for servers and parties.
// Server hoist: a role with Display Separately on gets its own online
// group, named and colored like the role, above Online. Offline stays
// one list. Parties have no roles. Owner is not a group; they get a
// crown next to their name in whichever group they sit.
// Role / presence / join / leave patch that one row. Do not rebuild
// the rail unless the whole member set is loading.
// ==================================================================

function memberAppearsOnline(status) {
  return status === "online" || status === "away" || status === "dnd";
}

function hideMemberList() {
  memberListScope = null;
  memberListScopeId = null;
  memberList = [];
  document.getElementById("main-grid").classList.remove("has-member-list");
  document.getElementById("user-list").style.display = "none";
  document.getElementById("member-list-body").innerHTML = "";
}

function showMemberListPanel() {
  document.getElementById("main-grid").classList.add("has-member-list");
  document.getElementById("user-list").style.display = "flex";
}

async function loadMemberList(scope, scopeId) {
  memberListScope = scope;
  memberListScopeId = scopeId;
  const url = scope === "server"
    ? `https://${serverAddress}/get_server_members/${scopeId}`
    : `https://${serverAddress}/get_party_members/${scopeId}`;
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      hideMemberList();
      return;
    }
    const data = await response.json();
    if (memberListScope !== scope || memberListScopeId !== scopeId) return;
    memberList = data.members || [];
    memberList.forEach((member) => {
      if (typeof rememberIdentityFace === "function") rememberIdentityFace(member.id, member && member.avatar);
    });
    showMemberListPanel();
    renderMemberList();
    if (scope === "server" && typeof refreshServerNameColors === "function") refreshServerNameColors();
    if (typeof refreshComposerMentions === "function") {
      const input = typeof activeMentionComposer === "function" ? activeMentionComposer() : null;
      if (input) refreshComposerMentions(input);
    }
  } catch (e) {
    hideMemberList();
  }
}

function refreshServerMemberList(serverId) {
  if (memberListScope !== "server") return;
  if (String(memberListScopeId) !== String(serverId)) return;
  loadMemberList("server", serverId);
}

function renderMemberList() {
  const body = document.getElementById("member-list-body");
  body.innerHTML = "";

  const online = [];
  const offline = [];
  memberList.forEach(member => {
    if (memberAppearsOnline(member.status)) online.push(member);
    else offline.push(member);
  });

  const byName = (a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
  online.sort(byName);
  offline.sort(byName);

  if (memberListScope === "server") {
    const groups = new Map();
    const leftover = [];
    online.forEach((member) => {
      const hoist = member.hoist_role;
      if (hoist && hoist.id != null) {
        const key = String(hoist.id);
        if (!groups.has(key)) groups.set(key, { role: hoist, members: [] });
        groups.get(key).members.push(member);
      } else {
        leftover.push(member);
      }
    });
    Array.from(groups.values())
      .sort((a, b) => (a.role.position || 0) - (b.role.position || 0) || (a.role.id - b.role.id))
      .forEach((group) => {
        appendMemberGroup(body, group.role.name || "Role", group.members, group.role.color, "hoist-" + group.role.id, group.role);
      });
    appendMemberGroup(body, "Online", leftover, null, "online");
  } else {
    appendMemberGroup(body, "Online", online, null, "online");
  }
  appendMemberGroup(body, "Offline", offline, null, "offline");
}

function memberGroupKey(member) {
  if (!memberAppearsOnline(member.status)) return "offline";
  if (memberListScope === "server" && member.hoist_role && member.hoist_role.id != null) {
    return "hoist-" + member.hoist_role.id;
  }
  return "online";
}

function memberGroupMeta(member) {
  const key = memberGroupKey(member);
  if (key === "offline") return { key: key, label: "Offline" };
  if (key === "online") return { key: key, label: "Online" };
  const hoist = member.hoist_role || {};
  return {
    key: key,
    label: hoist.name || "Role",
    color: hoist.color,
    position: hoist.position,
    id: hoist.id
  };
}

function cssAttr(value) {
  const text = String(value);
  return (typeof CSS !== "undefined" && CSS.escape) ? CSS.escape(text) : text;
}

function findMemberRow(userId) {
  return document.querySelector("#member-list-body .member-row[data-member-id=\"" + cssAttr(userId) + "\"]");
}

function findMemberGroupHeader(key) {
  return document.querySelector("#member-list-body .member-group-header[data-member-group=\"" + cssAttr(key) + "\"]");
}

function memberGroupCount(key) {
  return document.querySelectorAll("#member-list-body .member-row[data-member-group=\"" + cssAttr(key) + "\"]").length;
}

function paintMemberGroupHeader(header, label, count, color) {
  if (!header) return;
  header.textContent = label + " — " + count;
  header.style.color = color || "";
}

function refreshMemberGroupHeader(meta) {
  const header = findMemberGroupHeader(meta.key);
  if (!header) return;
  const count = memberGroupCount(meta.key);
  if (count === 0) {
    header.remove();
    return;
  }
  paintMemberGroupHeader(header, meta.label || header.dataset.groupLabel || "Online", count, meta.color);
}

function insertMemberGroupHeader(body, header, meta) {
  header.dataset.groupPosition = String(meta.position || 0);
  header.dataset.groupRoleId = String(meta.id || "");
  if (meta.key === "offline") {
    body.appendChild(header);
    return;
  }
  if (meta.key === "online") {
    const offline = findMemberGroupHeader("offline");
    body.insertBefore(header, offline);
    return;
  }
  const pos = Number(meta.position || 0);
  const id = Number(meta.id || 0);
  const headers = body.querySelectorAll(".member-group-header");
  for (let i = 0; i < headers.length; i += 1) {
    const existing = headers[i];
    const key = existing.dataset.memberGroup;
    if (key === "online" || key === "offline") {
      body.insertBefore(header, existing);
      return;
    }
    const epos = Number(existing.dataset.groupPosition || 0);
    const eid = Number(existing.dataset.groupRoleId || 0);
    if (pos < epos || (pos === epos && id < eid)) {
      body.insertBefore(header, existing);
      return;
    }
  }
  body.appendChild(header);
}

function ensureMemberGroup(meta) {
  const body = document.getElementById("member-list-body");
  let header = findMemberGroupHeader(meta.key);
  if (header) return header;
  header = document.createElement("div");
  header.className = "member-group-header";
  header.dataset.memberGroup = meta.key;
  header.dataset.groupLabel = meta.label || "Online";
  paintMemberGroupHeader(header, meta.label || "Online", 0, meta.color);
  insertMemberGroupHeader(body, header, meta);
  return header;
}

function insertMemberRowSorted(row, member, meta) {
  const header = ensureMemberGroup(meta);
  const body = header.parentNode;
  let cursor = header.nextSibling;
  while (cursor && !cursor.classList.contains("member-group-header")) {
    if (cursor !== row) {
      const other = memberList.find((item) => String(item.id) === String(cursor.dataset.memberId));
      if (other && member.username.localeCompare(other.username, undefined, { sensitivity: "base" }) < 0) break;
    }
    cursor = cursor.nextSibling;
  }
  body.insertBefore(row, cursor);
}

function paintMemberRowState(row, member) {
  const status = memberAppearsOnline(member.status) ? member.status : "offline";
  row.className = "member-row" + (status === "offline" ? " offline" : "");
  row.dataset.memberId = String(member.id);
  row.dataset.memberGroup = memberGroupKey(member);
  const pip = row.querySelector(".status-dot");
  if (pip) pip.className = "status-dot status-" + status;
  const name = row.querySelector(".member-name");
  if (name && memberListScope === "server" && typeof applyServerNameColor === "function") {
    applyServerNameColor(name, member.id, member.name_role);
  }
}

function placeMemberRow(member) {
  const meta = memberGroupMeta(member);
  let row = findMemberRow(member.id);
  const oldKey = row ? row.dataset.memberGroup : "";
  if (!row) {
    row = buildMemberRow(member);
    const face = row.querySelector(".avatar-dot");
    if (face && typeof paintUserFace === "function") {
      paintUserFace(face, member, { name: member.username, userId: member.id });
    }
  } else {
    paintMemberRowState(row, member);
  }
  row.dataset.memberGroup = meta.key;
  insertMemberRowSorted(row, member, meta);
  refreshMemberGroupHeader(meta);
  if (oldKey && oldKey !== meta.key) refreshMemberGroupHeader({ key: oldKey });
}

function removePlacedMemberRow(userId) {
  const row = findMemberRow(userId);
  const oldKey = row ? row.dataset.memberGroup : "";
  if (row) row.remove();
  if (oldKey) refreshMemberGroupHeader({ key: oldKey });
}

function appendMemberGroup(body, label, members, color, key, role) {
  if (members.length === 0) return;
  const header = document.createElement("div");
  header.className = "member-group-header";
  header.dataset.memberGroup = key;
  header.dataset.groupLabel = label;
  if (role) {
    header.dataset.groupPosition = String(role.position || 0);
    header.dataset.groupRoleId = String(role.id || "");
  }
  header.textContent = `${label} — ${members.length}`;
  if (color) header.style.color = color;
  body.appendChild(header);
  members.forEach((member) => {
    const row = buildMemberRow(member);
    row.dataset.memberGroup = key;
    body.appendChild(row);
    const face = row.querySelector(".avatar-dot");
    if (face && typeof paintUserFace === "function") {
      paintUserFace(face, member, { name: member.username, userId: member.id });
    }
  });
}

function buildMemberRow(member) {
  const row = document.createElement("div");
  const status = memberAppearsOnline(member.status) ? member.status : "offline";
  row.dataset.memberId = String(member.id);
  row.dataset.memberGroup = memberGroupKey(member);
  row.className = "member-row" + (status === "offline" ? " offline" : "");

  const avatar = document.createElement("div");
  avatar.className = "avatar-dot";
  const pip = document.createElement("div");
  pip.className = "status-dot status-" + status;
  avatar.appendChild(pip);
  row.appendChild(avatar);

  const name = document.createElement("span");
  name.className = "member-name";
  name.textContent = member.username;
  if (memberListScope === "server" && typeof applyServerNameColor === "function") {
    applyServerNameColor(name, member.id, member.name_role);
  }
  row.appendChild(name);

  if (member.is_owner) {
    const crown = document.createElement("span");
    crown.className = "member-crown";
    crown.title = "Owner";
    crown.textContent = "\u{1F451}";
    row.appendChild(crown);
  }
  row.addEventListener("contextmenu", (e) => showMemberContextMenu(e, member));
  if (typeof bindMiniProfileTarget === "function") {
    bindMiniProfileTarget(avatar, member.id);
    bindMiniProfileTarget(name, member.id);
  }
  return row;
}

function applyMemberRolesUpdated(serverId, userId, hoistRole, nameRole, opts) {
  if (memberListScope !== "server" || String(memberListScopeId) !== String(serverId)) return;
  const member = memberList.find((row) => row.id === userId);
  if (!member) return;
  if (hoistRole) member.hoist_role = hoistRole;
  else delete member.hoist_role;
  if (nameRole) member.name_role = nameRole;
  else delete member.name_role;
  placeMemberRow(member);
  refreshServerNameColors(userId);
  if ((!opts || !opts.skipMini) && typeof miniProfileOpen !== "undefined" && miniProfileOpen && miniProfileUserId === userId) {
    if (typeof reloadOpenMiniProfile === "function") reloadOpenMiniProfile();
  }
}

function nameColorPref() {
  return (typeof accessibilityPrefs !== "undefined" && accessibilityPrefs && accessibilityPrefs.role_colors) || "names";
}

function nameRoleForUser(userId, fallback) {
  if (typeof memberList !== "undefined" && memberListScope === "server") {
    const member = memberList.find((row) => String(row.id) === String(userId));
    if (member) return member.name_role || null;
  }
  return fallback && fallback.color ? fallback : null;
}

function applyServerNameColor(el, userId, fallbackRole) {
  if (!el) return;
  if (userId != null) el.dataset.nameUser = String(userId);
  const existing = el.querySelector(":scope > .name-color-dot");
  if (existing) existing.remove();
  el.classList.remove("has-name-color-dot");
  el.style.color = "";
  const pref = nameColorPref();
  if (pref === "off") return;
  const role = nameRoleForUser(userId, fallbackRole);
  const color = role && role.color;
  if (!color) return;
  if (pref === "next") {
    const dot = document.createElement("span");
    dot.className = "name-color-dot";
    dot.style.background = color;
    el.insertBefore(dot, el.firstChild);
    el.classList.add("has-name-color-dot");
    return;
  }
  el.style.color = color;
}

function refreshServerNameColors(userId) {
  const sel = userId != null
    ? "[data-name-user=\"" + cssAttr(userId) + "\"]"
    : "[data-name-user]";
  document.querySelectorAll(sel).forEach((el) => {
    applyServerNameColor(el, el.dataset.nameUser);
  });
}

function paintMiniProfilePresence(status) {
  const pip = document.querySelector("#mini-profile .mini-profile-avatar .status-dot");
  if (!pip) return;
  pip.className = "status-dot status-" + (memberAppearsOnline(status) ? status : "offline");
}

function applyPresence(userId, status) {
  const member = memberList.find(m => m.id === userId);
  if (member) {
    member.status = status;
    placeMemberRow(member);
  }
  if (typeof miniProfileOpen !== "undefined" && miniProfileOpen && miniProfileData && miniProfileUserId === userId) {
    miniProfileData.presence = status;
    paintMiniProfilePresence(status);
  }
}

function applyMemberJoined(scope, scopeId, member) {
  if (memberListScope !== scope || String(memberListScopeId) !== String(scopeId)) return;
  if (!member || memberList.some(m => m.id === member.id)) return;
  memberList.push(member);
  placeMemberRow(member);
}

function applyMemberLeft(scope, scopeId, userId) {
  if (scope === "server" && typeof removeServerRosterMember === "function") {
    removeServerRosterMember(scopeId, userId);
  }
  if (memberListScope !== scope || String(memberListScopeId) !== String(scopeId)) return;
  memberList = memberList.filter(m => m.id !== userId);
  removePlacedMemberRow(userId);
}
