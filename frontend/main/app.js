let serverAddress = null;
let ws = null;
let myUsername = null;
let myUserId = null; // from /whoami — needed to compare against a server's owner_id

// The single open chat, whatever kind it is. type is "dm" or "party";
// id's meaning depends on type (a DM partner's user id, or a party's
// party_id) — those two number spaces can coincidentally collide, so
// EVERY comparison against "is this the open chat" must check type AND
// id together, never id alone. name is whatever the header/start-card
// should display (a username or a party name).
let openChatType = null;
let openChatId = null;
let openChatName = null;

let conversationList = [];

// The user's servers, in position order — comes straight from
// GET /get_servers, which already sorts server-side by the stored
// gap-based position column. Unlike conversationList, this array is
// NEVER reordered client-side by activity; it only changes on a fresh
// load or (later) an explicit drag-and-drop reorder.
let serverList = [];

// Which rail icon is currently visually selected — "home" or a server's
// id. Selection is purely cosmetic for now (per this session's scope:
// servers have no functioning view yet), so this only ever drives the
// .active class, nothing else.
let selectedRailIcon = "home";

// The currently-open server and channel, if any. Cleared whenever Home
// is clicked. currentChannelId/Type/Name mirror openChatType/Id/Name's
// role for DMs/parties — the single source of truth for "what's showing
// in the main panel right now" while inside a server.
let currentServerId = null;
let currentServerOwnerId = null;
// The full get_server_contents payload for whichever server is currently
// open — kept around (not just currentServerId/OwnerId) so a live
// category_created/channel_created push can patch it in place and
// re-render, instead of re-fetching the whole server just to add one
// item to the sidebar.
let currentServerData = null;
let currentChannelId = null;
let currentChannelType = null;
let currentChannelName = null;

// Messages currently shown in the open conversation, in send order.
// Kept in memory and fully re-rendered into clusters on every change
// (small lists, ~25 messages) rather than patched in place — this is
// deliberate: a future edit/delete needs to be able to reflow cluster
// boundaries (e.g. deleting the first message in a cluster hands the
// header to the next one), which only works cleanly if render always
// recomputes clusters from the live list rather than trusting old DOM.
let currentMessages = [];

// Per-conversation pagination state — reset whenever openDirectMessage
// switches to a different conversation.
let hasMoreHistory = true;
let isLoadingMore = false;

// Channel messaging mirrors the DM/party pagination state above, kept as
// its own separate set of variables (not folded into currentMessages/
// hasMoreHistory) since a server channel and the DM/party chat window are
// two different main-views that can each be showing their own history at
// once — see view-chat vs. view-channel. Reset whenever selectChannel
// switches to a different channel.
let currentChannelMessages = [];
let channelHasMoreHistory = true;
let channelIsLoadingMore = false;

// Announcements equivalent of the above — same cursor-based pagination
// shape, but since posts are newest-first (composer at the TOP, scroll
// DOWN for older), "more history" is loaded from the bottom, opposite
// of channel messages. Reset by selectChannel on every channel switch.
let currentAnnouncementPosts = [];
let announcementHasMoreHistory = true;
let announcementIsLoadingMore = false;

// A same-sender gap this long or longer forces a new cluster/bubble,
// even without a sender change in between.
const CLUSTER_GAP_MINUTES = 5;

// Matches an invite link's exact shape (this app's own domain + path,
// specifically — not a loose "any link" guess) so a pasted invite gets
// unfurled into a real card, the same way a normal chat client unfurls
// a pasted link, without accidentally matching some unrelated URL a
// person happens to paste that just looks similar.
const INVITE_LINK_REGEX = /^https:\/\/oneira\.cc\/invite\/([A-Za-z0-9]{8})$/;

window.addEventListener("load", () => {
  serverAddress = API_HOST;

  // Identity now comes from the verified session (via /whoami), not the
  // ?user= URL param — that param was just trusted client-side text and
  // could be wrong, stale, or edited by hand. /whoami asks the server,
  // which checks the real session cookie, so this is the actual source
  // of truth for "who am I." credentials: "include" is required here
  // since api.oneira.cc is a different origin from oneira.cc, so the
  // session cookie won't be sent unless we explicitly ask for it.
  fetch(`https://${serverAddress}/whoami`, { credentials: "include" })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Not logged in");
      }
      return response.json();
    })
    .then((data) => {
      myUsername = data.username;
      myUserId = data.id;
      connectSocket();
    })
    .catch(() => {
      window.location.href = "../login.html";
    });
});

function connectSocket() {
  ws = new WebSocket(`wss://${serverAddress}/ws`);

  // True only once this socket has successfully opened. A page-unload
  // (refresh, tab close, navigating away) tears down the socket and fires
  // onclose too, but that's not a rejected session — it's just this page
  // dying. If we already opened once, the incoming page load will run its
  // own connectSocket() and settle the question for itself, so there's
  // nothing to redirect for here. Only a close that happens BEFORE we
  // ever opened means the server actually refused the connection (e.g.
  // an expired/invalid session cookie) — that's the real "go to login" case.
  let hasOpened = false;

  ws.onopen = () => {
    hasOpened = true;
    enterApp();
  };

  ws.onclose = () => {
    ws = null;
    if (!hasOpened) {
      window.location.href = "../login.html";
    }
  };

  ws.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); } catch (e) { return; }
    if (data.type === "friend_request") refreshFriendsView();

    if (data.type === "message") {
      const isOpen = openChatType === "dm" && openChatId === data.sender_id;
      bumpConversation("dm", data.sender_id, data.username, !isOpen);
      if (isOpen) {
        // Backend doesn't send a timestamp on the live push yet (only on
        // the history fetch) — fall back to "now" so clustering still
        // works; recommend adding a real one server-side for accuracy
        // across devices with clock drift.
        currentMessages.push({
          isMine: false,
          senderId: data.sender_id,
          username: data.username,
          content: data.content,
          time: data.timestamp ? new Date(data.timestamp) : new Date()
        });
        renderMessages();
      }
    }

    if (data.type === "party_message") {
      const isOpen = openChatType === "party" && openChatId === data.party_id;
      bumpConversation("party", data.party_id, data.party_name, !isOpen);
      if (isOpen) {
        currentMessages.push({
          isMine: false,
          senderId: data.sender_id,
          username: data.username,
          content: data.content,
          time: data.timestamp ? new Date(data.timestamp) : new Date()
        });
        renderMessages();
      }
    }

    // The backend never broadcasts this back to the sender (see
    // message_server_channel's /ws branch), so isMine is always false
    // here — no need to guard against double-adding our own message.
    // Unlike DMs/parties, there's no sidebar/rail unread signal to bump
    // yet if the channel isn't open — per-channel unread tracking was
    // deliberately deferred (see Handoff.md), so a message arriving in a
    // channel you're not currently viewing produces no visible signal
    // today.
    if (data.type === "channel_message") {
      const isOpen = currentChannelId === data.channel_id;
      if (isOpen) {
        currentChannelMessages.push({
          senderId: data.sender_id,
          isMine: false,
          username: data.username,
          content: data.content,
          time: data.timestamp ? new Date(data.timestamp) : new Date()
        });
        renderChannelMessages();
      }
    }

    // Server-wide structural pushes (create_category/create_channel on
    // the backend). Only patch currentServerData if we're actually
    // looking at the server this event is about — no point rebuilding a
    // sidebar that isn't even on screen, and currentServerData wouldn't
    // match this event's shape otherwise anyway. The sender themself
    // never receives these (see server_broadcast's exclude_user_id), so
    // there's no need to guard against double-adding our own creation.
    if (data.type === "category_created") {
      if (currentServerId === data.server_id && currentServerData) {
        currentServerData.categories.push(data.category);
        renderServerSidebar(currentServerData);
      }
    }

    if (data.type === "channel_created") {
      if (currentServerId === data.server_id && currentServerData) {
        const category = currentServerData.categories.find(c => c.id === data.channel.category_id);
        if (category) {
          category.channels.push(data.channel);
          renderServerSidebar(currentServerData);
        }
      }
    }

    // Only render if this exact Announcements channel is the one
    // currently open — same guard channel_message uses against
    // currentChannelId, since a server-wide broadcast can be about any
    // channel in the server, not necessarily the one on screen. The
    // sender never receives this (server_broadcast's exclude_user_id),
    // so no risk of double-rendering their own post.
    if (data.type === "announcement_created") {
      if (currentChannelId === data.post.channel_id) {
        prependNewAnnouncementPost(data.post);
      }
    }
  };
}

function enterApp() {
  document.getElementById("topbar-username").textContent = myUsername || "(existing session)";
  document.getElementById("footer-username").textContent = myUsername || "(existing session)";
  document.getElementById("footer-avatar-letter").textContent = avatarLetter(myUsername);
  refreshFriendsView();
  loadConversations();
  loadServers();
  handleJoinDeepLink();

  // Blank-space context menu for the category/channel panel — wired up
  // ONCE here, not inside renderServerSidebar(), since #server-sidebar-
  // body is static markup that already exists at page load and never
  // gets rebuilt on each render (only its #category-list child does).
  // Category/channel-name right-clicks call e.stopPropagation() in their
  // own handlers, so this only ever fires for genuine blank space.
  document.getElementById("server-sidebar-body").addEventListener("contextmenu", showServerAreaContextMenu);
}

// Handles arriving here fresh from invite.html after already accepting
// an invite there (see invite.js) — the query params carry exactly what
// joinInviteFromCard's own response shape already gives it, just passed
// across a page load instead of handled in the same script. Runs once,
// then strips the params via replaceState so a manual refresh doesn't
// try to re-navigate to the same place again.
function handleJoinDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const joinType = params.get("join_type");
  const joinId = params.get("join_id");
  if (!joinType || !joinId) return;

  history.replaceState({}, "", window.location.pathname);

  if (joinType === "party") {
    loadConversations().then(() => openParty(Number(joinId), params.get("join_name") || ""));
  } else if (joinType === "server") {
    loadServers().then(() => {
      const iconEl = document.querySelector(`.server-icon[data-server-id="${joinId}"]`);
      openServer(joinId, iconEl);
    });
  }
}

