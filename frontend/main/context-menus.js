// ==================================================================
// context-menus.js - Every right-click menu, plus the actions they fire.
// Generic open/close/positioning engine lives in shared/context-menu.js.
// ==================================================================

function showMessageContextMenu(e, msg) {
  e.preventDefault();
  openContextMenu(e.clientX, e.clientY, {
    avatarText: avatarLetter(msg.username),
    title: msg.username,
    timestamp: formatClusterTime(msg.time),
    subtitle: truncateForContextMenu(msg.content)
  }, [
    { label: "Copy Message", onSelect: () => copyMessageContent(msg) },
    // Hover bar (last-3 emoji / Add Reaction / Edit / Forward) is
    // Discord's other add path. Not built this pass — keep the note.
    canReactMessage(msg) && { label: "Add Reaction", onSelect: () => openReactionPicker(msg, e.clientX, e.clientY) },
    canEditMessage(msg) && { label: "Edit Message", onSelect: () => startMessageEdit(msg) },
    canReplyMessage(msg) && { label: "Reply", onSelect: () => startReply(msg) },
    { label: "Pin", onSelect: () => console.log("Pin — not implemented yet") },
    canDeleteMessage(msg) && { label: "Delete Message", danger: true, onSelect: () => deleteMessageFromContextMenu(msg) }
  ]);
}

function canReactMessage(msg) {
  if (!appearancePref("show_reactions", true)) return false;
  if (!msg || !msg.id || msg.senderId === null || msg.senderId === undefined) return false;
  if (msg.deletionState === "pending" || msg.deletionState === "deleted") return false;
  if (typeof pendingIsExpired === "function" && pendingIsExpired(msg)) return false;
  return msg.chatKind === "dm" || msg.chatKind === "party" || msg.chatKind === "channel" || msg.chatKind === "forum" || msg.chatKind === "announcement" || msg.chatKind === "forum_post" || msg.chatKind === "comment";
}

function openReactionPicker(msg, x, y) {
  setTimeout(() => {
    if (typeof openEmojiPickerForReaction === "function") openEmojiPickerForReaction(x, y, msg);
  }, 0);
}

