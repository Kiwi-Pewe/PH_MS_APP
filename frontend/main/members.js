// ==================================================================
// members.js - Right-rail member list for servers and parties.
// Roles do not exist yet. Online users share one "Online" group;
// everyone who appears offline shares one "Offline" group. When role
// settings ship, the owner picks which roles hoist here — only the
// online half splits. Offline stays one list. Owner is not a group;
// they get a crown next to their name in whichever group they sit.
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
    showMemberListPanel();
    renderMemberList();
    if (typeof refreshComposerMentions === "function") {
      const input = typeof activeMentionComposer === "function" ? activeMentionComposer() : null;
      if (input) refreshComposerMentions(input);
    }
  } catch (e) {
    hideMemberList();
  }
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

  appendMemberGroup(body, "Online", online);
  appendMemberGroup(body, "Offline", offline);
}

function appendMemberGroup(body, label, members) {
  if (members.length === 0) return;
  const header = document.createElement("div");
  header.className = "member-group-header";
  header.textContent = `${label} — ${members.length}`;
  body.appendChild(header);
  members.forEach(member => body.appendChild(buildMemberRow(member)));
}

function buildMemberRow(member) {
  const row = document.createElement("div");
  const status = memberAppearsOnline(member.status) ? member.status : "offline";
  row.className = "member-row" + (status === "offline" ? " offline" : "");

  const avatar = document.createElement("div");
  avatar.className = "avatar-dot";
  avatar.textContent = avatarLetter(member.username);
  const pip = document.createElement("div");
  pip.className = "status-dot status-" + status;
  avatar.appendChild(pip);
  row.appendChild(avatar);

  const name = document.createElement("span");
  name.className = "member-name";
  name.textContent = member.username;
  row.appendChild(name);

  if (member.is_owner) {
    const crown = document.createElement("span");
    crown.className = "member-crown";
    crown.title = "Owner";
    crown.textContent = "\u{1F451}";
    row.appendChild(crown);
  }
  row.addEventListener("contextmenu", (e) => showMemberContextMenu(e, member));
  return row;
}

function applyPresence(userId, status) {
  const member = memberList.find(m => m.id === userId);
  if (!member) return;
  member.status = status;
  renderMemberList();
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