function avatarLetter(username) {
  return (username || "?").charAt(0).toUpperCase();
}

// Server icons show initials rather than a single letter — the default
// name shape ("{username}'s server") is always two words, so two
// letters actually distinguishes servers from each other at a glance
// the way one letter couldn't. Falls back to a single letter for a
// one-word name, same as avatarLetter above.
function serverAvatarLetters(name) {
  const words = (name || "?").trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  }
  return (words[0] || "?").charAt(0).toUpperCase();
}

// ---- Context menus (message + profile) ----
// The generic open/close/positioning engine lives in
// shared/context-menu.js and knows nothing about messages or friends —
// these two functions gather the real data for a click and decide what
// each option does. Every option is an inert placeholder for now
// (per the design discussion — functionality comes later) EXCEPT
// "Message", which just reuses the existing openDirectMessage() the
// app already has, since that's zero new behavior, not a new feature.

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

// Party rows get their own menu, not the profile one — right-clicking a
// party isn't right-clicking a person. Reference area mirrors the
// sidebar's own subtitle line ("N Members") for consistency. Leave Party
// is the only real action so far; the others stay inert placeholders
// until party settings actually exist.
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

// Server rail icons get their own menu, mirroring showPartyContextMenu's
// shape. Just one real option for now — Invite — since no other
// server-level action (settings, leave) exists on the backend yet;
// unlike the other context menus in this file, there's deliberately no
// placeholder filler here, per this session's "keep it minimal" scope.
function showServerContextMenu(e, id, name) {
  e.preventDefault();
  openContextMenu(e.clientX, e.clientY, {
    avatarText: serverAvatarLetters(name),
    title: name
  }, [
    { label: "Invite People", onSelect: () => openInviteModal("server", id, name) }
  ]);
}

// Right-clicking BLANK SPACE in the category/channel panel — no
// reference area, since nothing specific was clicked. "Create Category"
// only actually does anything for the server owner (roles don't exist
// yet, so owner is the only tier that can act) — still shown either way
// per this session's "the menu itself is useful to everyone eventually"
// call (Hide/Mute/notification-style options land here later too).
// Wired up once, in enterApp(), against #server-sidebar-body — NOT
// re-attached on every renderServerSidebar() call, since blank space
// itself never changes shape between renders.
function showServerAreaContextMenu(e) {
  e.preventDefault();
  const isOwner = currentServerOwnerId === myUserId;
  openContextMenu(e.clientX, e.clientY, null, [
    { label: "Create Category", onSelect: () => { if (isOwner) openCategoryModal(); } },
    { label: "Server Settings", onSelect: () => console.log("Server Settings — not implemented yet") }
  ]);
}

// Right-clicking an EXISTING category's name. Edit/Delete are owner-only
// for now (same tier as the "+" create-channel button and the blank-
// space menu above) and simply don't appear for anyone else — they'll
// be joined by Hide/Mute/Notification Settings later, which WILL apply
// to every member, which is why this menu still opens for non-owners
// even though it has nothing to show them yet. Delete never deletes
// immediately — it's meant to open a confirmation sub-menu once that's
// built (see Handoff.md); for now it's still an inert stub like every
// other new option in this pass.
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

// Right-clicking an EXISTING channel's name/row. Mirrors
// showCategoryContextMenu exactly, one level down — same owner-only
// gate, same Delete-needs-confirmation caveat, same "opens for everyone,
// has nothing yet for non-owners" reasoning.
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

// Sends the leave request over the socket — leave_party is a live,
// broadcast-driven action (see /ws's "leave_party" branch), not a plain
// HTTP round-trip like closeConversation, so there's no response object
// to await here. The backend deletes the membership row synchronously
// as part of handling that packet, so the local teardown below is safe
// to do right away rather than waiting on any ack.
function leavePartyFromContextMenu(id, name) {
  if (!ws) return;
  ws.send(JSON.stringify({ type: "leave_party", party_id: id }));
  if (openChatType === "party" && openChatId === id) resetChatView();
  conversationList = conversationList.filter(c => !(c.type === "party" && c.id === id));
  renderConversationList();
}

// Unfriending/blocking someone you currently have open should also back
// you out of that conversation — you're about to lose the ability to
// message them (block removes the friendship server-side too), so
// leaving the chat window sitting open on a now-invalid relationship
// would be confusing. Both refresh the friends list and DM sidebar
// afterward so the UI reflects the change immediately rather than
// waiting for the next full reload.

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

// ---- Server rail (list + create) ----
// Servers are a separate concept from the DM/party sidebar entirely —
// per Session 9's plan they'll eventually replace #secondary-panel when
// you're inside one, not live alongside it, so this is deliberately its
// own load/render pair rather than folded into loadConversations().

async function loadServers() {
  try {
    const response = await fetch(`https://${serverAddress}/get_servers`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    // Already sorted by position server-side — no client-side sort here,
    // since (unlike conversationList) this order is never activity-driven.
    serverList = data.servers || [];
    renderServerList();
  } catch (e) { /* leave last render in place */ }
}

function renderServerList() {
  const container = document.getElementById("server-list");
  container.innerHTML = "";
  serverList.forEach(server => {
    const icon = document.createElement("div");
    icon.className = "rail-icon server-icon" + (selectedRailIcon === server.id ? " active" : "");
    icon.title = server.name;
    icon.textContent = serverAvatarLetters(server.name);
    icon.dataset.serverId = server.id; // read back by joinInviteFromCard's deep-link, once loadServers() re-renders
    icon.addEventListener("click", () => openServer(server.id, icon));
    icon.addEventListener("contextmenu", (e) => showServerContextMenu(e, server.id, server.name));
    container.appendChild(icon);
  });
}

// Shared by home-icon and every server icon — swaps which rail icon
// shows the .active treatment. Purely cosmetic right now; the actual
// view-switching side of clicking Home still lives in resetChatView()
// via the home-icon listener below, untouched by this function.
function selectRailIcon(id, iconEl) {
  selectedRailIcon = id;
  document.querySelectorAll(".rail-icon").forEach(i => i.classList.remove("active"));
  iconEl.classList.add("active");
}

// Fetches a server's categories/channels and swaps the whole screen
// into "inside a server" mode: the DM sidebar is replaced by the
// category/channel list, and the main panel switches to the channel
// view. Sending messages isn't built yet (next step, not this one) —
// today's goal is purely making a server's contents viewable.
async function openServer(serverId, iconEl) {
  selectRailIcon(serverId, iconEl);

  let data;
  try {
    const response = await fetch(`https://${serverAddress}/get_server_contents/${serverId}`, { credentials: "include" });
    if (!response.ok) return; // not a member, or the server no longer exists
    data = await response.json();
  } catch (e) {
    return; // leave whatever was showing in place
  }

  currentServerId = serverId;
  currentServerOwnerId = data.owner;
  currentServerData = data;

  document.getElementById("dm-sidebar-view").style.display = "none";
  document.getElementById("server-sidebar-view").style.display = "flex";

  const serverMeta = serverList.find(s => s.id === serverId);
  document.getElementById("server-sidebar-name").textContent = serverMeta ? serverMeta.name : "";

  renderServerSidebar(data);

  // Auto-selects the first channel found, same as Discord's default
  // entry behavior. Remembering the LAST channel you were actually
  // viewing is a real planned feature (added to Server_members once
  // built) but is explicitly deferred — see Handoff.md.
  const firstChannel = data.categories.flatMap(c => c.channels)[0];
  if (firstChannel) {
    selectChannel(firstChannel);
  } else {
    currentChannelId = null;
    switchMainView("channel");
    document.getElementById("channel-header-title").textContent = "No channels yet";
    document.getElementById("channel-messages").style.display = "none";
    document.getElementById("channel-empty").style.display = "flex";
    document.getElementById("channel-empty-badge").textContent = "#";
    document.getElementById("channel-welcome-title").textContent = "";
    document.getElementById("channel-welcome-sub").textContent = "";
    disableChannelComposer("No channel selected.");
  }
}

function renderServerSidebar(data) {
  const list = document.getElementById("category-list");
  list.innerHTML = "";
  // Owner-only for now — there's no admin/role tier to extend this to
  // yet (roles are explicitly deferred, per Handoff.md).
  const isOwner = data.owner === myUserId;

  data.categories.forEach(category => {
    const block = document.createElement("div");
    block.className = "category-block";

    const header = document.createElement("div");
    header.className = "category-header";

    const arrow = document.createElement("span");
    arrow.className = "category-arrow";
    arrow.textContent = "\u25BE"; // ▾
    header.appendChild(arrow);

    const nameEl = document.createElement("span");
    nameEl.className = "category-name";
    nameEl.textContent = category.name;
    nameEl.addEventListener("contextmenu", (e) => showCategoryContextMenu(e, category, isOwner));
    header.appendChild(nameEl);

    if (isOwner) {
      const addBtn = document.createElement("button");
      addBtn.className = "category-add-btn";
      addBtn.title = "Create Channel";
      addBtn.textContent = "+";
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openChannelModal(category.id);
      });
      header.appendChild(addBtn);
    }

    const channelsEl = document.createElement("div");
    channelsEl.className = "category-channels";
    category.channels.forEach(channel => {
      const row = document.createElement("div");
      row.className = "channel-row";
      row.dataset.channelId = channel.id;

      const icon = document.createElement("span");
      icon.className = "channel-icon";
      icon.textContent = channel.channel_type === "voice" ? "\u{1F50A}" : "#";
      row.appendChild(icon);

      const label = document.createElement("span");
      label.className = "channel-label";
      label.textContent = channel.name;
      row.appendChild(label);

      row.addEventListener("click", () => selectChannel(channel, row));
      row.addEventListener("contextmenu", (e) => showChannelContextMenu(e, channel, isOwner));
      channelsEl.appendChild(row);
    });

    // Dropdown collapse/expand — purely visual, does not persist across
    // a refresh (this session's explicit scope call).
    header.addEventListener("click", () => block.classList.toggle("collapsed"));

    block.appendChild(header);
    block.appendChild(channelsEl);
    list.appendChild(block);
  });
}

