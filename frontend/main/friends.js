// ==================================================================
// friends.js - Friends view, friend requests, and start-card remove/block.
// ==================================================================

document.getElementById("add-friend-toggle").addEventListener("click", () => {
  const bar = document.getElementById("add-friend-bar");
  bar.style.display = bar.style.display === "flex" ? "none" : "flex";
});

async function sendFriendRequestFromMain() {
  const input = document.getElementById("add-friend-input");
  const status = document.getElementById("add-friend-status");
  const username = input.value.trim();
  if (!username) { status.textContent = "Enter a username first."; return; }
  status.textContent = "Sending...";
  try {
    const response = await fetch(`https://${serverAddress}/friend_user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      status.textContent = err.detail || `Failed (${response.status}).`;
      return;
    }
    status.textContent = `Friend request sent to ${username}.`;
    input.value = "";
  } catch (e) {
    status.textContent = "Could not reach server.";
  }
}

function applyFriendsView(data) {
  const pending = (data && data.pending_requests) || [];
  const online = (data && data.online_friends) || [];
  const offline = (data && data.offline_friends) || [];
  renderPendingRequests(pending);
  renderFriendList("online", online);
  renderFriendList("offline", offline);
  if (typeof rememberFriendsForOnlineToasts === "function") {
    rememberFriendsForOnlineToasts(online, offline);
  }
}

async function refreshFriendsView() {
  try {
    const response = await fetch(`https://${serverAddress}/get_friends`, { credentials: "include" });
    if (!response.ok) return;
    applyFriendsView(await response.json());
  } catch (e) { /* leave last render in place */ }
}

function renderFriendList(kind, list) {
  document.getElementById(`${kind}-heading`).textContent = `${kind === "online" ? "Online" : "Offline"} — ${list.length}`;
  document.getElementById(`${kind}-empty-note`).style.display = list.length === 0 ? "block" : "none";

  const rows = document.getElementById(`${kind}-rows`);
  rows.innerHTML = "";
  list.forEach(friend => {
    const row = document.createElement("div");
    row.className = "friend-row";
    row.style.cursor = "pointer";
    row.innerHTML = `<div class="avatar-dot"></div><div class="friend-text"><div class="who"></div></div>`;
    if (typeof paintUserFace === "function") paintUserFace(row.querySelector(".avatar-dot"), friend, { name: friend.username, userId: friend.id });
    else row.querySelector(".avatar-dot").textContent = avatarLetter(friend.username);
    row.querySelector(".who").textContent = friend.username;
    row.dataset.userId = String(friend.id);
    if (typeof rememberUserStatus === "function") rememberUserStatus(friend.id, friend.status);
    const line = String(friend.status || "").trim();
    if (line) {
      const sub = document.createElement("div");
      sub.className = "friend-status";
      sub.textContent = line;
      row.querySelector(".friend-text").appendChild(sub);
    }
    row.addEventListener("click", () => openDirectMessage(friend.id, friend.username));
    row.addEventListener("contextmenu", (e) => showProfileContextMenu(e, friend.id, friend.username, false));
    rows.appendChild(row);
  });
}

function renderPendingRequests(list) {
  document.getElementById("pending-heading").textContent = `Pending — ${list.length}`;
  document.getElementById("pending-empty-note").style.display = list.length === 0 ? "block" : "none";

  const rows = document.getElementById("pending-rows");
  rows.innerHTML = "";
  list.forEach(req => rows.appendChild(buildPendingRow(req)));

  const badge = document.getElementById("pending-badge");
  if (list.length > 0) {
    badge.textContent = list.length;
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

function buildPendingRow(req) {
  const row = document.createElement("div");
  row.className = "friend-row";
  row.innerHTML = `
    <div class="avatar-dot"></div>
    <div class="who"></div>
    <div class="row-actions">
      <button class="accept-btn">Accept</button>
      <button class="deny-btn">Deny</button>
    </div>
  `;
  if (typeof paintUserFace === "function") paintUserFace(row.querySelector(".avatar-dot"), req, { name: req.username, userId: req.id });
  else row.querySelector(".avatar-dot").textContent = avatarLetter(req.username);
  row.querySelector(".who").textContent = req.username;
  row.querySelector(".accept-btn").addEventListener("click", () => respondToRequest(req, true));
  row.querySelector(".deny-btn").addEventListener("click", () => respondToRequest(req, false));
  return row;
}

async function respondToRequest(req, accept) {
  const path = accept ? "/friend_user" : "/unfriend_user";
  const body = accept ? { username: req.username } : { user_id_2: req.id };
  try {
    await fetch(`https://${serverAddress}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    });
    if (accept) ensureConversationPresent(req.id, req.username);
  } catch (e) { /* fall through to refresh regardless */ }
  refreshFriendsView();
}

function paintConversationStartActions(actionsEl, id, username, relation) {
  if (!actionsEl) return;
  actionsEl.innerHTML = "";
  const rel = relation || {};
  if (rel.self) return;
  if (!rel.blocked) {
    const friendBtn = document.createElement("button");
    friendBtn.type = "button";
    friendBtn.className = "icon-btn";
    if (rel.friend) {
      friendBtn.textContent = "Remove Friend";
      friendBtn.addEventListener("click", () => handleRemoveFriend(id, username, actionsEl));
    } else {
      friendBtn.textContent = "Add Friend";
      if (rel.pending_out) friendBtn.disabled = true;
      else friendBtn.addEventListener("click", () => handleAddFriend(id, username, actionsEl));
    }
    actionsEl.appendChild(friendBtn);
  }
  const blockBtn = document.createElement("button");
  blockBtn.type = "button";
  if (rel.blocked) {
    blockBtn.className = "icon-btn";
    blockBtn.textContent = "Unblock";
    blockBtn.addEventListener("click", () => handleUnblockUser(id, username, actionsEl));
  } else {
    blockBtn.className = "danger-btn";
    blockBtn.textContent = "Block";
    blockBtn.addEventListener("click", () => handleBlockUser(id, username, actionsEl));
  }
  actionsEl.appendChild(blockBtn);
}

async function refreshConversationStartActions(actionsEl, id, username) {
  const relation = typeof fetchRelationship === "function"
    ? await fetchRelationship(id)
    : { friend: false, pending_out: false, blocked: false };
  if (!actionsEl || !actionsEl.isConnected) return;
  paintConversationStartActions(actionsEl, id, username, relation);
  if (typeof openChatType === "undefined" || openChatType !== "dm" || Number(openChatId) !== Number(id)) return;
  if (relation.blocked) {
    if (typeof disableComposer === "function") disableComposer("You can't message " + username + " \u2014 blocked.");
  } else if (typeof enableComposer === "function") {
    enableComposer();
  }
}

async function handleAddFriend(id, username, actionsEl) {
  try {
    const response = await fetch(`https://${serverAddress}/friend_user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username })
    });
    if (!response.ok) return;
    await refreshConversationStartActions(actionsEl, id, username);
    refreshFriendsView();
  } catch (e) {}
}

async function handleRemoveFriend(id, username, actionsEl) {
  try {
    const response = await fetch(`https://${serverAddress}/unfriend_user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id_2: id })
    });
    if (!response.ok) return;
    await refreshConversationStartActions(actionsEl, id, username);
    refreshFriendsView();
  } catch (e) {}
}

async function handleBlockUser(id, username, actionsEl) {
  try {
    const response = await fetch(`https://${serverAddress}/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ blocked_user: id })
    });
    if (!response.ok) return;
    if (typeof rememberBlockedUser === "function") rememberBlockedUser(id);
    if (typeof purgeBlockedMessagesFromOpenViews === "function") purgeBlockedMessagesFromOpenViews(id);
    await refreshConversationStartActions(actionsEl, id, username);
    refreshFriendsView();
    if (typeof loadConversations === "function") loadConversations();
  } catch (e) {}
}

async function handleUnblockUser(id, username, actionsEl) {
  try {
    const response = await fetch(`https://${serverAddress}/unblock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ blocked_user: id })
    });
    if (!response.ok) return;
    if (typeof forgetBlockedUser === "function") forgetBlockedUser(id);
    await refreshConversationStartActions(actionsEl, id, username);
    refreshFriendsView();
    if (typeof loadConversations === "function") loadConversations();
  } catch (e) {}
}
