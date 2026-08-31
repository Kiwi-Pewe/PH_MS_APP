let serverAddress = null;
let ws = null;
let myUsername = null;

// The single open chat, whatever kind it is. type is "dm" or "party";
// id's meaning depends on type (a DM partner's user id, or a party's
// party_id) — those two number spaces can coincidentally collide, so
// EVERY comparison against "is this the open chat" must check type AND
// id together, never id alone. name is whatever the header/start-card
// should display (a username or a party name).
let openChatType = null;
let openChatId = null;
let openChatName = null;

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
      const isOpen = openChatType === "dm" && openChatId === data.sender_id;
      bumpConversation("dm", data.sender_id, data.username, !isOpen);
      if (isOpen) {
        // Backend doesn't send a timestamp on the live push yet (only on
        // the history fetch) — fall back to "now" so clustering still
        // works; recommend adding a real one server-side for accuracy
        // across devices with clock drift.
        currentMessages.push({
          isMine: false,
          senderId: data.sender_id,
          username: data.username,
          content: data.content,
          time: data.timestamp ? new Date(data.timestamp) : new Date()
        });
        renderMessages();
      }
    }

    if (data.type === "party_message") {
      const isOpen = openChatType === "party" && openChatId === data.party_id;
      bumpConversation("party", data.party_id, data.party_name, !isOpen);
      if (isOpen) {
        currentMessages.push({
          isMine: false,
          senderId: data.sender_id,
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

// ---- Context menus (message + profile) ----
// The generic open/close/positioning engine lives in
// shared/context-menu.js and knows nothing about messages or friends —
// these two functions gather the real data for a click and decide what
// each option does. Every option is an inert placeholder for now
// (per the design discussion — functionality comes later) EXCEPT
// "Message", which just reuses the existing openDirectMessage() the
// app already has, since that's zero new behavior, not a new feature.

function showMessageContextMenu(e, msg) {
  e.preventDefault();
  openContextMenu(e.clientX, e.clientY, {
    avatarText: avatarLetter(msg.username),
    title: msg.username,
    timestamp: formatClusterTime(msg.time),
    subtitle: truncateForContextMenu(msg.content)
  }, [
    msg.isMine && { label: "Edit Message", onSelect: () => console.log("Edit message — not implemented yet") },
    { label: "Reply", onSelect: () => console.log("Reply — not implemented yet") },
    { label: "Pin", onSelect: () => console.log("Pin — not implemented yet") },
    msg.isMine && { label: "Delete Message", danger: true, onSelect: () => console.log("Delete message — not implemented yet") }
  ]);
}

function showProfileContextMenu(e, id, username, isSelf) {
  e.preventDefault();
  const options = isSelf ? [
    { label: "Profile", onSelect: () => console.log("View own profile — not implemented yet") },
    { label: "Settings", onSelect: () => console.log("Open settings from context menu — not implemented yet") }
  ] : [
    { label: "Profile", onSelect: () => console.log("View profile — not implemented yet") },
    { label: "Unfriend", onSelect: () => unfriendFromContextMenu(id, username) },
    { label: "Mute", onSelect: () => console.log("Mute — not implemented yet") },
    { label: "Message", onSelect: () => openDirectMessage(id, username) },
    { label: "Invite", onSelect: () => console.log("Invite — not implemented yet") },
    { label: "Block", danger: true, onSelect: () => blockFromContextMenu(id, username) }
  ];
  openContextMenu(e.clientX, e.clientY, {
    avatarText: avatarLetter(username),
    title: username,
    subtitle: "{Status}"
  }, options);
}

// Party rows get their own menu, not the profile one — right-clicking a
// party isn't right-clicking a person. Reference area mirrors the
// sidebar's own subtitle line ("N Members") for consistency. Leave Party
// is the only real action so far; the others stay inert placeholders
// until party settings actually exist.
function showPartyContextMenu(e, id, name, memberCount) {
  e.preventDefault();
  openContextMenu(e.clientX, e.clientY, {
    avatarText: avatarLetter(name),
    title: name,
    subtitle: `${memberCount} Members`
  }, [
    { label: "Party Info", onSelect: () => console.log("Party info — not implemented yet") },
    { label: "Mute", onSelect: () => console.log("Mute — not implemented yet") },
    { label: "Leave Party", danger: true, onSelect: () => leavePartyFromContextMenu(id, name) }
  ]);
}

// Sends the leave request over the socket — leave_party is a live,
// broadcast-driven action (see /ws's "leave_party" branch), not a plain
// HTTP round-trip like closeConversation, so there's no response object
// to await here. The backend deletes the membership row synchronously
// as part of handling that packet, so the local teardown below is safe
// to do right away rather than waiting on any ack.
function leavePartyFromContextMenu(id, name) {
  if (!ws) return;
  ws.send(JSON.stringify({ type: "leave_party", party_id: id }));
  if (openChatType === "party" && openChatId === id) resetChatView();
  conversationList = conversationList.filter(c => !(c.type === "party" && c.id === id));
  renderConversationList();
}

// Unfriending/blocking someone you currently have open should also back
// you out of that conversation — you're about to lose the ability to
// message them (block removes the friendship server-side too), so
// leaving the chat window sitting open on a now-invalid relationship
// would be confusing. Both refresh the friends list and DM sidebar
// afterward so the UI reflects the change immediately rather than
// waiting for the next full reload.

async function unfriendFromContextMenu(id, username) {
  try {
    const response = await fetch(`https://${serverAddress}/unfriend_user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id_2: id })
    });
    if (!response.ok) {
      console.error(`Failed to unfriend ${username}: ${response.status}`);
      return;
    }
  } catch (e) {
    console.error("Failed to unfriend, network error:", e);
    return;
  }
  if (openChatType === "dm" && openChatId === id) resetChatView();
  refreshFriendsView();
  loadConversations();
}

async function blockFromContextMenu(id, username) {
  try {
    const response = await fetch(`https://${serverAddress}/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ blocked_user: id })
    });
    if (!response.ok) {
      console.error(`Failed to block ${username}: ${response.status}`);
      return;
    }
  } catch (e) {
    console.error("Failed to block, network error:", e);
    return;
  }
  if (openChatType === "dm" && openChatId === id) resetChatView();
  refreshFriendsView();
  loadConversations();
}

async function logout() {
  try {
    await fetch(`https://${serverAddress}/logout`, { method: "POST", credentials: "include" });
  } catch (e) { /* tear down locally regardless */ }
  if (ws) { ws.close(); ws = null; }
  window.location.href = "../login.html";
}

// ---- Party creation modal ----
// Max 9 selectable here since the creator themselves is the 10th member
// (the roadmap's party cap is 10 total). Re-fetches the friends list
// fresh every time the modal opens rather than reusing whatever's
// cached from the Friends view, so it can't show stale invite options.

let selectedPartyMembers = new Set();
const MAX_PARTY_INVITES = 9;

document.getElementById("create-party-btn").addEventListener("click", openPartyModal);
document.getElementById("party-modal-close").addEventListener("click", closePartyModal);
document.getElementById("party-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "party-modal-overlay") closePartyModal();
});
document.getElementById("party-modal-create-btn").addEventListener("click", submitCreateParty);

async function openPartyModal() {
  selectedPartyMembers = new Set();
  updatePartyModalCount();
  document.getElementById("party-modal-overlay").style.display = "flex";

  const rows = document.getElementById("party-modal-friend-rows");
  rows.innerHTML = "";

  try {
    const response = await fetch(`https://${serverAddress}/get_friends`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const allFriends = [...(data.online_friends || []), ...(data.offline_friends || [])];

    document.getElementById("party-modal-empty-note").style.display = allFriends.length === 0 ? "block" : "none";

    allFriends.forEach(friend => {
      const row = document.createElement("div");
      row.className = "friend-row";
      row.innerHTML = `<div class="avatar-dot"></div><div class="who"></div><input type="checkbox">`;
      row.querySelector(".avatar-dot").textContent = avatarLetter(friend.username);
      row.querySelector(".who").textContent = friend.username;
      const checkbox = row.querySelector("input");
      checkbox.addEventListener("change", () => togglePartyMember(friend.id, checkbox));
      rows.appendChild(row);
    });
  } catch (e) {
    console.error("Failed to load friends for party creation:", e);
  }
}

function togglePartyMember(id, checkbox) {
  if (checkbox.checked) {
    if (selectedPartyMembers.size >= MAX_PARTY_INVITES) {
      // Cap enforced here, not just visually — every OTHER unchecked box
      // gets disabled below once the cap is hit, but this still guards
      // the one that was already mid-click when the limit was reached.
      checkbox.checked = false;
      return;
    }
    selectedPartyMembers.add(id);
  } else {
    selectedPartyMembers.delete(id);
  }
  updatePartyModalCount();
}

function updatePartyModalCount() {
  document.getElementById("party-modal-count").textContent = `${selectedPartyMembers.size} / ${MAX_PARTY_INVITES} selected`;
  const atCap = selectedPartyMembers.size >= MAX_PARTY_INVITES;
  document.querySelectorAll("#party-modal-friend-rows input[type=checkbox]").forEach(box => {
    if (!box.checked) box.disabled = atCap;
  });
}

function closePartyModal() {
  document.getElementById("party-modal-overlay").style.display = "none";
}

async function submitCreateParty() {
  try {
    const response = await fetch(`https://${serverAddress}/create_party`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        party_name: `${myUsername}'s Party`,
        member_ids: Array.from(selectedPartyMembers)
      })
    });
    if (!response.ok) {
      console.error(`Failed to create party: ${response.status}`);
      return;
    }
  } catch (e) {
    console.error("Failed to create party, network error:", e);
    return;
  }
  closePartyModal();
  loadConversations();
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
  // DMs and parties live in completely separate backend tables, so this
  // is two independent fetches — merged into one array afterward so the
  // sidebar can interleave them by recency, the same way Discord does.
  // Both endpoints hand back a real timestamp (last_message_at /
  // last_activity) specifically so this merge has something honest to
  // sort by, rather than guessing at an order.
  Promise.all([
    fetch(`https://${serverAddress}/conversation_history`, { credentials: "include" })
      .then(response => response.ok ? response.json() : { conversations: [] })
      .catch(() => ({ conversations: [] })),
    fetch(`https://${serverAddress}/get_parties`, { credentials: "include" })
      .then(response => response.ok ? response.json() : { parties: [] })
      .catch(() => ({ parties: [] }))
  ]).then(([dmData, partyData]) => {
    // Seed unread counts from the DB on load, so messages that arrived
    // while offline (or before this page loaded) still show correctly —
    // bumpConversation only handles counts that arrive while connected.
    const dms = (dmData.conversations || []).map(c => ({
      type: "dm",
      id: c.id,
      username: c.username,
      unread: c.unread_count || 0,
      timestamp: c.last_message_at
    }));
    const parties = (partyData.parties || []).map(p => ({
      type: "party",
      id: p.id,
      name: p.name,
      memberCount: p.member_count,
      unread: p.unread_count || 0,
      timestamp: p.last_activity
    }));
    conversationList = dms.concat(parties).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    renderConversationList();
  });
}

