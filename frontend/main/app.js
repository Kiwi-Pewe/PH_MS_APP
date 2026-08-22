let serverAddress = null;
let ws = null;
let myUsername = null;
let openConversationWith = null;
let conversationList = [];

window.addEventListener("load", () => {
  serverAddress = API_HOST;
  const params = new URLSearchParams(window.location.search);
  myUsername = params.get("user");
  connectSocket();
});

function connectSocket() {
  ws = new WebSocket(`wss://${serverAddress}/ws`);

  ws.onopen = () => enterApp();

  ws.onclose = () => {
    ws = null;
    window.location.href = "../login.html";
  };

  ws.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch (e) { return; }
    if (data.type === "friend_request") refreshFriendsView();
    if (data.type === "message") {
      bumpConversation(data.sender_id, data.username, data.sender_id !== openConversationWith);
      if (data.sender_id === openConversationWith) {
        appendChatMessage(data.username, data.content, false);
      }
    }
  };
}

function enterApp() {
  document.getElementById("topbar-username").textContent = myUsername || "(existing session)";
  document.getElementById("footer-username").textContent = myUsername || "(existing session)";
  document.getElementById("footer-avatar-letter").textContent = avatarLetter(myUsername);
  refreshFriendsView();
  loadConversations();
}

function avatarLetter(username) {
  return (username || "?").charAt(0).toUpperCase();
}

async function logout() {
  try {
    await fetch(`https://${serverAddress}/logout`, { method: "POST", credentials: "include" });
  } catch (e) { /* tear down locally regardless */ }
  if (ws) { ws.close(); ws = null; }
  window.location.href = "../login.html";
}

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

async function refreshFriendsView() {
  try {
    const response = await fetch(`https://${serverAddress}/get_friends`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    renderPendingRequests(data.pending_requests || []);
    renderFriendList("online", data.online_friends || []);
    renderFriendList("offline", data.offline_friends || []);
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
    row.innerHTML = `<div class="avatar-dot"></div><div class="who"></div>`;
    row.querySelector(".avatar-dot").textContent = avatarLetter(friend.username);
    row.querySelector(".who").textContent = friend.username;
    row.addEventListener("click", () => openDirectMessage(friend.id, friend.username));
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
  row.querySelector(".avatar-dot").textContent = avatarLetter(req.username);
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

function switchMainView(viewName) {
  document.querySelectorAll(".main-view").forEach(v => v.classList.remove("active"));
  document.getElementById(`view-${viewName}`).classList.add("active");
  updateHomeBadge();
}

document.querySelectorAll("#secondary-nav .nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#secondary-nav .nav-item").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".dm-item").forEach(d => d.classList.remove("active"));
    btn.classList.add("active");
    switchMainView(btn.dataset.view);
    if (btn.dataset.view === "friends") refreshFriendsView();
  });
});

function loadConversations() {
  fetch(`https://${serverAddress}/conversation_history`, { credentials: "include" })
    .then(response => response.ok ? response.json() : { conversations: [] })
    .then(data => {
      // Seed unread counts from the DB on load, so messages that arrived
      // while offline (or before this page loaded) still show correctly —
      // bumpConversation only handles counts that arrive while connected.
      conversationList = (data.conversations || []).map(c => ({
        id: c.id,
        username: c.username,
        unread: c.unread_count || 0
      }));
      renderConversationList();
    })
    .catch(() => { /* leave sidebar empty on failure */ });
}

function renderConversationList() {
  document.getElementById("dm-empty-note").style.display = conversationList.length === 0 ? "block" : "none";

  const rows = document.getElementById("dm-rows");
  rows.innerHTML = "";
  conversationList.forEach(convo => {
    const row = document.createElement("div");
    row.className = "dm-item" + (convo.id === openConversationWith ? " active" : "");
    row.innerHTML = `<div class="avatar-dot"></div><div class="who"></div><span class="dm-unread-badge"></span><button class="dm-close" title="Close">&times;</button>`;
    row.querySelector(".avatar-dot").textContent = avatarLetter(convo.username);
    row.querySelector(".who").textContent = convo.username;
    if (convo.unread > 0) {
      const badge = row.querySelector(".dm-unread-badge");
      badge.textContent = convo.unread;
      badge.style.display = "flex";
    }
    row.addEventListener("click", () => openDirectMessage(convo.id, convo.username));
    row.querySelector(".dm-close").addEventListener("click", (e) => {
      e.stopPropagation();
      closeConversation(convo.id);
    });
    rows.appendChild(row);
  });

  updateHomeBadge();
}

