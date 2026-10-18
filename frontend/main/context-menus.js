// ==================================================================
// context-menus.js - Every right-click menu, plus the actions they fire.
// Generic open/close/positioning engine lives in shared/context-menu.js.
// ==================================================================

function showMessageContextMenu(e, msg) {
  e.preventDefault();
  if (msg && msg.permaban) {
    openContextMenu(e.clientX, e.clientY, {
      avatarText: "!",
      title: "Banned user",
      timestamp: formatClusterTime(msg.time),
      subtitle: msg.content || "A user was banned from Oneira."
    }, [
      canDeleteMessage(msg) && { label: "Delete Message", danger: true, onSelect: () => deleteMessageFromContextMenu(msg) }
    ]);
    return;
  }
  openContextMenu(e.clientX, e.clientY, {
    avatarText: avatarLetter(msg.username),
    title: msg.username,
    timestamp: formatClusterTime(msg.time),
    subtitle: truncateForContextMenu(msg.content),
    userId: msg.senderId,
    avatar: msg.avatar
  }, [
    { label: "Copy Message", onSelect: () => copyMessageContent(msg) },
    canSpeakMessage(msg) && { label: "Speak Message", onSelect: () => speakMessageContent(msg) },
    // Hover bar (last-3 emoji / Add Reaction / Edit / Forward) is
    // Discord's other add path. Not built this pass — keep the note.
    canReactMessage(msg) && { label: "Add Reaction", onSelect: () => openReactionPicker(msg, e.clientX, e.clientY) },
    canEditMessage(msg) && { label: "Edit Message", onSelect: () => startMessageEdit(msg) },
    canReplyMessage(msg) && { label: "Reply", onSelect: () => startReply(msg) },
    canPinMessage(msg) && {
      label: isMessagePinned(msg.chatKind, msg.id) ? "Unpin" : "Pin",
      onSelect: () => pinOrUnpinMessage(msg, !isMessagePinned(msg.chatKind, msg.id)),
    },
    canDeleteMessage(msg) && { label: "Delete Message", danger: true, onSelect: () => deleteMessageFromContextMenu(msg) }
  ]);
}

function showAttachMarkdownContextMenu(e, info) {
  e.preventDefault();
  e.stopPropagation();
  const marked = !!(info && info.marked);
  const kind = (info && info.kind) === "video" ? "Video" : "Image";
  const reference = {
    avatarText: kind.charAt(0),
    title: (info && info.name) || "file",
    subtitle: kind
  };
  if (info && info.image) reference.image = info.image;
  openContextMenu(e.clientX, e.clientY, reference, [
    {
      label: marked ? "Remove Explicit" : "Mark as Explicit",
      onSelect: () => {
        if (info && typeof info.onToggle === "function") info.onToggle();
      }
    }
  ]);
}

function canPinMessage(msg) {
  if (!msg || !msg.id || msg.senderId === null || msg.senderId === undefined) return false;
  if (msg.deletionState === "pending" || msg.deletionState === "deleted") return false;
  if (typeof pendingIsExpired === "function" && pendingIsExpired(msg)) return false;
  if (msg.chatKind === "dm" || msg.chatKind === "party") return true;
  if (msg.chatKind === "channel" || msg.chatKind === "forum" || msg.chatKind === "forum_post" || msg.chatKind === "announcement" || msg.chatKind === "comment" || msg.chatKind === "media_comment") {
    return typeof canPinMessages !== "function" || canPinMessages();
  }
  return false;
}

function canSpeakMessage(msg) {
  if (!msg || msg.permaban) return false;
  if (!window.speechSynthesis) return false;
  const text = String(msg.content || "").trim();
  return !!text;
}

