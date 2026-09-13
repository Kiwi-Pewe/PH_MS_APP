// ==================================================================
// chat-compose.js - Both message composers: enable/disable, send, auto-grow.
// ==================================================================

// Used after Remove Friend/Block, since the backend would reject a send
// anyway - this just makes that plain up front.
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

function disableChannelComposer(message) {
  document.getElementById("channel-composer-input").disabled = true;
  document.getElementById("channel-composer-input").placeholder = message;
  document.getElementById("channel-composer-send-btn").disabled = true;
  document.getElementById("channel-composer-plus-btn").disabled = true;
  document.getElementById("channel-composer-emoji-btn").disabled = true;
}

function enableChannelComposer(label) {
  document.getElementById("channel-composer-input").disabled = false;
  document.getElementById("channel-composer-input").placeholder = `Message ${label}`;
  document.getElementById("channel-composer-send-btn").disabled = false;
  document.getElementById("channel-composer-plus-btn").disabled = false;
  document.getElementById("channel-composer-emoji-btn").disabled = false;
}

async function sendChatMessage() {
  const input = document.getElementById("composer-input");
  const content = input.value.trim();
  if ((!content && !pendingAttach) || openChatId === null || !ws) return;
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
  const chatKind = openChatType === "party" ? "party" : "dm";
  const payload = openChatType === "party"
    ? { type: "party_message", party_id: openChatId, content, attachment, temp_id: tempId }
    : { type: "message", receiver_id: openChatId, content, attachment, temp_id: tempId };
  ws.send(JSON.stringify(payload));

  currentMessages.push({
    tempId,
    chatKind,
    isMine: true,
    senderId: myUserId,
    username: myUsername || "You",
    content,
    attachment,
    time: new Date(),
    edited: false
  });
  renderMessages();
  bumpConversation(openChatType, openChatId, openChatName, false);
  input.value = "";
  clearPendingAttach();
  autoGrowComposer();
}

function autoGrowComposer() {
  const el = document.getElementById("composer-input");
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

document.getElementById("composer-input").addEventListener("input", autoGrowComposer);

document.getElementById("composer-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// sender_id isn't in the payload - backend fills it from the verified
// session (never trust the client for identity).
async function sendChannelMessage() {
  const input = document.getElementById("channel-composer-input");
  const content = input.value.trim();
  if ((!content && !pendingAttach) || !ws) return;
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

  // One composer, two possible destinations: a forum thread borrows this
  // view, so openForumPostId decides where this send is addressed.
  const tempId = nextMessageTempId();
  const chatKind = openForumPostId !== null ? "forum" : "channel";
  if (openForumPostId !== null) {
    ws.send(JSON.stringify({ type: "forum_message", post_id: openForumPostId, content, attachment, temp_id: tempId }));
  } else if (currentChannelId !== null) {
    ws.send(JSON.stringify({ type: "channel_message", channel_id: currentChannelId, content, attachment, temp_id: tempId }));
  } else {
    return;
  }

  currentChannelMessages.push({
    tempId,
    chatKind,
    senderId: myUserId,
    isMine: true,
    username: myUsername || "You",
    content,
    attachment,
    time: new Date(),
    edited: false
  });
  renderChannelMessages();
  input.value = "";
  clearPendingAttach();
  autoGrowChannelComposer();
}

function autoGrowChannelComposer() {
  const el = document.getElementById("channel-composer-input");
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

document.getElementById("channel-composer-input").addEventListener("input", autoGrowChannelComposer);

document.getElementById("channel-composer-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChannelMessage();
  }
});

function abandonMessageEdit() {
  if (typeof closeEmojiPicker === "function") closeEmojiPicker();
  editingMessageId = null;
  editingDraft = "";
  if (editAttach && editAttach.mode === "new" && editAttach.previewUrl) {
    URL.revokeObjectURL(editAttach.previewUrl);
  }
  editAttach = null;
  attachDestination = "composer";
}

function startMessageEdit(msg) {
  if (!canEditMessage(msg)) return;
  abandonMessageEdit();
  editingMessageId = msg.id;
  editingDraft = msg.content || "";
  const att = typeof parseAttachment === "function" ? parseAttachment(msg.attachment) : msg.attachment;
  editAttach = att ? { mode: "existing", attachment: att } : null;
  attachDestination = "edit";
  if (msg.chatKind === "channel") renderChannelMessages({ preserveScroll: true });
  else renderMessages({ preserveScroll: true });
}

function cancelMessageEdit() {
  abandonMessageEdit();
  const channelView = document.getElementById("view-channel");
  if (channelView && channelView.classList.contains("active")) renderChannelMessages({ preserveScroll: true });
  else renderMessages({ preserveScroll: true });
}

async function confirmMessageEdit(msg) {
  const ta = document.getElementById("edit-composer-input");
  const content = ((ta && ta.value) || "").trim();
  const originalContent = (msg.content || "").trim();
  const originalAtt = typeof parseAttachment === "function" ? parseAttachment(msg.attachment) : msg.attachment;
  const originalKey = originalAtt && originalAtt.key ? originalAtt.key : null;
  const nextKey = attachmentKey(editAttach);
  const sameFile = nextKey === originalKey && !(editAttach && editAttach.mode === "new");

  if (content === originalContent && sameFile) {
    cancelMessageEdit();
    return;
  }

  let attachment = null;
  if (editAttach) {
    try {
      attachment = await uploadEditIfNeeded();
    } catch (err) {
      window.alert(err.message || "Upload failed.");
      return;
    }
  }

  let data;
  try {
    const response = await fetch(`https://${serverAddress}/edit_message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind: msg.chatKind, message_id: msg.id, content, attachment })
    });
    if (!response.ok) {
      console.error(`Failed to edit message: ${response.status}`);
      return;
    }
    data = await response.json();
  } catch (e) {
    console.error("Failed to edit message, network error:", e);
    return;
  }

  if (data.deleted) {
    abandonMessageEdit();
    removeLocalMessage(msg.chatKind, msg.id);
    return;
  }
  if (data.deletion_state === "pending") {
    msg.deletionState = "pending";
    msg.deletionRequestedAt = data.deletion_requested_at
      ? parseUtcTimestamp(data.deletion_requested_at)
      : new Date();
    abandonMessageEdit();
    rerenderForKind(msg.chatKind);
    return;
  }
  msg.content = data.content;
  msg.attachment = typeof parseAttachment === "function" ? parseAttachment(data.attachment) : data.attachment;
  msg.edited = !!data.edited;
  cancelMessageEdit();
}
