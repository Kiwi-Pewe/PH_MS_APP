// ==================================================================
// members.js - Right-rail member list for servers and parties.
// Server hoist: a role with Display Separately on gets its own online
// group, named and colored like the role, above Online. Offline stays
// one list. Parties have no roles. Owner is not a group; they get a
// crown next to their name in whichever group they sit.
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
        appendMemberGroup(body, group.role.name || "Role", group.members, group.role.color);
      });
    appendMemberGroup(body, "Online", leftover);
  } else {
    appendMemberGroup(body, "Online", online);
  }
  appendMemberGroup(body, "Offline", offline);
}

function appendMemberGroup(body, label, members, color) {
  if (members.length === 0) return;
  const header = document.createElement("div");
  header.className = "member-group-header";
  header.textContent = `${label} — ${members.length}`;
  if (color) header.style.color = color;
  body.appendChild(header);
  members.forEach((member) => {
    const row = buildMemberRow(member);
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

function applyMemberRolesUpdated(serverId, userId, hoistRole, nameRole) {
  if (memberListScope !== "server" || String(memberListScopeId) !== String(serverId)) return;
  const member = memberList.find((row) => row.id === userId);
  if (!member) return;
  if (hoistRole) member.hoist_role = hoistRole;
  else delete member.hoist_role;
  if (nameRole) member.name_role = nameRole;
  else delete member.name_role;
  renderMemberList();
  if (typeof refreshServerNameColors === "function") refreshServerNameColors();
  if (typeof miniProfileOpen !== "undefined" && miniProfileOpen && miniProfileUserId === userId) {
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

function refreshServerNameColors() {
  document.querySelectorAll("[data-name-user]").forEach((el) => {
    applyServerNameColor(el, el.dataset.nameUser);
  });
}

function applyPresence(userId, status) {
  const member = memberList.find(m => m.id === userId);
  if (member) {
    member.status = status;
    renderMemberList();
  }
  if (typeof miniProfileOpen !== "undefined" && miniProfileOpen && miniProfileData && miniProfileUserId === userId) {
    miniProfileData.presence = status;
    paintMiniProfile(miniProfileData);
    positionMiniProfile(miniProfileAnchor);
  }
}

function applyMemberJoined(scope, scopeId, member) {
  if (memberListScope !== scope || String(memberListScopeId) !== String(scopeId)) return;
  if (!member || memberList.some(m => m.id === member.id)) return;
  memberList.push(member);
  renderMemberList();
}

function applyMemberLeft(scope, scopeId, userId) {
  if (memberListScope !== scope || String(memberListScopeId) !== String(scopeId)) return;
  memberList = memberList.filter(m => m.id !== userId);
  renderMemberList();
}
