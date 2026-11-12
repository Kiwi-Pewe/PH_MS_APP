function profileChatRoomMode(props) {
  return props && props.mode === "profile" ? "profile" : "rooms";
}

function profileChatRoomTitle(props) {
  const title = String((props && props.title) || "").trim();
  if (title) return title;
  return profileChatRoomMode(props) === "profile" ? "Profile chat" : "Chat rooms";
}

function profileChatOwnerId() {
  return typeof profileOwnerId !== "undefined" ? profileOwnerId : null;
}

function profileChatPreview(el) {
  return !!(el && el.closest && el.closest(".is-opt-preview"));
}

function bindProfileChatPointer(el) {
  if (!el) return;
  const stop = (e) => e.stopPropagation();
  el.addEventListener("pointerdown", stop);
  el.addEventListener("mousedown", stop);
  el.addEventListener("click", stop);
}

function profileChatTiles() {
  return Array.from(document.querySelectorAll(".profile-tile.is-chat_room"));
}

function mapProfileChatMessage(msg, kind) {
  const mapped = {
    id: msg.id,
    tempId: msg.temp_id || msg.tempId,
    chatKind: kind || "profile",
    isMine: msg.sender_id === myUserId || msg.username === myUsername,
    senderId: msg.sender_id,
    username: msg.username || "",
    nickname: msg.display_name || msg.nickname || msg.username || "",
    content: msg.content || "",
    attachment: typeof parseAttachment === "function" ? parseAttachment(msg.attachment) : (msg.attachment || null),
    time: typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(msg.timestamp) : new Date(msg.timestamp),
    edited: !!msg.edited,
    reactions: msg.reactions || [],
    avatar: msg.avatar || null,
    replyTo: msg.reply_to || msg.replyTo || null,
    mentioned: !!msg.mentioned
  };
  if (typeof applyMentionFields === "function") applyMentionFields(mapped, msg);
  if (kind === "room" && typeof communityRoomMessageView === "function") return communityRoomMessageView(mapped);
  return mapped;
}

function paintProfileChatLog(log, messages) {
  if (!log) return;
  if (typeof applyChatLogSelfSide === "function") applyChatLogSelfSide(log);
  log.replaceChildren();
  if (!messages || !messages.length) {
    const empty = document.createElement("div");
    empty.className = "profile-chat-room-empty";
    empty.textContent = "There's no messages yet.";
    log.appendChild(empty);
    return;
  }
  try {
    if (typeof renderClusteredMessages === "function") renderClusteredMessages(log, messages);
  } catch (err) {
    const empty = document.createElement("div");
    empty.className = "profile-chat-room-empty";
    empty.textContent = "There's no messages yet.";
    log.appendChild(empty);
  }
  log.scrollTop = log.scrollHeight;
}

function paintProfileChatRoomCard(row) {
  const card = document.createElement("div");
  card.className = "community-room profile-chat-room-card";
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  const head = document.createElement("div");
  head.className = "community-room-head";
  const titleWrap = document.createElement("div");
  titleWrap.className = "community-room-title";
  const name = document.createElement("div");
  name.className = "community-room-name";
  name.textContent = row.name || "Room";
  const by = document.createElement("div");
  by.className = "community-room-by";
  by.textContent = "By: " + (row.handle || "user");
  titleWrap.appendChild(name);
  titleWrap.appendChild(by);
  head.appendChild(titleWrap);
  const mid = document.createElement("div");
  mid.className = "community-room-mid";
  const about = document.createElement("div");
  about.className = "community-room-about" + (row.about ? "" : " is-empty");
  about.textContent = row.about || "No description.";
  mid.appendChild(about);
  const foot = document.createElement("div");
  foot.className = "community-room-foot";
  const pills = document.createElement("div");
  pills.className = "community-post-pills";
  (row.topics || []).forEach((topic) => {
    const pill = document.createElement("span");
    pill.className = "community-post-pill";
    pill.textContent = topic;
    pills.appendChild(pill);
  });
  const meta = document.createElement("div");
  meta.className = "community-room-meta";
  meta.textContent = String(row.n || 0) + " / 15";
  foot.appendChild(pills);
  foot.appendChild(meta);
  card.appendChild(head);
  card.appendChild(mid);
  card.appendChild(foot);
  return card;
}

