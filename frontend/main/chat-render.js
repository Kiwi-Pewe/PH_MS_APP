// ==================================================================
// chat-render.js - Turning a message array into DOM: clusters, dividers, start cards.
// ==================================================================

const lastReadMessageIds = {};
let chatNewMarker = { kind: null, id: null, unreadCount: 0, useCursor: false, messageId: null };

function chatReadKey(kind, id) {
  return String(kind || "") + ":" + String(id);
}

function captureNewMessagesIntent(kind, id, extra) {
  extra = extra || {};
  chatNewMarker = {
    kind: kind,
    id: id,
    unreadCount: 0,
    useCursor: false,
    messageId: null
  };
  if (kind === "dm" || kind === "party") {
    const row = (typeof conversationList !== "undefined" ? conversationList : []).find(
      (c) => c.type === kind && Number(c.id) === Number(id)
    );
    const unread = (row && row.unread) || 0;
    const mentions = (row && row.mentions) || 0;
    chatNewMarker.unreadCount = kind === "party" ? (unread + mentions) : unread;
    return;
  }
  if (kind === "channel") {
    const unread = !!(extra.unread || extra.mention_count);
    const cursor = lastReadMessageIds[chatReadKey("channel", id)];
    if (unread && cursor != null) chatNewMarker.useCursor = true;
  }
}

function resolveNewMessagesMarker(messages) {
  if (chatNewMarker.messageId != null) return;
  if (!messages || !messages.length) return;
  if (chatNewMarker.unreadCount > 0) {
    let left = chatNewMarker.unreadCount;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m || m.isMine || m.isSystem || m.senderId == null) continue;
      left -= 1;
      if (left <= 0) {
        chatNewMarker.messageId = m.id;
        return;
      }
    }
    const first = messages.find((m) => m && !m.isMine && !m.isSystem && m.senderId != null);
    if (first) chatNewMarker.messageId = first.id;
    return;
  }
  if (chatNewMarker.useCursor) {
    const cursor = lastReadMessageIds[chatReadKey(chatNewMarker.kind, chatNewMarker.id)];
    const found = messages.find((m) => (
      m && m.id != null && Number(m.id) > Number(cursor) && !m.isMine && !m.isSystem && m.senderId != null
    ));
    if (found) chatNewMarker.messageId = found.id;
  }
}

function rememberReadCursor(kind, id, messages) {
  if (!kind || id == null || !messages || !messages.length) return;
  let last = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.id != null && String(m.id).indexOf("tmp-") !== 0) {
      last = m.id;
      break;
    }
  }
  if (last == null) return;
  const key = chatReadKey(kind, id);
  const prev = lastReadMessageIds[key];
  if (prev == null || Number(last) >= Number(prev)) lastReadMessageIds[key] = last;
}

