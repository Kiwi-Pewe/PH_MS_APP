let serverAddress = null;
let ws = null;
let myUsername = null;
let openConversationWith = null;
let openConversationUsername = null;
let conversationList = [];

// Messages currently shown in the open conversation, in send order.
// Kept in memory and fully re-rendered into clusters on every change
// (small lists, ~25 messages) rather than patched in place — this is
// deliberate: a future edit/delete needs to be able to reflow cluster
// boundaries (e.g. deleting the first message in a cluster hands the
// header to the next one), which only works cleanly if render always
// recomputes clusters from the live list rather than trusting old DOM.
let currentMessages = [];

// Per-conversation pagination state — reset whenever openDirectMessage
// switches to a different conversation.
let hasMoreHistory = true;
let isLoadingMore = false;

// A same-sender gap this long or longer forces a new cluster/bubble,
// even without a sender change in between.
const CLUSTER_GAP_MINUTES = 5;

window.addEventListener("load", () => {
  serverAddress = API_HOST;

  // Identity now comes from the verified session (via /whoami), not the
  // ?user= URL param — that param was just trusted client-side text and
  // could be wrong, stale, or edited by hand. /whoami asks the server,
  // which checks the real session cookie, so this is the actual source
  // of truth for "who am I." credentials: "include" is required here
  // since api.oneira.cc is a different origin from oneira.cc, so the
  // session cookie won't be sent unless we explicitly ask for it.
  fetch(`https://${serverAddress}/whoami`, { credentials: "include" })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Not logged in");
      }
      return response.json();
    })
    .then((data) => {
      myUsername = data.username;
      connectSocket();
    })
    .catch(() => {
      window.location.href = "../login.html";
    });
});

