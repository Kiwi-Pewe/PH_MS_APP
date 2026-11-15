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
  name.textContent = comment.display_name || comment.username || "Unknown";
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
  const newsComment = commentKindOf(comment) === "news_comment";
  const canDelete = isMine || (newsComment ? (typeof isOneiraAdmin === "function" && isOneiraAdmin()) : myUserId === currentServerOwnerId);
  openContextMenu(e.clientX, e.clientY, {
    avatarText: avatarLetter(comment.display_name || comment.username),
    title: comment.display_name || comment.username,
    timestamp: formatClusterTime(parseUtcTimestamp(comment.created_at)),
    subtitle: truncateForContextMenu(typeof mentionDisplayText === "function" ? mentionDisplayText(comment.content, comment.mentionUsers, comment.mentionRoles) : comment.content)
  }, [
    { label: "Copy Comment", onSelect: () => copyCommentContent(comment) },
    isMine && { label: "Edit Comment", onSelect: () => startCommentEdit(comment) },
    { label: "Add Reaction", onSelect: () => openReactionPicker(commentReactionTarget(comment), e.clientX, e.clientY) },
    !newsComment && (typeof canPinMessages !== "function" || canPinMessages()) && {
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
  const path = commentKindOf(comment) === "news_comment" ? "news/comments/edit" : "edit_comment";
  const response = await fetch(`https://${serverAddress}/${path}`, {
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
  const keys = [data.post_id, commentThreadKey(data.post_id, "news")];
  let comment = null;
  for (let i = 0; i < keys.length; i++) {
    const state = commentThreadState[keys[i]];
    comment = state && (state.comments || []).find((row) => Number(row.id) === Number(data.comment_id));
    if (comment) break;
  }
  if (!comment) return;
  comment.content = data.content;
  comment.edited = !!data.edited;
  if (typeof applyMentionFields === "function") applyMentionFields(comment, data);
  editingCommentId = null;
  const row = document.querySelector(`.announce-comment[data-comment-id="${data.comment_id}"]`);
  if (row) row.replaceWith(buildCommentElement(comment));
}

function commentKindOf(comment) {
  if (comment && comment.chatKind === "media_comment") return "media_comment";
  if (comment && comment.chatKind === "news_comment") return "news_comment";
  return "comment";
}

function commentThreadKey(postId, surface) {
  return surface === "news" ? "news:" + String(postId) : postId;
}

function parseCommentThreadKey(key) {
  const text = String(key == null ? "" : key);
  if (text.indexOf("news:") === 0) return { surface: "news", postId: Number(text.slice(5)) };
  return { surface: "announcement", postId: Number(text) };
}

function commentThreadPost(key) {
  const parsed = parseCommentThreadKey(key);
  if (parsed.surface === "news") {
    return (typeof newsPosts !== "undefined" ? newsPosts : []).find((row) => Number(row.id) === parsed.postId) || null;
  }
  return (typeof currentAnnouncementPosts !== "undefined" ? currentAnnouncementPosts : []).find((row) => Number(row.id) === parsed.postId) || null;
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
    const row = els && els.listEl && els.listEl.querySelector(`[data-comment-id="${commentId}"]`);
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
  const kind = commentKindOf(comment);
  const news = kind === "news_comment";
  const media = kind === "media_comment";
  const path = media ? `delete_media_comment/${comment.id}` : (news ? "news/comments/delete" : `delete_comment/${comment.id}`);
  try {
    const response = await fetch(`https://${serverAddress}/${path}`, {
      method: "POST",
      credentials: "include",
      headers: news ? { "Content-Type": "application/json" } : undefined,
      body: news ? JSON.stringify({ comment_id: comment.id }) : undefined
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
    if (news) {
      const data = await response.json().catch(() => ({}));
      removeCommentFromThread(commentThreadKey(comment.post_id, "news"), comment.id, data.comment_count);
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
  const key = postId;
  const state = commentThreadState[key];
  if (state) {
    state.comments = state.comments.filter(c => c.id !== commentId);
  }
  const els = commentThreadElements[key];
  if (els && els.listEl) {
    const rowEl = els.listEl.querySelector(`[data-comment-id="${commentId}"]`);
    if (rowEl) rowEl.remove();
  }

  const post = commentThreadPost(key);
  const newCount = typeof authoritativeCount === "number"
    ? authoritativeCount
    : (post ? Math.max(0, (post.comment_count || 0) - 1) : null);
  if (post && newCount !== null) post.comment_count = newCount;
  if (els && els.btnEl && newCount !== null) els.btnEl.textContent = `${newCount} comments`;
  syncAnnounceCommentsEmpty(key);
}

// Fetch happens once, on first expand - state.comments.length check
// below means re-expanding doesn't re-request the same first page.
let announceCommentsBound = false;
let currentAnnounceCommentsPostId = null;

function closeAnnounceComments() {
  const overlay = document.getElementById("announce-comments-overlay");
  if (overlay) overlay.hidden = true;
  if (currentAnnounceCommentsPostId != null) {
    const prev = commentThreadState[currentAnnounceCommentsPostId];
    if (prev) prev.expanded = false;
    const prevEls = commentThreadElements[currentAnnounceCommentsPostId];
    if (prevEls) {
      prevEls.listEl = null;
      prevEls.loadMoreBtn = null;
    }
  }
  currentAnnounceCommentsPostId = null;
}

function paintAnnounceCommentsSnippet(post, surface) {
  const host = document.getElementById("announce-comments-snippet");
  if (!host || !post) return;
  host.replaceChildren();
  const top = document.createElement("div");
  top.className = "announce-comments-snippet-top";
  const avatar = document.createElement("div");
  avatar.className = "cluster-avatar";
  const label = post.display_name || post.username || "Unknown";
  if (typeof paintUserFace === "function") paintUserFace(avatar, post, { name: label, userId: post.sender_id });
  else avatar.textContent = (label || "?").charAt(0).toUpperCase();
  const meta = document.createElement("div");
  meta.className = "announce-comments-snippet-meta";
  const name = document.createElement("div");
  name.className = "announce-post-name";
  name.textContent = label;
  if (surface !== "news" && typeof applyServerNameColor === "function") applyServerNameColor(name, post.sender_id, post.name_role || post.nameRole);
  const title = document.createElement("div");
  title.className = "announce-comments-snippet-title";
  if (surface === "news" && typeof fillNewsMarkdown === "function") fillNewsMarkdown(title, post.title || "");
  else title.textContent = post.title || "";
  meta.appendChild(name);
  meta.appendChild(title);
  top.appendChild(avatar);
  top.appendChild(meta);
  host.appendChild(top);
  if (post.body) {
    const body = document.createElement("div");
    body.className = "announce-comments-snippet-body";
    if (surface === "news" && typeof fillNewsMarkdown === "function") fillNewsMarkdown(body, post.body);
    else if (typeof fillMentionText === "function") fillMentionText(body, post.body, post.mentionUsers, post.mentionRoles, { rich: true });
    else body.textContent = post.body;
    host.appendChild(body);
  }
}

function ensureAnnounceCommentsOverlay() {
  const overlay = document.getElementById("announce-comments-overlay");
  if (!overlay || announceCommentsBound) return overlay;
  announceCommentsBound = true;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeAnnounceComments();
  });
  const close = document.getElementById("announce-comments-close");
  if (close) close.addEventListener("click", () => closeAnnounceComments());
  const send = document.getElementById("announce-comments-send");
  const input = document.getElementById("announce-comments-input");
  if (send) send.addEventListener("click", () => {
    if (currentAnnounceCommentsPostId) submitComment(currentAnnounceCommentsPostId, input);
  });
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitComment(currentAnnounceCommentsPostId, input);
    });
    input.addEventListener("contextmenu", (e) => e.stopPropagation());
    if (typeof bindMentionComposer === "function") bindMentionComposer(input);
  }
  const more = document.getElementById("announce-comments-more");
  if (more) more.addEventListener("click", () => {
    if (currentAnnounceCommentsPostId) loadMoreComments(currentAnnounceCommentsPostId);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || overlay.hidden || editingCommentId) return;
    closeAnnounceComments();
  });
  return overlay;
}

function syncAnnounceCommentsEmpty(postId) {
  const empty = document.getElementById("announce-comments-empty");
  if (!empty) return;
  const state = commentThreadState[postId];
  empty.hidden = !!(state && state.comments && state.comments.length);
}

async function openAnnounceComments(postId, surface) {
  const key = commentThreadKey(postId, surface);
  const post = commentThreadPost(key);
  if (!post) return;
  const overlay = ensureAnnounceCommentsOverlay();
  if (!overlay) return;
  if (currentAnnounceCommentsPostId != null && String(currentAnnounceCommentsPostId) !== String(key)) {
    const prev = commentThreadState[currentAnnounceCommentsPostId];
    if (prev) prev.expanded = false;
    const prevEls = commentThreadElements[currentAnnounceCommentsPostId];
    if (prevEls) {
      prevEls.listEl = null;
      prevEls.loadMoreBtn = null;
    }
  }
  currentAnnounceCommentsPostId = key;
  paintAnnounceCommentsSnippet(post, surface);
  const list = document.getElementById("announce-comments-list");
  const more = document.getElementById("announce-comments-more");
  const input = document.getElementById("announce-comments-input");
  const composer = document.getElementById("announce-comments-composer");
  if (list) list.replaceChildren();
  if (composer) composer.hidden = post.comments_open === false;
  if (input) {
    input.value = "";
    input.disabled = surface !== "news" && typeof isServerTimedOut === "function" && isServerTimedOut();
    input.placeholder = input.disabled
      ? "You do not have permission to send messages in this channel."
      : "Add a comment...";
  }
  const els = commentThreadElements[key] || (commentThreadElements[key] = {});
  els.listEl = list;
  els.loadMoreBtn = more;
  let state = commentThreadState[key];
  if (!state) {
    state = { expanded: false, comments: [], hasMore: true };
    commentThreadState[key] = state;
  }
  state.expanded = true;
  (state.comments || []).forEach((comment) => {
    if (list) list.appendChild(buildCommentElement(comment));
  });
  if (more) more.style.display = (state.comments.length && state.hasMore) ? "block" : "none";
  syncAnnounceCommentsEmpty(key);
  overlay.hidden = false;
  if (state.comments.length === 0 && state.hasMore) await fetchComments(key, 25);
  syncAnnounceCommentsEmpty(key);
  if (input && !input.disabled) input.focus();
}

async function toggleCommentThread(postId, surface) {
  const key = commentThreadKey(postId, surface);
  const overlay = document.getElementById("announce-comments-overlay");
  if (overlay && !overlay.hidden && String(currentAnnounceCommentsPostId) === String(key)) {
    closeAnnounceComments();
    return;
  }
  await openAnnounceComments(postId, surface);
}

// Shared by the initial 3-comment load and each "load more" click -
// only the limit differs.
async function fetchComments(postId, limit) {
  const state = commentThreadState[postId];
  const els = commentThreadElements[postId];
  if (!state || !els || !els.listEl) return;
  const parsed = parseCommentThreadKey(postId);
  const lastId = state.comments.length > 0 ? state.comments[state.comments.length - 1].id : null;
  let url = parsed.surface === "news"
    ? `https://${serverAddress}/news/comments/${parsed.postId}?limit=${limit}`
    : `https://${serverAddress}/get_post_comment/${parsed.postId}?limit=${limit}`;
  if (lastId) url += `&after_id=${lastId}`;

  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const incoming = (data.comments || []).map(c => {
      c.reactions = applyReactionMe(c.reactions || []);
      if (parsed.surface === "news") c.chatKind = "news_comment";
      if (typeof applyMentionFields === "function") applyMentionFields(c, c);
      return c;
    });
    state.comments = state.comments.concat(incoming);
    if (incoming.length < limit) state.hasMore = false;
    if (els.listEl) incoming.forEach(c => els.listEl.appendChild(buildCommentElement(c)));
    if (els.loadMoreBtn) els.loadMoreBtn.style.display = state.hasMore ? "block" : "none";
    syncAnnounceCommentsEmpty(postId);
  } catch (e) { /* leave state as-is on failure */ }
}

function loadMoreComments(postId) {
  fetchComments(postId, 25);
}

async function submitComment(postId, inputEl) {
  const content = inputEl.value.trim();
  if (!content) return;
  const parsed = parseCommentThreadKey(postId);
  if (parsed.surface !== "news" && typeof isServerTimedOut === "function" && isServerTimedOut()) return;

  let result;
  try {
    const path = parsed.surface === "news" ? "news/comments" : "post_comment";
    const response = await fetch(`https://${serverAddress}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ post_id: parsed.postId, content })
    });
    if (!response.ok) return;
    result = await response.json();
  } catch (e) {
    return;
  }
  inputEl.value = "";
  if (typeof refreshComposerMentions === "function") refreshComposerMentions(inputEl);
  if (typeof hideMentionPicker === "function") hideMentionPicker();

  const comment = result.id ? result : { id: result.id, post_id: parsed.postId, sender_id: myUserId, content: result.content, created_at: result.created_at, username: myUsername, reactions: [] };
  if (!comment.username) comment.username = myUsername;
  if (!comment.display_name) comment.display_name = (typeof myDisplayName !== "undefined" && myDisplayName) || myUsername;
  if (!comment.sender_id) comment.sender_id = myUserId;
  if (!comment.post_id) comment.post_id = parsed.postId;
  if (parsed.surface === "news") comment.chatKind = "news_comment";
  comment.reactions = applyReactionMe(comment.reactions || []);
  if (typeof applyMentionFields === "function") applyMentionFields(comment, result);
  const state = commentThreadState[postId] || (commentThreadState[postId] = { expanded: true, comments: [], hasMore: false });
  state.comments.push(comment);
  const els = commentThreadElements[postId];
  const post = commentThreadPost(postId);
  if (post && result.comment_count != null) post.comment_count = result.comment_count;
  if (els) {
    if (els.listEl) els.listEl.appendChild(buildCommentElement(comment));
    if (els.btnEl) els.btnEl.textContent = `${result.comment_count} comments`;
  }
  syncAnnounceCommentsEmpty(postId);
}