// Sending or receiving a message bumps a conversation to the top — the
// only two things that count as "interacting with" it per the design call.
function bumpConversation(id, username, incrementUnread) {
  let entry = conversationList.find(c => c.id === id);
  conversationList = conversationList.filter(c => c.id !== id);
  if (!entry) entry = { id, username, unread: 0 };
  if (incrementUnread) entry.unread = (entry.unread || 0) + 1;
  conversationList.unshift(entry);
  renderConversationList();
}

// Opening a conversation (click, or a freshly accepted friend) must NOT
// reorder the sidebar — only actual message activity does that.
function ensureConversationPresent(id, username) {
  if (!conversationList.some(c => c.id === id)) {
    conversationList.unshift({ id, username, unread: 0 });
  }
  renderConversationList();
}

function clearUnread(id) {
  const entry = conversationList.find(c => c.id === id);
  if (entry) entry.unread = 0;
  renderConversationList();
}

function updateHomeBadge() {
  const badge = document.getElementById("home-unread-badge");
  const total = conversationList.reduce((sum, c) => sum + (c.unread || 0), 0);
  const dmFocused = document.getElementById("view-chat").classList.contains("active") && openConversationWith !== null;
  if (total > 0 && !dmFocused) {
    badge.textContent = total;
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

function closeConversation(id) {
  conversationList = conversationList.filter(c => c.id !== id);
  if (openConversationWith === id) resetChatView();
  renderConversationList();
}

function resetChatView() {
  openConversationWith = null;
  document.querySelectorAll("#secondary-nav .nav-item").forEach(b => b.classList.remove("active"));
  switchMainView("chat");
  document.getElementById("chat-header-title").textContent = "No conversation selected";
  document.getElementById("chat-messages").style.display = "none";
  document.getElementById("chat-empty").style.display = "flex";
}

async function openDirectMessage(id, username) {
  openConversationWith = id;
  document.querySelectorAll("#secondary-nav .nav-item").forEach(b => b.classList.remove("active"));
  switchMainView("chat");
  document.getElementById("chat-header-title").textContent = username;
  ensureConversationPresent(id, username);
  clearUnread(id);

  const chatEmpty = document.getElementById("chat-empty");
  const chatMessages = document.getElementById("chat-messages");
  chatEmpty.style.display = "none";
  chatMessages.style.display = "block";
  chatMessages.innerHTML = "";

  try {
    const response = await fetch(`https://${serverAddress}/messages/${id}`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    data.messages.forEach(msg => {
      const isMine = msg.sender_id !== id;
      appendChatMessage(isMine ? myUsername : username, msg.content, isMine);
    });
  } catch (e) { /* leave empty on failure */ }
}

function appendChatMessage(who, content, isMine) {
  const wrap = document.getElementById("chat-messages");
  const line = document.createElement("div");
  line.className = "chat-message" + (isMine ? " outgoing" : "");
  line.innerHTML = `<span class="who"></span><span class="content"></span>`;
  line.querySelector(".who").textContent = `${who}:`;
  line.querySelector(".content").textContent = content;
  wrap.appendChild(line);
  wrap.scrollTop = wrap.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById("composer-input");
  const content = input.value.trim();
  if (!content || openConversationWith === null || !ws) return;
  ws.send(JSON.stringify({ type: "message", receiver_id: openConversationWith, content }));
  appendChatMessage(myUsername || "You", content, true);
  bumpConversation(openConversationWith, document.getElementById("chat-header-title").textContent, false);
  input.value = "";
}

document.getElementById("composer-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChatMessage();
});

document.querySelectorAll(".settings-nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".settings-nav-item").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".settings-section").forEach(s => s.style.display = "none");
    btn.classList.add("active");
    document.getElementById(`settings-${btn.dataset.section}`).style.display = "block";
  });
});

document.querySelectorAll("#topbar .tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#topbar .tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

document.getElementById("home-icon").addEventListener("click", () => {
  document.querySelectorAll(".rail-icon").forEach(i => i.classList.remove("active"));
  document.getElementById("home-icon").classList.add("active");
  resetChatView();
});
