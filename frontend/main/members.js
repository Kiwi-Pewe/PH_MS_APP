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
  if (typeof searchResultsOpen !== "undefined" && searchResultsOpen) {
    searchResultsOpen = false;
    searchRailForced = false;
    const panel = document.getElementById("search-results-panel");
    const body = document.getElementById("search-results-body");
    const footer = document.getElementById("search-results-footer");
    if (panel) panel.hidden = true;
    if (body) body.replaceChildren();
    if (footer) {
      footer.hidden = true;
      footer.replaceChildren();
    }
  }
  const grid = document.getElementById("main-grid");
  if (grid) grid.classList.remove("has-search-results");
  memberListScope = null;
  memberListScopeId = null;
  memberList = [];
  memberRailQuery = "";
  memberRailUserId = null;
  document.getElementById("main-grid").classList.remove("has-member-list");
  document.getElementById("user-list").style.display = "none";
  const memberBody = document.getElementById("member-list-body");
  if (memberBody) {
    memberBody.hidden = false;
    memberBody.innerHTML = "";
  }
  if (typeof syncChatSearchPlacement === "function") syncChatSearchPlacement();
}

function showMemberListPanel() {
  document.getElementById("main-grid").classList.add("has-member-list");
  document.getElementById("user-list").style.display = "flex";
  if (typeof syncChatSearchPlacement === "function") syncChatSearchPlacement();
}

function applyPartyMembers(partyId, members) {
  memberListScope = "party";
  memberListScopeId = partyId;
  memberList = Array.isArray(members) ? members : [];
  memberList.forEach((member) => {
    if (typeof rememberIdentityFace === "function") rememberIdentityFace(member.id, member && member.avatar);
    if (typeof rememberUserStatus === "function") rememberUserStatus(member.id, member && member.status_line);
  });
  showMemberListPanel();
  renderMemberList();
  if (typeof refreshComposerMentions === "function") {
    const input = typeof activeMentionComposer === "function" ? activeMentionComposer() : null;
    if (input) refreshComposerMentions(input);
  }
}

function applyServerMembers(serverId, members, opts) {
  opts = opts || {};
  memberListScope = "server";
  memberListScopeId = serverId;
  memberList = Array.isArray(members) ? members : [];
  memberList.forEach((member) => {
    if (typeof rememberIdentityFace === "function") rememberIdentityFace(member.id, member && member.avatar);
    if (typeof rememberUserStatus === "function") rememberUserStatus(member.id, member && member.status_line);
  });
  showMemberListPanel();
  if (!opts.keepRows) renderMemberList();
  if (typeof refreshServerNameColors === "function") refreshServerNameColors();
  if (typeof refreshComposerMentions === "function") {
    const input = typeof activeMentionComposer === "function" ? activeMentionComposer() : null;
    if (input) refreshComposerMentions(input);
  }
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
    if (scope === "server") applyServerMembers(scopeId, data.members || []);
    else applyPartyMembers(scopeId, data.members || []);
  } catch (e) {
    hideMemberList();
  }
}

function refreshServerMemberList(serverId) {
  if (memberListScope !== "server") return;
  if (String(memberListScopeId) !== String(serverId)) return;
  loadMemberList("server", serverId);
}

let memberRailQuery = "";
let memberRailUserId = null;

function memberSearchQuery() {
  let query = memberRailQuery.trim().toLowerCase();
  if (query.charAt(0) === "@") query = query.slice(1).trim();
  return query;
}

function memberMatchesRailSearch(member) {
  const query = memberSearchQuery();
  if (!query) return true;
  return [member.nickname, member.display_name, member.username].some((value) => {
    return String(value || "").trim().toLowerCase().indexOf(query) === 0;
  });
}

function memberCanSeeCurrentChannel(member) {
  if (memberListScope !== "server" || !member) return true;
  const channel = typeof findCurrentServerChannel === "function" ? findCurrentServerChannel() : null;
  if (!channel) return true;
  if (channel.is_private) return !!(member.is_owner || String(member.id) === String(currentServerOwnerId));
  if (member.is_owner || String(member.id) === String(currentServerOwnerId)) return true;
  const visible = channel.role_visible;
  if (!visible || typeof visible !== "object") return true;
  const ids = member.role_ids;
  if (!Array.isArray(ids)) return true;
  return ids.some((id) => !!visible[String(id)]);
}

function visibleMemberList() {
  return memberList.filter((member) => {
    if (!memberCanSeeCurrentChannel(member)) return false;
    if (memberRailUserId != null) return String(member.id) === String(memberRailUserId);
    return memberMatchesRailSearch(member);
  });
}

