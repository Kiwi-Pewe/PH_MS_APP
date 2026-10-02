// ==================================================================
// comments.js - Comment threads on announcement posts.
// ==================================================================

function buildCommentElement(comment) {
  const row = document.createElement("div");
  row.className = "announce-comment";
  row.dataset.commentId = comment.id;

  const avatar = document.createElement("div");
  avatar.className = "cluster-avatar";
  if (typeof paintUserFace === "function") paintUserFace(avatar, comment, { name: comment.username, userId: comment.sender_id });
  else avatar.textContent = (comment.username || "?").charAt(0).toUpperCase();

  const body = document.createElement("div");
  body.className = "announce-comment-body";
  const header = document.createElement("div");
  header.className = "announce-comment-header";
  const name = document.createElement("span");
  name.className = "announce-comment-name";
  name.textContent = comment.username || "Unknown";
  if (typeof applyServerNameColor === "function") applyServerNameColor(name, comment.sender_id, comment.name_role || comment.nameRole);
  const time = document.createElement("span");
  time.className = "announce-comment-time";
  time.textContent = formatClusterTime(parseUtcTimestamp(comment.created_at));
  header.appendChild(name);
  header.appendChild(time);
  if (comment.edited) {
    const edited = document.createElement("span");
    edited.className = "edited-tag";
    edited.textContent = "edited";
    header.appendChild(edited);
  }

  // Always rendered now - Copy/React always populate the menu
  // regardless of permission, so it's never empty the way a
  // Delete-only menu would have been for a non-owner.
  const menuBtn = document.createElement("button");
  menuBtn.className = "announce-comment-menu-btn";
  menuBtn.title = "More";
  menuBtn.innerHTML = "&#8942;";
  menuBtn.addEventListener("click", (e) => showCommentContextMenu(e, comment));
  header.appendChild(menuBtn);

  const content = document.createElement("div");
  content.className = "announce-comment-content";
  if (typeof applyMentionFields === "function") applyMentionFields(comment, comment);
  if (typeof fillMentionText === "function") fillMentionText(content, comment.content, comment.mentionUsers, comment.mentionRoles, { rich: true });
  else content.textContent = comment.content;
  const reactionsHost = document.createElement("div");
  reactionsHost.className = "announce-comment-reactions";
  const addReactionBtn = document.createElement("button");
  addReactionBtn.className = "announce-add-reaction-btn";
  addReactionBtn.title = "Add Reaction";
  addReactionBtn.textContent = "+";
  addReactionBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openReactionPicker(commentReactionTarget(comment), e.clientX, e.clientY);
  });
  reactionsHost.appendChild(addReactionBtn);
  fillCommentReactions(reactionsHost, comment);
  body.appendChild(header);
  body.appendChild(content);
  body.appendChild(reactionsHost);

  row.appendChild(avatar);
  row.appendChild(body);
  row.addEventListener("contextmenu", (e) => showCommentContextMenu(e, comment));
  return row;
}

// Mirrors a normal (non-own) message's context menu: Copy/React/Report
// available on anyone's content, Delete only for the owner. Report is
// still a placeholder. Report is only relevant on someone else's comment.
function showCommentContextMenu(e, comment) {
  e.preventDefault();
  e.stopPropagation();
  const isMine = comment.sender_id === myUserId;
  const canDelete = isMine || myUserId === currentServerOwnerId;
  openContextMenu(e.clientX, e.clientY, {
    avatarText: avatarLetter(comment.username),
    title: comment.username,
    timestamp: formatClusterTime(parseUtcTimestamp(comment.created_at)),
    subtitle: truncateForContextMenu(typeof mentionDisplayText === "function" ? mentionDisplayText(comment.content, comment.mentionUsers, comment.mentionRoles) : comment.content)
  }, [
    { label: "Copy Comment", onSelect: () => copyCommentContent(comment) },
    isMine && { label: "Edit Comment", onSelect: () => startCommentEdit(comment) },
    { label: "Add Reaction", onSelect: () => openReactionPicker(commentReactionTarget(comment), e.clientX, e.clientY) },
    (typeof canPinMessages !== "function" || canPinMessages()) && {
      label: (typeof isMessagePinned === "function" && isMessagePinned(commentKindOf(comment), comment.id)) ? "Unpin" : "Pin",
      onSelect: () => {
        if (typeof pinOrUnpinMessage === "function") {
          pinOrUnpinMessage(
            { id: comment.id, chatKind: commentKindOf(comment), senderId: comment.sender_id },
            !(typeof isMessagePinned === "function" && isMessagePinned(commentKindOf(comment), comment.id))
          );
        }
      },
    },
    !isMine && { label: "Report", disabled: true },
    canDelete && { label: "Delete Comment", danger: true, onSelect: () => deleteCommentFromContextMenu(comment) }
  ]);
}

