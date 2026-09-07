// ==================================================================
// comments.js - Comment threads on announcement posts.
// ==================================================================

function buildCommentElement(comment) {
  const row = document.createElement("div");
  row.className = "announce-comment";
  row.dataset.commentId = comment.id;

  const avatar = document.createElement("div");
  avatar.className = "cluster-avatar";
  avatar.textContent = (comment.username || "?").charAt(0).toUpperCase();

  const body = document.createElement("div");
  body.className = "announce-comment-body";
  const header = document.createElement("div");
  header.className = "announce-comment-header";
  const name = document.createElement("span");
  name.className = "announce-comment-name";
  name.textContent = comment.username || "Unknown";
  const time = document.createElement("span");
  time.className = "announce-comment-time";
  time.textContent = formatClusterTime(parseUtcTimestamp(comment.created_at));
  header.appendChild(name);
  header.appendChild(time);

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
  content.textContent = comment.content;
  body.appendChild(header);
  body.appendChild(content);

  row.appendChild(avatar);
  row.appendChild(body);
  row.addEventListener("contextmenu", (e) => showCommentContextMenu(e, comment));
  return row;
}

// Mirrors a normal (non-own) message's context menu: Copy/React/Report
// available on anyone's content, Delete only for the owner. React/Report
// have no backend yet, so they're shown-disabled like Edit Post - not
// hidden, since a comment's menu should never look empty. Report is
// only relevant on someone else's comment.
function showCommentContextMenu(e, comment) {
  e.preventDefault();
  e.stopPropagation();
  const isMine = comment.sender_id === myUserId;
  const canDelete = isMine || myUserId === currentServerOwnerId;
  openContextMenu(e.clientX, e.clientY, {
    avatarText: avatarLetter(comment.username),
    title: comment.username,
    timestamp: formatClusterTime(parseUtcTimestamp(comment.created_at)),
    subtitle: truncateForContextMenu(comment.content)
  }, [
    { label: "Copy Comment", onSelect: () => copyCommentContent(comment) },
    { label: "React", disabled: true },
    !isMine && { label: "Report", disabled: true },
    canDelete && { label: "Delete Comment", danger: true, onSelect: () => deleteCommentFromContextMenu(comment) }
  ]);
}

async function copyCommentContent(comment) {
  try {
    await navigator.clipboard.writeText(comment.content);
  } catch (e) {
    console.error("Failed to copy comment, clipboard error:", e);
  }
}

// delete_comment returns no body, and excludes the deleter from the
// broadcast - so the deleter does its own local cleanup here instead
// of waiting for the ws event like everyone else does.
async function deleteCommentFromContextMenu(comment) {
  try {
    const response = await fetch(`https://${serverAddress}/delete_comment/${comment.id}`, {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) {
      console.error(`Failed to delete comment: ${response.status}`);
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
    state.comments = state.comments.concat(data.comments);
    if (data.comments.length < limit) state.hasMore = false;
    data.comments.forEach(c => els.listEl.appendChild(buildCommentElement(c)));
    els.loadMoreBtn.style.display = state.hasMore ? "block" : "none";
  } catch (e) { /* leave state as-is on failure */ }
}

function loadMoreComments(postId) {
  fetchComments(postId, 5);
}

async function submitComment(postId, inputEl) {
  const content = inputEl.value.trim();
  if (!content) return;

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

  const comment = { id: result.id, post_id: postId, sender_id: myUserId, content: result.content, created_at: result.created_at, username: myUsername };
  const state = commentThreadState[postId] || (commentThreadState[postId] = { expanded: true, comments: [], hasMore: false });
  state.comments.push(comment);
  const els = commentThreadElements[postId];
  if (els) {
    els.listEl.appendChild(buildCommentElement(comment));
    els.btnEl.textContent = `${result.comment_count} comments`;
  }
}