function setProfileChatComposer(state, enabled, placeholder) {
  state.canSend = !!enabled;
  if (state.root) state.root.classList.toggle("has-compose", !!enabled);
  if (state.input) {
    state.input.placeholder = placeholder || "Message";
    state.input.disabled = !enabled;
  }
  if (state.sendBtn) state.sendBtn.disabled = !enabled;
  if (state.plusBtn) state.plusBtn.disabled = !enabled;
  if (state.emojiBtn) state.emojiBtn.disabled = !enabled;
}

function paintProfileChatAttachPreviews() {
  profileChatTiles().forEach((el) => {
    const state = el._profileChat;
    if (state && state.attachPreview && typeof fillAttachPreview === "function") {
      fillAttachPreview(state.attachPreview);
    }
  });
}

function paintProfileChatRoomComposer(state) {
  const wrap = document.createElement("div");
  wrap.className = "profile-chat-room-compose-wrap";
  const preview = document.createElement("div");
  preview.className = "attach-preview";
  preview.hidden = true;
  bindProfileChatPointer(preview);
  const row = document.createElement("div");
  row.className = "profile-chat-room-compose";
  bindProfileChatPointer(row);
  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "icon-btn profile-chat-room-icon";
  plus.textContent = "+";
  plus.title = "Attach image or video";
  plus.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!state.canSend || plus.disabled || profileChatPreview(wrap)) return;
    if (typeof attachDestination !== "undefined") attachDestination = "composer";
    if (typeof openMediaPicker === "function") openMediaPicker();
  });
  const input = document.createElement("textarea");
  input.className = "profile-chat-room-input";
  input.rows = 1;
  input.placeholder = "Message";
  const emoji = document.createElement("button");
  emoji.type = "button";
  emoji.className = "icon-btn profile-chat-room-icon";
  emoji.textContent = "\u{1F600}";
  emoji.title = "Emoji";
  emoji.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!state.canSend || emoji.disabled || profileChatPreview(wrap)) return;
    if (typeof openEmojiPicker === "function") openEmojiPicker(emoji, input, e.clientX, e.clientY);
  });
  const send = document.createElement("button");
  send.type = "button";
  send.className = "pill-btn profile-chat-room-send";
  send.textContent = "Send";
  function fire() {
    if (!state.canSend || profileChatPreview(wrap) || input.disabled) return;
    if (state.mode === "profile") sendProfileChatMessage(state, input);
    else sendProfileChatRoomMessage(state, input);
  }
  send.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fire();
  });
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    fire();
  });
  input.addEventListener("paste", (e) => {
    const files = e.clipboardData && e.clipboardData.files;
    if (!files || !files.length) return;
    e.preventDefault();
    if (typeof attachDestination !== "undefined") attachDestination = "composer";
    if (typeof setPendingFile === "function") setPendingFile(files[0]);
  });
  const leftRule = document.createElement("div");
  leftRule.className = "profile-chat-room-compose-rule";
  const rightRule = document.createElement("div");
  rightRule.className = "profile-chat-room-compose-rule";
  row.appendChild(plus);
  row.appendChild(leftRule);
  row.appendChild(input);
  row.appendChild(rightRule);
  row.appendChild(emoji);
  row.appendChild(send);
  wrap.appendChild(preview);
  wrap.appendChild(row);
  state.input = input;
  state.sendBtn = send;
  state.plusBtn = plus;
  state.emojiBtn = emoji;
  state.attachPreview = preview;
  return wrap;
}

function paintProfileChatRoomThread(host, state, title, showBack, onBack) {
  host.replaceChildren();
  if (showBack) {
    const head = document.createElement("div");
    head.className = "profile-chat-room-chat-head";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "ghost-btn";
    back.textContent = "Rooms";
    bindProfileChatPointer(back);
    back.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof onBack === "function") onBack();
    });
    const name = document.createElement("div");
    name.className = "profile-chat-room-chat-title";
    name.textContent = title;
    head.appendChild(back);
    head.appendChild(name);
    host.appendChild(head);
  }
  const log = document.createElement("div");
  log.className = "profile-chat-room-log";
  if (typeof applyChatLogSelfSide === "function") applyChatLogSelfSide(log);
  else log.classList.add("self-right");
  host.appendChild(log);
  state.log = log;
  paintProfileChatLog(log, state.messages);
}