function renderConversationList() {
  document.getElementById("dm-empty-note").style.display = conversationList.length === 0 ? "block" : "none";

  const rows = document.getElementById("dm-rows");
  rows.innerHTML = "";
  conversationList.forEach(convo => {
    const row = document.createElement("div");
    const displayName = convo.type === "party" ? convo.name : convo.username;
    const subtitle = convo.type === "party" ? `${convo.memberCount} Members` : "{Status}";
    const isActive = convo.type === openChatType && convo.id === openChatId;

    row.className = "dm-item" + (isActive ? " active" : "");
    row.innerHTML = `<div class="avatar-dot"></div><div class="dm-item-text"><div class="who"></div><div class="dm-subtitle"></div></div><span class="dm-unread-badge"></span>`;
    row.querySelector(".avatar-dot").textContent = avatarLetter(displayName);
    row.querySelector(".who").textContent = displayName;
    row.querySelector(".dm-subtitle").textContent = subtitle;
    if (convo.unread > 0) {
      const badge = row.querySelector(".dm-unread-badge");
      badge.textContent = convo.unread;
      badge.style.display = "flex";
    }

    if (convo.type === "party") {
      // No close (×) button on party rows — "closing" a party isn't a
      // real concept the way closing a DM is; leaving is the equivalent
      // action, and it lives in the context menu instead, matching how
      // Discord treats a group differently from a DM in this respect.
      row.addEventListener("click", () => openParty(convo.id, convo.name));
      row.addEventListener("contextmenu", (e) => showPartyContextMenu(e, convo.id, convo.name, convo.memberCount));
    } else {
      row.addEventListener("click", () => openDirectMessage(convo.id, convo.username));
      row.addEventListener("contextmenu", (e) => showProfileContextMenu(e, convo.id, convo.username, false));

      const closeBtn = document.createElement("button");
      closeBtn.className = "dm-close";
      closeBtn.title = "Close";
      closeBtn.innerHTML = "&times;";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeConversation("dm", convo.id);
      });
      row.appendChild(closeBtn);
    }

    rows.appendChild(row);
  });

  updateHomeBadge();
}

