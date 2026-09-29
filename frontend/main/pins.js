let pinsPanelOpen = false;
let pinsScopeKind = null;
let pinsScopeId = null;
let pinsPage = 1;
let pinsPages = 1;
let pinsCanPin = true;
let pinsIdSet = new Set();
let pinsJumpHighlightId = null;

function pinKey(kind, messageId) {
  return String(kind) + ":" + String(messageId);
}

function isMessagePinned(kind, messageId) {
  return pinsIdSet.has(pinKey(kind, messageId));
}

function rememberPinIds(rows) {
  pinsIdSet = new Set();
  (rows || []).forEach((row) => {
    if (row && row.kind != null && row.message_id != null) {
      pinsIdSet.add(pinKey(row.kind, row.message_id));
    }
  });
}

function canPinInCurrentScope() {
  if (openChatType === "dm" || openChatType === "party") return true;
  if (typeof canPinMessages === "function") return canPinMessages();
  return true;
}

async function resolveCurrentPinScope() {
  if (openChatType === "dm" && openChatId) {
    const response = await fetch(`https://${serverAddress}/dm_pin_scope/${openChatId}`, { credentials: "include" });
    if (!response.ok) return null;
    const data = await response.json();
    return { kind: data.scope_kind || "dm", id: data.scope_id };
  }
  if (openChatType === "party" && openChatId) {
    return { kind: "party", id: openChatId };
  }
  if (currentChannelId) {
    return { kind: "channel", id: currentChannelId };
  }
  return null;
}

async function refreshPinIdsForScope(scope) {
  if (!scope) {
    rememberPinIds([]);
    return;
  }
  try {
    const response = await fetch(
      `https://${serverAddress}/pin_ids/${scope.kind}/${scope.id}`,
      { credentials: "include" }
    );
    if (!response.ok) {
      rememberPinIds([]);
      return;
    }
    const data = await response.json();
    rememberPinIds(data.pins || []);
  } catch (e) {
    rememberPinIds([]);
  }
}

async function syncPinsForOpenChat() {
  const scope = await resolveCurrentPinScope();
  pinsScopeKind = scope ? scope.kind : null;
  pinsScopeId = scope ? scope.id : null;
  await refreshPinIdsForScope(scope);
}

function closePinsPanel() {
  pinsPanelOpen = false;
  const panel = document.getElementById("pins-panel");
  if (panel) panel.hidden = true;
}

function ensurePinsPanel() {
  let panel = document.getElementById("pins-panel");
  if (panel) return panel;
  panel = document.createElement("div");
  panel.id = "pins-panel";
  panel.hidden = true;
  panel.innerHTML = [
    '<div class="pins-panel-header">',
    '<div class="pins-panel-title"><span class="pins-panel-pin-icon" aria-hidden="true">📌</span>Pinned Messages</div>',
    '<button type="button" class="pins-panel-close" id="pins-panel-close" title="Close">&times;</button>',
    "</div>",
    '<div class="pins-panel-body" id="pins-panel-body"></div>',
    '<div class="pins-panel-footer" id="pins-panel-footer" hidden></div>',
  ].join("");
  const host = document.getElementById("main-panel") || document.body;
  host.appendChild(panel);
  document.getElementById("pins-panel-close").addEventListener("click", () => closePinsPanel());
  return panel;
}

async function togglePinsPanel() {
  if (pinsPanelOpen) {
    closePinsPanel();
    return;
  }
  await openPinsPanel(1);
}