function connectSocket() {
  ws = new WebSocket(`wss://${serverAddress}/ws`);

  // True only once this socket has successfully opened. A page-unload
  // (refresh, tab close, navigating away) tears down the socket and fires
  // onclose too, but that's not a rejected session — it's just this page
  // dying. If we already opened once, the incoming page load will run its
  // own connectSocket() and settle the question for itself, so there's
  // nothing to redirect for here. Only a close that happens BEFORE we
  // ever opened means the server actually refused the connection (e.g.
  // an expired/invalid session cookie) — that's the real "go to login" case.
  let hasOpened = false;

  ws.onopen = () => {
    hasOpened = true;
    enterApp();
  };

  ws.onclose = () => {
    ws = null;
    if (!hasOpened) {
      window.location.href = "../login.html";
    }
  };

  ws.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch (e) { return; }
    if (data.type === "friend_request") refreshFriendsView();
    if (data.type === "message") {
      bumpConversation(data.sender_id, data.username, data.sender_id !== openConversationWith);
      if (data.sender_id === openConversationWith) {
        // Backend doesn't send a timestamp on the live push yet (only on
        // the history fetch) — fall back to "now" so clustering still
        // works; recommend adding a real one server-side for accuracy
        // across devices with clock drift.
        currentMessages.push({
          isMine: false,
          username: data.username,
          content: data.content,
          time: data.timestamp ? new Date(data.timestamp) : new Date()
        });
        renderMessages();
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
  document.getElementById("chat-header-actions").style.display = "none";
  document.getElementById("chat-messages").style.display = "none";
  document.getElementById("chat-empty").style.display = "flex";
}

async function openDirectMessage(id, username) {
  openConversationWith = id;
  document.querySelectorAll("#secondary-nav .nav-item").forEach(b => b.classList.remove("active"));
  switchMainView("chat");
  document.getElementById("chat-header-title").textContent = username;
  document.getElementById("chat-header-actions").style.display = "flex";
  openConversationUsername = username;
  enableComposer();
  ensureConversationPresent(id, username);
  clearUnread(id);

  const chatEmpty = document.getElementById("chat-empty");
  const chatMessages = document.getElementById("chat-messages");
  chatEmpty.style.display = "none";
  chatMessages.style.display = "block";
  currentMessages = [];
  hasMoreHistory = true;
  isLoadingMore = false;

  try {
    const response = await fetch(`https://${serverAddress}/messages/${id}`, { credentials: "include" });
    if (!response.ok) { renderMessages(); return; }
    const data = await response.json();
    currentMessages = data.messages.map(msg => {
      const isMine = msg.sender_id !== id;
      return {
        id: msg.id,
        isMine,
        username: isMine ? myUsername : username,
        content: msg.content,
        // History rows always have a real server timestamp.
        time: new Date(msg.timestamp)
      };
    });
    if (currentMessages.length < 25) hasMoreHistory = false;
    renderMessages();
  } catch (e) { renderMessages(); /* leave empty on failure */ }
}

// Triggered when the user scrolls to the top of currently-loaded history.
// Uses the oldest loaded message's real database id as a cursor — see
// the backend route's before_id parameter. Scroll position is preserved
// afterward so prepending older messages doesn't visually jump the view.
async function loadOlderMessages() {
  if (isLoadingMore || !hasMoreHistory || currentMessages.length === 0) return;
  const oldest = currentMessages[0];
  if (!oldest.id) return; // no real cursor to anchor on (shouldn't normally happen)
  isLoadingMore = true;

  const chatBody = document.getElementById("chat-body");
  const prevScrollHeight = chatBody.scrollHeight;
  const prevScrollTop = chatBody.scrollTop;

  try {
    const response = await fetch(
      `https://${serverAddress}/messages/${openConversationWith}?before_id=${oldest.id}`,
      { credentials: "include" }
    );
    if (!response.ok) return;
    const data = await response.json();
    const older = data.messages.map(msg => {
      const isMine = msg.sender_id !== openConversationWith;
      return {
        id: msg.id,
        isMine,
        username: isMine ? myUsername : openConversationUsername,
        content: msg.content,
        time: new Date(msg.timestamp)
      };
    });
    if (older.length < 25) hasMoreHistory = false;
    currentMessages = older.concat(currentMessages);
    renderMessages({ preserveScroll: true });
    // Restore the same relative viewing position rather than jumping to
    // the very top or snapping back to the bottom.
    chatBody.scrollTop = chatBody.scrollHeight - prevScrollHeight + prevScrollTop;
  } catch (e) { /* leave state as-is on failure */ }

  isLoadingMore = false;
}

// A cluster is one avatar + one name + one timestamp, holding one or more
// messages from the same sender sent close together in time (see
// CLUSTER_GAP_MINUTES). This is intentionally recomputed from scratch on
// every call rather than incrementally patched — see the comment on
// currentMessages above for why that matters once edit/delete exist.
//
// opts.preserveScroll: true when called from loadOlderMessages(), which
// manages scroll position itself afterward (restoring the user's exact
// viewing spot). Every other caller (initial load, send, receive) wants
// the default behavior: snap to the bottom, since #chat-body is the
// element that actually scrolls — NOT #chat-messages, which has no
// overflow of its own.
function renderMessages(opts = {}) {
  const wrap = document.getElementById("chat-messages");
  wrap.innerHTML = "";

  if (openConversationWith !== null) {
    wrap.appendChild(buildConversationStartCard(openConversationWith, openConversationUsername));
  }

  let openCluster = null; // { isMine, lastTime, bubbleEl }

  currentMessages.forEach(msg => {
    const sameSenderAsLast = openCluster && openCluster.isMine === msg.isMine;
    const withinGap = openCluster &&
      (msg.time - openCluster.lastTime) <= CLUSTER_GAP_MINUTES * 60 * 1000;

    if (!(sameSenderAsLast && withinGap)) {
      openCluster = startNewCluster(wrap, msg);
    } else {
      const line = document.createElement("div");
      line.className = "bubble-line";
      line.textContent = msg.content;
      openCluster.bubbleEl.appendChild(line);
    }

    openCluster.lastTime = msg.time;
  });

  // #chat-body is the actual scrolling element (overflow-y: auto lives
  // there, not on #chat-messages) — this was previously targeting the
  // wrong element and silently doing nothing; CSS's justify-content:
  // flex-end was masking that by coincidence. loadOlderMessages()
  // manages scroll position itself, so skip this when preserving.
  if (!opts.preserveScroll) {
    const chatBody = document.getElementById("chat-body");
    chatBody.scrollTop = chatBody.scrollHeight;
  }
}

function startNewCluster(wrap, msg) {
  const cluster = document.createElement("div");
  cluster.className = "msg-cluster " + (msg.isMine ? "self" : "other");

  const avatar = document.createElement("div");
  avatar.className = "cluster-avatar";
  avatar.textContent = avatarLetter(msg.username);

  const body = document.createElement("div");
  body.className = "cluster-body";

  const header = document.createElement("div");
  header.className = "cluster-header";
  const name = document.createElement("span");
  name.className = "cluster-name";
  name.textContent = msg.username;
  const time = document.createElement("span");
  time.className = "cluster-time";
  time.textContent = formatClusterTime(msg.time);
  header.appendChild(name);
  header.appendChild(time);

  const bubble = document.createElement("div");
  bubble.className = "cluster-bubble";
  const firstLine = document.createElement("div");
  firstLine.className = "bubble-line";
  firstLine.textContent = msg.content;
  bubble.appendChild(firstLine);

  body.appendChild(header);
  body.appendChild(bubble);
  cluster.appendChild(avatar);
  cluster.appendChild(body);
  wrap.appendChild(cluster);

  return { isMine: msg.isMine, lastTime: msg.time, bubbleEl: bubble };
}

// "24 hours old" is relative to the moment this renders, not the calendar
// date — a message from 11 PM last night is 2 hours old at 1 AM, and
// should NOT show a date yet just because it crossed midnight.
function formatClusterTime(date) {
  const ageMs = Date.now() - date.getTime();
  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (ageMs < 24 * 60 * 60 * 1000) return timeStr;
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateStr} \u00b7 ${timeStr}`;
}

// Sits once at the very top of message history — signals "you've reached
// the start, nothing more to load" and hosts Remove Friend / Block.
// Rebuilt fresh on every renderMessages() call, same as the clusters
// below it, so it always reflects openConversationWith/Username correctly
// even right after switching conversations.
function buildConversationStartCard(id, username) {
  const card = document.createElement("div");
  card.className = "convo-start-card";

  const avatar = document.createElement("div");
  avatar.className = "convo-start-avatar";
  avatar.textContent = avatarLetter(username);

  const name = document.createElement("div");
  name.className = "convo-start-name";
  name.textContent = username;

  const meta = document.createElement("div");
  meta.className = "convo-start-meta"; // placeholder line — mutual-servers-style info, later

  const desc = document.createElement("div");
  desc.className = "convo-start-desc";
  desc.textContent = `This is the beginning of your direct message history with ${username}.`;

  const actions = document.createElement("div");
  actions.className = "convo-start-actions";

  const removeBtn = document.createElement("button");
  removeBtn.className = "icon-btn";
  removeBtn.textContent = "Remove Friend";
  removeBtn.onclick = () => handleRemoveFriend(id, username, actions);

  const blockBtn = document.createElement("button");
  blockBtn.className = "danger-btn";
  blockBtn.textContent = "Block";
  blockBtn.onclick = () => handleBlockUser(id, username, actions);

  actions.appendChild(removeBtn);
  actions.appendChild(blockBtn);

  card.appendChild(avatar);
  card.appendChild(name);
  card.appendChild(meta);
  card.appendChild(desc);
  card.appendChild(actions);
  return card;
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
    actionsEl.innerHTML = "";
    const status = document.createElement("div");
    status.className = "convo-start-status";
    status.textContent = `You are no longer friends with ${username}.`;
    actionsEl.appendChild(status);
    disableComposer(`You can't message ${username} \u2014 you're no longer friends.`);
  } catch (e) { /* leave the buttons as-is on failure */ }
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
    actionsEl.innerHTML = "";
    const status = document.createElement("div");
    status.className = "convo-start-status";
    status.textContent = `You have blocked ${username}.`;
    actionsEl.appendChild(status);
    disableComposer(`You can't message ${username} \u2014 blocked.`);
  } catch (e) { /* leave the buttons as-is on failure */ }
}

