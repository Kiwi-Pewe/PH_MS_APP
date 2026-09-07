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

function showPartyContextMenu(e, id, name, memberCount) {
  e.preventDefault();
  openContextMenu(e.clientX, e.clientY, {
    avatarText: avatarLetter(name),
    title: name,
    subtitle: `${memberCount} Members`
  }, [
    { label: "Invite to Party", onSelect: () => openInviteModal("party", id, name) },
    { label: "Party Info", onSelect: () => console.log("Party info — not implemented yet") },
    { label: "Mute", onSelect: () => console.log("Mute — not implemented yet") },
    { label: "Leave Party", danger: true, onSelect: () => leavePartyFromContextMenu(id, name) }
  ]);
}

function showServerContextMenu(e, id, name) {
  e.preventDefault();
  openContextMenu(e.clientX, e.clientY, {
    avatarText: serverAvatarLetters(name),
    title: name
  }, [
    { label: "Invite People", onSelect: () => openInviteModal("server", id, name) }
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
  const options = isOwner ? [
    { label: "Edit Category", onSelect: () => console.log("Edit Category — not implemented yet") },
    { label: "Delete Category", danger: true, onSelect: () => console.log("Delete Category — confirmation sub-menu not implemented yet") }
  ] : [];
  openContextMenu(e.clientX, e.clientY, {
    avatarText: "\u{1F4C1}",
    title: category.name,
    subtitle: category.is_private ? "Private Category" : "Category"
  }, options);
}

function showChannelContextMenu(e, channel, isOwner) {
  e.preventDefault();
  e.stopPropagation();
  const options = isOwner ? [
    { label: "Edit Channel", onSelect: () => console.log("Edit Channel — not implemented yet") },
    { label: "Delete Channel", danger: true, onSelect: () => console.log("Delete Channel — confirmation sub-menu not implemented yet") }
  ] : [];
  const typeLabel = channel.channel_type === "voice" ? "Voice Channel" : "Text Channel";
  openContextMenu(e.clientX, e.clientY, {
    avatarText: channel.channel_type === "voice" ? "\u{1F50A}" : "#",
    title: channel.name,
    subtitle: channel.is_private ? `Private ${typeLabel}` : typeLabel
  }, options);
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