async function openPinsPanel(page) {
  const scope = await resolveCurrentPinScope();
  if (!scope) return;
  pinsScopeKind = scope.kind;
  pinsScopeId = scope.id;
  pinsPage = Math.max(1, page || 1);
  const panel = ensurePinsPanel();
  pinsPanelOpen = true;
  panel.hidden = false;
  const body = document.getElementById("pins-panel-body");
  const footer = document.getElementById("pins-panel-footer");
  if (body) body.replaceChildren();
  if (footer) {
    footer.hidden = true;
    footer.replaceChildren();
  }
  try {
    const response = await fetch(
      `https://${serverAddress}/pins/${scope.kind}/${scope.id}?page=${pinsPage}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (body) {
        const empty = document.createElement("div");
        empty.className = "pins-panel-empty";
        empty.textContent = (typeof data.detail === "string" && data.detail) || "Could not load pins.";
        body.appendChild(empty);
      }
      return;
    }
    pinsPages = data.pages || 1;
    pinsCanPin = data.can_pin !== false;
    paintPinsPanel(data.messages || [], data);
  } catch (e) {
    if (body) {
      const empty = document.createElement("div");
      empty.className = "pins-panel-empty";
      empty.textContent = "Could not load pins.";
      body.appendChild(empty);
    }
  }
}

function paintPinsPanel(messages, meta) {
  const body = document.getElementById("pins-panel-body");
  const footer = document.getElementById("pins-panel-footer");
  if (!body) return;
  body.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "pins-panel-empty";
    empty.textContent = "This chat doesn't have any pinned messages...yet.";
    body.appendChild(empty);
  } else {
    messages.forEach((row) => body.appendChild(buildPinRow(row)));
  }
  if (!footer) return;
  footer.replaceChildren();
  const pages = meta && meta.pages ? meta.pages : 1;
  const page = meta && meta.page ? meta.page : 1;
  if (pages <= 1) {
    footer.hidden = true;
    return;
  }
  footer.hidden = false;
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "settings-row-btn";
  prev.textContent = "Previous";
  prev.disabled = page <= 1;
  prev.addEventListener("click", () => openPinsPanel(page - 1));
  const label = document.createElement("span");
  label.className = "pins-page-label";
  label.textContent = "Page " + page + " of " + pages;
  const next = document.createElement("button");
  next.type = "button";
  next.className = "settings-row-btn";
  next.textContent = "Next";
  next.disabled = page >= pages;
  next.addEventListener("click", () => openPinsPanel(page + 1));
  footer.appendChild(prev);
  footer.appendChild(label);
  footer.appendChild(next);
}

function buildPinRow(row) {
  const card = document.createElement("div");
  card.className = "pin-row";
  card.dataset.messageKind = row.message_kind || row.chat_kind || "";
  card.dataset.messageId = String(row.message_id || row.id || "");

  const actions = document.createElement("div");
  actions.className = "pin-row-actions";
  const jump = document.createElement("button");
  jump.type = "button";
  jump.className = "pin-row-jump";
  jump.textContent = "Jump";
  jump.addEventListener("click", (e) => {
    e.stopPropagation();
    jumpToPinnedMessage(row);
  });
  actions.appendChild(jump);
  if (pinsCanPin || canPinInCurrentScope()) {
    const unpin = document.createElement("button");
    unpin.type = "button";
    unpin.className = "pin-row-unpin";
    unpin.title = "Unpin";
    unpin.textContent = "×";
    unpin.addEventListener("click", (e) => {
      e.stopPropagation();
      unpinMessageFromPins(row);
    });
    actions.appendChild(unpin);
  }
  card.appendChild(actions);

  const msg = mapPinRowToMessage(row);
  const wrap = document.createElement("div");
  wrap.className = "pin-row-message";
  if (typeof startNewCluster === "function") {
    startNewCluster(wrap, msg);
  } else {
    const fallback = document.createElement("div");
    fallback.textContent = (msg.username || "") + ": " + (msg.content || "");
    wrap.appendChild(fallback);
  }
  card.appendChild(wrap);
  card.addEventListener("click", () => jumpToPinnedMessage(row));
  card.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof openContextMenu !== "function") return;
    const items = [];
    if (pinsCanPin || canPinInCurrentScope()) {
      items.push({ label: "Unpin", onSelect: () => unpinMessageFromPins(row) });
    }
    items.push({ label: "Jump", onSelect: () => jumpToPinnedMessage(row) });
    openContextMenu(e.clientX, e.clientY, {
      avatarText: typeof avatarLetter === "function" ? avatarLetter(msg.username) : "?",
      title: msg.username || "Message",
      timestamp: typeof formatClusterTime === "function" ? formatClusterTime(msg.time) : "",
      subtitle: typeof truncateForContextMenu === "function" ? truncateForContextMenu(msg.content) : (msg.content || ""),
    }, items);
  });
  return card;
}

function mapPinRowToMessage(row) {
  const kind = row.message_kind || row.chat_kind || "channel";
  return {
    id: row.message_id || row.id,
    chatKind: kind === "forum_post" || kind === "announcement" || kind === "comment" ? kind : kind,
    isMine: Number(row.sender_id) === Number(myUserId),
    senderId: row.sender_id,
    username: row.username || "",
    content: row.content || "",
    attachment: typeof parseAttachment === "function" ? parseAttachment(row.attachment) : row.attachment,
    time: row.timestamp ? new Date(row.timestamp) : new Date(),
    edited: !!row.edited,
    reactions: typeof applyReactionMe === "function" ? applyReactionMe(row.reactions || []) : (row.reactions || []),
    avatar: row.avatar || null,
    title: row.title || "",
    body: row.body || "",
    postId: row.post_id || null,
    channelId: row.channel_id || null,
  };
}

async function pinOrUnpinMessage(msg, wantPinned) {
  if (!msg || !msg.id || !msg.chatKind) return;
  if (!canPinInCurrentScope() && (msg.chatKind === "channel" || msg.chatKind === "forum" || msg.chatKind === "forum_post" || msg.chatKind === "announcement" || msg.chatKind === "comment")) {
    return;
  }
  const path = wantPinned ? "/pin_message" : "/unpin_message";
  try {
    const response = await fetch(`https://${serverAddress}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind: msg.chatKind, message_id: msg.id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Pin failed:", data.detail || response.status);
      return;
    }
    const key = pinKey(msg.chatKind, msg.id);
    if (wantPinned) pinsIdSet.add(key);
    else pinsIdSet.delete(key);
    if (data.scope_kind && data.scope_id != null) {
      pinsScopeKind = data.scope_kind;
      pinsScopeId = data.scope_id;
    }
    if (pinsPanelOpen) openPinsPanel(pinsPage);
  } catch (e) {
    console.error("Pin failed, network error:", e);
  }
}