function chatItemTime(msg) {
  if (!msg || msg.time == null) return null;
  const d = msg.time instanceof Date ? msg.time : new Date(msg.time);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildDateSeparator(date) {
  const el = document.createElement("div");
  el.className = "chat-date-sep";
  el.textContent = typeof formatChatDateSeparator === "function" ? formatChatDateSeparator(date) : "";
  return el;
}

function buildNewMessagesDivider() {
  const el = document.createElement("div");
  el.className = "new-messages-divider";
  el.textContent = "New Messages";
  return el;
}

function appendChatDecorators(wrap, msg, lastDateRef) {
  const when = chatItemTime(msg);
  if (when && (!lastDateRef.date || (typeof sameCalendarDay === "function" ? !sameCalendarDay(lastDateRef.date, when) : false))) {
    wrap.appendChild(buildDateSeparator(when));
  }
  if (when) lastDateRef.date = when;
  if (chatNewMarker && chatNewMarker.messageId != null && msg && msg.id != null && String(msg.id) === String(chatNewMarker.messageId)) {
    wrap.appendChild(buildNewMessagesDivider());
  }
}

function scrollFeedToNewOrEnd(scrollEl, opts) {
  if (!scrollEl || (opts && opts.preserveScroll)) return;
  const line = scrollEl.querySelector(".new-messages-divider");
  if (line) {
    line.scrollIntoView({ block: "center" });
    return;
  }
  scrollEl.scrollTop = scrollEl.scrollHeight;
}

function renderClusteredMessages(wrap, messages) {
  let openCluster = null;
  const lastDateRef = { date: null };
  resolveNewMessagesMarker(messages);

  messages.forEach(msg => {
    const when = chatItemTime(msg);
    const newDay = !!(when && lastDateRef.date && typeof sameCalendarDay === "function" && !sameCalendarDay(lastDateRef.date, when));
    const isNewStart = !!(chatNewMarker && chatNewMarker.messageId != null && msg.id != null && String(msg.id) === String(chatNewMarker.messageId));

    if (msg.deletionState === "deleted" || pendingIsExpired(msg)) {
      appendChatDecorators(wrap, msg, lastDateRef);
      wrap.appendChild(buildDeletedTombstone(msg));
      openCluster = null;
      return;
    }
    if (msg.permaban) {
      appendChatDecorators(wrap, msg, lastDateRef);
      wrap.appendChild(buildPermabanFooter(msg));
      openCluster = null;
      return;
    }
    if (msg.deletionState === "pending") {
      appendChatDecorators(wrap, msg, lastDateRef);
      wrap.appendChild(buildPendingDeleteCard(msg));
      openCluster = null;
      return;
    }
    if (editingMessageId && msg.id === editingMessageId) {
      appendChatDecorators(wrap, msg, lastDateRef);
      wrap.appendChild(buildEditComposer(msg));
      openCluster = null;
      return;
    }

    if (isCallMessage(msg)) {
      appendChatDecorators(wrap, msg, lastDateRef);
      wrap.appendChild(buildCallLine(msg));
      openCluster = null;
      return;
    }

    if (msg.isSystem || msg.senderId === null) {
      appendChatDecorators(wrap, msg, lastDateRef);
      wrap.appendChild(buildSystemDivider(msg));
      openCluster = null;
      return;
    }

    const sameSenderAsLast = openCluster && openCluster.isMine === msg.isMine && openCluster.username === msg.username;
    const withinGap = openCluster &&
      (msg.time - openCluster.lastTime) <= CLUSTER_GAP_MINUTES * 60 * 1000;

    if (msg.replyTo || isNewStart || newDay || !(sameSenderAsLast && withinGap)) {
      appendChatDecorators(wrap, msg, lastDateRef);
      openCluster = startNewCluster(wrap, msg);
    } else {
      if (when) lastDateRef.date = when;
      const line = document.createElement("div");
      if (msg.content) {
        fillBubbleLine(line, msg);
        openCluster.bubbleEl.appendChild(line);
        if (typeof attachLinkEmbedsIfNeeded === "function") attachLinkEmbedsIfNeeded(line, msg.content);
        attachInviteCardIfNeeded(openCluster.bubbleEl, msg.content);
      }
      if (typeof attachLinkImagesIfNeeded === "function") attachLinkImagesIfNeeded(openCluster.bubbleEl, msg.content);
      if (typeof attachMediaIfNeeded === "function") attachMediaIfNeeded(openCluster.bubbleEl, msg);
      if (!msg.content && msg.edited) {
        const tagLine = document.createElement("div");
        tagLine.className = "bubble-line";
        appendEditedTag(tagLine, msg);
        openCluster.bubbleEl.appendChild(tagLine);
      }
      attachReactionsIfNeeded(openCluster.bubbleEl, msg);
    }

    openCluster.lastTime = msg.time;
  });
}

function snapshotEditDraft() {
  const ta = document.getElementById("edit-composer-input");
  if (ta && editingMessageId) editingDraft = ta.value;
}

function renderMessages(opts = {}) {
  snapshotEditDraft();
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

  if (openChatId != null && openChatType) rememberReadCursor(openChatType, openChatId, currentMessages);
  scrollFeedToNewOrEnd(document.getElementById("chat-body"), opts);
}

function renderChannelMessages(opts = {}) {
  snapshotEditDraft();
  const wrap = document.getElementById("channel-messages");
  wrap.innerHTML = "";

  // Same view, two occupants — a forum thread borrows this whole feed.
  // The opener lives in #forum-thread-opener (sticky above the scroll),
  // so the message list only gets a normal channel start when not in a thread.
  if (openForumPostId === null && currentChannelId !== null) {
    wrap.appendChild(buildChannelStartCard(currentChannelName));
  }

  renderClusteredMessages(wrap, currentChannelMessages);

  if (typeof openForumPostId !== "undefined" && openForumPostId != null) {
    rememberReadCursor("forum", openForumPostId, currentChannelMessages);
  } else if (currentChannelId != null) {
    rememberReadCursor("channel", currentChannelId, currentChannelMessages);
  }
  scrollFeedToNewOrEnd(document.getElementById("channel-body"), opts);
  if (typeof paintVoiceChannelChat === "function") paintVoiceChannelChat(opts);
}

function fillBubbleLine(line, msg) {
  line.className = "bubble-line";
  if (msg.id) line.dataset.messageId = String(msg.id);
  if (msg.mentioned) line.classList.add("mention-highlight");
  if (typeof isEmojiOnlyContent === "function" && isEmojiOnlyContent(msg.content)) {
    line.classList.add("emoji-only");
  }
  if (typeof appendMentionAwareText === "function") appendMentionAwareText(line, msg.content, msg);
  else if (typeof renderMessageText === "function") renderMessageText(line, msg.content);
  else line.textContent = msg.content;
  appendEditedTag(line, msg);
  line.addEventListener("contextmenu", (e) => showMessageContextMenu(e, msg));
}

function attachReactionsIfNeeded(host, msg) {
  if (!appearancePref("show_reactions", true)) return;
  if (!host || !msg.reactions || !msg.reactions.length) return;
  const row = document.createElement("div");
  row.className = "reaction-row";
  msg.reactions.forEach(r => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "reaction-pill" + (r.me ? " mine" : "");
    const emoji = document.createElement("span");
    emoji.className = "reaction-emoji";
    emoji.textContent = r.emoji;
    const count = document.createElement("span");
    count.className = "reaction-count";
    count.textContent = String(r.count);
    pill.appendChild(emoji);
    pill.appendChild(count);
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleReaction(msg, r.emoji);
    });
    row.appendChild(pill);
  });
  host.appendChild(row);
}

