// ==================================================================
// conversations.js - The DM/party sidebar, and opening a conversation.
// ==================================================================

const conversationMutes = {};
let muteExpiryTimer = null;

function muteMapKey(type, id) {
  return type + ":" + String(id);
}

function rememberConversationMute(type, id, muted, untilMs) {
  const key = muteMapKey(type, id);
  if (!muted) {
    delete conversationMutes[key];
    return;
  }
  const until = untilMs == null || untilMs === "" ? Number.MAX_SAFE_INTEGER : Number(untilMs);
  if (until > Date.now()) conversationMutes[key] = until;
  else delete conversationMutes[key];
}

function isConversationMuted(type, id) {
  const until = conversationMutes[muteMapKey(type, id)];
  return !!until && until > Date.now();
}

function scheduleMuteExpiryRefresh() {
  if (muteExpiryTimer) {
    clearTimeout(muteExpiryTimer);
    muteExpiryTimer = null;
  }
  const now = Date.now();
  let next = 0;
  Object.keys(conversationMutes).forEach((key) => {
    const until = conversationMutes[key];
    if (until <= now) {
      delete conversationMutes[key];
      return;
    }
    if (until >= Number.MAX_SAFE_INTEGER) return;
    if (!next || until < next) next = until;
  });
  if (!next) return;
  const wait = Math.min(Math.max(next - now, 50), 2147483647);
  muteExpiryTimer = setTimeout(() => {
    scheduleMuteExpiryRefresh();
    renderConversationList();
  }, wait);
}

function applyConversationMute(type, id, muted, untilMs) {
  rememberConversationMute(type, id, muted, untilMs);
  scheduleMuteExpiryRefresh();
  renderConversationList();
}

function localMuteState(duration) {
  const key = String(duration || "").toLowerCase();
  if (key === "off" || key === "unmute") return { muted: false, muted_until: null };
  if (key === "on") return { muted: true, muted_until: null };
  const ms = { "15m": 15 * 60 * 1000, "1h": 60 * 60 * 1000, "8h": 8 * 60 * 60 * 1000, "24h": 24 * 60 * 60 * 1000 }[key];
  return { muted: true, muted_until: Date.now() + (ms || 0) };
}

async function muteConversation(type, id, duration) {
  const guess = localMuteState(duration);
  applyConversationMute(type, id, guess.muted, guess.muted_until);
  const path = type === "party"
    ? `https://${serverAddress}/party/${encodeURIComponent(id)}/mute`
    : `https://${serverAddress}/conversation/${encodeURIComponent(id)}/mute`;
  try {
    const response = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duration })
    });
    if (!response.ok) {
      loadConversations();
      return;
    }
    const data = await response.json();
    applyConversationMute(type, id, !!data.muted, data.muted_until);
  } catch (err) {
    loadConversations();
  }
}

function applyConversationLists(conversations, parties, closedMutes) {
  Object.keys(conversationMutes).forEach((key) => { delete conversationMutes[key]; });
  const dms = (conversations || []).map(c => {
    rememberConversationMute("dm", c.id, !!c.muted, c.muted_until);
    return {
      type: "dm",
      id: c.id,
      username: c.username,
      displayName: c.display_name || c.username,
      status: (c.status || "").trim(),
      unread: c.unread_count || 0,
      timestamp: c.last_message_at,
      avatar: c.avatar || null
    };
  });
  const partyRows = (parties || []).map(p => {
    rememberConversationMute("party", p.id, !!p.muted, p.muted_until);
    return {
      type: "party",
      id: p.id,
      name: p.name,
      memberCount: p.member_count,
      unread: p.unread_count || 0,
      mentions: p.mention_count || 0,
      timestamp: p.last_activity
    };
  });
  (closedMutes || []).forEach((row) => {
    rememberConversationMute("dm", row.id, true, row.muted_until);
  });
  conversationList = dms.concat(partyRows).sort((a, b) => parseUtcTimestamp(b.timestamp) - parseUtcTimestamp(a.timestamp));
  scheduleMuteExpiryRefresh();
  renderConversationList();
}

function loadConversations() {
  return Promise.all([
    fetch(`https://${serverAddress}/conversation_history`, { credentials: "include" })
      .then(response => response.ok ? response.json() : { conversations: [] })
      .catch(() => ({ conversations: [] })),
    fetch(`https://${serverAddress}/get_parties`, { credentials: "include" })
      .then(response => response.ok ? response.json() : { parties: [] })
      .catch(() => ({ parties: [] }))
  ]).then(([dmData, partyData]) => {
    applyConversationLists(dmData.conversations, partyData.parties, dmData.closed_mutes);
  });
}