async function toggleReaction(msg, emoji) {
  if (!canReactMessage(msg) || !emoji) return;
  try {
    const response = await fetch(`https://${serverAddress}/react_message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind: msg.chatKind, message_id: msg.id, emoji })
    });
    if (!response.ok) {
      console.error(`Failed to react: ${response.status}`);
      return;
    }
    const data = await response.json();
    if (msg.chatKind === "announcement") {
      patchAnnouncementReactions(msg.id, data.reactions || []);
      return;
    }
    if (msg.chatKind === "forum_post") {
      patchForumPostReactions(msg.id, data.reactions || []);
      return;
    }
    if (msg.chatKind === "comment") {
      patchCommentReactions(msg.id, data.reactions || []);
      return;
    }
    msg.reactions = applyReactionMe(data.reactions || []);
    rerenderForKind(msg.chatKind);
  } catch (e) {
    console.error("Failed to react, network error:", e);
  }
}

function canReplyMessage(msg) {
  if (!msg || !msg.id || msg.senderId === null || msg.senderId === undefined) return false;
  if (msg.deletionState === "pending" || msg.deletionState === "deleted") return false;
  if (typeof pendingIsExpired === "function" && pendingIsExpired(msg)) return false;
  return msg.chatKind === "dm" || msg.chatKind === "party" || msg.chatKind === "channel" || msg.chatKind === "forum";
}

function canEditMessage(msg) {
  if (!msg || !msg.id || !msg.isMine) return false;
  if (msg.deletionState === "pending" || msg.deletionState === "deleted") return false;
  if (typeof pendingIsExpired === "function" && pendingIsExpired(msg)) return false;
  return true;
}

function canDeleteMessage(msg) {
  if (!msg || !msg.id || msg.senderId === null || msg.senderId === undefined) return false;
  if (msg.deletionState === "pending" || msg.deletionState === "deleted") return false;
  if (typeof pendingIsExpired === "function" && pendingIsExpired(msg)) return false;
  if (msg.chatKind === "channel" || msg.chatKind === "forum") {
    return msg.isMine || myUserId === currentServerOwnerId;
  }
  return msg.isMine;
}

function rerenderForKind(kind) {
  if (kind === "channel" || kind === "forum") renderChannelMessages({ preserveScroll: true });
  else renderMessages({ preserveScroll: true });
}

function findLocalMessage(kind, messageId) {
  const list = (kind === "channel" || kind === "forum") ? currentChannelMessages : currentMessages;
  return list.find(m => m.id === messageId);
}

function removeLocalMessage(kind, messageId) {
  if (kind === "channel" || kind === "forum") {
    currentChannelMessages = currentChannelMessages.filter(m => m.id !== messageId);
  } else {
    currentMessages = currentMessages.filter(m => m.id !== messageId);
  }
  rerenderForKind(kind);
}

function markLocalPending(kind, messageId, requestedAt) {
  const row = findLocalMessage(kind, messageId);
  if (!row) return;
  row.deletionState = "pending";
  row.deletionRequestedAt = requestedAt ? parseUtcTimestamp(requestedAt) : new Date();
  rerenderForKind(kind);
}

function markLocalDeleted(kind, messageId) {
  const row = findLocalMessage(kind, messageId);
  if (!row) return;
  row.deletionState = "deleted";
  row.content = "";
  row.attachment = null;
  rerenderForKind(kind);
}

function markLocalReinstated(kind, messageId) {
  const row = findLocalMessage(kind, messageId);
  if (!row) return;
  row.deletionState = null;
  row.deletionRequestedAt = null;
  rerenderForKind(kind);
}

function deletionEventTargetsOpenChat(data) {
  if (data.kind === "dm") {
    return openChatType === "dm" && (openChatId === data.sender_id || openChatId === data.receiver_id);
  }
  if (data.kind === "party") {
    return openChatType === "party" && openChatId === data.party_id;
  }
  if (data.kind === "channel") {
    return openForumPostId === null && currentChannelId === data.channel_id;
  }
  if (data.kind === "forum") {
    return openForumPostId === data.post_id;
  }
  return false;
}

async function deleteMessageFromContextMenu(msg) {
  if (!msg.id || !msg.chatKind) return;
  try {
    const response = await fetch(`https://${serverAddress}/delete_message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind: msg.chatKind, message_id: msg.id })
    });
    if (!response.ok) {
      console.error(`Failed to delete message: ${response.status}`);
      return;
    }
    const data = await response.json();
    if (msg.chatKind === "channel" || msg.chatKind === "forum") {
      removeLocalMessage(msg.chatKind, msg.id);
    } else {
      msg.deletionState = data.deletion_state || "pending";
      msg.deletionRequestedAt = data.deletion_requested_at
        ? parseUtcTimestamp(data.deletion_requested_at)
        : new Date();
      rerenderForKind(msg.chatKind);
    }
  } catch (e) {
    console.error("Failed to delete message, network error:", e);
  }
}