function appendEditedTag(parent, msg) {
  if (!msg || !msg.edited) return;
  const tag = document.createElement("span");
  tag.className = "edited-tag";
  tag.textContent = "edited";
  parent.appendChild(tag);
}

function wrapDeletionOnSenderSide(msg, inner) {
  const cluster = document.createElement("div");
  cluster.className = "msg-cluster deletion-cluster " + (msg.isMine ? "self" : "other");

  const avatar = document.createElement("div");
  avatar.className = "cluster-avatar";
  if (typeof paintUserFace === "function") paintUserFace(avatar, msg, { name: msg.username, userId: msg.senderId });
  else avatar.textContent = avatarLetter(msg.username);
  if (typeof bindMiniProfileTarget === "function") bindMiniProfileTarget(avatar, msg.senderId);

  const body = document.createElement("div");
  body.className = "cluster-body";
  body.appendChild(inner);

  cluster.appendChild(avatar);
  cluster.appendChild(body);
  return cluster;
}

function buildDeletedTombstone(msg) {
  const el = document.createElement("div");
  el.className = "deletion-tombstone";
  el.textContent = "Message deleted";
  return wrapDeletionOnSenderSide(msg, el);
}

function buildPermabanFooter(msg) {
  const el = document.createElement("div");
  el.className = "permaban-footer";
  el.textContent = msg.content || "A user was banned from Oneira.";
  el.addEventListener("contextmenu", (e) => {
    if (typeof showMessageContextMenu === "function") showMessageContextMenu(e, msg);
  });
  return el;
}

