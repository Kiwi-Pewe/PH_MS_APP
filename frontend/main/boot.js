// ==================================================================
// boot.js - Startup, session identity, and the WebSocket inbound router.
// ==================================================================

window.addEventListener("load", () => {
  serverAddress = API_HOST;

  // Identity comes from the verified session (/whoami), not a trusted
  // client-side param. credentials: "include" needed since api.oneira.cc
  // is a different origin from oneira.cc.
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

  // True only once this socket has opened. A page-unload also fires
  // onclose but isn't a rejected session — only a close BEFORE ever
  // opening means the server actually refused (e.g. bad session cookie).
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

    // Backend never broadcasts channel_message back to the sender, so
    // isMine is always false here. Per-channel unread tracking is
    // deferred, so an unopened channel gets no visible signal.
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

    // Sender is excluded from these broadcasts (server_broadcast's
    // exclude_user_id), so no double-add guard needed for our own creations.
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

    if (data.type === "announcement_created") {
      if (currentChannelId === data.post.channel_id) {
        appendNewAnnouncementPost(data.post);
      }
    }

    // Not gated on the channel being open — commentThreadElements only
    // has entries for posts actually rendered, so the lookup is the
    // guard. Count always updates; comment only appends if expanded.
    if (data.type === "announcement_comment") {
      const els = commentThreadElements[data.post_id];
      const state = commentThreadState[data.post_id];
      if (els) {
        els.btnEl.textContent = `${data.comment.comment_count} comments`;
        if (state && state.expanded) {
          state.comments.push(data.comment);
          els.listEl.appendChild(buildCommentElement(data.comment));
        }
      }
    }

    // Deleter never receives this broadcast — their own cleanup happens
    // directly in deleteCommentFromContextMenu instead.
    if (data.type === "comment_deleted") {
      removeCommentFromThread(data.post_id, data.comment_id, data.comment_count);
    }

    // Same exclude_user_id pattern — deleter's own cleanup happens
    // directly in deletePostFromContextMenu instead. Not gated on the
    // channel being open, same reasoning as announcement_comment above:
    // removePostFromView's own DOM/array lookups are the guard, and
    // simply no-op if this post isn't currently rendered.
    if (data.type === "announcement_deleted") {
      removePostFromView(data.post_id);
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

  // Wired once here, not in renderServerSidebar — #server-sidebar-body
  // is static markup, never rebuilt. Category/channel rows call
  // e.stopPropagation() so this only fires for genuine blank space.
  document.getElementById("server-sidebar-body").addEventListener("contextmenu", showServerAreaContextMenu);
}

// Handles arriving fresh from invite.html after accepting an invite
// there. Strips the query params via replaceState so a manual refresh
// doesn't re-navigate to the same place.
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