// Voice channels fall back to the same read-only centered-welcome state
// this used to show for every channel, since there's no voice UI or
// voice message history yet (WebRTC is last on the roadmap). Text
// channels now load and render real history and enable the composer —
// this function is async for that reason, matching openDirectMessage/
// openParty's shape exactly.
async function selectChannel(channel, rowEl) {
  currentChannelId = channel.id;
  currentChannelType = channel.channel_type;
  currentChannelName = channel.name;

  document.querySelectorAll(".channel-row").forEach(r => r.classList.remove("active"));
  const activeRow = rowEl || document.querySelector(`.channel-row[data-channel-id="${channel.id}"]`);
  if (activeRow) activeRow.classList.add("active");

  switchMainView("channel");
  const isVoice = channel.channel_type === "voice";
  const isAnnouncement = channel.channel_type === "announcements";
  const label = isVoice ? channel.name : `#${channel.name}`;
  document.getElementById("channel-header-title").textContent = label;

  const channelEmpty = document.getElementById("channel-empty");
  const channelMessages = document.getElementById("channel-messages");
  const channelBody = document.getElementById("channel-body");
  const channelComposer = document.getElementById("channel-composer");
  const announcementsView = document.getElementById("announcements-view");

  // Announcements gets its own view entirely — composer-on-top, card-
  // style posts — rather than sharing #channel-body/#channel-composer's
  // clustered-message layout. Persistence is real now (loadAnnouncementPosts
  // fetches get_announcement on every open, same as loadChannelHistory
  // does for plain chat) — no more resetting to an empty placeholder.
  if (isAnnouncement) {
    channelBody.style.display = "none";
    channelComposer.style.display = "none";
    announcementsView.style.display = "flex";
    hideAnnounceComposerEditing();
    // Only the owner can post right now (server-enforced in
    // post_announcement) — hidden entirely for everyone else rather
    // than shown greyed-out, per Kiwi's call when this was designed.
    document.getElementById("announce-new-post-btn").style.display =
      (myUserId === currentServerOwnerId) ? "inline-flex" : "none";
    loadAnnouncementPosts(channel.id);
    return;
  }
  announcementsView.style.display = "none";
  channelBody.style.display = "flex";
  channelComposer.style.display = "block";

  if (isVoice) {
    channelMessages.style.display = "none";
    channelEmpty.style.display = "flex";
    document.getElementById("channel-empty-badge").textContent = "\u{1F50A}";
    document.getElementById("channel-welcome-title").textContent = `Welcome to ${label}!`;
    document.getElementById("channel-welcome-sub").textContent = "Voice channels aren't supported yet \u2014 text channels are today's focus.";
    disableChannelComposer("Voice channels can't receive text messages yet.");
    return;
  }

  enableChannelComposer(label);
  channelEmpty.style.display = "none";
  channelMessages.style.display = "block";
  currentChannelMessages = [];
  channelHasMoreHistory = true;
  channelIsLoadingMore = false;

  try {
    const response = await fetch(`https://${serverAddress}/get_channel_history/${channel.id}`, { credentials: "include" });
    if (!response.ok) { renderChannelMessages(); return; }
    const data = await response.json();
    currentChannelMessages = data.messages.map(msg => ({
      id: msg.id,
      isMine: msg.sender_id === myUserId,
      senderId: msg.sender_id,
      username: msg.username,
      content: msg.content,
      // History rows always have a real server timestamp.
      time: new Date(msg.timestamp)
    }));
    if (currentChannelMessages.length < 25) channelHasMoreHistory = false;
    renderChannelMessages();
  } catch (e) { renderChannelMessages(); /* leave empty on failure */ }
}

// ---- Server creation modal ----
// Simpler than the party modal — name-only, no member checklist, since
// a server starts with just its owner (invites deferred, per Session 9).

document.getElementById("create-server-btn").addEventListener("click", openServerModal);
document.getElementById("server-modal-close").addEventListener("click", closeServerModal);
document.getElementById("server-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "server-modal-overlay") closeServerModal();
});
document.getElementById("server-modal-create-btn").addEventListener("click", submitCreateServer);

function openServerModal() {
  const input = document.getElementById("server-name-input");
  input.value = `${myUsername}'s server`;
  document.getElementById("server-modal-overlay").style.display = "flex";
  input.focus();
  input.select();
}

function closeServerModal() {
  document.getElementById("server-modal-overlay").style.display = "none";
}

async function submitCreateServer() {
  const input = document.getElementById("server-name-input");
  // Falls back to the same default shown as a placeholder value, in the
  // rare case someone clears the field entirely rather than editing it.
  const name = input.value.trim() || `${myUsername}'s server`;

  try {
    const response = await fetch(`https://${serverAddress}/create_server`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name })
    });
    if (!response.ok) {
      console.error(`Failed to create server: ${response.status}`);
      return;
    }
  } catch (e) {
    console.error("Failed to create server, network error:", e);
    return;
  }
  closeServerModal();
  loadServers();
}

// ---- Category creation modal ----
// Reached via "Create Category" in the blank-space context menu (see
// showServerAreaContextMenu above). Same overlay/close/outside-click
// pattern as the server modal, plus a Cancel button — the first modal
// in the app to have one — and the new Private Category toggle, the
// first real use of .toggle-switch (see app.css).
//
// BACKEND CONTRACT NEEDED — not yet built, this is Kiwi's to write:
//   POST /create_category
//   body: { server_id, name, is_private }
//   Expected to insert a row into Server_categories (using the
//   is_private column added this session) at the next gap-based
//   position for that server, and return any 2xx status on success.
// This function only checks response.ok — it doesn't read the response
// body at all, since refreshServerSidebar() re-fetches the full server
// contents from get_server_contents afterward rather than trusting
// whatever this endpoint returns. So the exact success payload shape
// doesn't need to be nailed down yet, just the request contract above.
document.getElementById("category-modal-close").addEventListener("click", closeCategoryModal);
document.getElementById("category-modal-cancel-btn").addEventListener("click", closeCategoryModal);
document.getElementById("category-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "category-modal-overlay") closeCategoryModal();
});
document.getElementById("category-modal-create-btn").addEventListener("click", submitCreateCategory);

function openCategoryModal() {
  const input = document.getElementById("category-name-input");
  input.value = "";
  document.getElementById("category-private-toggle").checked = false;
  document.getElementById("category-modal-overlay").style.display = "flex";
  input.focus();
}

function closeCategoryModal() {
  document.getElementById("category-modal-overlay").style.display = "none";
}

async function submitCreateCategory() {
  const input = document.getElementById("category-name-input");
  // Falls back to the same default shown as the placeholder, in the
  // rare case someone clears the field entirely — same pattern as
  // submitCreateServer() above.
  const name = input.value.trim() || "New Category";
  const isPrivate = document.getElementById("category-private-toggle").checked;

  try {
    const response = await fetch(`https://${serverAddress}/create_category`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ server_id: currentServerId, name, is_private: isPrivate })
    });
    if (!response.ok) {
      console.error(`Failed to create category: ${response.status}`);
      return;
    }
  } catch (e) {
    console.error("Failed to create category, network error:", e);
    return;
  }
  closeCategoryModal();
  refreshServerSidebar();
}

// Re-fetches the CURRENT server's categories/channels and re-renders
// the sidebar in place — unlike openServer(), it doesn't touch rail-
// icon selection or auto-select a channel, so whatever's currently
// open in the main panel stays put. Used after creating a category
// (and, later, a channel) so the new item appears immediately without
// resetting the view. No-ops if no server is currently open.
async function refreshServerSidebar() {
  if (!currentServerId) return;
  let data;
  try {
    const response = await fetch(`https://${serverAddress}/get_server_contents/${currentServerId}`, { credentials: "include" });
    if (!response.ok) return;
    data = await response.json();
  } catch (e) {
    return;
  }
  currentServerOwnerId = data.owner;
  renderServerSidebar(data);
}

// ---- Channel creation modal ----
// Reached via the "+" button next to a category's name (see
// renderServerSidebar above — that button just stopped propagation and
// did nothing until this session). Same overlay/close/outside-click/
// Cancel pattern as the category modal. Two things this modal has that
// the category one doesn't: the accordion type-picker, and a
// disabled-until-valid Create button (category creation only needed a
// name; this needs a name AND a selected type).
//
// Accordion behavior: clicking a header toggles .open on its own
// .accordion-group and removes it from every other group, so only one
// panel is ever expanded — wired once here since the accordion's DOM
// is static markup in app.html, not rebuilt per open like the category/
// channel LIST is.
document.querySelectorAll("#channel-type-accordion .accordion-header").forEach(header => {
  header.addEventListener("click", () => {
    const group = header.closest(".accordion-group");
    const wasOpen = group.classList.contains("open");
    document.querySelectorAll("#channel-type-accordion .accordion-group").forEach(g => g.classList.remove("open"));
    if (!wasOpen) group.classList.add("open");
  });
});

// Re-checked on every radio change and every keystroke in the name
// field — either one alone leaves Create disabled. Disabled radios
// (the "Coming Soon" types) never fire "change" from a user click since
// the browser blocks interaction with them entirely, so this never
// needs to special-case them.
function updateChannelModalCreateState() {
  const selected = document.querySelector('input[name="channel-type"]:checked');
  const name = document.getElementById("channel-name-input").value.trim();
  document.getElementById("channel-modal-create-btn").disabled = !selected || !name;
}
document.querySelectorAll('input[name="channel-type"]').forEach(radio => {
  radio.addEventListener("change", updateChannelModalCreateState);
});
document.getElementById("channel-name-input").addEventListener("input", updateChannelModalCreateState);

document.getElementById("channel-modal-close").addEventListener("click", closeChannelModal);
document.getElementById("channel-modal-cancel-btn").addEventListener("click", closeChannelModal);
document.getElementById("channel-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "channel-modal-overlay") closeChannelModal();
});
document.getElementById("channel-modal-create-btn").addEventListener("click", submitCreateChannel);