// Sending or receiving a message bumps a conversation to the top — the
// only two things that count as "interacting with" it per the design call.
// type+id together identify the entry, since a DM partner's id and a
// party's id can coincidentally collide — id alone is never enough.
function bumpConversation(type, id, name, incrementUnread) {
  let entry = conversationList.find(c => c.type === type && c.id === id);
  conversationList = conversationList.filter(c => !(c.type === type && c.id === id));
  if (!entry) {
    // memberCount defaults to 0 here — this fallback only fires if a
    // party message arrives for a party not already in the sidebar,
    // which shouldn't normally happen (get_parties loads it up front),
    // but a wrong member count is a cosmetic gap, not a crash.
    entry = type === "party"
      ? { type, id, name, memberCount: 0, unread: 0 }
      : { type, id, username: name, unread: 0 };
  }
  if (incrementUnread) entry.unread = (entry.unread || 0) + 1;
  conversationList.unshift(entry);
  renderConversationList();
}

// Opening a conversation (click, or a freshly accepted friend) must NOT
// reorder the sidebar — only actual message activity does that. DM-only:
// parties are always already present once created, since there's no
// per-user "close" for them yet.
function ensureConversationPresent(id, username) {
  if (!conversationList.some(c => c.type === "dm" && c.id === id)) {
    conversationList.unshift({ type: "dm", id, username, unread: 0 });
  }
  renderConversationList();
}

