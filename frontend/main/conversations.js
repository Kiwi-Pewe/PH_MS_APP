// ==================================================================
// conversations.js - The DM/party sidebar, and opening a conversation.
// ==================================================================

function loadConversations() {
  // DMs and parties are separate backend tables, merged here so the
  // sidebar can interleave by recency. Returns the Promise.all chain
  // (not just fires it) so callers like handleJoinDeepLink can await it.
  return Promise.all([
    fetch(`https://${serverAddress}/conversation_history`, { credentials: "include" })
      .then(response => response.ok ? response.json() : { conversations: [] })
      .catch(() => ({ conversations: [] })),
    fetch(`https://${serverAddress}/get_parties`, { credentials: "include" })
      .then(response => response.ok ? response.json() : { parties: [] })
      .catch(() => ({ parties: [] }))
  ]).then(([dmData, partyData]) => {
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
      // No close button on parties - leaving is the equivalent action,
      // and lives in the context menu instead.
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

// type+id together identify an entry - a DM partner's id and a party's
// id can coincidentally collide.
function bumpConversation(type, id, name, incrementUnread) {
  let entry = conversationList.find(c => c.type === type && c.id === id);
  conversationList = conversationList.filter(c => !(c.type === type && c.id === id));
  if (!entry) {
    entry = type === "party"
      ? { type, id, name, memberCount: 0, unread: 0 }
      : { type, id, username: name, unread: 0 };
  }
  if (incrementUnread) entry.unread = (entry.unread || 0) + 1;
  conversationList.unshift(entry);
  renderConversationList();
}

// Opening a conversation must NOT reorder the sidebar - only message
// activity does that. DM-only: parties are always already present.
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
  // Optimistic: hide immediately, keep a copy to restore if the request
  // fails. DM-only - no "leave party" endpoint exists yet.
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
        time: new Date(msg.timestamp)
      };
    });
    if (currentMessages.length < 25) hasMoreHistory = false;
    renderMessages();
  } catch (e) { renderMessages(); }
}

// Mirrors openDirectMessage exactly, pointed at party endpoints -
// everything downstream works off openChatType/openChatId/currentMessages.
async function openParty(id, name) {
  openChatType = "party";
  openChatId = id;
  openChatName = name;
  document.querySelectorAll("#secondary-nav .nav-item").forEach(b => b.classList.remove("active"));
  switchMainView("chat");
  document.getElementById("chat-header-title").textContent = name;
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