async function unpinMessageFromPins(row) {
  const kind = row.message_kind || row.chat_kind;
  const id = row.message_id || row.id;
  await pinOrUnpinMessage({ chatKind: kind, id: id }, false);
}

function highlightMessageInView(messageId) {
  const target = document.querySelector(`[data-message-id="${CSS.escape(String(messageId))}"]`);
  if (!target) return false;
  target.scrollIntoView({ block: "center" });
  target.classList.add("pin-jump-flash");
  setTimeout(() => target.classList.remove("pin-jump-flash"), 1600);
  return true;
}

async function jumpToPinnedMessage(row) {
  const kind = row.message_kind || row.chat_kind;
  const messageId = row.message_id || row.id;
  if (!kind || !messageId) return;

  if (kind === "dm" || kind === "party") {
    if (highlightMessageInView(messageId)) return;
    await jumpLoadAroundChat(kind, messageId);
    highlightMessageInView(messageId);
    return;
  }

  if (kind === "channel") {
    if (highlightMessageInView(messageId)) return;
    await jumpLoadAroundChannel(messageId);
    highlightMessageInView(messageId);
    return;
  }

  if (kind === "forum") {
    const postId = row.post_id;
    if (postId && Number(openForumPostId) !== Number(postId)) {
      if (typeof openForumPost === "function") {
        await openForumPost({ id: postId, title: row.title || "Topic", body: "", attachment: null });
      }
    }
    if (highlightMessageInView(messageId)) return;
    await jumpLoadAroundForum(postId || openForumPostId, messageId);
    highlightMessageInView(messageId);
    return;
  }

  if (kind === "forum_post") {
    if (typeof openForumPost === "function") {
      await openForumPost({
        id: messageId,
        title: row.title || "Topic",
        body: row.body || "",
        attachment: row.attachment || null,
        edited: !!row.edited,
      });
    }
    const start = document.querySelector(".forum-start-card, .channel-start-card");
    if (start) start.scrollIntoView({ block: "center" });
    return;
  }

  if (kind === "announcement") {
    const el = document.querySelector(`.announce-card[data-post-id="${CSS.escape(String(messageId))}"]`);
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.classList.add("pin-jump-flash");
      setTimeout(() => el.classList.remove("pin-jump-flash"), 1600);
    }
    return;
  }

  if (kind === "comment") {
    const el = document.querySelector(`[data-comment-id="${CSS.escape(String(messageId))}"]`);
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.classList.add("pin-jump-flash");
      setTimeout(() => el.classList.remove("pin-jump-flash"), 1600);
    }
  }
}