// Read-only mode for the composer — used after Remove Friend/Block, since
// the backend's own friend-check would reject a send anyway; this just
// makes that plain up front instead of letting the user type into a
// message that's guaranteed to fail.
function disableComposer(message) {
  document.getElementById("composer-input").disabled = true;
  document.getElementById("composer-input").placeholder = message;
  document.getElementById("composer-send-btn").disabled = true;
  document.getElementById("composer-plus-btn").disabled = true;
  document.getElementById("composer-emoji-btn").disabled = true;
}

function enableComposer() {
  document.getElementById("composer-input").disabled = false;
  document.getElementById("composer-input").placeholder = "Type a message";
  document.getElementById("composer-send-btn").disabled = false;
  document.getElementById("composer-plus-btn").disabled = false;
  document.getElementById("composer-emoji-btn").disabled = false;
}

function sendChatMessage() {
  const input = document.getElementById("composer-input");
  const content = input.value.trim();
  if (!content || openConversationWith === null || !ws) return;
  ws.send(JSON.stringify({ type: "message", receiver_id: openConversationWith, content }));
  currentMessages.push({
    isMine: true,
    username: myUsername || "You",
    content,
    time: new Date() // optimistic local echo — no round trip to wait on
  });
  renderMessages();
  bumpConversation(openConversationWith, document.getElementById("chat-header-title").textContent, false);
  input.value = "";
  autoGrowComposer(); // shrink back down after clearing
}

// Grows the composer textarea to fit its content, up to 5 lines, then
// leaves it fixed height and lets the textarea's own scrollbar take over.
function autoGrowComposer() {
  const el = document.getElementById("composer-input");
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

document.getElementById("composer-input").addEventListener("input", autoGrowComposer);

document.getElementById("composer-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // stop the textarea's default newline insertion
    sendChatMessage();
  }
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

// Scroll-to-top triggers loading older history. Threshold of 40px rather
// than exactly 0 so it fires a moment before the user hits the hard
// edge — feels less abrupt than waiting for scrollTop to hit zero.
document.getElementById("chat-body").addEventListener("scroll", () => {
  const chatBody = document.getElementById("chat-body");
  if (chatBody.scrollTop < 40) loadOlderMessages();
});
