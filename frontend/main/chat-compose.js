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
  clearPendingReply();
  if (typeof stopOutgoingTyping === "function") stopOutgoingTyping();
}

function enableComposer() {
  document.getElementById("composer-input").disabled = false;
  document.getElementById("composer-input").placeholder = "Type a message";
  document.getElementById("composer-send-btn").disabled = false;
  document.getElementById("composer-plus-btn").disabled = false;
  document.getElementById("composer-emoji-btn").disabled = false;
}

function replyBarIds(kind) {
  if (kind === "channel" || kind === "forum") {
    return { bar: "channel-composer-reply-bar", name: "channel-composer-reply-name", input: "channel-composer-input" };
  }
  return { bar: "composer-reply-bar", name: "composer-reply-name", input: "composer-input" };
}

function paintPendingReply() {
  const homeBar = document.getElementById("composer-reply-bar");
  const homeName = document.getElementById("composer-reply-name");
  const channelBar = document.getElementById("channel-composer-reply-bar");
  const channelName = document.getElementById("channel-composer-reply-name");
  const homeActive = !!(pendingReply && (pendingReply.chatKind === "dm" || pendingReply.chatKind === "party"));
  const channelActive = !!(pendingReply && (pendingReply.chatKind === "channel" || pendingReply.chatKind === "forum"));
  if (homeBar) {
    homeBar.hidden = !homeActive;
    if (homeActive && homeName) homeName.textContent = pendingReply.username || "user";
  }
  if (channelBar) {
    channelBar.hidden = !channelActive;
    if (channelActive && channelName) channelName.textContent = pendingReply.username || "user";
  }
}

function clearPendingReply() {
  pendingReply = null;
  paintPendingReply();
}

function startReply(msg) {
  if (typeof canReplyMessage === "function" && !canReplyMessage(msg)) return;
  pendingReply = {
    id: msg.id,
    chatKind: msg.chatKind,
    senderId: msg.senderId,
    username: msg.username,
    content: msg.content || "",
    mentionUsers: msg.mentionUsers || {}
  };
  paintPendingReply();
  const input = document.getElementById(replyBarIds(msg.chatKind).input);
  if (input && !input.disabled) {
    input.focus();
  }
}

function currentPendingReplyId(chatKind) {
  return pendingReply && pendingReply.chatKind === chatKind ? pendingReply.id : null;
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
  const storedContent = chatKind === "party" && typeof encodeMentions === "function" ? encodeMentions(content) : content;
  const payload = openChatType === "party"
    ? { type: "party_message", party_id: openChatId, content, attachment, temp_id: tempId, reply_to_id: currentPendingReplyId(chatKind) }
    : { type: "message", receiver_id: openChatId, content, attachment, temp_id: tempId, reply_to_id: currentPendingReplyId(chatKind) };
  ws.send(JSON.stringify(payload));

  currentMessages.push({
    tempId,
    chatKind,
    isMine: true,
    senderId: myUserId,
    username: myUsername || "You",
    content: storedContent,
    attachment,
    time: new Date(),
    edited: false,
    reactions: [],
    mentionUsers: typeof mentionUsersFromText === "function" ? mentionUsersFromText(storedContent) : {},
    replyTo: pendingReply && pendingReply.chatKind === chatKind ? {
      id: pendingReply.id,
      sender_id: pendingReply.senderId,
      username: pendingReply.username,
      content: pendingReply.content,
      deleted: false
    } : null
  });
  renderMessages();
  bumpConversation(openChatType, openChatId, openChatName, false);
  input.value = "";
  clearPendingAttach();
  clearPendingReply();
  if (typeof stopOutgoingTyping === "function") stopOutgoingTyping();
  autoGrowComposer();
  if (typeof refreshComposerMentions === "function") refreshComposerMentions(input);
  if (typeof hideMentionPicker === "function") hideMentionPicker();
}

function autoGrowComposer() {
  const el = document.getElementById("composer-input");
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

document.getElementById("composer-input").addEventListener("input", autoGrowComposer);

document.getElementById("composer-input").addEventListener("keydown", (e) => {
  if (e.key === "Escape" && pendingReply) {
    e.preventDefault();
    clearPendingReply();
    return;
  }
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
  const replyToId = currentPendingReplyId(chatKind);
  if (openForumPostId !== null) {
    ws.send(JSON.stringify({ type: "forum_message", post_id: openForumPostId, content, attachment, temp_id: tempId, reply_to_id: replyToId }));
  } else if (currentChannelId !== null) {
    ws.send(JSON.stringify({ type: "channel_message", channel_id: currentChannelId, content, attachment, temp_id: tempId, reply_to_id: replyToId }));
  } else {
    return;
  }

  const storedContent = (chatKind === "channel" || chatKind === "forum") && typeof encodeMentions === "function" ? encodeMentions(content) : content;
  currentChannelMessages.push({
    tempId,
    chatKind,
    senderId: myUserId,
    isMine: true,
    username: myUsername || "You",
    content: storedContent,
    attachment,
    time: new Date(),
    edited: false,
    reactions: [],
    mentionUsers: typeof mentionUsersFromText === "function" ? mentionUsersFromText(storedContent) : {},
    replyTo: pendingReply && pendingReply.chatKind === chatKind ? {
      id: pendingReply.id,
      sender_id: pendingReply.senderId,
      username: pendingReply.username,
      content: pendingReply.content,
      deleted: false
    } : null
  });
  renderChannelMessages();
  input.value = "";
  clearPendingAttach();
  clearPendingReply();
  if (typeof stopOutgoingTyping === "function") stopOutgoingTyping();
  autoGrowChannelComposer();
  if (typeof refreshComposerMentions === "function") refreshComposerMentions(input);
  if (typeof hideMentionPicker === "function") hideMentionPicker();
}

function autoGrowChannelComposer() {
  const el = document.getElementById("channel-composer-input");
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

document.getElementById("channel-composer-input").addEventListener("input", autoGrowChannelComposer);

document.getElementById("channel-composer-input").addEventListener("keydown", (e) => {
  if (e.key === "Escape" && pendingReply) {
    e.preventDefault();
    clearPendingReply();
    return;
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChannelMessage();
  }
});

function abandonMessageEdit() {
  if (typeof closeEmojiPicker === "function") closeEmojiPicker();
  if (typeof hideMentionPicker === "function") hideMentionPicker();
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
  editingDraft = typeof mentionDisplayText === "function"
    ? mentionDisplayText(msg.content || "", msg.mentionUsers)
    : (msg.content || "");
  const att = typeof parseAttachment === "function" ? parseAttachment(msg.attachment) : msg.attachment;
  editAttach = att ? { mode: "existing", attachment: att } : null;
  attachDestination = "edit";
  if (msg.chatKind === "channel" || msg.chatKind === "forum") renderChannelMessages({ preserveScroll: true });
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
  const originalContent = typeof mentionDisplayText === "function"
    ? mentionDisplayText(msg.content || "", msg.mentionUsers).trim()
    : (msg.content || "").trim();
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
  if (typeof applyMentionFields === "function") applyMentionFields(msg, data);
  cancelMessageEdit();
}

document.getElementById("composer-reply-cancel").addEventListener("click", clearPendingReply);
document.getElementById("channel-composer-reply-cancel").addEventListener("click", clearPendingReply);