function canReactMessage(msg) {
  if (!appearancePref("show_reactions", true)) return false;
  if (!msg || !msg.id || msg.senderId === null || msg.senderId === undefined) return false;
  if (msg.permaban) return false;
  if (msg.deletionState === "pending" || msg.deletionState === "deleted") return false;
  if (typeof pendingIsExpired === "function" && pendingIsExpired(msg)) return false;
  return msg.chatKind === "dm" || msg.chatKind === "party" || msg.chatKind === "channel" || msg.chatKind === "forum" || msg.chatKind === "announcement" || msg.chatKind === "forum_post" || msg.chatKind === "comment" || msg.chatKind === "media_comment" || msg.chatKind === "calendar_event";
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
    if (msg.chatKind === "media_comment") {
      if (typeof patchMediaCommentReactions === "function") patchMediaCommentReactions(msg.id, data.reactions || []);
      return;
    }
    if (msg.chatKind === "calendar_event") {
      if (typeof patchEventReactions === "function") patchEventReactions(msg.id, data.reactions || []);
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
  if (msg.chatKind === "forum") {
    if (openForumPostLocked) return false;
    return typeof canCreateTopicReplies !== "function" || canCreateTopicReplies();
  }
  if (msg.chatKind === "channel") {
    return typeof canSendMessages !== "function" || canSendMessages();
  }
  return msg.chatKind === "dm" || msg.chatKind === "party";
}

function canEditMessage(msg) {
  if (!msg || !msg.id || !msg.isMine) return false;
  if (msg.deletionState === "pending" || msg.deletionState === "deleted") return false;
  if (typeof pendingIsExpired === "function" && pendingIsExpired(msg)) return false;
  if (msg.chatKind === "forum" && openForumPostLocked) return false;
  return true;
}

function canDeleteMessage(msg) {
  if (!msg || !msg.id || msg.senderId === null || msg.senderId === undefined) return false;
  if (msg.deletionState === "pending" || msg.deletionState === "deleted") return false;
  if (typeof pendingIsExpired === "function" && pendingIsExpired(msg)) return false;
  if (msg.permaban) {
    if (msg.chatKind === "channel") return typeof canManageMessages === "function" && canManageMessages();
    if (msg.chatKind === "forum") return typeof canManageTopics === "function" && canManageTopics();
    return msg.isMine || msg.chatKind === "dm" || msg.chatKind === "party";
  }
  if (msg.chatKind === "channel") {
    return msg.isMine || (typeof canManageMessages === "function" && canManageMessages());
  }
  if (msg.chatKind === "forum") {
    return msg.isMine || (typeof canManageTopics === "function" && canManageTopics());
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
      ? mentionDisplayText(msg.content || "", msg.mentionUsers, msg.mentionRoles)
      : (msg.content || "");
    await navigator.clipboard.writeText(text);
  } catch (e) {
    console.error("Failed to copy message, clipboard error:", e);
  }
}

function canModerateMember(member) {
  return canActOnMember(member, "kick_members")
    || canActOnMember(member, "ban_members")
    || canActOnMember(member, "timeout_members");
}

async function fetchRelationship(userId) {
  try {
    const response = await fetch(`https://${serverAddress}/relationship/${userId}`, { credentials: "include" });
    if (!response.ok) return { friend: false, pending_out: false, blocked: false, dm_action: "message" };
    return await response.json();
  } catch (e) {
    return { friend: false, pending_out: false, blocked: false, dm_action: "message" };
  }
}

function friendMenuOption(id, username, relation) {
  if (!relation || relation.self || relation.blocked) return null;
  if (relation.friend) {
    return { label: "Remove Friend", onSelect: () => unfriendFromContextMenu(id, username) };
  }
  return {
    label: "Add Friend",
    disabled: !!relation.pending_out,
    onSelect: () => addFriendFromContextMenu(username)
  };
}

function dmMenuOption(id, username, relation) {
  const action = (relation && relation.dm_action) || "message";
  if (action === "blocked" || (relation && relation.blocked)) return null;
  if (action === "message") {
    return { label: "Message", onSelect: () => messageMemberFromList(id, username) };
  }
  return {
    label: "Request DM",
    disabled: action !== "request",
    onSelect: () => requestDirectMessage(id)
  };
}

async function requestDirectMessage(userId) {
  try {
    const response = await fetch(`https://${serverAddress}/dm_request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id: userId })
    });
    if (!response.ok) {
      console.error(`Failed to request DM: ${response.status}`);
    }
  } catch (e) {
    console.error("Failed to request DM, network error:", e);
  }
}

function memberContextReference(member) {
  const line = (member.status_line || (typeof userStatusLine === "function" ? userStatusLine(member.id) : "") || "").trim();
  const statusLabel = line || (typeof memberAppearsOnline === "function" && memberAppearsOnline(member.status)
    ? member.status.charAt(0).toUpperCase() + member.status.slice(1)
    : "Offline");
  return {
    avatarText: typeof avatarLetter === "function" ? avatarLetter(member.username) : (member.username || "?").slice(0, 1),
    title: typeof memberVisibleName === "function" ? memberVisibleName(member) : member.username,
    subtitle: statusLabel,
    userId: member.id,
    avatar: member.avatar
  };
}

function memberFromVoicePerson(person) {
  const list = (typeof memberList !== "undefined" && Array.isArray(memberList)) ? memberList : [];
  const found = list.find((row) => Number(row.id) === Number(person.user_id));
  if (found) return found;
  return {
    id: person.user_id,
    username: person.username,
    avatar: person.avatar,
    status: "online",
    status_line: ""
  };
}

async function memberContextOptions(member) {
  const isSelf = member.id === myUserId;
  const relation = isSelf ? { self: true } : await fetchRelationship(member.id);
  const nicknameRow = typeof canChangeNickname === "function" && canChangeNickname(member)
    ? { label: "Change Nickname", onSelect: () => openNicknameSubmenu(member) }
    : null;
  if (isSelf) {
    return [
      { label: "Profile", onSelect: () => openUserProfile(member.id) },
      nicknameRow,
      { label: "Mention", onSelect: () => insertMentionToken(member.username) }
    ];
  }
  return [
    { label: "Profile", onSelect: () => openUserProfile(member.id) },
    nicknameRow,
    { label: "Mention", onSelect: () => insertMentionToken(member.username) },
    dmMenuOption(member.id, member.username, relation),
    friendMenuOption(member.id, member.username, relation),
    relation.blocked
      ? { label: "Unblock", onSelect: () => unblockFromContextMenu(member.id, member.username) }
      : { label: "Block", danger: true, onSelect: () => blockFromContextMenu(member.id, member.username) },
    canActOnMember(member, "timeout_members") && (memberTimeoutActive(member)
      ? { label: "Show Timeout", onSelect: () => openModerationModal("timeout-edit", member) }
      : { label: "Timeout", onSelect: () => openModerationModal("timeout", member) }),
    canActOnMember(member, "kick_members") && { label: "Kick", danger: true, onSelect: () => openModerationModal("kick", member) },
    canActOnMember(member, "ban_members") && { label: "Ban", danger: true, onSelect: () => openModerationModal("ban", member) }
  ];
}

async function showMemberContextMenu(e, member) {
  e.preventDefault();
  e.stopPropagation();
  openContextMenu(e.clientX, e.clientY, memberContextReference(member), await memberContextOptions(member));
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

const userStatusLines = {};
const userStatusKnown = {};

function rememberUserStatus(userId, status) {
  if (userId === null || userId === undefined || userId === "") return;
  userStatusKnown[String(userId)] = true;
  userStatusLines[String(userId)] = String(status || "").trim();
}

function userStatusLine(userId) {
  if (userId === null || userId === undefined) return "";
  return userStatusLines[String(userId)] || "";
}

function applyUserStatusLine(userId, status) {
  const line = String(status || "").trim();
  rememberUserStatus(userId, line);
  if (typeof memberList !== "undefined" && Array.isArray(memberList)) {
    memberList.forEach((member) => {
      if (String(member.id) !== String(userId)) return;
      member.status_line = line;
      const row = typeof findMemberRow === "function" ? findMemberRow(member.id) : null;
      if (row && typeof paintMemberStatusLine === "function") paintMemberStatusLine(row, member);
    });
  }
  if (typeof conversationList !== "undefined" && Array.isArray(conversationList)) {
    let changed = false;
    conversationList.forEach((convo) => {
      if (!convo || convo.type === "party") return;
      if (String(convo.id) !== String(userId)) return;
      convo.status = line;
      changed = true;
    });
    if (changed && typeof renderConversationList === "function") renderConversationList();
  }
  document.querySelectorAll(".friend-row").forEach((row) => {
    if (String(row.dataset.userId) !== String(userId)) return;
    let sub = row.querySelector(".friend-status");
    if (!line) {
      if (sub) sub.remove();
      return;
    }
    if (!sub) {
      const host = row.querySelector(".friend-text") || row;
      sub = document.createElement("div");
      sub.className = "friend-status";
      host.appendChild(sub);
    }
    sub.textContent = line;
  });
}

function muteDurationRows(type, id) {
  const pick = (duration) => () => {
    if (typeof closeContextMenu === "function") closeContextMenu();
    if (typeof muteConversation === "function") muteConversation(type, id, duration);
  };
  return [
    { label: "For 15 Minutes", onSelect: pick("15m") },
    { label: "For 1 Hour", onSelect: pick("1h") },
    { label: "For 8 Hours", onSelect: pick("8h") },
    { label: "For 24 Hours", onSelect: pick("24h") },
    { separator: true },
    { label: "Until I turn it back on", onSelect: pick("on") }
  ];
}

function muteMenuOption(type, id) {
  const muted = typeof isConversationMuted === "function" && isConversationMuted(type, id);
  if (muted) {
    return { label: "Unmute", onSelect: () => { if (typeof muteConversation === "function") muteConversation(type, id, "off"); } };
  }
  return { label: "Mute", submenu: muteDurationRows(type, id) };
}

async function showProfileContextMenu(e, id, username, isSelf) {
  e.preventDefault();
  let line = userStatusLine(id);
  if (id && !userStatusKnown[String(id)]) {
    try {
      const response = await fetch(`https://${serverAddress}/user_status/${encodeURIComponent(id)}`, { credentials: "include" });
      if (response.ok) {
        const data = await response.json();
        line = String((data && data.status) || "").trim();
        rememberUserStatus(id, line);
      }
    } catch (err) {
      line = "";
    }
  }
  const relation = isSelf ? { self: true } : await fetchRelationship(id);
  const options = isSelf ? [
    { label: "Profile", onSelect: () => openUserProfile(id) },
    { label: "Settings", onSelect: () => console.log("Open settings from context menu — not implemented yet") }
  ] : [
    { label: "Profile", onSelect: () => openUserProfile(id) },
    friendMenuOption(id, username, relation),
    muteMenuOption("dm", id),
    dmMenuOption(id, username, relation),
    { label: "Invite", onSelect: () => console.log("Invite — not implemented yet") },
    relation.blocked
      ? { label: "Unblock", onSelect: () => unblockFromContextMenu(id, username) }
      : { label: "Block", danger: true, onSelect: () => blockFromContextMenu(id, username) }
  ];
  openContextMenu(e.clientX, e.clientY, {
    avatarText: avatarLetter(username),
    title: username,
    subtitle: line,
    userId: id
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
    muteMenuOption("party", id),
    { label: "Leave Party", danger: true, onSelect: () => leavePartyFromContextMenu(id, name) }
  ]);
}

function serverIconUrl(serverId, hint) {
  if (hint) return hint;
  const sid = String(serverId || "");
  if (!sid) return "";
  if (typeof currentServerId !== "undefined" && String(currentServerId) === sid && currentServerData && currentServerData.icon_url) {
    return currentServerData.icon_url;
  }
  if (typeof serverList !== "undefined") {
    const meta = (serverList || []).find((row) => row && String(row.id) === sid);
    if (meta && meta.icon_url) return meta.icon_url;
  }
  const railImg = document.querySelector('.rail-icon.server-icon[data-server-id="' + sid + '"] .server-icon-img');
  return (railImg && railImg.getAttribute("src")) || "";
}

function serverContextReference(serverId, name, hint) {
  const icon = serverIconUrl(serverId, hint);
  return {
    image: icon,
    avatarText: typeof serverAvatarLetters === "function" ? serverAvatarLetters(name) : (name || "?").slice(0, 2),
    title: name || ""
  };
}

function serverInviteRow(serverId, name) {
  const inThis = typeof currentServerId !== "undefined" && String(currentServerId) === String(serverId);
  const allowed = inThis
    ? (typeof canInviteMembers === "function" ? canInviteMembers() : true)
    : true;
  if (!allowed) return null;
  return { label: "Invite to Server", onSelect: () => openInviteModal("server", serverId, name) };
}

function serverSettingsRow(serverId) {
  const inThis = typeof currentServerId !== "undefined" && String(currentServerId) === String(serverId);
  if (!inThis) return null;
  const allowed = typeof canOpenServerSettings === "function" ? canOpenServerSettings() : currentServerOwnerId === myUserId;
  if (!allowed) return null;
  return { label: "Server Settings", onSelect: () => openServerSettings() };
}

function serverLeaveRow(serverId, ownerId) {
  if (ownerId === myUserId) return null;
  return { label: "Leave Server", danger: true, onSelect: () => leaveServerFromContextMenu(serverId) };
}

function serverCreateRows() {
  const canLayout = typeof canManageChannels === "function" ? canManageChannels() : currentServerOwnerId === myUserId;
  if (!canLayout) return [];
  const firstCategory = ((currentServerData && currentServerData.categories) || [])[0];
  return [
    firstCategory
      ? { label: "Create Channel", onSelect: () => openChannelModal(firstCategory.id) }
      : { label: "Create Channel", disabled: true },
    { label: "Create Category", onSelect: () => openCategoryModal() }
  ];
}

function serverNotifyMenuRows(serverId, prefs) {
  const muted = !!(prefs && prefs.muted);
  return [
    { label: "Mark as Read", onSelect: () => { if (typeof markServerRead === "function") markServerRead(serverId); } },
    {
      label: muted ? "Unmute Server" : "Mute Server",
      onSelect: () => {
        if (typeof saveServerNotifyPrefs === "function") saveServerNotifyPrefs(serverId, { muted: !muted }).catch(() => {});
      }
    },
    {
      label: "Notification Settings",
      submenu: typeof buildServerNotifySubmenu === "function" ? buildServerNotifySubmenu(serverId, prefs) : []
    },
    { label: "Hide Muted Channels", disabled: true }
  ];
}

function showServerContextMenu(e, server) {
  e.preventDefault();
  const id = server && server.id;
  const name = (server && server.name) || "";
  const ownerId = server && server.owner_id;
  const x = e.clientX;
  const y = e.clientY;
  const open = (prefs) => {
    openContextMenu(x, y, serverContextReference(id, name, server && server.icon_url), [
      serverInviteRow(id, name),
      ...serverNotifyMenuRows(id, prefs),
      serverSettingsRow(id),
      serverLeaveRow(id, ownerId)
    ]);
  };
  if (typeof loadServerNotifyPrefs === "function") {
    loadServerNotifyPrefs(id).then(open).catch(() => open(typeof cachedServerNotifyPrefs === "function" ? cachedServerNotifyPrefs(id) : null));
  } else {
    open(null);
  }
}

function showServerAreaContextMenu(e) {
  e.preventDefault();
  if (!currentServerId) return;
  const x = e.clientX;
  const y = e.clientY;
  const name = (document.getElementById("server-sidebar-name") && document.getElementById("server-sidebar-name").textContent) || "";
  const serverId = currentServerId;
  const ownerId = currentServerOwnerId;
  const open = (prefs) => {
    const options = [
      serverInviteRow(serverId, name),
      ...serverCreateRows(),
      serverSettingsRow(serverId)
    ];
    if (options.filter(Boolean).length) options.push({ separator: true });
    options.push(
      ...serverNotifyMenuRows(serverId, prefs),
      serverLeaveRow(serverId, ownerId)
    );
    openContextMenu(x, y, serverContextReference(serverId, name), options);
  };
  if (typeof loadServerNotifyPrefs === "function") {
    loadServerNotifyPrefs(serverId).then(open).catch(() => open(typeof cachedServerNotifyPrefs === "function" ? cachedServerNotifyPrefs(serverId) : null));
  } else {
    open(null);
  }
}

function showServerHeaderMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  if (!currentServerId) return;
  if (e.type === "click" && activeMenuEl) {
    closeContextMenu();
    return;
  }

  const header = document.getElementById("server-sidebar-header");
  const rect = header.getBoundingClientRect();
  const name = (document.getElementById("server-sidebar-name") && document.getElementById("server-sidebar-name").textContent) || "";
  const serverId = currentServerId;
  const ownerId = currentServerOwnerId;

  const open = (prefs) => {
    const options = [];
    const invite = serverInviteRow(serverId, name);
    if (invite) options.push(invite);
    if (typeof canServerPerm === "function" && canServerPerm("change_nickname") && typeof openNicknameSubmenu === "function") {
      options.push({
        label: "Edit Per-server Profile",
        onSelect: () => openNicknameSubmenu({
          id: myUserId,
          nickname: typeof myServerNickname === "function" ? myServerNickname() : ""
        })
      });
    }
    const settings = serverSettingsRow(serverId);
    if (settings) options.push(settings);
    options.push(...serverCreateRows());
    if (options.length) options.push({ separator: true });
    options.push(
      ...serverNotifyMenuRows(serverId, prefs),
      serverLeaveRow(serverId, ownerId)
    );
    openContextMenu(rect.left, rect.bottom, serverContextReference(serverId, name), options);
  };

  if (typeof loadServerNotifyPrefs === "function") {
    loadServerNotifyPrefs(serverId).then(open).catch(() => open(typeof cachedServerNotifyPrefs === "function" ? cachedServerNotifyPrefs(serverId) : null));
  } else {
    open(null);
  }
}