function buildPendingDeleteCard(msg) {
  const card = document.createElement("div");
  card.className = "deletion-card";

  const summary = document.createElement("div");
  summary.className = "deletion-card-summary";
  const label = document.createElement("span");
  label.textContent = "Message marked for deletion";
  const caret = document.createElement("span");
  caret.className = "deletion-card-caret";
  caret.innerHTML = "&#9662;";
  summary.appendChild(label);
  summary.appendChild(caret);

  const detail = document.createElement("div");
  detail.className = "deletion-card-detail";

  const original = document.createElement("div");
  original.className = "deletion-card-original";
  if (msg.content) {
    const line = document.createElement("div");
    fillBubbleLine(line, msg);
    original.appendChild(line);
  } else if (msg.edited) {
    const line = document.createElement("div");
    line.className = "bubble-line";
    appendEditedTag(line, msg);
    original.appendChild(line);
  }
  if (typeof attachMediaIfNeeded === "function") attachMediaIfNeeded(original, msg);

  const when = document.createElement("div");
  when.className = "deletion-card-when";
  when.textContent = msg.deletionRequestedAt
    ? `Marked for deletion ${formatClusterTime(msg.deletionRequestedAt)}`
    : "Marked for deletion";

  detail.appendChild(original);
  detail.appendChild(when);
  if (msg.isMine) {
    const btn = document.createElement("button");
    btn.className = "pill-btn";
    btn.textContent = "Reinstate";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      reinstateMessage(msg);
    });
    detail.appendChild(btn);
  }

  card.appendChild(summary);
  card.appendChild(detail);
  card.addEventListener("click", () => {
    card.classList.toggle("expanded");
  });
  return wrapDeletionOnSenderSide(msg, card);
}

function buildEditComposer(msg) {
  const cluster = document.createElement("div");
  cluster.className = "msg-cluster edit-cluster " + (msg.isMine ? "self" : "other");

  const avatar = document.createElement("div");
  avatar.className = "cluster-avatar";
  if (typeof paintUserFace === "function") paintUserFace(avatar, msg, { name: msg.username, userId: msg.senderId });
  else avatar.textContent = avatarLetter(msg.username);
  if (typeof bindMiniProfileTarget === "function") bindMiniProfileTarget(avatar, msg.senderId);

  const body = document.createElement("div");
  body.className = "cluster-body";

  const editor = document.createElement("div");
  editor.className = "edit-composer";
  editor.id = "edit-composer";

  const top = document.createElement("div");
  top.className = "edit-composer-top";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "icon-btn edit-composer-cancel";
  cancelBtn.title = "Cancel";
  cancelBtn.innerHTML = "&times;";
  cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    cancelMessageEdit();
  });
  top.appendChild(cancelBtn);

  const preview = document.createElement("div");
  preview.id = "edit-composer-attach-preview";
  preview.className = "attach-preview";
  preview.hidden = true;

  const box = document.createElement("div");
  box.className = "box";
  const plusBtn = document.createElement("button");
  plusBtn.type = "button";
  plusBtn.className = "composer-icon-btn edit-composer-plus";
  plusBtn.title = "Attach image or video";
  plusBtn.textContent = "+";
  const field = document.createElement("div");
  field.className = "composer-field";
  const highlight = document.createElement("div");
  highlight.className = "composer-highlight";
  highlight.setAttribute("aria-hidden", "true");
  const textarea = document.createElement("textarea");
  textarea.id = "edit-composer-input";
  textarea.className = "edit-composer-input";
  textarea.rows = 1;
  textarea.placeholder = "Type a message";
  textarea.value = editingDraft;
  field.appendChild(highlight);
  field.appendChild(textarea);
  const emojiBtn = document.createElement("button");
  emojiBtn.type = "button";
  emojiBtn.className = "composer-icon-btn edit-composer-emoji";
  emojiBtn.title = "Emoji";
  emojiBtn.textContent = "🙂";
  box.appendChild(plusBtn);
  box.appendChild(field);
  box.appendChild(emojiBtn);

  const footer = document.createElement("div");
  footer.className = "edit-composer-footer";
  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "pill-btn";
  confirmBtn.textContent = "Confirm";
  confirmBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    confirmMessageEdit(msg);
  });
  footer.appendChild(confirmBtn);

  editor.appendChild(top);
  editor.appendChild(preview);
  editor.appendChild(box);
  editor.appendChild(footer);
  body.appendChild(editor);
  cluster.appendChild(avatar);
  cluster.appendChild(body);

  if (msg.chatKind === "channel" && typeof canUploadChatMedia === "function" && !canUploadChatMedia()) {
    plusBtn.disabled = true;
  }
  plusBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (plusBtn.disabled) return;
    attachDestination = "edit";
    openMediaPicker();
  });
  emojiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (typeof openEmojiPicker === "function") openEmojiPicker(emojiBtn, textarea, e.clientX, e.clientY);
  });
  textarea.addEventListener("input", () => {
    if (typeof applyEmojiShortcodesToInput === "function") applyEmojiShortcodesToInput(textarea);
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
    editingDraft = textarea.value;
    if (typeof refreshComposerMentions === "function") refreshComposerMentions(textarea);
  });
  textarea.addEventListener("paste", (e) => {
    const files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) {
      e.preventDefault();
      attachDestination = "edit";
      setPendingFile(files[0]);
    }
  });
  editor.addEventListener("dragover", (e) => {
    if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
      e.preventDefault();
      editor.classList.add("attach-drop");
    }
  });
  editor.addEventListener("dragleave", () => editor.classList.remove("attach-drop"));
  editor.addEventListener("drop", (e) => {
    editor.classList.remove("attach-drop");
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) {
      e.preventDefault();
      attachDestination = "edit";
      setPendingFile(files[0]);
    }
  });

  requestAnimationFrame(() => {
    fillEditAttachPreview(preview);
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    if (typeof bindMentionComposer === "function") bindMentionComposer(textarea);
  });
  return cluster;
}