let editingCommentId = null;

function startCommentEdit(comment) {
  if (!comment || Number(comment.sender_id) !== Number(myUserId)) return;
  if (editingCommentId && Number(editingCommentId) !== Number(comment.id)) {
    const previous = findCommentRecord(editingCommentId);
    if (previous) cancelCommentEdit(previous);
  }
  editingCommentId = comment.id;
  const row = document.querySelector(`.announce-comment[data-comment-id="${comment.id}"]`);
  const content = row && row.querySelector(".announce-comment-content");
  if (!content) return;
  content.replaceChildren();
  const editor = document.createElement("div");
  editor.className = "announce-comment-edit";
  const field = document.createElement("textarea");
  field.className = "announce-comment-input";
  field.rows = 5;
  field.maxLength = 4000;
  field.value = typeof mentionDisplayText === "function"
    ? mentionDisplayText(comment.content || "", comment.mentionUsers, comment.mentionRoles)
    : (comment.content || "");
  const save = document.createElement("button");
  save.type = "button";
  save.className = "pill-btn";
  save.textContent = "Save";
  save.addEventListener("click", () => confirmCommentEdit(comment, field));
  field.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancelCommentEdit(comment);
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) confirmCommentEdit(comment, field);
  });
  editor.appendChild(field);
  editor.appendChild(save);
  content.appendChild(editor);
  if (typeof bindMentionComposer === "function") bindMentionComposer(field);
  field.focus();
}

function findCommentRecord(commentId) {
  const keys = Object.keys(commentThreadState || {});
  for (let i = 0; i < keys.length; i++) {
    const found = (commentThreadState[keys[i]].comments || []).find((row) => Number(row.id) === Number(commentId));
    if (found) return found;
  }
  return null;
}

function cancelCommentEdit(comment) {
  editingCommentId = null;
  const row = document.querySelector(`.announce-comment[data-comment-id="${comment.id}"]`);
  if (row) row.replaceWith(buildCommentElement(comment));
}

async function confirmCommentEdit(comment, field) {
  const content = ((field && field.value) || "").trim();
  if (!content) {
    window.alert("Write a comment first.");
    return;
  }
  const response = await fetch(`https://${serverAddress}/edit_comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ comment_id: comment.id, content }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert((typeof data.detail === "string" && data.detail) || "Could not edit that comment.");
    return;
  }
  applyCommentEdit({
    post_id: comment.post_id,
    comment_id: comment.id,
    content: data.content,
    edited: data.edited,
    mention_users: data.mention_users,
    mention_roles: data.mention_roles,
    mentionUsers: data.mention_users,
    mentionRoles: data.mention_roles,
  });
}

function applyCommentEdit(data) {
  const state = commentThreadState[data.post_id];
  const comment = state && (state.comments || []).find((row) => Number(row.id) === Number(data.comment_id));
  if (!comment) return;
  comment.content = data.content;
  comment.edited = !!data.edited;
  if (typeof applyMentionFields === "function") applyMentionFields(comment, data);
  editingCommentId = null;
  const row = document.querySelector(`.announce-comment[data-comment-id="${data.comment_id}"]`);
  if (row) row.replaceWith(buildCommentElement(comment));
}

function commentKindOf(comment) {
  return comment && comment.chatKind === "media_comment" ? "media_comment" : "comment";
}

function commentReactionTarget(comment) {
  return {
    id: comment.id,
    chatKind: commentKindOf(comment),
    senderId: comment.sender_id,
    reactions: comment.reactions || []
  };
}

function fillCommentReactions(host, comment) {
  if (!host) return;
  host.querySelectorAll(".reaction-pill").forEach(el => el.remove());
  const addBtn = host.querySelector(".announce-add-reaction-btn");
  (comment.reactions || []).forEach(r => {
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
      toggleReaction(commentReactionTarget(comment), r.emoji);
    });
    if (addBtn) host.insertBefore(pill, addBtn);
    else host.appendChild(pill);
  });
}

function patchCommentReactions(commentId, reactions) {
  const painted = applyReactionMe(reactions || []);
  Object.keys(commentThreadState).forEach(postId => {
    const state = commentThreadState[postId];
    const comment = state && state.comments.find(c => c.id === commentId);
    if (!comment) return;
    comment.reactions = painted;
    const els = commentThreadElements[postId];
    const row = els && els.listEl.querySelector(`[data-comment-id="${commentId}"]`);
    const host = row && row.querySelector(".announce-comment-reactions");
    if (host) fillCommentReactions(host, comment);
  });
}

async function copyCommentContent(comment) {
  try {
    await navigator.clipboard.writeText(typeof mentionDisplayText === "function" ? mentionDisplayText(comment.content, comment.mentionUsers, comment.mentionRoles) : comment.content);
  } catch (e) {
    console.error("Failed to copy comment, clipboard error:", e);
  }
}

// delete_comment returns no body, and excludes the deleter from the
// broadcast - so the deleter does its own local cleanup here instead
// of waiting for the ws event like everyone else does.
async function deleteCommentFromContextMenu(comment) {
  const media = commentKindOf(comment) === "media_comment";
  const path = media ? `delete_media_comment/${comment.id}` : `delete_comment/${comment.id}`;
  try {
    const response = await fetch(`https://${serverAddress}/${path}`, {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) {
      console.error(`Failed to delete comment: ${response.status}`);
      return;
    }
    if (media) {
      const data = await response.json().catch(() => ({}));
      if (typeof removeMediaComment === "function") removeMediaComment(comment.item_id || comment.post_id, comment.id, data.comment_count);
      return;
    }
  } catch (e) {
    console.error("Failed to delete comment, network error:", e);
    return;
  }
  removeCommentFromThread(comment.post_id, comment.id);
}