async function jumpLoadAroundChat(kind, messageId) {
  if (!openChatId) return;
  const url = kind === "party"
    ? `https://${serverAddress}/get_party_messages/${openChatId}?around_id=${messageId}`
    : `https://${serverAddress}/messages/${openChatId}?around_id=${messageId}`;
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const username = openChatName;
    currentMessages = (data.messages || []).map((msg) => {
      const isMine = kind === "dm" ? msg.sender_id !== openChatId : msg.sender_id === myUserId;
      const mapped = (typeof applyDeletionFields === "function" ? applyDeletionFields : (o) => o)({
        id: msg.id,
        chatKind: kind,
        isMine,
        senderId: msg.sender_id,
        username: isMine ? myUsername : (msg.username || username),
        content: msg.content,
        attachment: typeof parseAttachment === "function" ? parseAttachment(msg.attachment) : msg.attachment,
        time: new Date(msg.timestamp),
        avatar: msg.avatar || null,
        permaban: !!msg.permaban,
      }, msg);
      if (typeof takeMessageAvatar === "function") takeMessageAvatar(mapped, msg);
      return typeof applyMentionFields === "function" ? applyMentionFields(mapped, msg) : mapped;
    });
    hasMoreHistory = true;
    if (typeof renderMessages === "function") renderMessages({ preserveScroll: true });
  } catch (e) {}
}

async function jumpLoadAroundChannel(messageId) {
  if (!currentChannelId) return;
  try {
    const response = await fetch(
      `https://${serverAddress}/get_channel_history/${currentChannelId}?around_id=${messageId}`,
      { credentials: "include" }
    );
    if (!response.ok) return;
    const data = await response.json();
    currentChannelMessages = (data.messages || []).map((msg) => {
      const mapped = {
        id: msg.id,
        chatKind: "channel",
        isMine: msg.sender_id === myUserId,
        senderId: msg.sender_id,
        username: msg.username,
        content: msg.content,
        attachment: typeof parseAttachment === "function" ? parseAttachment(msg.attachment) : msg.attachment,
        time: new Date(msg.timestamp),
        edited: !!msg.edited,
        reactions: typeof applyReactionMe === "function" ? applyReactionMe(msg.reactions || []) : (msg.reactions || []),
        avatar: msg.avatar || null,
        nameRole: msg.name_role || null,
        permaban: !!msg.permaban,
      };
      if (typeof takeMessageAvatar === "function") takeMessageAvatar(mapped, msg);
      return typeof applyMentionFields === "function" ? applyMentionFields(mapped, msg) : mapped;
    });
    channelHasMoreHistory = true;
    if (typeof renderChannelMessages === "function") renderChannelMessages({ preserveScroll: true });
  } catch (e) {}
}

async function jumpLoadAroundForum(postId, messageId) {
  if (!postId) return;
  try {
    const response = await fetch(
      `https://${serverAddress}/get_forum_messages/${postId}?around_id=${messageId}`,
      { credentials: "include" }
    );
    if (!response.ok) return;
    const data = await response.json();
    currentChannelMessages = (data.forum_post_messages || []).map((msg) => {
      const mapped = {
        id: msg.id,
        chatKind: "forum",
        isMine: msg.author_id === myUserId,
        senderId: msg.author_id,
        username: msg.username,
        content: msg.content,
        attachment: typeof parseAttachment === "function" ? parseAttachment(msg.attachment) : msg.attachment,
        time: typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(msg.timestamp) : new Date(msg.timestamp),
        edited: !!msg.edited,
        reactions: typeof applyReactionMe === "function" ? applyReactionMe(msg.reactions || []) : (msg.reactions || []),
        avatar: msg.avatar || null,
        nameRole: msg.name_role || null,
      };
      if (typeof takeMessageAvatar === "function") takeMessageAvatar(mapped, msg);
      return typeof applyMentionFields === "function" ? applyMentionFields(mapped, msg) : mapped;
    });
    channelHasMoreHistory = true;
    if (typeof renderChannelMessages === "function") renderChannelMessages({ preserveScroll: true });
  } catch (e) {}
}

function applyPinRealtime(data) {
  if (!data) return;
  if (pinsScopeKind && pinsScopeId != null
    && String(data.scope_kind) === String(pinsScopeKind)
    && Number(data.scope_id) === Number(pinsScopeId)) {
    const key = pinKey(data.message_kind, data.message_id);
    if (data.type === "message_pinned") pinsIdSet.add(key);
    if (data.type === "message_unpinned") pinsIdSet.delete(key);
    if (pinsPanelOpen) openPinsPanel(pinsPage);
  }
}

(function bindPinsButtons() {
  const chatPins = document.getElementById("chat-pins-btn");
  if (chatPins) chatPins.addEventListener("click", () => togglePinsPanel());
  const channelPins = document.getElementById("channel-pins-btn");
  if (channelPins) channelPins.addEventListener("click", () => togglePinsPanel());
})();
