function communityRoomReady(row) {
  const room = Object.assign({}, row || {});
  room.topics = room.topics || [];
  room.about = room.about || "";
  return room;
}

let communityRoomBusy = false;

function communityRoomErrorText(data, fallback) {
  if (typeof communityErrorText === "function") return communityErrorText(data, fallback);
  const detail = data && data.detail;
  if (typeof detail === "string" && detail) return detail;
  return fallback;
}

async function loadCommunityRooms() {
  let response;
  try {
    response = await fetch(`https://${serverAddress}/community_rooms`, { credentials: "include" });
  } catch (e) {
    return;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return;
  communityRooms = (data.rooms || []).map(communityRoomReady);
  if (typeof paintCommunityRooms === "function") paintCommunityRooms();
  if (typeof paintCommunityRoomNav === "function") paintCommunityRoomNav();
}

function showCommunityRoomSaveError(message) {
  const blocked = message === "Room name cannnot but used.";
  const block = document.getElementById("community-room-block");
  const status = document.getElementById("community-room-status");
  if (block) {
    block.hidden = !blocked;
    block.textContent = blocked ? message : "";
  }
  if (status) {
    status.hidden = blocked || !message;
    status.textContent = blocked ? "" : (message || "");
  }
}

async function saveCommunityRoom() {
  const input = document.getElementById("community-room-name");
  const submit = document.getElementById("community-room-submit");
  const name = input ? String(input.value || "").trim() : "";
  if (!name || name.length > 15) return;
  const editing = typeof communityRoomEditing !== "undefined" ? communityRoomEditing : null;
  if (submit) submit.disabled = true;
  showCommunityRoomSaveError("");
  try {
    const response = await fetch(`https://${serverAddress}/community_rooms${editing ? "/" + editing : ""}`, {
      method: editing ? "PATCH" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.slice(0, 15),
        about: (document.getElementById("community-room-about") ? document.getElementById("community-room-about").value : "").slice(0, 500),
        topics: (typeof communityRoomTopics !== "undefined" ? communityRoomTopics : []).slice(0, 3)
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(communityRoomErrorText(data, editing ? "Could not save that room." : "Could not create that room."));
    const room = communityRoomReady(data);
    if (!editing) {
      room.joined = true;
      room.owned = true;
    }
    const index = communityRooms.findIndex((row) => String(row.id) === String(room.id));
    if (index >= 0) communityRooms[index] = room;
    else communityRooms.unshift(room);
    if (editing) {
      if (typeof closeCommunityRoomCompose === "function") closeCommunityRoomCompose();
      if (typeof paintCommunityRooms === "function") paintCommunityRooms();
      if (typeof paintCommunityRoomNav === "function") paintCommunityRoomNav();
      const title = document.getElementById("community-room-chat-title");
      if (title && String(communityOpenRoom) === String(room.id)) title.textContent = room.name || "Room";
      return;
    }
    if (typeof openCommunityRoomChat === "function") openCommunityRoomChat(room.id);
    else {
      if (typeof closeCommunityRoomCompose === "function") closeCommunityRoomCompose();
      if (typeof paintCommunityRooms === "function") paintCommunityRooms();
      if (typeof paintCommunityRoomNav === "function") paintCommunityRoomNav();
    }
  } catch (e) {
    showCommunityRoomSaveError(e.message || "Could not create that room.");
    if (typeof syncCommunityRoomCompose === "function") syncCommunityRoomCompose();
  }
}

function mapCommunityRoomMessage(msg) {
  const mapped = {
    id: msg.id,
    tempId: msg.temp_id || msg.tempId,
    chatKind: "room",
    isMine: msg.sender_id === myUserId || msg.username === myUsername,
    senderId: msg.sender_id,
    username: msg.username || "",
    nickname: msg.display_name || msg.nickname || msg.username || "",
    content: msg.content || "",
    attachment: typeof parseAttachment === "function" ? parseAttachment(msg.attachment) : (msg.attachment || null),
    time: typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(msg.timestamp) : new Date(msg.timestamp),
    edited: false,
    reactions: msg.reactions || [],
    avatar: msg.avatar || null,
    replyTo: msg.reply_to || msg.replyTo || null,
    mentioned: !!msg.mentioned
  };
  if (typeof applyMentionFields === "function") applyMentionFields(mapped, msg);
  return mapped;
}

function applyCommunityRoomRoster(data) {
  if (!data) return;
  const row = typeof communityRoomById === "function" ? communityRoomById(data.room_id) : null;
  if (row && data.n != null) row.n = data.n;
  if (String(communityOpenRoom) === String(data.room_id)) {
    communityRoomMemberRows = data.members || [];
    if (typeof paintCommunityRoomMembers === "function") paintCommunityRoomMembers(row);
  }
  if (typeof paintCommunityRooms === "function") paintCommunityRooms();
  if (typeof paintCommunityRoomNav === "function") paintCommunityRoomNav();
}

function applyCommunityRoomMessage(data) {
  if (!data || String(communityOpenRoom) !== String(data.room_id)) return;
  if (data.sender_id && typeof isUserBlocked === "function" && isUserBlocked(data.sender_id)) return;
  if (data.id && communityRoomMessages.some((row) => row.id === data.id)) return;
  communityRoomMessages.push(mapCommunityRoomMessage(data));
  if (typeof paintCommunityRoomChat === "function") paintCommunityRoomChat();
  if (typeof clearRemoteTyper === "function") clearRemoteTyper(data.sender_id);
}

function ackCommunityRoomMessage(tempId, id) {
  const row = communityRoomMessages.find((item) => item.tempId === tempId);
  if (!row) return false;
  row.id = id;
  return true;
}

function dropCommunityRoomTemp(tempId) {
  const before = communityRoomMessages.length;
  communityRoomMessages = communityRoomMessages.filter((row) => row.tempId !== tempId);
  if (communityRoomMessages.length === before) return false;
  if (typeof paintCommunityRoomChat === "function") paintCommunityRoomChat();
  return true;
}

async function loadCommunityRoomChat(id) {
  const gen = ++communityRoomLoadGen;
  let response;
  try {
    response = await fetch(`https://${serverAddress}/community_rooms/${id}/messages`, { credentials: "include" });
  } catch (e) {
    return;
  }
  if (gen !== communityRoomLoadGen || String(communityOpenRoom) !== String(id)) return;
  const data = await response.json().catch(() => ({}));
  if (gen !== communityRoomLoadGen || String(communityOpenRoom) !== String(id)) return;
  if (!response.ok) {
    if (typeof showCommunityRow === "function") showCommunityRow("rooms");
    return;
  }
  communityRoomMessages = (data.messages || []).map(mapCommunityRoomMessage);
  communityRoomMemberRows = data.members || [];
  if (typeof paintCommunityRoomChat === "function") paintCommunityRoomChat();
  const input = document.getElementById("composer-input");
  if (input && typeof communityRoomComposerOpen === "function" && communityRoomComposerOpen()) input.focus();
}

async function saveCommunityRoomJoin(row) {
  if (!row || row.joined || row.n >= 15 || communityRoomBusy) return;
  communityRoomBusy = true;
  try {
    const response = await fetch(`https://${serverAddress}/community_rooms/${row.id}/join`, {
      method: "POST",
      credentials: "include"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    const next = communityRoomReady(data);
    next.joined = true;
    const index = communityRooms.findIndex((item) => String(item.id) === String(next.id));
    if (index >= 0) communityRooms[index] = next;
    if (typeof paintCommunityRooms === "function") paintCommunityRooms();
    if (typeof paintCommunityRoomNav === "function") paintCommunityRoomNav();
  } catch (e) {
    return;
  } finally {
    communityRoomBusy = false;
  }
}

async function saveCommunityRoomLeave(row) {
  if (!row || !row.joined || communityRoomBusy) return;
  communityRoomBusy = true;
  const open = String(communityOpenRoom) === String(row.id);
  try {
    const response = await fetch(`https://${serverAddress}/community_rooms/${row.id}/leave`, {
      method: "POST",
      credentials: "include"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 404) return;
    const next = response.ok ? communityRoomReady(data) : row;
    next.joined = false;
    const index = communityRooms.findIndex((item) => String(item.id) === String(row.id));
    if (index >= 0) communityRooms[index] = next;
    if (open && typeof showCommunityRow === "function") showCommunityRow("rooms");
    else {
      if (typeof paintCommunityRooms === "function") paintCommunityRooms();
      if (typeof paintCommunityRoomNav === "function") paintCommunityRoomNav();
    }
  } catch (e) {
    return;
  } finally {
    communityRoomBusy = false;
  }
}

async function sendCommunityRoomMessage() {
  const input = document.getElementById("composer-input");
  const content = input ? input.value.trim() : "";
  if ((!content && !pendingAttach) || !communityOpenRoom || !ws || ws.readyState !== 1) return;
  if (pendingAttach && pendingAttach.busy) return;
  let attachment = null;
  if (pendingAttach) {
    try {
      attachment = await uploadPendingIfNeeded();
    } catch (err) {
      window.alert(err.message || "Upload failed.");
      return;
    }
  }
  const tempId = nextMessageTempId();
  const stored = content && typeof encodeMentions === "function" ? encodeMentions(content, false) : content;
  const replyId = typeof currentPendingReplyId === "function" ? currentPendingReplyId("room") : null;
  ws.send(JSON.stringify({
    type: "room_message",
    room_id: communityOpenRoom,
    content: content,
    attachment: attachment,
    temp_id: tempId,
    reply_to_id: replyId
  }));
  communityRoomMessages.push(mapCommunityRoomMessage({
    temp_id: tempId,
    sender_id: myUserId,
    username: myUsername || "",
    display_name: typeof myDisplayName !== "undefined" ? myDisplayName : "",
    content: stored,
    attachment: attachment,
    timestamp: new Date().toISOString(),
    reply_to: pendingReply && pendingReply.chatKind === "room" ? {
      id: pendingReply.id,
      sender_id: pendingReply.senderId,
      username: pendingReply.username,
      content: pendingReply.content,
      deleted: false
    } : null,
    avatar: typeof faceForUser === "function" ? faceForUser(myUserId) : null,
    mention_users: typeof mentionUsersFromText === "function" ? mentionUsersFromText(stored) : {}
  }));
  if (typeof paintCommunityRoomChat === "function") paintCommunityRoomChat();
  if (input) input.value = "";
  if (typeof clearPendingAttach === "function") clearPendingAttach();
  if (typeof clearPendingReply === "function") clearPendingReply();
  if (typeof stopOutgoingTyping === "function") stopOutgoingTyping();
  if (typeof autoGrowComposer === "function") autoGrowComposer();
  if (typeof refreshComposerMentions === "function") refreshComposerMentions(input);
  if (typeof hideMentionPicker === "function") hideMentionPicker();
}