// Shared by the deleter's own path and the comment_deleted broadcast
// below. authoritativeCount comes from the broadcast; the deleter's own
// path has no response body so it falls back to a local decrement.
function removeCommentFromThread(postId, commentId, authoritativeCount) {
  const state = commentThreadState[postId];
  if (state) {
    state.comments = state.comments.filter(c => c.id !== commentId);
  }
  const els = commentThreadElements[postId];
  if (els) {
    const rowEl = els.listEl.querySelector(`[data-comment-id="${commentId}"]`);
    if (rowEl) rowEl.remove();
  }

  const post = currentAnnouncementPosts.find(p => p.id === postId);
  const newCount = typeof authoritativeCount === "number"
    ? authoritativeCount
    : (post ? Math.max(0, (post.comment_count || 0) - 1) : null);
  if (post && newCount !== null) post.comment_count = newCount;
  if (els && newCount !== null) els.btnEl.textContent = `${newCount} comments`;
}

// Fetch happens once, on first expand - state.comments.length check
// below means re-expanding doesn't re-request the same first page.
async function toggleCommentThread(postId) {
  const els = commentThreadElements[postId];
  if (!els) return;
  let state = commentThreadState[postId];
  if (!state) {
    state = { expanded: false, comments: [], hasMore: true };
    commentThreadState[postId] = state;
  }

  if (state.expanded) {
    state.expanded = false;
    els.sectionEl.style.display = "none";
    return;
  }
  state.expanded = true;
  els.sectionEl.style.display = "flex";
  if (state.comments.length === 0 && state.hasMore) {
    await fetchComments(postId, 3);
  }
}

// Shared by the initial 3-comment load and each "load more" click -
// only the limit differs.
async function fetchComments(postId, limit) {
  const state = commentThreadState[postId];
  const els = commentThreadElements[postId];
  if (!state || !els) return;
  const lastId = state.comments.length > 0 ? state.comments[state.comments.length - 1].id : null;
  let url = `https://${serverAddress}/get_post_comment/${postId}?limit=${limit}`;
  if (lastId) url += `&after_id=${lastId}`;

  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const incoming = (data.comments || []).map(c => {
      c.reactions = applyReactionMe(c.reactions || []);
      if (typeof applyMentionFields === "function") applyMentionFields(c, c);
      return c;
    });
    state.comments = state.comments.concat(incoming);
    if (incoming.length < limit) state.hasMore = false;
    incoming.forEach(c => els.listEl.appendChild(buildCommentElement(c)));
    els.loadMoreBtn.style.display = state.hasMore ? "block" : "none";
  } catch (e) { /* leave state as-is on failure */ }
}

function loadMoreComments(postId) {
  fetchComments(postId, 5);
}

async function submitComment(postId, inputEl) {
  const content = inputEl.value.trim();
  if (!content) return;
  if (typeof isServerTimedOut === "function" && isServerTimedOut()) return;

  let result;
  try {
    const response = await fetch(`https://${serverAddress}/post_comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ post_id: postId, content })
    });
    if (!response.ok) return;
    result = await response.json();
  } catch (e) {
    return;
  }
  inputEl.value = "";
  if (typeof refreshComposerMentions === "function") refreshComposerMentions(inputEl);
  if (typeof hideMentionPicker === "function") hideMentionPicker();

  const comment = { id: result.id, post_id: postId, sender_id: myUserId, content: result.content, created_at: result.created_at, username: myUsername, reactions: [] };
  if (typeof applyMentionFields === "function") applyMentionFields(comment, result);
  const state = commentThreadState[postId] || (commentThreadState[postId] = { expanded: true, comments: [], hasMore: false });
  state.comments.push(comment);
  const els = commentThreadElements[postId];
  if (els) {
    els.listEl.appendChild(buildCommentElement(comment));
    els.btnEl.textContent = `${result.comment_count} comments`;
  }
}