function showCategoryContextMenu(e, category) {
  e.preventDefault();
  e.stopPropagation();
  const x = e.clientX;
  const y = e.clientY;
  const serverId = typeof currentServerId !== "undefined" ? currentServerId : "";
  const canLayout = typeof canManageChannels === "function" ? canManageChannels() : currentServerOwnerId === myUserId;
  const reference = {
    avatarText: "\u{1F4C1}",
    title: category.name,
    subtitle: category.is_private ? "Private Category" : "Category"
  };
  const open = () => {
    const serverPrefs = typeof cachedServerNotifyPrefs === "function" ? cachedServerNotifyPrefs(serverId) : null;
    const options = [
      { label: "Mark as Read", onSelect: () => { if (typeof markCategoryRead === "function") markCategoryRead(category); } },
      {
        label: "Mute Category",
        onSelect: () => {
          if (typeof saveCategoryNotifyPrefs === "function") {
            saveCategoryNotifyPrefs(serverId, category, { muted: true }).catch(() => {});
          }
        }
      },
      {
        label: "Notification Settings",
        submenu: typeof buildCategoryNotifySubmenu === "function"
          ? buildCategoryNotifySubmenu(serverId, category, serverPrefs)
          : []
      }
    ];
    if (canLayout) {
      options.push(
        { separator: true },
        { label: "Create Channel", onSelect: () => openChannelModal(category.id) },
        { label: "Edit Category", onSelect: () => { if (typeof openCategorySettings === "function") openCategorySettings(category); } },
        { label: "Delete Category", danger: true, onSelect: () => openDeleteConfirm("category", category) }
      );
    }
    openContextMenu(x, y, reference, options);
  };
  const pending = [];
  if (typeof loadServerNotifyPrefs === "function") pending.push(loadServerNotifyPrefs(serverId));
  if (typeof loadChannelNotifyPrefs === "function") pending.push(loadChannelNotifyPrefs(serverId));
  if (pending.length) Promise.all(pending).then(open).catch(open);
  else open();
}