function setMemberRailQuery(value) {
  memberRailUserId = null;
  memberRailQuery = value || "";
  if (memberSearchQuery()) {
    const hits = memberList.filter((member) => memberCanSeeCurrentChannel(member) && memberMatchesRailSearch(member));
    if (!hits.length) memberRailQuery = "";
  }
  if (memberListScope) renderMemberList();
}

function setMemberRailUser(userId) {
  memberRailUserId = userId;
  memberRailQuery = "";
  if (memberListScope) renderMemberList();
}

function clearMemberRailQuery() {
  memberRailUserId = null;
  memberRailQuery = "";
  if (memberListScope) renderMemberList();
}

function renderMemberList() {
  const body = document.getElementById("member-list-body");
  body.innerHTML = "";
  const shown = visibleMemberList();
  if (!shown.length && memberSearchQuery()) {
    const empty = document.createElement("div");
    empty.className = "member-rail-empty";
    empty.textContent = "No members found";
    body.appendChild(empty);
    return;
  }

  if (memberSearchQuery()) {
    shown.sort((a, b) => memberVisibleName(a).localeCompare(memberVisibleName(b), undefined, { sensitivity: "base" }));
    shown.forEach((member) => {
      const row = buildMemberRow(member);
      row.dataset.memberGroup = "search";
      body.appendChild(row);
      const face = row.querySelector(".avatar-dot");
      if (face && typeof paintUserFace === "function") {
        paintUserFace(face, member, { name: member.username, userId: member.id });
      }
    });
    return;
  }

  const online = [];
  const offline = [];
  shown.forEach(member => {
    if (memberAppearsOnline(member.status)) online.push(member);
    else offline.push(member);
  });

  const byName = (a, b) => memberVisibleName(a).localeCompare(memberVisibleName(b), undefined, { sensitivity: "base" });
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
      if (other && memberVisibleName(member).localeCompare(memberVisibleName(other), undefined, { sensitivity: "base" }) < 0) break;
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
  paintMemberStatusLine(row, member);
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

function paintMemberStatusLine(row, member) {
  const text = row.querySelector(".member-text");
  if (!text) return;
  let sub = text.querySelector(".member-status-line");
  const query = memberSearchQuery();
  const username = String((member && member.username) || "");
  const visible = typeof memberVisibleName === "function" ? memberVisibleName(member) : username;
  const line = query && username && username.toLowerCase() !== String(visible).toLowerCase()
    ? username
    : String((member && member.status_line) || "").trim();
  if (!line) {
    if (sub) sub.remove();
    return;
  }
  if (!sub) {
    sub = document.createElement("div");
    sub.className = "member-status-line";
    text.appendChild(sub);
  }
  sub.textContent = line;
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
  name.textContent = memberVisibleName(member);
  if (memberListScope === "server" && typeof applyServerNameColor === "function") {
    applyServerNameColor(name, member.id, member.name_role);
  }
  const text = document.createElement("div");
  text.className = "member-text";
  text.appendChild(name);
  row.appendChild(text);
  paintMemberStatusLine(row, member);

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
  el.style.backgroundImage = "";
  el.style.webkitBackgroundClip = "";
  el.style.backgroundClip = "";
  el.style.webkitTextFillColor = "";
  el.classList.remove("has-text-gradient");
  const pref = nameColorPref();
  if (pref === "off") return;
  const role = nameRoleForUser(userId, fallbackRole);
  const colorRaw = role && role.color;
  if (!colorRaw) return;
  let color = colorRaw;
  let color2 = role.color_2 || "";
  if (
    typeof accessibilityPrefs !== "undefined"
    && accessibilityPrefs
    && accessibilityPrefs.saturation_custom
    && typeof desaturateHex === "function"
    && typeof themeSaturationAmount === "function"
  ) {
    color = desaturateHex(colorRaw, themeSaturationAmount());
    if (color2) color2 = desaturateHex(color2, themeSaturationAmount());
  }
  if (pref === "next") {
    const dot = document.createElement("span");
    dot.className = "name-color-dot";
    dot.style.background = color2 ? (typeof roleGradientCss === "function" ? roleGradientCss(color, color2, role.gradient_angle) : "linear-gradient(90deg, " + color + ", " + color2 + ")") : color;
    el.insertBefore(dot, el.firstChild);
    el.classList.add("has-name-color-dot");
    return;
  }
  if (color2) {
    el.classList.add("has-text-gradient");
    el.style.backgroundImage = typeof roleGradientCss === "function"
      ? roleGradientCss(color, color2, role.gradient_angle)
      : "linear-gradient(90deg, " + color + ", " + color2 + ")";
    el.style.webkitBackgroundClip = "text";
    el.style.backgroundClip = "text";
    el.style.color = "transparent";
    el.style.webkitTextFillColor = "transparent";
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

function memberVisibleName(member) {
  if (!member) return "";
  if (typeof memberListScope !== "undefined" && memberListScope === "server" && member.nickname) return member.nickname;
  return member.username || "";
}

function myServerNickname() {
  if (typeof memberList === "undefined" || memberListScope !== "server") return "";
  const me = memberList.find((row) => row.id === myUserId);
  return (me && me.nickname) || "";
}

function applyServerNickname(serverId, userId, nickname) {
  const nick = (nickname || "").trim();
  if (typeof memberList !== "undefined" && memberListScope === "server" && String(memberListScopeId) === String(serverId)) {
    const member = memberList.find((row) => row.id === userId);
    if (member) {
      if (nick) member.nickname = nick;
      else delete member.nickname;
      placeMemberRow(member);
    }
  }
  if (typeof serverRosterMembers !== "undefined" && String(serverRosterLoadedFor) === String(serverId)) {
    const row = serverRosterMembers.find((member) => member.id === userId);
    if (row) {
      if (nick) row.nickname = nick;
      else delete row.nickname;
      if (typeof paintServerMembersTable === "function") paintServerMembersTable();
    }
  }
  let touched = false;
  if (typeof currentChannelMessages !== "undefined" && String(currentServerId) === String(serverId)) {
    currentChannelMessages.forEach((msg) => {
      if (msg && msg.senderId === userId) {
        msg.nickname = nick;
        touched = true;
      }
    });
  }
  if (touched && typeof renderChannelMessages === "function") renderChannelMessages();
}

function closeNicknameSubmenu() {
  const overlay = document.getElementById("nickname-overlay");
  if (overlay) overlay.hidden = true;
  const err = document.getElementById("nickname-error");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  const confirm = document.getElementById("nickname-confirm");
  const cancel = document.getElementById("nickname-cancel");
  if (confirm) confirm.disabled = false;
  if (cancel) cancel.disabled = false;
}

function canChangeNickname(member) {
  if (!member || typeof memberListScope === "undefined" || memberListScope !== "server" || !currentServerId) return false;
  if (member.id === myUserId) return typeof canServerPerm === "function" && canServerPerm("change_nickname");
  return typeof canActOnMember === "function" && canActOnMember(member, "manage_nicknames");
}

function openNicknameSubmenu(member) {
  if (!member || !currentServerId) return;
  const overlay = document.getElementById("nickname-overlay");
  const input = document.getElementById("nickname-input");
  if (!overlay || !input) return;
  overlay.dataset.userId = String(member.id);
  input.value = member.nickname || "";
  const err = document.getElementById("nickname-error");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  overlay.hidden = false;
  input.focus();
}

async function confirmNicknameSubmenu() {
  const overlay = document.getElementById("nickname-overlay");
  const input = document.getElementById("nickname-input");
  const userId = overlay ? Number(overlay.dataset.userId) : 0;
  if (!currentServerId || !userId) return;
  const confirm = document.getElementById("nickname-confirm");
  const cancel = document.getElementById("nickname-cancel");
  if (confirm) confirm.disabled = true;
  if (cancel) cancel.disabled = true;
  const err = document.getElementById("nickname-error");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  try {
    const response = await fetch(`https://${serverAddress}/update_server_nickname`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        user_id: userId,
        nickname: input ? input.value : ""
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not change that nickname.");
    applyServerNickname(currentServerId, userId, data.nickname || "");
    closeNicknameSubmenu();
  } catch (error) {
    if (err) {
      err.hidden = false;
      err.textContent = error.message || "Could not change that nickname.";
    }
    if (confirm) confirm.disabled = false;
    if (cancel) cancel.disabled = false;
  }
}

function bindNicknameChrome() {
  const close = document.getElementById("nickname-close");
  const cancel = document.getElementById("nickname-cancel");
  const confirm = document.getElementById("nickname-confirm");
  if (close) close.addEventListener("click", closeNicknameSubmenu);
  if (cancel) cancel.addEventListener("click", closeNicknameSubmenu);
  if (confirm) confirm.addEventListener("click", confirmNicknameSubmenu);
  const overlay = document.getElementById("nickname-overlay");
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target.id === "nickname-overlay") closeNicknameSubmenu();
    });
  }
  const input = document.getElementById("nickname-input");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmNicknameSubmenu();
      }
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const card = document.getElementById("nickname-overlay");
    if (card && !card.hidden) {
      e.preventDefault();
      e.stopPropagation();
      closeNicknameSubmenu();
    }
  });
}

bindNicknameChrome();

function applyMemberLeft(scope, scopeId, userId) {
  if (scope === "server" && typeof removeServerRosterMember === "function") {
    removeServerRosterMember(scopeId, userId);
  }
  if (memberListScope !== scope || String(memberListScopeId) !== String(scopeId)) return;
  memberList = memberList.filter(m => m.id !== userId);
  removePlacedMemberRow(userId);
}