function isCallMessage(msg) {
  return !!msg && typeof msg.content === "string" && (msg.content === "oneira-call" || msg.content.indexOf("oneira-call:") === 0);
}

function callLengthSeconds(content) {
  if (content === "oneira-call") return null;
  const raw = Number(String(content).slice("oneira-call:".length));
  return Number.isFinite(raw) ? raw : null;
}

function formatCallLength(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return whole + (whole === 1 ? " second" : " seconds");
  const minutes = Math.round(whole / 60);
  if (minutes < 60) return minutes + (minutes === 1 ? " minute" : " minutes");
  const hours = Math.round(minutes / 60);
  return hours + (hours === 1 ? " hour" : " hours");
}

function callLineText(msg) {
  const name = msg.username || "Someone";
  const seconds = callLengthSeconds(msg.content);
  if (seconds == null) return name + " started a call.";
  return name + " started a call that lasted " + formatCallLength(seconds) + ".";
}

function buildCallLine(msg) {
  const row = document.createElement("div");
  row.className = "call-line";
  const icon = document.createElement("span");
  icon.className = "call-line-phone";
  icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.5.6 3.6.1.4 0 .7-.3 1L6.6 10.8z"/></svg>';
  const text = document.createElement("span");
  text.className = "call-line-text";
  text.textContent = callLineText(msg);
  const when = document.createElement("span");
  when.className = "call-line-time";
  const date = msg.time instanceof Date ? msg.time : new Date(msg.time);
  when.textContent = (typeof formatClusterTime === "function" && !Number.isNaN(date.getTime())) ? formatClusterTime(date) : "";
  row.appendChild(icon);
  row.appendChild(text);
  row.appendChild(when);
  return row;
}

function buildSystemDivider(msg) {
  const divider = document.createElement("div");
  divider.className = "system-divider";
  divider.textContent = msg.content;
  return divider;
}

