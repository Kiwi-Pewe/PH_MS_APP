// ==================================================================
// chat-render.js - Turning a message array into DOM: clusters, dividers, start cards.
// ==================================================================

// Shared by renderMessages (DMs/parties) and renderChannelMessages
// (server channels) so both get identical clustering/divider behavior.
function renderClusteredMessages(wrap, messages) {
  let openCluster = null; // { isMine, lastTime, bubbleEl }

  messages.forEach(msg => {
    // No sender = system notice (leave-party, etc.) - always a full-width
    // divider, never merged into a cluster. Resets openCluster so the
    // next real message starts fresh rather than silently merging across
    // the divider.
    if (msg.deletionState === "deleted" || pendingIsExpired(msg)) {
      wrap.appendChild(buildDeletedTombstone(msg));
      openCluster = null;
      return;
    }
    if (msg.deletionState === "pending") {
      wrap.appendChild(buildPendingDeleteCard(msg));
      openCluster = null;
      return;
    }
    if (editingMessageId && msg.id === editingMessageId) {
      wrap.appendChild(buildEditComposer(msg));
      openCluster = null;
      return;
    }

    if (msg.senderId === null) {
      wrap.appendChild(buildSystemDivider(msg));
      openCluster = null;
      return;
    }

    // username (not just isMine) is the real clustering key - a party
    // can have multiple "not me" senders, and isMine alone would wrongly
    // merge two different people's back-to-back messages.
    const sameSenderAsLast = openCluster && openCluster.isMine === msg.isMine && openCluster.username === msg.username;
    const withinGap = openCluster &&
      (msg.time - openCluster.lastTime) <= CLUSTER_GAP_MINUTES * 60 * 1000;

    if (msg.replyTo || !(sameSenderAsLast && withinGap)) {
      openCluster = startNewCluster(wrap, msg);
    } else {
      const line = document.createElement("div");
      if (msg.content) {
        fillBubbleLine(line, msg);
        openCluster.bubbleEl.appendChild(line);
        if (typeof attachLinkEmbedsIfNeeded === "function") attachLinkEmbedsIfNeeded(line, msg.content);
        attachInviteCardIfNeeded(openCluster.bubbleEl, msg.content);
      }
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

  // #chat-body is the actual scrolling element, not #chat-messages.
  // loadOlderMessages manages scroll itself, so skip when preserving.
  if (!opts.preserveScroll) {
    const chatBody = document.getElementById("chat-body");
    chatBody.scrollTop = chatBody.scrollHeight;
  }
}

function renderChannelMessages(opts = {}) {
  snapshotEditDraft();
  const wrap = document.getElementById("channel-messages");
  wrap.innerHTML = "";

  // Same view, two occupants — a forum thread borrows this whole feed,
  // so the only thing that differs is which start card tops it.
  if (openForumPostId !== null) {
    wrap.appendChild(buildForumStartCard(openForumPostTitle, openForumPostBody, openForumPostAttachment, openForumPostEdited));
  } else if (currentChannelId !== null) {
    wrap.appendChild(buildChannelStartCard(currentChannelName));
  }

  renderClusteredMessages(wrap, currentChannelMessages);

  if (!opts.preserveScroll) {
    const channelBody = document.getElementById("channel-body");
    channelBody.scrollTop = channelBody.scrollHeight;
  }
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
  avatar.textContent = avatarLetter(msg.username);

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
  avatar.textContent = avatarLetter(msg.username);

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

  plusBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    attachDestination = "edit";
    openMediaPicker();
  });
  emojiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (typeof openEmojiPicker === "function") openEmojiPicker(emojiBtn, textarea);
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

function buildSystemDivider(msg) {
  const divider = document.createElement("div");
  divider.className = "system-divider";
  divider.textContent = msg.content;
  return divider;
}

function startNewCluster(wrap, msg) {
  const cluster = document.createElement("div");
  cluster.className = "msg-cluster " + (msg.isMine ? "self" : "other");
  if (msg.mentioned) cluster.classList.add("mention-highlight");

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
  if (msg.content) {
    const firstLine = document.createElement("div");
    fillBubbleLine(firstLine, msg);
    bubble.appendChild(firstLine);
    if (typeof attachLinkEmbedsIfNeeded === "function") attachLinkEmbedsIfNeeded(firstLine, msg.content);
    attachInviteCardIfNeeded(bubble, msg.content);
  }
  if (typeof attachMediaIfNeeded === "function") attachMediaIfNeeded(bubble, msg);
  if (!msg.content && msg.edited) {
    const tagLine = document.createElement("div");
    tagLine.className = "bubble-line";
    appendEditedTag(tagLine, msg);
    bubble.appendChild(tagLine);
  }
  attachReactionsIfNeeded(bubble, msg);

  if (msg.replyTo) body.appendChild(buildReplySnippet(msg.replyTo));
  body.appendChild(header);
  body.appendChild(bubble);
  cluster.appendChild(avatar);
  cluster.appendChild(body);
  wrap.appendChild(cluster);

  return { isMine: msg.isMine, username: msg.username, lastTime: msg.time, bubbleEl: bubble };
}

function buildReplySnippet(replyTo) {
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
  avatar.textContent = avatarLetter(username);

  const name = document.createElement("div");
  name.className = "convo-start-name";
  name.textContent = username;

  const meta = document.createElement("div");
  meta.className = "convo-start-meta";

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
    fillMentionText(desc, body, typeof openForumPostMentionUsers !== "undefined" ? openForumPostMentionUsers : {});
  } else {
    desc.textContent = body || `This is the start of ${title || "this post"}.`;
  }

  card.appendChild(avatar);
  card.appendChild(nameRow);
  card.appendChild(desc);
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