function renderConversationList() {
  document.getElementById("dm-empty-note").style.display = conversationList.length === 0 ? "block" : "none";

  const rows = document.getElementById("dm-rows");
  rows.innerHTML = "";
  conversationList.forEach(convo => {
    const row = document.createElement("div");
    const displayName = convo.type === "party" ? convo.name : (convo.displayName || convo.username);
    const subtitle = convo.type === "party" ? `${convo.memberCount} Members` : (convo.status || "").trim();
    const isActive = convo.type === openChatType && convo.id === openChatId;

    row.className = "dm-item" + (isActive ? " active" : "");
    row.innerHTML = `<div class="avatar-dot"></div><div class="dm-item-text"><div class="who"></div></div><span class="dm-unread-badge"></span>`;
    const face = row.querySelector(".avatar-dot");
    if (convo.type !== "party" && typeof paintUserFace === "function") {
      paintUserFace(face, convo, { name: displayName, userId: convo.id });
    } else {
      face.textContent = avatarLetter(displayName);
    }
    row.querySelector(".who").textContent = displayName;
    if (subtitle) {
      const sub = document.createElement("div");
      sub.className = "dm-subtitle";
      sub.textContent = subtitle;
      row.querySelector(".dm-item-text").appendChild(sub);
    }
    if (convo.type !== "party" && typeof rememberUserStatus === "function") rememberUserStatus(convo.id, convo.status);
    if (!isConversationMuted(convo.type, convo.id)) {
      if (convo.type === "party") {
        if ((convo.mentions || 0) > 0) {
          const badge = row.querySelector(".dm-unread-badge");
          badge.textContent = convo.mentions > 99 ? "99+" : convo.mentions;
          badge.style.display = "flex";
        } else if (convo.unread > 0) {
          row.classList.add("has-unread");
        }
      } else if (convo.unread > 0) {
        const badge = row.querySelector(".dm-unread-badge");
        badge.textContent = convo.unread;
        badge.style.display = "flex";
      }
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
function bumpConversation(type, id, name, incrementUnread, opts) {
  const extra = opts || {};
  let entry = conversationList.find(c => c.type === type && c.id === id);
  conversationList = conversationList.filter(c => !(c.type === type && c.id === id));
  if (!entry) {
    entry = type === "party"
      ? { type, id, name, memberCount: 0, unread: 0, mentions: 0 }
      : { type, id, username: name, displayName: extra.displayName || name, status: (extra.status || "").trim(), unread: 0 };
  } else if (type === "dm") {
    if (extra.displayName) entry.displayName = extra.displayName;
    if (Object.prototype.hasOwnProperty.call(extra, "status")) entry.status = String(extra.status || "").trim();
  }
  if (incrementUnread) {
    if (type === "party" && extra.mentioned) entry.mentions = (entry.mentions || 0) + 1;
    else entry.unread = (entry.unread || 0) + 1;
  }
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
  if (entry) {
    entry.unread = 0;
    entry.mentions = 0;
  }
  renderConversationList();
}

function updateHomeBadge() {
  const badge = document.getElementById("home-unread-badge");
  const total = conversationList.reduce((sum, c) => {
    if (isConversationMuted(c.type, c.id)) return sum;
    if (c.type === "party") return sum + (c.mentions || 0);
    return sum + (c.unread || 0);
  }, 0);
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
  if (typeof openFeedView === "function") {
    openFeedView();
    return;
  }
  if (typeof hideMemberList === "function") hideMemberList();
  if (typeof clearPendingReply === "function") clearPendingReply();
  if (typeof resetTypingOnLeave === "function") resetTypingOnLeave();
  openChatType = null;
  openChatId = null;
  openChatName = null;
  document.querySelectorAll("#secondary-nav .nav-item").forEach(b => b.classList.remove("active"));
  switchMainView("chat");
  document.getElementById("chat-header-title").textContent = "No conversation selected";
  if (typeof setHeaderDescription === "function") setHeaderDescription("chat-header-desc", "");
  const chatActions = document.getElementById("chat-header-actions");
  if (chatActions) chatActions.hidden = false;
  document.getElementById("chat-messages").style.display = "none";
  document.getElementById("chat-empty").style.display = "flex";
}

function mapDmApiMessages(messages, otherId, username) {
  return (messages || []).map((msg) => {
    const isMine = msg.sender_id !== otherId;
    const mapped = applyDeletionFields({
      id: msg.id,
      chatKind: "dm",
      isMine,
      senderId: msg.sender_id,
      isSystem: !!msg.is_system,
      username: isMine ? myUsername : username,
      content: msg.content,
      attachment: typeof parseAttachment === "function" ? parseAttachment(msg.attachment) : msg.attachment,
      time: parseUtcTimestamp(msg.timestamp),
      avatar: msg.avatar || null,
      permaban: !!msg.permaban
    }, msg);
    if (typeof takeMessageAvatar === "function") takeMessageAvatar(mapped, msg);
    return typeof applyMentionFields === "function" ? applyMentionFields(mapped, msg) : mapped;
  });
}

function mapPartyApiMessages(messages) {
  return (messages || []).map((msg) => {
    const mapped = applyDeletionFields({
      id: msg.id,
      chatKind: "party",
      isMine: msg.username === myUsername,
      senderId: msg.sender_id,
      isSystem: !!msg.is_system || msg.sender_id == null,
      username: msg.username,
      content: msg.content,
      attachment: typeof parseAttachment === "function" ? parseAttachment(msg.attachment) : msg.attachment,
      time: parseUtcTimestamp(msg.timestamp),
      avatar: msg.avatar || null,
      permaban: !!msg.permaban
    }, msg);
    if (typeof takeMessageAvatar === "function") takeMessageAvatar(mapped, msg);
    if (typeof applyMentionFields === "function") applyMentionFields(mapped, msg);
    return mapped;
  });
}

async function openDirectMessage(id, username, preload) {
  if (typeof abandonMessageEdit === "function") abandonMessageEdit();
  if (typeof abandonAnnouncementEdit === "function") abandonAnnouncementEdit();
  if (typeof abandonForumEdit === "function") abandonForumEdit();
  if (typeof clearPendingAttach === "function") clearPendingAttach();
  if (typeof clearPendingReply === "function") clearPendingReply();
  if (typeof resetTypingOnLeave === "function") resetTypingOnLeave();
  const readyMessages = preload && Array.isArray(preload.messages) ? preload.messages : null;
  const cachedMessages = readyMessages ? null : (typeof recallPlaceMessages === "function" ? recallPlaceMessages("dm", id) : null);
  const token = beginPlace({
    view: "chat",
    titleEl: "chat-header-title",
    title: username,
    hideMembers: true,
    hold: (readyMessages != null || (cachedMessages && cachedMessages.length)) ? null : ["chat-messages"]
  });
  openChatType = "dm";
  openChatId = id;
  openChatName = username;
  document.querySelectorAll("#secondary-nav .nav-item").forEach(b => b.classList.remove("active"));
  if (typeof setHeaderDescription === "function") setHeaderDescription("chat-header-desc", "");
  const chatActions = document.getElementById("chat-header-actions");
  if (chatActions) chatActions.hidden = false;
  enableComposer();
  ensureConversationPresent(id, username);
  if (typeof captureNewMessagesIntent === "function") captureNewMessagesIntent("dm", id);
  clearUnread("dm", id);
  if (typeof closePinsPanel === "function") closePinsPanel();
  if (typeof setChatSearchPlaceholder === "function") setChatSearchPlaceholder("Search @" + username);
  if (typeof syncChatSearchPlacement === "function") syncChatSearchPlacement();

  const chatEmpty = document.getElementById("chat-empty");
  const chatMessages = document.getElementById("chat-messages");
  chatEmpty.style.display = "none";
  chatMessages.style.display = "block";
  currentMessages = [];
  hasMoreHistory = true;
  isLoadingMore = false;
  if (cachedMessages && cachedMessages.length) {
    currentMessages = cachedMessages;
    renderMessages();
  }

  if (readyMessages) {
    currentMessages = mapDmApiMessages(readyMessages, id, username);
    if (currentMessages.length < 25) hasMoreHistory = false;
    if (typeof rememberPlaceMessages === "function") rememberPlaceMessages("dm", id, currentMessages);
    renderMessages();
  } else {
    const historyFetch = fetch(`https://${serverAddress}/messages/${id}`, { credentials: "include" });
    try {
      const response = await historyFetch;
      if (!bodyIsCurrent(token)) return;
      if (!response.ok) { renderMessages(); }
      else {
        const data = await response.json();
        if (!bodyIsCurrent(token)) return;
        currentMessages = mapDmApiMessages(data.messages, id, username);
        if (currentMessages.length < 25) hasMoreHistory = false;
        if (typeof rememberPlaceMessages === "function") rememberPlaceMessages("dm", id, currentMessages);
        renderMessages();
      }
    } catch (e) {
      if (!bodyIsCurrent(token)) return;
      renderMessages();
    }
  }
  if (!bodyIsCurrent(token)) return;
  if (typeof stampDmView === "function") stampDmView(id);
  if (typeof syncPinsForOpenChat === "function") syncPinsForOpenChat();
  if (typeof refreshOpenCall === "function") refreshOpenCall();
}

// Mirrors openDirectMessage exactly, pointed at party endpoints -
// everything downstream works off openChatType/openChatId/currentMessages.
async function openParty(id, name, preload) {
  if (typeof abandonMessageEdit === "function") abandonMessageEdit();
  if (typeof abandonAnnouncementEdit === "function") abandonAnnouncementEdit();
  if (typeof abandonForumEdit === "function") abandonForumEdit();
  if (typeof clearPendingAttach === "function") clearPendingAttach();
  if (typeof clearPendingReply === "function") clearPendingReply();
  if (typeof resetTypingOnLeave === "function") resetTypingOnLeave();
  const readyMessages = preload && Array.isArray(preload.messages) ? preload.messages : null;
  const cachedMessages = readyMessages ? null : (typeof recallPlaceMessages === "function" ? recallPlaceMessages("party", id) : null);
  const token = beginPlace({
    view: "chat",
    titleEl: "chat-header-title",
    title: name,
    members: true,
    hold: (readyMessages != null || (cachedMessages && cachedMessages.length)) ? null : ["chat-messages"]
  });
  openChatType = "party";
  openChatId = id;
  openChatName = name;
  document.querySelectorAll("#secondary-nav .nav-item").forEach(b => b.classList.remove("active"));
  if (typeof setHeaderDescription === "function") setHeaderDescription("chat-header-desc", "");
  const chatActions = document.getElementById("chat-header-actions");
  if (chatActions) chatActions.hidden = false;
  enableComposer();
  if (typeof captureNewMessagesIntent === "function") captureNewMessagesIntent("party", id);
  clearUnread("party", id);
  if (typeof closePinsPanel === "function") closePinsPanel();
  if (typeof setChatSearchPlaceholder === "function") setChatSearchPlaceholder("Search " + name);
  if (typeof syncChatSearchPlacement === "function") syncChatSearchPlacement();

  const chatEmpty = document.getElementById("chat-empty");
  const chatMessages = document.getElementById("chat-messages");
  chatEmpty.style.display = "none";
  chatMessages.style.display = "block";
  currentMessages = [];
  hasMoreHistory = true;
  isLoadingMore = false;
  if (cachedMessages && cachedMessages.length) {
    currentMessages = cachedMessages;
    renderMessages();
  }

  if (preload && Array.isArray(preload.members) && typeof applyPartyMembers === "function") {
    applyPartyMembers(id, preload.members);
  } else if (typeof loadMemberList === "function") {
    loadMemberList("party", id);
  }
  if (readyMessages) {
    currentMessages = mapPartyApiMessages(readyMessages);
    if (currentMessages.length < 25) hasMoreHistory = false;
    if (typeof rememberPlaceMessages === "function") rememberPlaceMessages("party", id, currentMessages);
    renderMessages();
  } else {
    const historyFetch = fetch(`https://${serverAddress}/get_party_messages/${id}`, { credentials: "include" });
    try {
      const response = await historyFetch;
      if (!bodyIsCurrent(token)) return;
      if (!response.ok) { renderMessages(); }
      else {
        const data = await response.json();
        if (!bodyIsCurrent(token)) return;
        currentMessages = mapPartyApiMessages(data.messages);
        if (currentMessages.length < 25) hasMoreHistory = false;
        if (typeof rememberPlaceMessages === "function") rememberPlaceMessages("party", id, currentMessages);
        renderMessages();
      }
    } catch (e) {
      if (!bodyIsCurrent(token)) return;
      renderMessages();
    }
  }
  if (!bodyIsCurrent(token)) return;
  if (typeof stampPartyView === "function") stampPartyView(id);
  if (typeof syncPinsForOpenChat === "function") syncPinsForOpenChat();
  if (typeof refreshOpenCall === "function") refreshOpenCall();
}