function paintProfileChatRoomPicker(host, state, rooms, onPick) {
  host.replaceChildren();
  state.log = null;
  state.roomId = null;
  state.messages = [];
  if (!rooms.length) {
    const empty = document.createElement("div");
    empty.className = "profile-chat-room-empty";
    empty.textContent = "No rooms found";
    host.appendChild(empty);
    return;
  }
  const list = document.createElement("div");
  list.className = "profile-chat-room-list";
  rooms.forEach((row) => {
    const card = paintProfileChatRoomCard(row);
    bindProfileChatPointer(card);
    const pick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (profileChatPreview(host)) return;
      if (!row.joined) return;
      if (typeof onPick === "function") onPick(row);
    };
    card.addEventListener("click", pick);
    card.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      pick(e);
    });
    list.appendChild(card);
  });
  host.appendChild(list);
}

function profileChatWatch(ownerId) {
  if (!ownerId || !ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: "profile_chat_view", owner_id: ownerId }));
}

function leaveProfileChatWatch() {
  const ownerId = profileChatOwnerId();
  if (ownerId && ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "profile_chat_leave", owner_id: ownerId }));
  }
}

async function loadProfileChatRooms(ownerId, shared) {
  const response = await profileApi(
    "/profile/" + encodeURIComponent(ownerId) + "/chat_rooms" + (shared ? "?shared=true" : "")
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  return data.rooms || [];
}

async function loadProfileChatThread(ownerId) {
  const response = await profileApi("/profile/" + encodeURIComponent(ownerId) + "/chat");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  profileChatWatch(ownerId);
  return (data.messages || []).map((row) => mapProfileChatMessage(row, "profile"));
}

async function loadProfileWidgetRoomMessages(roomId) {
  const response = await fetch("https://" + serverAddress + "/community_rooms/" + encodeURIComponent(roomId) + "/messages", {
    credentials: "include"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  return (data.messages || []).map((row) => {
    if (typeof mapCommunityRoomMessage === "function") return mapCommunityRoomMessage(row);
    return mapProfileChatMessage(row, "room");
  });
}

async function sendProfileChatRoomMessage(state, input) {
  const content = input ? String(input.value || "").trim() : "";
  if ((!content && !pendingAttach) || !state.roomId || !ws || ws.readyState !== 1) return;
  if (pendingAttach && pendingAttach.busy) return;
  let attachment = null;
  if (pendingAttach && typeof uploadPendingIfNeeded === "function") {
    try {
      attachment = await uploadPendingIfNeeded();
    } catch (err) {
      return;
    }
  }
  const tempId = typeof nextMessageTempId === "function" ? nextMessageTempId() : ("tmp-" + Date.now());
  const stored = typeof encodeMentions === "function" ? encodeMentions(content, false) : content;
  ws.send(JSON.stringify({
    type: "room_message",
    room_id: state.roomId,
    content: content,
    attachment: attachment,
    temp_id: tempId
  }));
  const mapped = typeof mapCommunityRoomMessage === "function"
    ? mapCommunityRoomMessage({
      temp_id: tempId,
      sender_id: myUserId,
      username: myUsername || "",
      display_name: typeof myDisplayName !== "undefined" ? myDisplayName : "",
      content: stored,
      attachment: attachment,
      timestamp: new Date().toISOString(),
      avatar: typeof faceForUser === "function" ? faceForUser(myUserId) : null
    })
    : mapProfileChatMessage({
      temp_id: tempId,
      sender_id: myUserId,
      username: myUsername || "",
      content: stored,
      attachment: attachment,
      timestamp: new Date().toISOString()
    }, "room");
  state.messages.push(mapped);
  paintProfileChatLog(state.log, state.messages);
  if (typeof communityOpenRoom !== "undefined" && String(communityOpenRoom) === String(state.roomId)) {
    communityRoomMessages.push(mapped);
    if (typeof paintCommunityRoomChat === "function") paintCommunityRoomChat();
  }
  if (input) input.value = "";
  if (typeof clearPendingAttach === "function") clearPendingAttach();
}

async function sendProfileChatMessage(state, input) {
  const content = input ? String(input.value || "").trim() : "";
  const ownerId = profileChatOwnerId();
  if ((!content && !pendingAttach) || !ownerId) return;
  if (pendingAttach && pendingAttach.busy) return;
  let attachment = null;
  if (pendingAttach && typeof uploadPendingIfNeeded === "function") {
    try {
      attachment = await uploadPendingIfNeeded();
    } catch (err) {
      return;
    }
  }
  if (input) input.value = "";
  try {
    const response = await profileApi("/profile/" + encodeURIComponent(ownerId) + "/chat", {
      method: "POST",
      body: JSON.stringify({ content: content, attachment: attachment })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    if (typeof clearPendingAttach === "function") clearPendingAttach();
    applyProfileChatMessage({ owner_id: ownerId, message: data });
  } catch (err) {
    return;
  }
}

function applyProfileChatRoomMessage(data) {
  if (!data || !data.room_id) return;
  if (data.sender_id && typeof isUserBlocked === "function" && isUserBlocked(data.sender_id)) return;
  const mapped = typeof mapCommunityRoomMessage === "function"
    ? mapCommunityRoomMessage(data)
    : mapProfileChatMessage(data, "room");
  profileChatTiles().forEach((el) => {
    const state = el._profileChat;
    if (!state || state.mode !== "rooms" || String(state.roomId) !== String(data.room_id)) return;
    if (data.id && state.messages.some((row) => row.id === data.id)) return;
    if (data.temp_id && state.messages.some((row) => row.tempId === data.temp_id)) return;
    state.messages.push(mapped);
    paintProfileChatLog(state.log, state.messages);
  });
}

function ackProfileChatRoomMessage(tempId, id) {
  if (!tempId) return;
  profileChatTiles().forEach((el) => {
    const state = el._profileChat;
    if (!state || !state.messages) return;
    const row = state.messages.find((item) => item.tempId === tempId);
    if (row) row.id = id;
  });
}

function dropProfileChatRoomTemp(tempId) {
  if (!tempId) return false;
  let hit = false;
  profileChatTiles().forEach((el) => {
    const state = el._profileChat;
    if (!state || !state.messages) return;
    const before = state.messages.length;
    state.messages = state.messages.filter((row) => row.tempId !== tempId);
    if (state.messages.length === before) return;
    hit = true;
    paintProfileChatLog(state.log, state.messages);
  });
  return hit;
}

function applyProfileChatRoomClosed(data) {
  if (!data || data.room_id == null) return;
  profileChatTiles().forEach((el) => {
    const state = el._profileChat;
    if (!state || state.mode !== "rooms") return;
    if (String(state.roomId) !== String(data.room_id)) return;
    if (typeof state.showPicker === "function") state.showPicker();
  });
}

function applyProfileChatMessage(data) {
  const ownerId = data && data.owner_id;
  const msg = data && data.message;
  if (!ownerId || !msg || String(ownerId) !== String(profileChatOwnerId() || "")) return;
  if (msg.sender_id && typeof isUserBlocked === "function" && isUserBlocked(msg.sender_id)) return;
  const mapped = mapProfileChatMessage(msg, "profile");
  profileChatTiles().forEach((el) => {
    const state = el._profileChat;
    if (!state || state.mode !== "profile") return;
    if (mapped.id && state.messages.some((row) => row.id === mapped.id)) return;
    state.messages.push(mapped);
    while (state.messages.length > 25) state.messages.shift();
    paintProfileChatLog(state.log, state.messages);
  });
}

function applyProfileChatCleared(data) {
  const ownerId = data && data.owner_id;
  if (ownerId && String(ownerId) !== String(profileChatOwnerId() || "")) return;
  profileChatTiles().forEach((el) => {
    const state = el._profileChat;
    if (!state || state.mode !== "profile") return;
    state.messages = [];
    paintProfileChatLog(state.log, state.messages);
  });
}

async function clearProfileChatHistory() {
  const ownerId = profileChatOwnerId();
  if (!ownerId) return;
  const response = await profileApi("/profile/" + encodeURIComponent(ownerId) + "/chat", { method: "DELETE" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((data && data.detail) || "Could not clear chat history.");
    return;
  }
  applyProfileChatCleared({ owner_id: ownerId });
}

function paintProfileChatRoom(tile, el) {
  const props = typeof defaultProfileTileProps === "function"
    ? defaultProfileTileProps("chat_room", tile && tile.props)
    : (tile && tile.props) || {};
  const chrome = typeof profileTextChrome === "function" ? profileTextChrome(props, "chat_room") : null;
  if (chrome && typeof applyProfileTextPaint === "function") applyProfileTextPaint(el, chrome);
  if (typeof applyProfileWidgetSurface === "function") applyProfileWidgetSurface(el, tile);
  const showTitle = props.show_title !== false;
  if (showTitle) {
    const align = props.title_align === "center" || props.title_align === "right" ? props.title_align : "left";
    el.dataset.titleAlign = align;
  } else {
    delete el.dataset.titleAlign;
  }
  const root = document.createElement("div");
  root.className = "profile-chat-room" + (showTitle ? " has-title" : "");
  if (showTitle) {
    const head = document.createElement("div");
    head.className = "profile-chat-room-head";
    const title = document.createElement("div");
    title.className = "oneira-wall-title";
    title.textContent = profileChatRoomTitle(props);
    head.appendChild(title);
    root.appendChild(head);
  }
  const body = document.createElement("div");
  body.className = "profile-chat-room-body";
  root.appendChild(body);
  const ownerId = profileChatOwnerId();
  const state = {
    mode: profileChatRoomMode(props),
    roomId: null,
    messages: [],
    log: null,
    input: null,
    sendBtn: null,
    canSend: false,
    gen: 0,
    showPicker: null,
    root
  };
  root.appendChild(paintProfileChatRoomComposer(state));
  el.appendChild(root);
  el._profileChat = state;
  if (!ownerId) {
    const empty = document.createElement("div");
    empty.className = "profile-chat-room-empty";
    empty.textContent = "No rooms found";
    body.appendChild(empty);
    setProfileChatComposer(state, false, "Message");
    return;
  }
  if (state.mode === "profile") {
    paintProfileChatRoomThread(body, state, profileChatRoomTitle(props), false);
    setProfileChatComposer(state, true, "Message " + profileChatRoomTitle(props));
    const gen = ++state.gen;
    loadProfileChatThread(ownerId).then((rows) => {
      if (el._profileChat !== state || state.gen !== gen) return;
      state.messages = rows;
      paintProfileChatLog(state.log, state.messages);
    }).catch(() => {});
    return;
  }
  function showPicker() {
    const gen = ++state.gen;
    state.roomId = null;
    state.messages = [];
    setProfileChatComposer(state, false, "Message");
    body.replaceChildren();
    loadProfileChatRooms(ownerId, !!props.owner_rooms).then((rooms) => {
      if (el._profileChat !== state || state.gen !== gen) return;
      paintProfileChatRoomPicker(body, state, rooms, (row) => {
        if (profileChatPreview(body)) return;
        openProfileChatRoom(body, state, row);
      });
    }).catch(() => {
      if (el._profileChat !== state || state.gen !== gen) return;
      paintProfileChatRoomPicker(body, state, [], null);
    });
  }
  state.showPicker = showPicker;
  showPicker();
}

function openProfileChatRoom(body, state, row) {
  const name = row.name || "Room";
  state.roomId = row.id;
  state.messages = [];
  paintProfileChatRoomThread(body, state, name, true, state.showPicker);
  setProfileChatComposer(state, true, "Message " + name);
  const gen = ++state.gen;
  loadProfileWidgetRoomMessages(row.id).then((rows) => {
    if (state.gen !== gen) return;
    state.messages = rows;
    paintProfileChatLog(state.log, state.messages);
  }).catch(() => {
    if (state.gen !== gen) return;
    if (typeof state.showPicker === "function") state.showPicker();
  });
}