function showChannelContextMenu(e, channel) {
  e.preventDefault();
  e.stopPropagation();
  const x = e.clientX;
  const y = e.clientY;
  const serverId = typeof currentServerId !== "undefined" ? currentServerId : "";
  const canLayout = typeof canManageChannels === "function" ? canManageChannels() : currentServerOwnerId === myUserId;
  const typeLabel = typeof channelTypeSidebarLabel === "function"
    ? channelTypeSidebarLabel(channel.channel_type)
    : (channel.channel_type === "voice" ? "Voice Channel" : "Text Channel");
  const reference = {
    avatarText: typeof channelTypeIcon === "function" ? channelTypeIcon(channel.channel_type) : (channel.channel_type === "voice" ? "\u{1F50A}" : "#"),
    title: channel.name,
    subtitle: channel.is_private ? `Private ${typeLabel}` : typeLabel
  };
  const open = () => {
    const channelPrefs = typeof cachedChannelNotifyPrefs === "function" ? cachedChannelNotifyPrefs(serverId, channel.id) : null;
    const serverPrefs = typeof cachedServerNotifyPrefs === "function" ? cachedServerNotifyPrefs(serverId) : null;
    const muted = !!(channelPrefs && channelPrefs.muted);
    const inThisVoice = channel.channel_type === "voice"
      && typeof voiceJoinedChannelId !== "undefined"
      && Number(voiceJoinedChannelId) === Number(channel.id);
    const options = [];
    if (channel.channel_type === "voice") {
      options.push({
        label: "Voice Text Channel",
        disabled: !inThisVoice,
        onSelect: () => {
          if (typeof openVoiceTextChannel === "function") openVoiceTextChannel(channel);
        }
      });
      options.push({ separator: true });
    }
    options.push(
      { label: "Mark as Read", onSelect: () => { if (typeof markChannelReadFromMenu === "function") markChannelReadFromMenu(channel.id); } },
      {
        label: muted ? "Unmute Channel" : "Mute Channel",
        onSelect: () => {
          if (typeof saveChannelNotifyPrefs === "function") {
            saveChannelNotifyPrefs(serverId, channel.id, { muted: !muted }).catch(() => {});
          }
        }
      },
      {
        label: "Notification Settings",
        submenu: typeof buildChannelNotifySubmenu === "function"
          ? buildChannelNotifySubmenu(serverId, channel.id, channelPrefs, serverPrefs)
          : []
      }
    );
    if (canLayout) {
      options.push(
        { separator: true },
        { label: "Edit Channel", onSelect: () => { if (typeof openChannelSettingsForChannel === "function") openChannelSettingsForChannel(channel); } },
        { label: "Delete Channel", danger: true, onSelect: () => openDeleteConfirm("channel", channel) }
      );
    }
    openContextMenu(x, y, reference, options);
  };
  const pending = [];
  if (typeof loadServerNotifyPrefs === "function") pending.push(loadServerNotifyPrefs(serverId));
  if (typeof loadChannelNotifyPrefs === "function") pending.push(loadChannelNotifyPrefs(serverId));
  if (pending.length) Promise.all(pending).then(open).catch(open);
  else open();
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

let pendingLeaveParty = null;

function closeLeavePartyConfirm() {
  pendingLeaveParty = null;
  const overlay = document.getElementById("leave-party-overlay");
  if (overlay) overlay.hidden = true;
}

function openLeavePartyConfirm(id, name) {
  pendingLeaveParty = { id, name };
  const body = document.getElementById("leave-party-body");
  if (body) body.textContent = "Are you sure you want to leave " + (name || "this party") + "?";
  const overlay = document.getElementById("leave-party-overlay");
  if (overlay) overlay.hidden = false;
  const cancel = document.getElementById("leave-party-cancel");
  if (cancel) cancel.focus();
}

function confirmLeaveParty() {
  const pending = pendingLeaveParty;
  closeLeavePartyConfirm();
  if (!pending || !ws) return;
  ws.send(JSON.stringify({ type: "leave_party", party_id: pending.id }));
  if (openChatType === "party" && openChatId === pending.id) resetChatView();
  conversationList = conversationList.filter(c => !(c.type === "party" && c.id === pending.id));
  renderConversationList();
}

function leavePartyFromContextMenu(id, name) {
  openLeavePartyConfirm(id, name);
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
  if (typeof forgetBlockedUser === "function") forgetBlockedUser(id);
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
  if (typeof rememberBlockedUser === "function") rememberBlockedUser(id);
  if (typeof purgeBlockedMessagesFromOpenViews === "function") purgeBlockedMessagesFromOpenViews(id);
  if (openChatType === "dm" && openChatId === id) resetChatView();
  refreshFriendsView();
  loadConversations();
}

(function bindLeavePartyConfirm() {
  const overlay = document.getElementById("leave-party-overlay");
  const closeBtn = document.getElementById("leave-party-close");
  const cancelBtn = document.getElementById("leave-party-cancel");
  const confirmBtn = document.getElementById("leave-party-confirm");
  if (closeBtn) closeBtn.addEventListener("click", closeLeavePartyConfirm);
  if (cancelBtn) cancelBtn.addEventListener("click", closeLeavePartyConfirm);
  if (confirmBtn) confirmBtn.addEventListener("click", confirmLeaveParty);
  if (overlay) {
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) closeLeavePartyConfirm();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const card = document.getElementById("leave-party-overlay");
    if (card && !card.hidden) closeLeavePartyConfirm();
  });
})();

async function logout() {
  try {
    await fetch(`https://${serverAddress}/logout`, { method: "POST", credentials: "include" });
  } catch (e) { /* tear down locally regardless */ }
  if (ws) { ws.close(); ws = null; }
  window.location.href = "../login.html";
}