// Which category a newly-created channel belongs to — set by
// openChannelModal(categoryId), read by submitCreateChannel(). Module-
// level rather than a data attribute on the modal since nothing else
// needs to query it from the DOM.
let channelModalCategoryId = null;

function openChannelModal(categoryId) {
  channelModalCategoryId = categoryId;
  document.getElementById("channel-name-input").value = "";
  document.getElementById("channel-private-toggle").checked = false;
  document.querySelectorAll('input[name="channel-type"]').forEach(radio => { radio.checked = false; });
  document.querySelectorAll("#channel-type-accordion .accordion-group").forEach(g => g.classList.remove("open"));
  updateChannelModalCreateState();
  document.getElementById("channel-modal-overlay").style.display = "flex";
}

function closeChannelModal() {
  document.getElementById("channel-modal-overlay").style.display = "none";
}

// BACKEND CONTRACT NEEDED — not yet built, Kiwi to write:
//   POST /create_channel
//   body: { category_id, name, channel_type, is_private }
//   Expected to insert a row into Server_channels (using the
//   is_private column added alongside categories' this session) at the
//   next gap-based position within that category, and return any 2xx
//   status on success. Same "don't trust the response body, just
//   refetch" pattern as submitCreateCategory() above — the exact
//   success payload shape doesn't matter yet.
//
// NOTE: creating any of these types today just makes an entry in the
// channel list — none of them render real functionality yet (a blank
// "you are here" placeholder page is the plan, per this session's
// scope, but that page itself isn't built in this pass either).
async function submitCreateChannel() {
  const selected = document.querySelector('input[name="channel-type"]:checked');
  const name = document.getElementById("channel-name-input").value.trim();
  if (!selected || !name) return; // Create button should already be disabled in this case
  const isPrivate = document.getElementById("channel-private-toggle").checked;

  try {
    const response = await fetch(`https://${serverAddress}/create_channel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        category_id: channelModalCategoryId,
        name,
        channel_type: selected.value,
        is_private: isPrivate
      })
    });
    if (!response.ok) {
      console.error(`Failed to create channel: ${response.status}`);
      return;
    }
  } catch (e) {
    console.error("Failed to create channel, network error:", e);
    return;
  }
  closeChannelModal();
  refreshServerSidebar();
}

// ---- Announcement composer (inline, not a modal) ----
// Two states in the same #announcements-composer-bar slot: default
// (search box + New Post) and editing (title/body/Post), toggled by
// show/hideAnnounceComposerEditing rather than showing a separate
// popup — matches the reference design's actual behavior (composer
// takes over the top bar in place) rather than the modal this used to
// be before it got compared side-by-side against real Discord/Guilded
// screenshots and corrected. Doesn't refresh from a fetch afterward —
// there's no GET route for existing posts yet (that's the
// "persistence" build step, still ahead) — so the creator's own card
// is built directly from this route's response instead. Other
// connected members get the new post via server_broadcast + the
// announcement_created ws.onmessage branch, same as
// category_created/channel_created.
document.getElementById("announce-new-post-btn").addEventListener("click", showAnnounceComposerEditing);
document.getElementById("announce-composer-cancel-btn").addEventListener("click", hideAnnounceComposerEditing);
document.getElementById("announcement-post-btn").addEventListener("click", submitCreateAnnouncement);

function showAnnounceComposerEditing() {
  document.getElementById("announcement-title-input").value = "";
  document.getElementById("announcement-body-input").value = "";
  document.getElementById("announce-composer-default").style.display = "none";
  document.getElementById("announce-composer-editing").style.display = "flex";
  document.getElementById("announcement-title-input").focus();
}

function hideAnnounceComposerEditing() {
  document.getElementById("announce-composer-editing").style.display = "none";
  document.getElementById("announce-composer-default").style.display = "flex";
}

async function submitCreateAnnouncement() {
  const title = document.getElementById("announcement-title-input").value.trim();
  const body = document.getElementById("announcement-body-input").value.trim();
  if (!title || !body) return; // both required — no empty posts

  let post;
  try {
    const response = await fetch(`https://${serverAddress}/post_announcement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ channel_id: currentChannelId, title, body })
    });
    if (!response.ok) {
      console.error(`Failed to post announcement: ${response.status}`);
      return;
    }
    post = await response.json();
  } catch (e) {
    console.error("Failed to post announcement, network error:", e);
    return;
  }
  hideAnnounceComposerEditing();
  // post_announcement's response doesn't include created_at/username
  // (see Handoff.md) — using client-side values here for the creator's
  // own immediate view is a deliberate, temporary stand-in until the
  // persistence pass adds a real fetch-on-load and can supply the
  // authoritative timestamp instead.
  prependNewAnnouncementPost({
    id: post.id, title: post.title, body: post.body,
    created_at: new Date().toISOString(), username: myUsername
  });
}

// Shared between a freshly-created post, the announcement_created
// broadcast handler, and now the real fetch-on-load/pagination path
// below — one shape, one function, so none of them can visually drift
// apart. Pure: builds and returns a card, doesn't touch the DOM or
// currentAnnouncementPosts itself — callers decide where it goes.
// Built with createElement/textContent throughout, not innerHTML with
// concatenated strings, matching how renderClusteredMessages handles
// message content — post title/body/username are user-supplied text,
// never HTML.
function buildAnnouncementPostCard(post) {
  const card = document.createElement("div");
  card.className = "announce-post";

  const top = document.createElement("div");
  top.className = "announce-post-top";
  const avatar = document.createElement("div");
  avatar.className = "cluster-avatar";
  avatar.textContent = (post.username || "?").charAt(0).toUpperCase();
  const meta = document.createElement("div");
  meta.className = "announce-post-meta";
  const name = document.createElement("div");
  name.className = "announce-post-name";
  name.textContent = post.username || "Unknown";
  const role = document.createElement("div");
  role.className = "announce-post-role";
  // Only the owner can post right now (server-enforced in
  // post_announcement) — hardcoding "Owner" here is accurate today,
  // not a shortcut that'll silently go stale until real roles exist,
  // at which point this needs to come from the payload instead.
  role.textContent = "Owner";
  meta.appendChild(name);
  meta.appendChild(role);
  const menuBtn = document.createElement("button");
  menuBtn.className = "announce-post-menu-btn";
  menuBtn.title = "More (coming soon)";
  menuBtn.innerHTML = "&#8942;";
  top.appendChild(avatar);
  top.appendChild(meta);
  top.appendChild(menuBtn);

  const title = document.createElement("div");
  title.className = "announce-post-title";
  title.textContent = post.title;

  const body = document.createElement("div");
  body.className = "announce-post-body";
  body.textContent = post.body;

  const date = document.createElement("div");
  date.className = "announce-post-date";
  date.textContent = new Date(post.created_at).toLocaleString();

  const dividerTop = document.createElement("div");
  dividerTop.className = "announce-divider";
  const dividerMid = document.createElement("div");
  dividerMid.className = "announce-divider";

  const reactionsRow = document.createElement("div");
  reactionsRow.className = "announce-reactions-row";
  const reactions = document.createElement("div");
  reactions.className = "announce-reactions";
  const addReactionBtn = document.createElement("button");
  addReactionBtn.className = "announce-add-reaction-btn";
  addReactionBtn.title = "React (coming soon)";
  addReactionBtn.textContent = "+";
  reactions.appendChild(addReactionBtn);
  reactionsRow.appendChild(reactions);

  const commentsRow = document.createElement("div");
  commentsRow.className = "announce-comments-row";
  const commentsBtn = document.createElement("button");
  commentsBtn.className = "announce-comments-btn";
  // get_announcement_posts doesn't return comment_count yet — harmless
  // right now since comments don't exist to count, but worth adding to
  // that route's response once the comments table/routes get built.
  commentsBtn.textContent = `${post.comment_count || 0} comments`;
  commentsRow.appendChild(commentsBtn);

  card.appendChild(top);
  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(date);
  card.appendChild(dividerTop);
  card.appendChild(reactionsRow);
  card.appendChild(dividerMid);
  card.appendChild(commentsRow);
  return card;
}

// A brand-new post — either just created by this user, or pushed live
// via the announcement_created broadcast. Updates the source-of-truth
// array AND the DOM, since a live post needs to be accounted for by
// later pagination (loadOlderAnnouncementPosts anchors on the OLDEST
// loaded post's id, which this doesn't change, but currentAnnouncementPosts
// needs to stay a true reflection of what's on screen regardless).
function prependNewAnnouncementPost(post) {
  currentAnnouncementPosts.unshift(post);
  const container = document.getElementById("announcements-posts");
  const card = buildAnnouncementPostCard(post);
  if (container.firstChild) {
    container.insertBefore(card, container.firstChild);
  } else {
    container.appendChild(card);
  }
}

// Removes any existing end marker before possibly re-adding one — safe
// to call after every load/append so it never ends up duplicated or
// stuck in the middle of the list after older posts get appended below
// where it used to sit.
function updateAnnouncementEndMarker() {
  const container = document.getElementById("announcements-posts");
  const existing = container.querySelector(".announce-end-marker");
  if (existing) existing.remove();
  if (!announcementHasMoreHistory) {
    const marker = document.createElement("div");
    marker.className = "announce-end-marker";
    marker.textContent = "You're up to date!";
    container.appendChild(marker);
  }
}