async function reinstateMessage(msg) {
  if (!msg.id || !msg.chatKind) return;
  try {
    const response = await fetch(`https://${serverAddress}/reinstate_message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind: msg.chatKind, message_id: msg.id })
    });
    if (!response.ok) {
      if (response.status === 400) markLocalDeleted(msg.chatKind, msg.id);
      else console.error(`Failed to reinstate message: ${response.status}`);
      return;
    }
    msg.deletionState = null;
    msg.deletionRequestedAt = null;
    rerenderForKind(msg.chatKind);
  } catch (e) {
    console.error("Failed to reinstate message, network error:", e);
  }
}

async function copyMessageContent(msg) {
  try {
    const text = typeof mentionDisplayText === "function"
      ? mentionDisplayText(msg.content || "", msg.mentionUsers)
      : (msg.content || "");
    await navigator.clipboard.writeText(text);
  } catch (e) {
    console.error("Failed to copy message, clipboard error:", e);
  }
}

function canModerateMember(member) {
  if (memberListScope !== "server") return false;
  if (!member || member.id === myUserId || member.is_owner) return false;
  return currentServerOwnerId === myUserId;
}

async function fetchRelationship(userId) {
  try {
    const response = await fetch(`https://${serverAddress}/relationship/${userId}`, { credentials: "include" });
    if (!response.ok) return { friend: false, pending_out: false, blocked: false };
    return await response.json();
  } catch (e) {
    return { friend: false, pending_out: false, blocked: false };
  }
}

async function showMemberContextMenu(e, member) {
  e.preventDefault();
  e.stopPropagation();
  const isSelf = member.id === myUserId;
  const relation = isSelf ? { self: true } : await fetchRelationship(member.id);
  const statusLabel = memberAppearsOnline(member.status)
    ? member.status.charAt(0).toUpperCase() + member.status.slice(1)
    : "Offline";

  const options = isSelf ? [
    { label: "Profile", onSelect: () => console.log("View own profile — not implemented yet") },
    { label: "Mention", onSelect: () => insertMentionToken(member.username) }
  ] : [
    { label: "Profile", onSelect: () => console.log("View profile — not implemented yet") },
    { label: "Mention", onSelect: () => insertMentionToken(member.username) },
    { label: "Message", onSelect: () => messageMemberFromList(member.id, member.username) },
    !relation.blocked && (relation.friend
      ? { label: "Remove Friend", onSelect: () => unfriendFromContextMenu(member.id, member.username) }
      : { label: "Add Friend", disabled: !!relation.pending_out, onSelect: () => addFriendFromContextMenu(member.username) }),
    relation.blocked
      ? { label: "Unblock", onSelect: () => unblockFromContextMenu(member.id, member.username) }
      : { label: "Block", danger: true, onSelect: () => blockFromContextMenu(member.id, member.username) },
    canModerateMember(member) && { label: "Timeout", onSelect: () => console.log("Timeout — not implemented yet") },
    canModerateMember(member) && { label: "Kick", danger: true, onSelect: () => console.log("Kick — not implemented yet") },
    canModerateMember(member) && { label: "Ban", danger: true, onSelect: () => console.log("Ban — not implemented yet") }
  ];

  openContextMenu(e.clientX, e.clientY, {
    avatarText: avatarLetter(member.username),
    title: member.username,
    subtitle: statusLabel
  }, options);
}

async function messageMemberFromList(id, username) {
  if (currentServerId && typeof goHome === "function") {
    if (!(await goHome())) return;
  }
  openDirectMessage(id, username);
}

async function addFriendFromContextMenu(username) {
  try {
    const response = await fetch(`https://${serverAddress}/friend_user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username })
    });
    if (!response.ok) {
      console.error(`Failed to add friend: ${response.status}`);
    }
  } catch (e) {
    console.error("Failed to add friend, network error:", e);
  }
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

function showPartyContextMenu(e, id, name, memberCount) {
  e.preventDefault();
  openContextMenu(e.clientX, e.clientY, {
    avatarText: avatarLetter(name),
    title: name,
    subtitle: `${memberCount} Members`
  }, [
    { label: "Invite to Party", onSelect: () => openInviteModal("party", id, name) },
    { label: "Mark as Read", onSelect: () => markPartyRead(id) },
    { label: "Party Info", onSelect: () => console.log("Party info — not implemented yet") },
    { label: "Mute", onSelect: () => console.log("Mute — not implemented yet") },
    { label: "Leave Party", danger: true, onSelect: () => leavePartyFromContextMenu(id, name) }
  ]);
}

function showServerContextMenu(e, id, name, ownerId) {
  e.preventDefault();
  openContextMenu(e.clientX, e.clientY, {
    avatarText: serverAvatarLetters(name),
    title: name
  }, [
    { label: "Invite People", onSelect: () => openInviteModal("server", id, name) },
    { label: "Mark as Read", onSelect: () => markServerRead(id) },
    ownerId !== myUserId && { label: "Leave Server", danger: true, onSelect: () => leaveServerFromContextMenu(id) }
  ]);
}

// Wired once in enterApp() against #server-sidebar-body, not re-attached
// per render. Category/channel rows call e.stopPropagation() so this
// only fires for genuine blank space.
function showServerAreaContextMenu(e) {
  e.preventDefault();
  const isOwner = currentServerOwnerId === myUserId;
  openContextMenu(e.clientX, e.clientY, null, [
    { label: "Create Category", onSelect: () => { if (isOwner) openCategoryModal(); } },
    { label: "Server Settings", onSelect: () => console.log("Server Settings — not implemented yet") }
  ]);
}

function showCategoryContextMenu(e, category, isOwner) {
  e.preventDefault();
  e.stopPropagation();
  const x = e.clientX;
  const y = e.clientY;
  const options = isOwner ? [
    { label: "Edit Category", onSelect: () => console.log("Edit Category — not implemented yet") },
    { label: "Delete Category", danger: true, onSelect: () => openDeleteConfirm("category", category) }
  ] : [];
  openContextMenu(x, y, {
    avatarText: "\u{1F4C1}",
    title: category.name,
    subtitle: category.is_private ? "Private Category" : "Category"
  }, options);
}

function showChannelContextMenu(e, channel, isOwner) {
  e.preventDefault();
  e.stopPropagation();
  const x = e.clientX;
  const y = e.clientY;
  const options = isOwner ? [
    { label: "Edit Channel", onSelect: () => console.log("Edit Channel — not implemented yet") },
    { label: "Delete Channel", danger: true, onSelect: () => openDeleteConfirm("channel", channel) }
  ] : [];
  const typeLabel = channel.channel_type === "voice" ? "Voice Channel" : "Text Channel";
  openContextMenu(x, y, {
    avatarText: channel.channel_type === "voice" ? "\u{1F50A}" : "#",
    title: channel.name,
    subtitle: channel.is_private ? `Private ${typeLabel}` : typeLabel
  }, options);
}

async function deleteCategoryFromContextMenu(category) {
  try {
    const response = await fetch(`https://${serverAddress}/delete_category/${category.id}`, {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) {
      console.error(`Failed to delete category: ${response.status}`);
      return false;
    }
  } catch (e) {
    console.error("Failed to delete category, network error:", e);
    return false;
  }
  applyCategoryDeleted(category.id);
  return true;
}

async function deleteChannelFromContextMenu(channel) {
  try {
    const response = await fetch(`https://${serverAddress}/delete_channel/${channel.id}`, {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) {
      console.error(`Failed to delete channel: ${response.status}`);
      return false;
    }
  } catch (e) {
    console.error("Failed to delete channel, network error:", e);
    return false;
  }
  applyChannelDeleted(channel.category_id, channel.id);
  return true;
}

// leave_party is a live socket action, not an HTTP round-trip, so there's
// no response to await - backend deletes the membership synchronously.
function leavePartyFromContextMenu(id, name) {
  if (!ws) return;
  ws.send(JSON.stringify({ type: "leave_party", party_id: id }));
  if (openChatType === "party" && openChatId === id) resetChatView();
  conversationList = conversationList.filter(c => !(c.type === "party" && c.id === id));
  renderConversationList();
}

async function leaveServerFromContextMenu(id) {
  try {
    const response = await fetch(`https://${serverAddress}/leave_server/${id}`, {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) {
      console.error(`Failed to leave server: ${response.status}`);
      return;
    }
  } catch (e) {
    console.error("Failed to leave server, network error:", e);
    return;
  }
  serverList = serverList.filter(s => s.id !== id);
  renderServerList();
  if (currentServerId === id) {
    document.getElementById("home-icon").click();
  }
}

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

async function unblockFromContextMenu(id, username) {
  try {
    const response = await fetch(`https://${serverAddress}/unblock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ blocked_user: id })
    });
    if (!response.ok) {
      console.error(`Failed to unblock ${username}: ${response.status}`);
      return;
    }
  } catch (e) {
    console.error("Failed to unblock, network error:", e);
    return;
  }
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