function clearUnread(type, id) {
  const entry = conversationList.find(c => c.type === type && c.id === id);
  if (entry) entry.unread = 0;
  renderConversationList();
}

function updateHomeBadge() {
  const badge = document.getElementById("home-unread-badge");
  const total = conversationList.reduce((sum, c) => sum + (c.unread || 0), 0);
  const chatFocused = document.getElementById("view-chat").classList.contains("active") && openChatId !== null;
  if (total > 0 && !chatFocused) {
    badge.textContent = total;
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

async function closeConversation(type, id) {
  // Optimistic update: hide it immediately so the click feels instant,
  // then confirm with the server in the background. We keep a copy of
  // the removed entry so we can put it back if the request fails —
  // otherwise a failed close would silently disagree with the backend
  // until the next refresh, which is a confusing way to find out.
  // DM-only for now — no equivalent "leave party" endpoint exists yet.
  const removedConvo = conversationList.find(c => c.type === type && c.id === id);
  conversationList = conversationList.filter(c => !(c.type === type && c.id === id));
  if (openChatType === type && openChatId === id) resetChatView();
  renderConversationList();

  try {
    const response = await fetch(`https://${serverAddress}/conversation/${id}/close`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error("Failed to close conversation");
  } catch (e) {
    console.error("Failed to close conversation, restoring it:", e);
    if (removedConvo && !conversationList.some(c => c.type === type && c.id === id)) {
      conversationList.push(removedConvo);
      renderConversationList();
    }
  }
}

function resetChatView() {
  openChatType = null;
  openChatId = null;
  openChatName = null;
  document.querySelectorAll("#secondary-nav .nav-item").forEach(b => b.classList.remove("active"));
  switchMainView("chat");
  document.getElementById("chat-header-title").textContent = "No conversation selected";
  document.getElementById("chat-header-actions").style.display = "none";
  document.getElementById("chat-messages").style.display = "none";
  document.getElementById("chat-empty").style.display = "flex";
}

async function openDirectMessage(id, username) {
  openChatType = "dm";
  openChatId = id;
  openChatName = username;
  document.querySelectorAll("#secondary-nav .nav-item").forEach(b => b.classList.remove("active"));
  switchMainView("chat");
  document.getElementById("chat-header-title").textContent = username;
  document.getElementById("chat-header-actions").style.display = "flex";
  enableComposer();
  ensureConversationPresent(id, username);
  clearUnread("dm", id);

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
        senderId: msg.sender_id,
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

// Opening a party mirrors openDirectMessage exactly, just pointed at the
// party endpoints — this is the "universal chat window" design in
// practice: everything downstream (rendering, clustering, composer)
// works off openChatType/openChatId/currentMessages, and doesn't care
// which of these two functions populated them.
async function openParty(id, name) {
  openChatType = "party";
  openChatId = id;
  openChatName = name;
  document.querySelectorAll("#secondary-nav .nav-item").forEach(b => b.classList.remove("active"));
  switchMainView("chat");
  document.getElementById("chat-header-title").textContent = name;
  // No party-specific header actions (Remove Friend/Block make no sense
  // for a group) exist yet — hidden until that design pass happens.
  document.getElementById("chat-header-actions").style.display = "none";
  enableComposer();
  clearUnread("party", id);

  const chatEmpty = document.getElementById("chat-empty");
  const chatMessages = document.getElementById("chat-messages");
  chatEmpty.style.display = "none";
  chatMessages.style.display = "block";
  currentMessages = [];
  hasMoreHistory = true;
  isLoadingMore = false;

  try {
    const response = await fetch(`https://${serverAddress}/get_party_messages/${id}`, { credentials: "include" });
    if (!response.ok) { renderMessages(); return; }
    const data = await response.json();
    currentMessages = data.messages.map(msg => ({
      id: msg.id,
      isMine: msg.username === myUsername,
      senderId: msg.sender_id,
      username: msg.username,
      content: msg.content,
      time: new Date(msg.timestamp)
    }));
    if (currentMessages.length < 25) hasMoreHistory = false;
    renderMessages();
  } catch (e) { renderMessages(); }
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
    const url = openChatType === "party"
      ? `https://${serverAddress}/get_party_messages/${openChatId}?before_id=${oldest.id}`
      : `https://${serverAddress}/messages/${openChatId}?before_id=${oldest.id}`;
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const older = data.messages.map(msg => {
      const isMine = openChatType === "party" ? msg.username === myUsername : msg.sender_id !== openChatId;
      return {
        id: msg.id,
        isMine,
        senderId: msg.sender_id,
        username: isMine ? myUsername : (openChatType === "party" ? msg.username : openChatName),
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

  if (openChatId !== null) {
    wrap.appendChild(
      openChatType === "party"
        ? buildPartyStartCard(openChatName)
        : buildConversationStartCard(openChatId, openChatName)
    );
  }

  let openCluster = null; // { isMine, lastTime, bubbleEl }

  currentMessages.forEach(msg => {
    // No sender means this is a system notice (leave-party today, more
    // kinds later), not a real chat message — it always renders as a
    // full-width divider, never a cluster/bubble, regardless of who's
    // above or below it. openCluster is reset to null afterward so the
    // NEXT real message always starts a fresh cluster rather than
    // silently merging into whatever cluster was open before the
    // divider — a system notice breaking up two same-sender messages
    // should visually separate them, not be invisible to the grouping.
    if (msg.senderId === null) {
      wrap.appendChild(buildSystemDivider(msg));
      openCluster = null;
      return;
    }

    // isMine alone used to be enough to identify "same sender as last" —
    // true for a DM, since there's only ever one possible "not me"
    // person. In a party there can be 9, so two different other people
    // messaging back to back within the gap window would otherwise
    // wrongly merge into one bubble. username is always populated for
    // every message (self included) and uniquely identifies the actual
    // sender, so it's the real clustering key; isMine still decides
    // left/right layout.
    const sameSenderAsLast = openCluster && openCluster.isMine === msg.isMine && openCluster.username === msg.username;
    const withinGap = openCluster &&
      (msg.time - openCluster.lastTime) <= CLUSTER_GAP_MINUTES * 60 * 1000;

    if (!(sameSenderAsLast && withinGap)) {
      openCluster = startNewCluster(wrap, msg);
    } else {
      const line = document.createElement("div");
      line.className = "bubble-line";
      line.textContent = msg.content;
      line.addEventListener("contextmenu", (e) => showMessageContextMenu(e, msg));
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

// One-line, no avatar, no bubble — just the finished sentence centered
// in the divider. Nothing here needs msg.username/msg.senderId at all,
// since the content string is already the complete, self-contained
// message (see leave_party on the backend) — there's no "sender" to
// attribute this to, by design.
function buildSystemDivider(msg) {
  const divider = document.createElement("div");
  divider.className = "system-divider";
  divider.textContent = msg.content;
  return divider;
}

function startNewCluster(wrap, msg) {
  const cluster = document.createElement("div");
  cluster.className = "msg-cluster " + (msg.isMine ? "self" : "other");

  const avatar = document.createElement("div");
  avatar.className = "cluster-avatar";
  avatar.textContent = avatarLetter(msg.username);
  avatar.addEventListener("contextmenu", (e) => showProfileContextMenu(e, msg.senderId, msg.username, msg.isMine));

  const body = document.createElement("div");
  body.className = "cluster-body";

  const header = document.createElement("div");
  header.className = "cluster-header";
  const name = document.createElement("span");
  name.className = "cluster-name";
  name.textContent = msg.username;
  name.addEventListener("contextmenu", (e) => showProfileContextMenu(e, msg.senderId, msg.username, msg.isMine));
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
  firstLine.addEventListener("contextmenu", (e) => showMessageContextMenu(e, msg));
  bubble.appendChild(firstLine);

  body.appendChild(header);
  body.appendChild(bubble);
  cluster.appendChild(avatar);
  cluster.appendChild(body);
  wrap.appendChild(cluster);

  return { isMine: msg.isMine, username: msg.username, lastTime: msg.time, bubbleEl: bubble };
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
// below it, so it always reflects openChatId/openChatName correctly
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

// Party equivalent of the card above. Deliberately minimal — no
// Remove Friend/Block (neither applies to a group), and no party
// settings/rename/invite actions yet since none of that exists on the
// backend yet. Revisit once party settings are designed.
function buildPartyStartCard(name) {
  const card = document.createElement("div");
  card.className = "convo-start-card";

  const avatar = document.createElement("div");
  avatar.className = "convo-start-avatar";
  avatar.textContent = avatarLetter(name);

  const nameEl = document.createElement("div");
  nameEl.className = "convo-start-name";
  nameEl.textContent = name;

  const desc = document.createElement("div");
  desc.className = "convo-start-desc";
  desc.textContent = `This is the beginning of ${name}.`;

  card.appendChild(avatar);
  card.appendChild(nameEl);
  card.appendChild(desc);
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
  if (!content || openChatId === null || !ws) return;

  const payload = openChatType === "party"
    ? { type: "party_message", party_id: openChatId, content }
    : { type: "message", receiver_id: openChatId, content };
  ws.send(JSON.stringify(payload));

  currentMessages.push({
    isMine: true,
    username: myUsername || "You",
    content,
    time: new Date() // optimistic local echo — no round trip to wait on
  });
  renderMessages();
  bumpConversation(openChatType, openChatId, openChatName, false);
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