// Initial fetch on opening an Announcements channel — replaces the old
// "reset to empty" placeholder behavior now that persistence is real.
// Resets all three pieces of pagination state, same as selectChannel
// resetting currentChannelMessages/channelHasMoreHistory for a channel
// switch.
async function loadAnnouncementPosts(channelId) {
  currentAnnouncementPosts = [];
  announcementHasMoreHistory = true;
  announcementIsLoadingMore = false;
  const container = document.getElementById("announcements-posts");
  container.innerHTML = "";
  try {
    const response = await fetch(`https://${serverAddress}/get_announcement/${channelId}`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    currentAnnouncementPosts = data.posts;
    if (data.posts.length < 25) announcementHasMoreHistory = false;
    data.posts.forEach(post => container.appendChild(buildAnnouncementPostCard(post)));
    updateAnnouncementEndMarker();
  } catch (e) { /* leave empty on failure */ }
}

// Triggered when the user scrolls toward the BOTTOM of currently-loaded
// posts — opposite end from loadOlderChannelMessages, since Announcements
// is newest-first/composer-on-top rather than oldest-first/composer-on-
// bottom. Same cursor-based pagination shape otherwise (oldest loaded
// post's real id, via before_id).
async function loadOlderAnnouncementPosts() {
  if (announcementIsLoadingMore || !announcementHasMoreHistory || currentAnnouncementPosts.length === 0) return;
  const oldest = currentAnnouncementPosts[currentAnnouncementPosts.length - 1];
  if (!oldest.id) return;
  announcementIsLoadingMore = true;

  try {
    const response = await fetch(`https://${serverAddress}/get_announcement/${currentChannelId}?before_id=${oldest.id}`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    if (data.posts.length < 25) announcementHasMoreHistory = false;
    currentAnnouncementPosts = currentAnnouncementPosts.concat(data.posts);
    const container = document.getElementById("announcements-posts");
    const existingMarker = container.querySelector(".announce-end-marker");
    if (existingMarker) existingMarker.remove();
    data.posts.forEach(post => container.appendChild(buildAnnouncementPostCard(post)));
    updateAnnouncementEndMarker();
  } catch (e) { /* leave state as-is on failure */ }

  announcementIsLoadingMore = false;
}

document.getElementById("announcements-posts").addEventListener("scroll", () => {
  const el = document.getElementById("announcements-posts");
  if (el.scrollTop + el.clientHeight > el.scrollHeight - 40) loadOlderAnnouncementPosts();
});


// ---- Party creation modal ----
// Max 9 selectable here since the creator themselves is the 10th member
// (the roadmap's party cap is 10 total). Re-fetches the friends list
// fresh every time the modal opens rather than reusing whatever's
// cached from the Friends view, so it can't show stale invite options.

let selectedPartyMembers = new Set();
const MAX_PARTY_INVITES = 9;

document.getElementById("create-party-btn").addEventListener("click", openPartyModal);
document.getElementById("party-modal-close").addEventListener("click", closePartyModal);
document.getElementById("party-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "party-modal-overlay") closePartyModal();
});
document.getElementById("party-modal-create-btn").addEventListener("click", submitCreateParty);

async function openPartyModal() {
  selectedPartyMembers = new Set();
  updatePartyModalCount();
  document.getElementById("party-modal-overlay").style.display = "flex";

  const rows = document.getElementById("party-modal-friend-rows");
  rows.innerHTML = "";

  try {
    const response = await fetch(`https://${serverAddress}/get_friends`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const allFriends = [...(data.online_friends || []), ...(data.offline_friends || [])];

    document.getElementById("party-modal-empty-note").style.display = allFriends.length === 0 ? "block" : "none";

    allFriends.forEach(friend => {
      const row = document.createElement("div");
      row.className = "friend-row";
      row.innerHTML = `<div class="avatar-dot"></div><div class="who"></div><input type="checkbox">`;
      row.querySelector(".avatar-dot").textContent = avatarLetter(friend.username);
      row.querySelector(".who").textContent = friend.username;
      const checkbox = row.querySelector("input");
      checkbox.addEventListener("change", () => togglePartyMember(friend.id, checkbox));
      rows.appendChild(row);
    });
  } catch (e) {
    console.error("Failed to load friends for party creation:", e);
  }
}

function togglePartyMember(id, checkbox) {
  if (checkbox.checked) {
    if (selectedPartyMembers.size >= MAX_PARTY_INVITES) {
      // Cap enforced here, not just visually — every OTHER unchecked box
      // gets disabled below once the cap is hit, but this still guards
      // the one that was already mid-click when the limit was reached.
      checkbox.checked = false;
      return;
    }
    selectedPartyMembers.add(id);
  } else {
    selectedPartyMembers.delete(id);
  }
  updatePartyModalCount();
}

function updatePartyModalCount() {
  document.getElementById("party-modal-count").textContent = `${selectedPartyMembers.size} / ${MAX_PARTY_INVITES} selected`;
  const atCap = selectedPartyMembers.size >= MAX_PARTY_INVITES;
  document.querySelectorAll("#party-modal-friend-rows input[type=checkbox]").forEach(box => {
    if (!box.checked) box.disabled = atCap;
  });
}

function closePartyModal() {
  document.getElementById("party-modal-overlay").style.display = "none";
}

async function submitCreateParty() {
  try {
    const response = await fetch(`https://${serverAddress}/create_party`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        party_name: `${myUsername}'s Party`,
        member_ids: Array.from(selectedPartyMembers)
      })
    });
    if (!response.ok) {
      console.error(`Failed to create party: ${response.status}`);
      return;
    }
  } catch (e) {
    console.error("Failed to create party, network error:", e);
    return;
  }
  closePartyModal();
  loadConversations();
}

// ---- Invite panel ----
// Shared by both servers and parties — openInviteModal takes the type so
// one panel/one set of functions handles both, rather than duplicating
// this whole block per feature. Unlike the party modal's friend
// checklist (max 9, since it's fixed at creation time), there's no cap
// here — you can send an invite link to as many friends as you want,
// since accept_invite is idempotent per-recipient regardless of how many
// people got the link.

let inviteModalTarget = { type: null, id: null, name: null };
let inviteModalCode = null;
let selectedInviteRecipients = new Set();

document.getElementById("invite-modal-close").addEventListener("click", closeInviteModal);
document.getElementById("invite-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "invite-modal-overlay") closeInviteModal();
});
document.getElementById("invite-copy-btn").addEventListener("click", copyInviteLink);
document.getElementById("invite-modal-send-btn").addEventListener("click", sendInvitesFromModal);

