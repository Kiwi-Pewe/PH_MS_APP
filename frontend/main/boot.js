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
      myDisplayName = data.display_name || data.username;
      myUserId = data.id;
      if (typeof hydrateAppearance === "function") hydrateAppearance(data.appearance);
      if (typeof hydrateAccessibility === "function") hydrateAccessibility(data.accessibility);
      if (typeof hydrateLanguageTime === "function") hydrateLanguageTime(data.language_time);
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

    if (data.type === "message_ack" && data.temp_id) {
      const row = currentMessages.find(m => m.tempId === data.temp_id)
        || currentChannelMessages.find(m => m.tempId === data.temp_id);
      if (row) row.id = data.id;
    }

    if (data.type === "message_pending_delete" && deletionEventTargetsOpenChat(data)) {
      markLocalPending(data.kind, data.message_id, data.deletion_requested_at);
    }
    if (data.type === "message_reinstated" && deletionEventTargetsOpenChat(data)) {
      markLocalReinstated(data.kind, data.message_id);
    }
    if (data.type === "message_deleted" && deletionEventTargetsOpenChat(data)) {
      if (data.tombstone) markLocalDeleted(data.kind, data.message_id);
      else removeLocalMessage(data.kind, data.message_id);
    }
    if (data.type === "message_reacted" && deletionEventTargetsOpenChat(data)) {
      const row = findLocalMessage(data.kind, data.message_id);
      if (row) {
        row.reactions = applyReactionMe(data.reactions || []);
        rerenderForKind(data.kind);
      }
    }
    if (data.type === "message_edited" && deletionEventTargetsOpenChat(data)) {
      const row = findLocalMessage(data.kind, data.message_id);
      if (row) {
        row.content = data.content;
        row.attachment = typeof parseAttachment === "function" ? parseAttachment(data.attachment) : data.attachment;
        row.edited = true;
        if (typeof applyMentionFields === "function") applyMentionFields(row, data);
        rerenderForKind(data.kind);
      }
    }

    if (data.type === "typing") {
      if (typeof noteRemoteTyping === "function") noteRemoteTyping(data);
    }

    if (data.type === "message") {
      const isOpen = openChatType === "dm" && openChatId === data.sender_id;
      bumpConversation("dm", data.sender_id, data.username, !isOpen);
      if (isOpen) {
        const row = {
          id: data.id,
          chatKind: "dm",
          isMine: false,
          senderId: data.sender_id,
          username: data.username,
          content: data.content,
          attachment: typeof parseAttachment === "function" ? parseAttachment(data.attachment) : data.attachment,
          time: data.timestamp ? new Date(data.timestamp) : new Date(),
          edited: false,
          reactions: []
        };
        if (typeof applyMentionFields === "function") applyMentionFields(row, data);
        currentMessages.push(row);
        renderMessages();
        if (typeof clearRemoteTyper === "function") clearRemoteTyper(data.sender_id);
      }
    }

    if (data.type === "party_message") {
      const isOpen = openChatType === "party" && openChatId === data.party_id;
      bumpConversation("party", data.party_id, data.party_name, !isOpen, { mentioned: !!data.mentioned });
      if (isOpen) {
        if (typeof stampPartyView === "function") stampPartyView(data.party_id);
        const row = {
          id: data.id,
          chatKind: "party",
          isMine: false,
          senderId: data.sender_id,
          username: data.username,
          content: data.content,
          attachment: typeof parseAttachment === "function" ? parseAttachment(data.attachment) : data.attachment,
          time: data.timestamp ? new Date(data.timestamp) : new Date(),
          edited: false
        };
        if (typeof applyMentionFields === "function") applyMentionFields(row, data);
        currentMessages.push(row);
        renderMessages();
        if (typeof clearRemoteTyper === "function") clearRemoteTyper(data.sender_id);
      }
    }

    if (data.type === "channel_message") {
      const isOpen = currentChannelId === data.channel_id;
      if (typeof noteIncomingChannelMessage === "function") {
        noteIncomingChannelMessage(data.channel_id, data.server_id, !!data.mentioned, isOpen);
      }
      if (isOpen) {
        const row = {
          id: data.id,
          chatKind: "channel",
          senderId: data.sender_id,
          isMine: false,
          username: data.username,
          content: data.content,
          attachment: typeof parseAttachment === "function" ? parseAttachment(data.attachment) : data.attachment,
          time: data.timestamp ? new Date(data.timestamp) : new Date(),
          edited: false,
          reactions: []
        };
        if (typeof applyMentionFields === "function") applyMentionFields(row, data);
        currentChannelMessages.push(row);
        renderChannelMessages();
        if (typeof clearRemoteTyper === "function") clearRemoteTyper(data.sender_id);
      }
    }

    // Mirrors channel_message above almost exactly, because a forum
    // thread IS the channel chat view with a different id behind it -
    // only the "is this the open one" test differs. Sender is excluded
    // server-side, so isMine is always false here.
    if (data.type === "forum_message") {
      const isOpen = openForumPostId === data.post_id;
      if (typeof noteIncomingChannelMessage === "function") {
        noteIncomingChannelMessage(data.channel_id, data.server_id, !!data.mentioned, isOpen);
      }
      if (isOpen) {
        const row = {
          id: data.id,
          chatKind: "forum",
          senderId: data.sender_id,
          isMine: false,
          username: data.username,
          content: data.content,
          attachment: typeof parseAttachment === "function" ? parseAttachment(data.attachment) : data.attachment,
          time: data.timestamp ? parseUtcTimestamp(data.timestamp) : new Date(),
          edited: false,
          reactions: []
        };
        if (typeof applyMentionFields === "function") applyMentionFields(row, data);
        currentChannelMessages.push(row);
        renderChannelMessages();
        if (typeof clearRemoteTyper === "function") clearRemoteTyper(data.sender_id);
      }
    }

    // NOT gated on the channel being open, same reasoning as
    // announcement_comment below: forumCardElements only has entries for
    // cards actually built, so the lookup is its own guard. Unlike every
    // other broadcast here the sender is NOT excluded from this one -
    // they're inside the thread while their own card list sits behind
    // them, so letting it reach them keeps that card correct with no
    // separate local-patch path.
    if (data.type === "forum_post_updated") {
      patchForumCard(data.post_id, data.message_count, data.last_activity);
    }

    if (data.type === "forum_post_edited") {
      applyForumPostEdit(data);
    }

    if (data.type === "forum_post_deleted") {
      removeForumPostFromView(data.post_id);
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

    if (data.type === "channel_deleted") {
      if (currentServerId === data.server_id) {
        applyChannelDeleted(data.category_id, data.channel_id);
      }
    }

    if (data.type === "category_deleted") {
      if (currentServerId === data.server_id) {
        applyCategoryDeleted(data.category_id);
      }
    }

    if (data.type === "server_icon_updated") {
      if (typeof applyServerIcon === "function") applyServerIcon(data.server_id, data.icon_url || "");
    }

    if (data.type === "server_banner_updated") {
      if (typeof applyServerBanner === "function") {
        applyServerBanner(data.server_id, {
          banner_url: data.banner_url || "",
          banner_color: data.banner_color || ""
        });
      }
    }

    if (data.type === "server_name_updated") {
      if (typeof applyServerName === "function") applyServerName(data.server_id, data.name || "");
    }

    if (data.type === "server_about_updated") {
      if (typeof applyServerAbout === "function") applyServerAbout(data.server_id, data.about || "");
    }

    if (data.type === "server_url_updated") {
      if (typeof applyServerUrl === "function") applyServerUrl(data.server_id, data.url_slug || "");
    }

    if (data.type === "server_type_updated") {
      if (typeof applyServerType === "function") applyServerType(data.server_id, data.server_type || "");
    }

    if (data.type === "server_timezone_updated") {
      if (typeof applyServerTimezone === "function") applyServerTimezone(data.server_id, data.timezone || "");
    }

    if (data.type === "server_notifications_updated") {
      if (typeof applyServerNotifications === "function") {
        applyServerNotifications(data.server_id, data.default_notifications || "mentions");
      }
    }

    if (data.type === "presence") {
      applyPresence(data.user_id, data.status);
    }

    if (data.type === "member_joined") {
      applyMemberJoined(data.scope, data.scope_id, data.member);
    }

    if (data.type === "member_left") {
      applyMemberLeft(data.scope, data.scope_id, data.user_id);
    }

    if (data.type === "announcement_reacted") {
      patchAnnouncementReactions(data.post_id, data.reactions || []);
    }

    if (data.type === "forum_post_reacted") {
      patchForumPostReactions(data.post_id, data.reactions || []);
    }

    if (data.type === "comment_reacted") {
      patchCommentReactions(data.comment_id, data.reactions || []);
    }

    if (data.type === "announcement_created") {
      const post = data.post;
      if (typeof applyMentionFields === "function") applyMentionFields(post, post);
      const isOpen = currentChannelId === post.channel_id;
      if (typeof noteIncomingChannelMessage === "function") {
        noteIncomingChannelMessage(
          post.channel_id,
          data.server_id,
          typeof mentionedFromPayload === "function" ? mentionedFromPayload(post.body, post.mentionUsers || post.mention_users, post.mentioned) : !!post.mentioned,
          isOpen
        );
      }
      if (isOpen) {
        appendNewAnnouncementPost(post);
      }
    }

    // Not gated on the channel being open — commentThreadElements only
    // has entries for posts actually rendered, so the lookup is the
    // guard. Count always updates; comment only appends if expanded.
    if (data.type === "announcement_comment") {
      if (typeof applyMentionFields === "function") applyMentionFields(data.comment, data.comment);
      if (typeof noteIncomingChannelMessage === "function" && data.channel_id) {
        noteIncomingChannelMessage(
          data.channel_id,
          data.server_id,
          typeof mentionedFromPayload === "function" ? mentionedFromPayload(data.comment.content, data.comment.mentionUsers || data.comment.mention_users, data.comment.mentioned) : !!data.comment.mentioned,
          currentChannelId === data.channel_id
        );
      }
      const els = commentThreadElements[data.post_id];
      const state = commentThreadState[data.post_id];
      if (els) {
        els.btnEl.textContent = `${data.comment.comment_count} comments`;
        if (state && state.expanded) {
          data.comment.reactions = applyReactionMe(data.comment.reactions || []);
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

    if (data.type === "announcement_edited") {
      applyAnnouncementEdit(data);
    }

    if (data.type === "doc_locked") handleDocLocked(data);
    if (data.type === "doc_unlocked") handleDocUnlocked(data);
    if (data.type === "doc_updated") handleDocUpdated(data);

    // "post_forum" is broadcast by /create_forum but deliberately NOT
    // used to insert a card here, and this comment exists so nobody
    // "fixes" that. Inserting someone else's new card would reorder the
    // list under a reader mid-scroll, which is exactly what the Forums
    // no-live-reorder rule forbids - other people's posts appear on the
    // next channel load instead. Your own post is added locally by
    // submitCreateForumPost, so it still shows the moment you post it.
    // Mentions still light the rail, because a ping is not a reorder.
    if (data.type === "post_forum") {
      const post = data.content || {};
      const channelId = post.channel_id || data.channel_id;
      if (channelId && typeof noteIncomingChannelMessage === "function") {
        const isOpen = currentChannelId === channelId && openForumPostId === null;
        noteIncomingChannelMessage(
          channelId,
          data.server_id,
          typeof mentionedFromPayload === "function" ? mentionedFromPayload(post.body, post.mention_users, false) : false,
          isOpen
        );
      }
    }
  };
}

function enterApp() {
  const shown = myDisplayName || myUsername || "(existing session)";
  document.getElementById("footer-username").textContent = shown;
  document.getElementById("footer-avatar-letter").textContent = avatarLetter(shown);
  if (typeof syncAdminTab === "function") syncAdminTab();
  refreshFriendsView();
  loadConversations();
  loadServers();
  handleJoinDeepLink();

  // Wired once here, not in renderServerSidebar — #server-sidebar-body
  // is static markup, never rebuilt. Category/channel rows call
  // e.stopPropagation() so this only fires for genuine blank space.
  document.getElementById("server-sidebar-body").addEventListener("contextmenu", showServerAreaContextMenu);

  const serverHeader = document.getElementById("server-sidebar-header");
  serverHeader.addEventListener("click", showServerHeaderMenu);
  serverHeader.addEventListener("contextmenu", showServerHeaderMenu);
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