function startNewCluster(wrap, msg) {
  if (isCallMessage(msg)) {
    wrap.appendChild(buildCallLine(msg));
    return { isMine: false, username: "", lastTime: msg.time, bubbleEl: wrap };
  }
  const cluster = document.createElement("div");
  cluster.className = "msg-cluster " + (msg.isMine ? "self" : "other");
  if (msg.mentioned) cluster.classList.add("mention-highlight");

  const avatar = document.createElement("div");
  avatar.className = "cluster-avatar";
  if (typeof paintUserFace === "function") paintUserFace(avatar, msg, { name: msg.username, userId: msg.senderId });
  else avatar.textContent = avatarLetter(msg.username);
  avatar.addEventListener("contextmenu", (e) => showProfileContextMenu(e, msg.senderId, msg.username, msg.isMine, msg.chatKind === "party"));
  if (typeof bindMiniProfileTarget === "function") bindMiniProfileTarget(avatar, msg.senderId);

  const body = document.createElement("div");
  body.className = "cluster-body";

  const header = document.createElement("div");
  header.className = "cluster-header";
  const name = document.createElement("span");
  name.className = "cluster-name";
  name.textContent = msg.nickname || msg.username;
  if ((msg.chatKind === "channel" || msg.chatKind === "forum") && typeof applyServerNameColor === "function") {
    applyServerNameColor(name, msg.senderId, msg.nameRole);
  }
  name.addEventListener("contextmenu", (e) => showProfileContextMenu(e, msg.senderId, msg.username, msg.isMine, msg.chatKind === "party"));
  if (typeof bindMiniProfileTarget === "function") bindMiniProfileTarget(name, msg.senderId);
  const time = document.createElement("span");
  time.className = "cluster-time";
  time.textContent = formatClusterTime(msg.time);
  header.appendChild(name);
  header.appendChild(time);

  const bubble = document.createElement("div");
  bubble.className = "cluster-bubble";
  if (msg.content) {
    const firstLine = document.createElement("div");
    fillBubbleLine(firstLine, msg);
    bubble.appendChild(firstLine);
    if (typeof attachLinkEmbedsIfNeeded === "function") attachLinkEmbedsIfNeeded(firstLine, msg.content);
    attachInviteCardIfNeeded(bubble, msg.content);
  }
  if (typeof attachLinkImagesIfNeeded === "function") attachLinkImagesIfNeeded(bubble, msg.content);
  if (typeof attachMediaIfNeeded === "function") attachMediaIfNeeded(bubble, msg);
  if (!msg.content && msg.edited) {
    const tagLine = document.createElement("div");
    tagLine.className = "bubble-line";
    appendEditedTag(tagLine, msg);
    bubble.appendChild(tagLine);
  }
  attachReactionsIfNeeded(bubble, msg);

  if (msg.replyTo) body.appendChild(buildReplySnippet(msg.replyTo, msg.chatKind));
  body.appendChild(header);
  body.appendChild(bubble);
  cluster.appendChild(avatar);
  cluster.appendChild(body);
  wrap.appendChild(cluster);

  return { isMine: msg.isMine, username: msg.username, lastTime: msg.time, bubbleEl: bubble };
}

function buildReplySnippet(replyTo, chatKind) {
  const row = document.createElement("div");
  row.className = "msg-reply";
  const bar = document.createElement("span");
  bar.className = "msg-reply-bar";
  const name = document.createElement("span");
  name.className = "msg-reply-name";
  const text = document.createElement("span");
  text.className = "msg-reply-text";
  if (replyTo.deleted) {
    name.textContent = "";
    text.textContent = "Original message was deleted";
  } else {
    name.textContent = replyTo.username || "user";
    if ((chatKind === "channel" || chatKind === "forum") && typeof applyServerNameColor === "function") {
      applyServerNameColor(name, replyTo.sender_id, replyTo.name_role || replyTo.nameRole);
    }
    const raw = replyTo.content || "";
    text.textContent = typeof mentionDisplayText === "function"
      ? mentionDisplayText(raw, {})
      : raw;
  }
  row.appendChild(bar);
  if (name.textContent) row.appendChild(name);
  row.appendChild(text);
  if (replyTo.id && !replyTo.deleted) {
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof jumpToPinnedMessage === "function") {
        jumpToPinnedMessage({
          message_kind: chatKind,
          chat_kind: chatKind,
          message_id: replyTo.id,
          post_id: (typeof openForumPostId !== "undefined" ? openForumPostId : null)
        });
        return;
      }
      const target = document.querySelector(`[data-message-id="${replyTo.id}"]`);
      if (target) target.scrollIntoView({ block: "center" });
    });
  }
  return row;
}