async function openInviteModal(type, id, name) {
  inviteModalTarget = { type, id, name };
  selectedInviteRecipients = new Set();
  updateInviteModalCount();
  document.getElementById("invite-modal-title").textContent = `Invite to ${name}`;
  document.getElementById("invite-copy-status").textContent = "";
  document.getElementById("invite-link-display").value = "Generating...";
  document.getElementById("invite-modal-overlay").style.display = "flex";

  const rows = document.getElementById("invite-modal-friend-rows");
  rows.innerHTML = "";

  // Two independent fetches — the code itself, and who to offer sending
  // it to — kept as separate try/catches so a failure in one doesn't
  // block the other from still showing something useful.
  try {
    const response = await fetch(`https://${serverAddress}/create_invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        type,
        server_id: type === "server" ? id : null,
        party_id: type === "party" ? id : null
      })
    });
    if (!response.ok) {
      document.getElementById("invite-link-display").value = "Failed to generate invite.";
      return;
    }
    const data = await response.json();
    inviteModalCode = data.invite_code;
    document.getElementById("invite-link-display").value = `https://oneira.cc/invite/${inviteModalCode}`;
  } catch (e) {
    document.getElementById("invite-link-display").value = "Failed to generate invite.";
    return;
  }

  try {
    const response = await fetch(`https://${serverAddress}/get_friends`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const allFriends = [...(data.online_friends || []), ...(data.offline_friends || [])];

    document.getElementById("invite-modal-empty-note").style.display = allFriends.length === 0 ? "block" : "none";

    allFriends.forEach(friend => {
      const row = document.createElement("div");
      row.className = "friend-row";
      row.innerHTML = `<div class="avatar-dot"></div><div class="who"></div><input type="checkbox">`;
      row.querySelector(".avatar-dot").textContent = avatarLetter(friend.username);
      row.querySelector(".who").textContent = friend.username;
      const checkbox = row.querySelector("input");
      checkbox.addEventListener("change", () => toggleInviteRecipient(friend.id, friend.username, checkbox));
      rows.appendChild(row);
    });
  } catch (e) { /* link still works even if the friend list fails to load */ }
}

function toggleInviteRecipient(id, username, checkbox) {
  if (checkbox.checked) {
    selectedInviteRecipients.add(JSON.stringify({ id, username }));
  } else {
    selectedInviteRecipients.delete(JSON.stringify({ id, username }));
  }
  updateInviteModalCount();
}

function updateInviteModalCount() {
  document.getElementById("invite-modal-count").textContent = `${selectedInviteRecipients.size} selected`;
}

function closeInviteModal() {
  document.getElementById("invite-modal-overlay").style.display = "none";
}

async function copyInviteLink() {
  const status = document.getElementById("invite-copy-status");
  try {
    await navigator.clipboard.writeText(document.getElementById("invite-link-display").value);
    status.textContent = "Copied to clipboard.";
  } catch (e) {
    // Clipboard API can fail (permissions, insecure context) — the input
    // itself is still readonly + selectable as a manual fallback.
    status.textContent = "Couldn't copy automatically — select and copy the link above.";
  }
}

// Sends the invite link as a completely normal DM — reusing the existing
// message send path unchanged, rather than a dedicated "send invite"
// endpoint. This is why block-checking, friend-checking, etc. all apply
// for free: send_message already enforces every one of those rules, so
// there's nothing extra to duplicate here. Each send is independent —
// one recipient failing (e.g. no longer friends) doesn't stop the rest.
function sendInvitesFromModal() {
  if (!inviteModalCode || !ws) return;
  const link = `https://oneira.cc/invite/${inviteModalCode}`;

  selectedInviteRecipients.forEach(entryJson => {
    const { id, username } = JSON.parse(entryJson);
    ws.send(JSON.stringify({ type: "message", receiver_id: id, content: link }));
    // Matches the same "sending bumps the sidebar" behavior sendChatMessage
    // already gives the currently-open conversation — applied here even
    // though none of these DMs are necessarily open right now.
    bumpConversation("dm", id, username, false);
  });

  closeInviteModal();
}

document.getElementById("add-friend-toggle").addEventListener("click", () => {
  const bar = document.getElementById("add-friend-bar");
  bar.style.display = bar.style.display === "flex" ? "none" : "flex";
});

async function sendFriendRequestFromMain() {
  const input = document.getElementById("add-friend-input");
  const status = document.getElementById("add-friend-status");
  const username = input.value.trim();
  if (!username) { status.textContent = "Enter a username first."; return; }
  status.textContent = "Sending...";
  try {
    const response = await fetch(`https://${serverAddress}/friend_user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      status.textContent = err.detail || `Failed (${response.status}).`;
      return;
    }
    status.textContent = `Friend request sent to ${username}.`;
    input.value = "";
  } catch (e) {
    status.textContent = "Could not reach server.";
  }
}

async function refreshFriendsView() {
  try {
    const response = await fetch(`https://${serverAddress}/get_friends`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    renderPendingRequests(data.pending_requests || []);
    renderFriendList("online", data.online_friends || []);
    renderFriendList("offline", data.offline_friends || []);
  } catch (e) { /* leave last render in place */ }
}

function renderFriendList(kind, list) {
  document.getElementById(`${kind}-heading`).textContent = `${kind === "online" ? "Online" : "Offline"} — ${list.length}`;
  document.getElementById(`${kind}-empty-note`).style.display = list.length === 0 ? "block" : "none";

  const rows = document.getElementById(`${kind}-rows`);
  rows.innerHTML = "";
  list.forEach(friend => {
    const row = document.createElement("div");
    row.className = "friend-row";
    row.style.cursor = "pointer";
    row.innerHTML = `<div class="avatar-dot"></div><div class="who"></div>`;
    row.querySelector(".avatar-dot").textContent = avatarLetter(friend.username);
    row.querySelector(".who").textContent = friend.username;
    row.addEventListener("click", () => openDirectMessage(friend.id, friend.username));
    row.addEventListener("contextmenu", (e) => showProfileContextMenu(e, friend.id, friend.username, false));
    rows.appendChild(row);
  });
}

function renderPendingRequests(list) {
  document.getElementById("pending-heading").textContent = `Pending — ${list.length}`;
  document.getElementById("pending-empty-note").style.display = list.length === 0 ? "block" : "none";

  const rows = document.getElementById("pending-rows");
  rows.innerHTML = "";
  list.forEach(req => rows.appendChild(buildPendingRow(req)));

  const badge = document.getElementById("pending-badge");
  if (list.length > 0) {
    badge.textContent = list.length;
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

function buildPendingRow(req) {
  const row = document.createElement("div");
  row.className = "friend-row";
  row.innerHTML = `
    <div class="avatar-dot"></div>
    <div class="who"></div>
    <div class="row-actions">
      <button class="accept-btn">Accept</button>
      <button class="deny-btn">Deny</button>
    </div>
  `;
  row.querySelector(".avatar-dot").textContent = avatarLetter(req.username);
  row.querySelector(".who").textContent = req.username;
  row.querySelector(".accept-btn").addEventListener("click", () => respondToRequest(req, true));
  row.querySelector(".deny-btn").addEventListener("click", () => respondToRequest(req, false));
  return row;
}

async function respondToRequest(req, accept) {
  const path = accept ? "/friend_user" : "/unfriend_user";
  const body = accept ? { username: req.username } : { user_id_2: req.id };
  try {
    await fetch(`https://${serverAddress}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    });
    if (accept) ensureConversationPresent(req.id, req.username);
  } catch (e) { /* fall through to refresh regardless */ }
  refreshFriendsView();
}

function switchMainView(viewName) {
  document.querySelectorAll(".main-view").forEach(v => v.classList.remove("active"));
  document.getElementById(`view-${viewName}`).classList.add("active");
  updateHomeBadge();
}

document.querySelectorAll("#secondary-nav .nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#secondary-nav .nav-item").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".dm-item").forEach(d => d.classList.remove("active"));
    btn.classList.add("active");
    switchMainView(btn.dataset.view);
    if (btn.dataset.view === "friends") refreshFriendsView();
  });
});

function loadConversations() {
  // DMs and parties live in completely separate backend tables, so this
  // is two independent fetches — merged into one array afterward so the
  // sidebar can interleave them by recency, the same way Discord does.
  // Both endpoints hand back a real timestamp (last_message_at /
  // last_activity) specifically so this merge has something honest to
  // sort by, rather than guessing at an order.
  // The Promise.all chain is returned (not just fired) so callers that
  // need to know "the list has actually finished loading" — like
  // handleJoinDeepLink, which can't open a party until it exists in
  // conversationList — can await/.then() this call rather than guessing
  // at timing.
  return Promise.all([
    fetch(`https://${serverAddress}/conversation_history`, { credentials: "include" })
      .then(response => response.ok ? response.json() : { conversations: [] })
      .catch(() => ({ conversations: [] })),
    fetch(`https://${serverAddress}/get_parties`, { credentials: "include" })
      .then(response => response.ok ? response.json() : { parties: [] })
      .catch(() => ({ parties: [] }))
  ]).then(([dmData, partyData]) => {
    // Seed unread counts from the DB on load, so messages that arrived
    // while offline (or before this page loaded) still show correctly —
    // bumpConversation only handles counts that arrive while connected.
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
      // No close (×) button on party rows — "closing" a party isn't a
      // real concept the way closing a DM is; leaving is the equivalent
      // action, and it lives in the context menu instead, matching how
      // Discord treats a group differently from a DM in this respect.
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

// Sending or receiving a message bumps a conversation to the top — the
// only two things that count as "interacting with" it per the design call.
// type+id together identify the entry, since a DM partner's id and a
// party's id can coincidentally collide — id alone is never enough.
function bumpConversation(type, id, name, incrementUnread) {
  let entry = conversationList.find(c => c.type === type && c.id === id);
  conversationList = conversationList.filter(c => !(c.type === type && c.id === id));
  if (!entry) {
    // memberCount defaults to 0 here — this fallback only fires if a
    // party message arrives for a party not already in the sidebar,
    // which shouldn't normally happen (get_parties loads it up front),
    // but a wrong member count is a cosmetic gap, not a crash.
    entry = type === "party"
      ? { type, id, name, memberCount: 0, unread: 0 }
      : { type, id, username: name, unread: 0 };
  }
  if (incrementUnread) entry.unread = (entry.unread || 0) + 1;
  conversationList.unshift(entry);
  renderConversationList();
}

// Opening a conversation (click, or a freshly accepted friend) must NOT
// reorder the sidebar — only actual message activity does that. DM-only:
// parties are always already present once created, since there's no
// per-user "close" for them yet.
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
  // Optimistic update: hide it immediately so the click feels instant,
  // then confirm with the server in the background. We keep a copy of
  // the removed entry so we can put it back if the request fails —
  // otherwise a failed close would silently disagree with the backend
  // until the next refresh, which is a confusing way to find out.
  // DM-only for now — no equivalent "leave party" endpoint exists yet.
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
        // History rows always have a real server timestamp.
        time: new Date(msg.timestamp)
      };
    });
    if (currentMessages.length < 25) hasMoreHistory = false;
    renderMessages();
  } catch (e) { renderMessages(); /* leave empty on failure */ }
}

// Opening a party mirrors openDirectMessage exactly, just pointed at the
// party endpoints — this is the "universal chat window" design in
// practice: everything downstream (rendering, clustering, composer)
// works off openChatType/openChatId/currentMessages, and doesn't care
// which of these two functions populated them.
async function openParty(id, name) {
  openChatType = "party";
  openChatId = id;
  openChatName = name;
  document.querySelectorAll("#secondary-nav .nav-item").forEach(b => b.classList.remove("active"));
  switchMainView("chat");
  document.getElementById("chat-header-title").textContent = name;
  // No party-specific header actions (Remove Friend/Block make no sense
  // for a group) exist yet — hidden until that design pass happens.
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

// Triggered when the user scrolls to the top of currently-loaded history.
// Uses the oldest loaded message's real database id as a cursor — see
// the backend route's before_id parameter. Scroll position is preserved
// afterward so prepending older messages doesn't visually jump the view.
async function loadOlderMessages() {
  if (isLoadingMore || !hasMoreHistory || currentMessages.length === 0) return;
  const oldest = currentMessages[0];
  if (!oldest.id) return; // no real cursor to anchor on (shouldn't normally happen)
  isLoadingMore = true;

  const chatBody = document.getElementById("chat-body");
  const prevScrollHeight = chatBody.scrollHeight;
  const prevScrollTop = chatBody.scrollTop;

  try {
    const url = openChatType === "party"
      ? `https://${serverAddress}/get_party_messages/${openChatId}?before_id=${oldest.id}`
      : `https://${serverAddress}/messages/${openChatId}?before_id=${oldest.id}`;
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const older = data.messages.map(msg => {
      const isMine = openChatType === "party" ? msg.username === myUsername : msg.sender_id !== openChatId;
      return {
        id: msg.id,
        isMine,
        senderId: msg.sender_id,
        username: isMine ? myUsername : (openChatType === "party" ? msg.username : openChatName),
        content: msg.content,
        time: new Date(msg.timestamp)
      };
    });
    if (older.length < 25) hasMoreHistory = false;
    currentMessages = older.concat(currentMessages);
    renderMessages({ preserveScroll: true });
    // Restore the same relative viewing position rather than jumping to
    // the very top or snapping back to the bottom.
    chatBody.scrollTop = chatBody.scrollHeight - prevScrollHeight + prevScrollTop;
  } catch (e) { /* leave state as-is on failure */ }

  isLoadingMore = false;
}

// A cluster is one avatar + one name + one timestamp, holding one or more
// messages from the same sender sent close together in time (see
// CLUSTER_GAP_MINUTES). This is intentionally recomputed from scratch on
// every call rather than incrementally patched — see the comment on
// currentMessages above for why that matters once edit/delete exist.
//
// opts.preserveScroll: true when called from loadOlderMessages(), which
// manages scroll position itself afterward (restoring the user's exact
// viewing spot). Every other caller (initial load, send, receive) wants
// the default behavior: snap to the bottom, since #chat-body is the
// element that actually scrolls — NOT #chat-messages, which has no
// overflow of its own.
// Shared by renderMessages (DMs/parties) and renderChannelMessages
// (server channels) — the actual cluster-building loop doesn't care
// which kind of conversation it's rendering, only the container element
// and the message array. Pulled out specifically so channel messaging
// gets the exact same clustering/system-divider behavior for free,
// rather than a second hand-copied implementation that could drift out
// of sync with this one over time.
function renderClusteredMessages(wrap, messages) {
  let openCluster = null; // { isMine, lastTime, bubbleEl }

  messages.forEach(msg => {
    // No sender means this is a system notice (leave-party today, more
    // kinds later), not a real chat message — it always renders as a
    // full-width divider, never a cluster/bubble, regardless of who's
    // above or below it. openCluster is reset to null afterward so the
    // NEXT real message always starts a fresh cluster rather than
    // silently merging into whatever cluster was open before the
    // divider — a system notice breaking up two same-sender messages
    // should visually separate them, not be invisible to the grouping.
    if (msg.senderId === null) {
      wrap.appendChild(buildSystemDivider(msg));
      openCluster = null;
      return;
    }

    // isMine alone used to be enough to identify "same sender as last" —
    // true for a DM, since there's only ever one possible "not me"
    // person. In a party (or a server channel, same reasoning) there can
    // be many other senders, so two different other people messaging
    // back to back within the gap window would otherwise wrongly merge
    // into one bubble. username is always populated for every message
    // (self included) and uniquely identifies the actual sender, so it's
    // the real clustering key; isMine still decides left/right layout.
    const sameSenderAsLast = openCluster && openCluster.isMine === msg.isMine && openCluster.username === msg.username;
    const withinGap = openCluster &&
      (msg.time - openCluster.lastTime) <= CLUSTER_GAP_MINUTES * 60 * 1000;

    if (!(sameSenderAsLast && withinGap)) {
      openCluster = startNewCluster(wrap, msg);
    } else {
      const line = document.createElement("div");
      line.className = "bubble-line";
      line.textContent = msg.content;
      line.addEventListener("contextmenu", (e) => showMessageContextMenu(e, msg));
      openCluster.bubbleEl.appendChild(line);
      attachInviteCardIfNeeded(openCluster.bubbleEl, msg.content);
    }

    openCluster.lastTime = msg.time;
  });
}

function renderMessages(opts = {}) {
  const wrap = document.getElementById("chat-messages");
  wrap.innerHTML = "";

  if (openChatId !== null) {
    wrap.appendChild(
      openChatType === "party"
        ? buildPartyStartCard(openChatName)
        : buildConversationStartCard(openChatId, openChatName)
    );
  }

  renderClusteredMessages(wrap, currentMessages);

  // #chat-body is the actual scrolling element (overflow-y: auto lives
  // there, not on #chat-messages) — this was previously targeting the
  // wrong element and silently doing nothing; CSS's justify-content:
  // flex-end was masking that by coincidence. loadOlderMessages()
  // manages scroll position itself, so skip this when preserving.
  if (!opts.preserveScroll) {
    const chatBody = document.getElementById("chat-body");
    chatBody.scrollTop = chatBody.scrollHeight;
  }
}

// Channel equivalent of renderMessages — same shape, pointed at
// #channel-messages/currentChannelMessages/#channel-body instead. No
// openChatType branch needed here since every channel gets the same
// start card (buildChannelStartCard), unlike DMs vs. parties which each
// get their own.
function renderChannelMessages(opts = {}) {
  const wrap = document.getElementById("channel-messages");
  wrap.innerHTML = "";

  if (currentChannelId !== null) {
    wrap.appendChild(buildChannelStartCard(currentChannelName));
  }

  renderClusteredMessages(wrap, currentChannelMessages);

  if (!opts.preserveScroll) {
    const channelBody = document.getElementById("channel-body");
    channelBody.scrollTop = channelBody.scrollHeight;
  }
}

// One-line, no avatar, no bubble — just the finished sentence centered
// in the divider. Nothing here needs msg.username/msg.senderId at all,
// since the content string is already the complete, self-contained
// message (see leave_party on the backend) — there's no "sender" to
// attribute this to, by design.
function buildSystemDivider(msg) {
  const divider = document.createElement("div");
  divider.className = "system-divider";
  divider.textContent = msg.content;
  return divider;
}

function startNewCluster(wrap, msg) {
  const cluster = document.createElement("div");
  cluster.className = "msg-cluster " + (msg.isMine ? "self" : "other");

  const avatar = document.createElement("div");
  avatar.className = "cluster-avatar";
  avatar.textContent = avatarLetter(msg.username);
  avatar.addEventListener("contextmenu", (e) => showProfileContextMenu(e, msg.senderId, msg.username, msg.isMine));

  const body = document.createElement("div");
  body.className = "cluster-body";

  const header = document.createElement("div");
  header.className = "cluster-header";
  const name = document.createElement("span");
  name.className = "cluster-name";
  name.textContent = msg.username;
  name.addEventListener("contextmenu", (e) => showProfileContextMenu(e, msg.senderId, msg.username, msg.isMine));
  const time = document.createElement("span");
  time.className = "cluster-time";
  time.textContent = formatClusterTime(msg.time);
  header.appendChild(name);
  header.appendChild(time);

  const bubble = document.createElement("div");
  bubble.className = "cluster-bubble";
  const firstLine = document.createElement("div");
  firstLine.className = "bubble-line";
  firstLine.textContent = msg.content;
  firstLine.addEventListener("contextmenu", (e) => showMessageContextMenu(e, msg));
  bubble.appendChild(firstLine);
  attachInviteCardIfNeeded(bubble, msg.content);

  body.appendChild(header);
  body.appendChild(bubble);
  cluster.appendChild(avatar);
  cluster.appendChild(body);
  wrap.appendChild(cluster);

  return { isMine: msg.isMine, username: msg.username, lastTime: msg.time, bubbleEl: bubble };
}

// "24 hours old" is relative to the moment this renders, not the calendar
// date — a message from 11 PM last night is 2 hours old at 1 AM, and
// should NOT show a date yet just because it crossed midnight.
function formatClusterTime(date) {
  const ageMs = Date.now() - date.getTime();
  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (ageMs < 24 * 60 * 60 * 1000) return timeStr;
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateStr} \u00b7 ${timeStr}`;
}

// Checks whether a message's raw content is exactly an invite link and,
// if so, appends a card underneath it inside the same bubble — the link
// text itself is left untouched above the card, same as any chat app
// unfurling a pasted URL rather than replacing it. Renders a lightweight
// "Loading..." placeholder first since GET /invite/{code} is a real
// network round trip; the message text itself still appears instantly.
function attachInviteCardIfNeeded(bubbleEl, content) {
  const match = content.match(INVITE_LINK_REGEX);
  if (!match) return;
  const code = match[1];

  const card = document.createElement("div");
  card.className = "invite-card";
  card.innerHTML = `<div class="invite-card-subtitle">Loading invite...</div>`;
  bubbleEl.appendChild(card);

  fetch(`https://${serverAddress}/invite/${code}`, { credentials: "include" })
    .then(response => response.ok ? response.json() : { valid: false })
    .then(data => renderInviteCard(card, code, data))
    .catch(() => renderInviteCard(card, code, { valid: false }));
}

// Fills in the placeholder card built above once GET /invite/{code}
// responds. Matches mockup 3's flat "no longer usable" treatment for the
// invalid case, and the two other mockups' info-then-button layout for
// a real server/party invite — condensed to fit inside a chat bubble
// rather than the full standalone-page size those mockups show.
function renderInviteCard(card, code, data) {
  if (data.valid === false) {
    card.classList.add("invalid");
    card.innerHTML = `
      <div class="invite-card-header">
        <div class="invite-card-badge">!</div>
        <div>
          <div class="invite-card-invalid-text">Invalid Invite</div>
          <div class="invite-card-subtitle">Ask for a new invite.</div>
        </div>
      </div>`;
    return;
  }

  const isParty = data.type === "party";
  const name = isParty ? data.party_name : data.server_name;
  // The party lookup only tells us full-or-not, not an exact count (see
  // get_invite_info's deliberately lean response) — so unlike the
  // server card, there's no member/online tally to show here yet.
  const subtitle = isParty
    ? (data.full ? "This party is currently full." : "Click below to join.")
    : `${data.active_users} Online \u00b7 ${data.total_users} Members`;

  card.innerHTML = `
    <div class="invite-card-header">
      <div class="invite-card-badge"></div>
      <div>
        <div class="invite-card-name"></div>
        <div class="invite-card-subtitle"></div>
      </div>
    </div>
    <button class="invite-card-btn">${isParty && data.full ? "Party is Full" : "Join " + (isParty ? "Party" : "Server")}</button>`;
  card.querySelector(".invite-card-badge").textContent = isParty ? avatarLetter(name) : serverAvatarLetters(name);
  card.querySelector(".invite-card-name").textContent = name;
  card.querySelector(".invite-card-subtitle").textContent = subtitle;

  const btn = card.querySelector(".invite-card-btn");
  if (isParty && data.full) {
    btn.disabled = true;
  } else {
    btn.addEventListener("click", () => joinInviteFromCard(code, btn));
  }
}

// Deep-links straight into the joined server/party, per the design
// call: accepting an invite shouldn't just add the membership silently,
// it should take you there. Reloads the relevant list first (loadServers/
// loadConversations) since a brand-new server/party won't exist in
// serverList/conversationList yet — openServer specifically needs a real
// rail icon element to hand to selectRailIcon, hence looking it up by
// the data-server-id attribute renderServerList now sets on every icon.
async function joinInviteFromCard(code, btnEl) {
  btnEl.disabled = true;
  btnEl.textContent = "Joining...";

  let data;
  try {
    const response = await fetch(`https://${serverAddress}/accept_invite?code=${code}`, {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) {
      btnEl.textContent = "Failed \u2014 try again";
      btnEl.disabled = false;
      return;
    }
    data = await response.json();
  } catch (e) {
    btnEl.textContent = "Failed \u2014 try again";
    btnEl.disabled = false;
    return;
  }

  if (data.full) {
    btnEl.textContent = "Party is Full";
    return;
  }

  if (data.type === "party") {
    await loadConversations();
    openParty(data.id, data.party_name);
  } else if (data.type === "server") {
    await loadServers();
    const iconEl = document.querySelector(`.server-icon[data-server-id="${data.id}"]`);
    openServer(data.id, iconEl);
  }
}

// Sits once at the very top of message history — signals "you've reached
// the start, nothing more to load" and hosts Remove Friend / Block.
// Rebuilt fresh on every renderMessages() call, same as the clusters
// below it, so it always reflects openChatId/openChatName correctly
// even right after switching conversations.
function buildConversationStartCard(id, username) {
  const card = document.createElement("div");
  card.className = "convo-start-card";

  const avatar = document.createElement("div");
  avatar.className = "convo-start-avatar";
  avatar.textContent = avatarLetter(username);

  const name = document.createElement("div");
  name.className = "convo-start-name";
  name.textContent = username;

  const meta = document.createElement("div");
  meta.className = "convo-start-meta"; // placeholder line — mutual-servers-style info, later

  const desc = document.createElement("div");
  desc.className = "convo-start-desc";
  desc.textContent = `This is the beginning of your direct message history with ${username}.`;

  const actions = document.createElement("div");
  actions.className = "convo-start-actions";

  const removeBtn = document.createElement("button");
  removeBtn.className = "icon-btn";
  removeBtn.textContent = "Remove Friend";
  removeBtn.onclick = () => handleRemoveFriend(id, username, actions);

  const blockBtn = document.createElement("button");
  blockBtn.className = "danger-btn";
  blockBtn.textContent = "Block";
  blockBtn.onclick = () => handleBlockUser(id, username, actions);

  actions.appendChild(removeBtn);
  actions.appendChild(blockBtn);

  card.appendChild(avatar);
  card.appendChild(name);
  card.appendChild(meta);
  card.appendChild(desc);
  card.appendChild(actions);
  return card;
}

// Party equivalent of the card above. Deliberately minimal — no
// Remove Friend/Block (neither applies to a group), and no party
// settings/rename/invite actions yet since none of that exists on the
// backend yet. Revisit once party settings are designed.
function buildPartyStartCard(name) {
  const card = document.createElement("div");
  card.className = "convo-start-card";

  const avatar = document.createElement("div");
  avatar.className = "convo-start-avatar";
  avatar.textContent = avatarLetter(name);

  const nameEl = document.createElement("div");
  nameEl.className = "convo-start-name";
  nameEl.textContent = name;

  const desc = document.createElement("div");
  desc.className = "convo-start-desc";
  desc.textContent = `This is the beginning of ${name}.`;

  card.appendChild(avatar);
  card.appendChild(nameEl);
  card.appendChild(desc);
  return card;
}

// Channel equivalent of the two start cards above. Every channel gets
// this same generic card — no Remove Friend/Block (doesn't apply) and no
// per-channel settings/pin actions yet (none of that exists on the
// backend). "#" reuses the same avatar-circle treatment as a person's
// initial, just with a static glyph instead of a computed letter.
function buildChannelStartCard(name) {
  const card = document.createElement("div");
  card.className = "convo-start-card";

  const avatar = document.createElement("div");
  avatar.className = "convo-start-avatar";
  avatar.textContent = "#";

  const nameEl = document.createElement("div");
  nameEl.className = "convo-start-name";
  nameEl.textContent = `#${name}`;

  const desc = document.createElement("div");
  desc.className = "convo-start-desc";
  desc.textContent = `This is the start of #${name}. Welcome!`;

  card.appendChild(avatar);
  card.appendChild(nameEl);
  card.appendChild(desc);
  return card;
}

async function handleRemoveFriend(id, username, actionsEl) {
  try {
    const response = await fetch(`https://${serverAddress}/unfriend_user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ user_id_2: id })
    });
    if (!response.ok) return;
    actionsEl.innerHTML = "";
    const status = document.createElement("div");
    status.className = "convo-start-status";
    status.textContent = `You are no longer friends with ${username}.`;
    actionsEl.appendChild(status);
    disableComposer(`You can't message ${username} \u2014 you're no longer friends.`);
  } catch (e) { /* leave the buttons as-is on failure */ }
}

async function handleBlockUser(id, username, actionsEl) {
  try {
    const response = await fetch(`https://${serverAddress}/block`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ blocked_user: id })
    });
    if (!response.ok) return;
    actionsEl.innerHTML = "";
    const status = document.createElement("div");
    status.className = "convo-start-status";
    status.textContent = `You have blocked ${username}.`;
    actionsEl.appendChild(status);
    disableComposer(`You can't message ${username} \u2014 blocked.`);
  } catch (e) { /* leave the buttons as-is on failure */ }
}

// Read-only mode for the composer — used after Remove Friend/Block, since
// the backend's own friend-check would reject a send anyway; this just
// makes that plain up front instead of letting the user type into a
// message that's guaranteed to fail.
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

// Channel equivalents of disableComposer/enableComposer above, targeting
// #channel-composer's own elements. label is the already-computed
// "#channel-name" (or the bare voice channel name) string selectChannel
// builds, reused here so the placeholder always matches the header.
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

function sendChatMessage() {
  const input = document.getElementById("composer-input");
  const content = input.value.trim();
  if (!content || openChatId === null || !ws) return;

  const payload = openChatType === "party"
    ? { type: "party_message", party_id: openChatId, content }
    : { type: "message", receiver_id: openChatId, content };
  ws.send(JSON.stringify(payload));

  currentMessages.push({
    isMine: true,
    username: myUsername || "You",
    content,
    time: new Date() // optimistic local echo — no round trip to wait on
  });
  renderMessages();
  bumpConversation(openChatType, openChatId, openChatName, false);
  input.value = "";
  autoGrowComposer(); // shrink back down after clearing
}

// Grows the composer textarea to fit its content, up to 5 lines, then
// leaves it fixed height and lets the textarea's own scrollbar take over.
function autoGrowComposer() {
  const el = document.getElementById("composer-input");
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

document.getElementById("composer-input").addEventListener("input", autoGrowComposer);

document.getElementById("composer-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // stop the textarea's default newline insertion
    sendChatMessage();
  }
});

// Channel equivalent of sendChatMessage — same optimistic-echo shape,
// pointed at #channel-composer-input/currentChannelId/
// currentChannelMessages instead. sender_id isn't sent in the payload:
// the backend fills that in from the verified session itself (see
// message_server_channel), matching the same "never trust the client for
// identity" rule WebSocket identity already follows elsewhere.
function sendChannelMessage() {
  const input = document.getElementById("channel-composer-input");
  const content = input.value.trim();
  if (!content || currentChannelId === null || !ws) return;

  ws.send(JSON.stringify({ type: "channel_message", channel_id: currentChannelId, content }));

  currentChannelMessages.push({
    senderId: myUserId,
    isMine: true,
    username: myUsername || "You",
    content,
    time: new Date() // optimistic local echo — no round trip to wait on
  });
  renderChannelMessages();
  input.value = "";
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

document.querySelectorAll(".settings-nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".settings-nav-item").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".settings-section").forEach(s => s.style.display = "none");
    btn.classList.add("active");
    document.getElementById(`settings-${btn.dataset.section}`).style.display = "block";
  });
});

document.querySelectorAll("#topbar .tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#topbar .tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

document.getElementById("home-icon").addEventListener("click", () => {
  selectRailIcon("home", document.getElementById("home-icon"));

  // Reverses everything openServer() does. Remembering the last DM/party
  // you had open (so Home could restore it instead of resetting) is a
  // real planned QOL feature, but explicitly deferred — see Handoff.md —
  // so today Home always lands back on the blank "no conversation
  // selected" state, same as it did before servers existed.
  currentServerId = null;
  currentServerOwnerId = null;
  currentChannelId = null;
  currentChannelType = null;
  currentChannelName = null;
  document.getElementById("server-sidebar-view").style.display = "none";
  document.getElementById("dm-sidebar-view").style.display = "flex";

  resetChatView();
});

// Scroll-to-top triggers loading older history. Threshold of 40px rather
// than exactly 0 so it fires a moment before the user hits the hard
// edge — feels less abrupt than waiting for scrollTop to hit zero.
document.getElementById("chat-body").addEventListener("scroll", () => {
  const chatBody = document.getElementById("chat-body");
  if (chatBody.scrollTop < 40) loadOlderMessages();
});

// Channel equivalent of loadOlderMessages — same cursor-based pagination
// (oldest loaded message's real id, via before_id) and same scroll-
// position preservation, pointed at get_channel_history/#channel-body/
// currentChannelMessages instead.
async function loadOlderChannelMessages() {
  if (channelIsLoadingMore || !channelHasMoreHistory || currentChannelMessages.length === 0) return;
  const oldest = currentChannelMessages[0];
  if (!oldest.id) return; // no real cursor to anchor on (shouldn't normally happen)
  channelIsLoadingMore = true;

  const channelBody = document.getElementById("channel-body");
  const prevScrollHeight = channelBody.scrollHeight;
  const prevScrollTop = channelBody.scrollTop;

  try {
    const response = await fetch(`https://${serverAddress}/get_channel_history/${currentChannelId}?before_id=${oldest.id}`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const older = data.messages.map(msg => ({
      id: msg.id,
      isMine: msg.sender_id === myUserId,
      senderId: msg.sender_id,
      username: msg.username,
      content: msg.content,
      time: new Date(msg.timestamp)
    }));
    if (older.length < 25) channelHasMoreHistory = false;
    currentChannelMessages = older.concat(currentChannelMessages);
    renderChannelMessages({ preserveScroll: true });
    channelBody.scrollTop = channelBody.scrollHeight - prevScrollHeight + prevScrollTop;
  } catch (e) { /* leave state as-is on failure */ }

  channelIsLoadingMore = false;
}

document.getElementById("channel-body").addEventListener("scroll", () => {
  const channelBody = document.getElementById("channel-body");
  if (channelBody.scrollTop < 40) loadOlderChannelMessages();
});