function buildConversationStartCard(id, username) {
  const card = document.createElement("div");
  card.className = "convo-start-card";

  const avatar = document.createElement("div");
  avatar.className = "convo-start-avatar";
  if (typeof paintUserFace === "function") paintUserFace(avatar, { id: id, username: username }, { name: username, userId: id });
  else avatar.textContent = avatarLetter(username);
  avatar.addEventListener("contextmenu", (e) => {
    if (typeof showProfileContextMenu === "function") showProfileContextMenu(e, id, username, false, false);
  });
  if (typeof bindMiniProfileTarget === "function") bindMiniProfileTarget(avatar, id);

  const name = document.createElement("div");
  name.className = "convo-start-name";
  name.textContent = username;
  name.addEventListener("contextmenu", (e) => {
    if (typeof showProfileContextMenu === "function") showProfileContextMenu(e, id, username, false, false);
  });
  if (typeof bindMiniProfileTarget === "function") bindMiniProfileTarget(name, id);

  const meta = document.createElement("div");
  meta.className = "convo-start-meta";

  const desc = document.createElement("div");
  desc.className = "convo-start-desc";
  desc.textContent = `This is the beginning of your direct message history with ${username}.`;

  const actions = document.createElement("div");
  actions.className = "convo-start-actions";
  if (typeof refreshConversationStartActions === "function") {
    refreshConversationStartActions(actions, id, username);
  }

  card.appendChild(avatar);
  card.appendChild(name);
  card.appendChild(meta);
  card.appendChild(desc);
  card.appendChild(actions);
  return card;
}

function buildPartyStartCard(name) {
  const card = document.createElement("div");
  card.className = "convo-start-card";

  const avatar = document.createElement("div");
  avatar.className = "convo-start-avatar";
  const open = (typeof conversationList !== "undefined" ? conversationList : []).find(
    (c) => c.type === "party" && Number(c.id) === Number(openChatId)
  );
  if (typeof paintPartyFace === "function") paintPartyFace(avatar, name, open && open.iconUrl);
  else avatar.textContent = avatarLetter(name);

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

function buildForumStartCard(title, body, attachment, edited) {
  const card = document.createElement("div");
  card.className = "convo-start-card";

  const avatar = document.createElement("div");
  avatar.className = "convo-start-avatar";
  avatar.textContent = "\u{1F4AC}";

  const nameRow = document.createElement("div");
  nameRow.className = "forum-start-title-row";
  const nameEl = document.createElement("div");
  nameEl.className = "convo-start-name";
  nameEl.textContent = title || "";
  nameRow.appendChild(nameEl);
  if (edited) {
    const tag = document.createElement("span");
    tag.className = "edited-tag";
    tag.textContent = "edited";
    nameRow.appendChild(tag);
  }

  const desc = document.createElement("div");
  desc.className = "convo-start-desc";
  if (body && typeof fillMentionText === "function") {
    fillMentionText(desc, body, typeof openForumPostMentionUsers !== "undefined" ? openForumPostMentionUsers : {}, typeof openForumPostMentionRoles !== "undefined" ? openForumPostMentionRoles : {});
  } else {
    desc.textContent = body || `This is the start of ${title || "this post"}.`;
  }

  card.appendChild(avatar);
  card.appendChild(nameRow);
  card.appendChild(desc);
  if (body) {
    if (typeof attachLinkEmbedsIfNeeded === "function") attachLinkEmbedsIfNeeded(desc, body);
    if (typeof attachLinkImagesIfNeeded === "function") attachLinkImagesIfNeeded(card, body);
  }
  const media = typeof buildPostMedia === "function" ? buildPostMedia(attachment) : null;
  if (media) card.appendChild(media);
  return card;
}

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
