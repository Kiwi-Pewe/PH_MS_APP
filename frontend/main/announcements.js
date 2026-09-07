// ==================================================================
// announcements.js - Announcement composer, post cards, and post pagination.
// ==================================================================

// Composer takes over the top bar in place (default <-> editing state),
// not a popup. No refresh-from-fetch after posting - the creator's own
// card is built directly from this route's response; other members get
// it via announcement_created broadcast.
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
  if (!title || !body) return;

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
  // post_announcement's response has no created_at/username/sender_id -
  // client values stand in until a real fetch-on-load exists.
  appendNewAnnouncementPost({
    id: post.id, title: post.title, body: post.body,
    created_at: new Date().toISOString(), username: myUsername, sender_id: myUserId
  });
}

// Pure builder, shared by a fresh post / the broadcast handler / the
// fetch-on-load path below - one shape everywhere. createElement/
// textContent throughout, never innerHTML - post fields are user text.
function buildAnnouncementPostCard(post) {
  const card = document.createElement("div");
  card.className = "announce-post";
  // Read back by removePostFromView to find and remove this exact DOM
  // node, same pattern buildCommentElement uses for its own rows.
  card.dataset.postId = post.id;

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
  // Only the owner can post right now (server-enforced) - accurate
  // today, needs to come from the payload once real roles exist.
  role.textContent = "Owner";
  meta.appendChild(name);
  meta.appendChild(role);
  const menuBtn = document.createElement("button");
  menuBtn.className = "announce-post-menu-btn";
  menuBtn.title = "More";
  menuBtn.innerHTML = "&#8942;";
  menuBtn.addEventListener("click", (e) => showPostContextMenu(e, post));
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
  date.textContent = formatClusterTime(parseUtcTimestamp(post.created_at));

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
  commentsBtn.textContent = `${post.comment_count || 0} comments`;
  commentsRow.appendChild(commentsBtn);

  // Thread built once per card, toggled not re-fetched (state lives in
  // commentThreadState). Registered in commentThreadElements so a live
  // broadcast can find/update this card even while collapsed.
  const commentsSection = document.createElement("div");
  commentsSection.className = "announce-comments-section";
  commentsSection.style.display = "none";
  const commentsList = document.createElement("div");
  commentsList.className = "announce-comments-list";
  const loadMoreBtn = document.createElement("button");
  loadMoreBtn.className = "announce-comments-loadmore-btn";
  // No batch-size number stated - avoids implying a broken promise if
  // fewer than expected come back.
  loadMoreBtn.textContent = "Load more comments";
  loadMoreBtn.style.display = "none";
  const commentComposer = document.createElement("div");
  commentComposer.className = "announce-comment-composer";
  const commentInput = document.createElement("input");
  commentInput.type = "text";
  commentInput.className = "announce-comment-input";
  commentInput.placeholder = "Add a comment...";
  const commentSendBtn = document.createElement("button");
  commentSendBtn.className = "announce-comment-send-btn";
  commentSendBtn.textContent = "Post";
  commentComposer.appendChild(commentInput);
  commentComposer.appendChild(commentSendBtn);
  // Stops the post's own right-click handler (attached to the whole
  // card below) from swallowing native browser paste/spellcheck on this
  // input - preventDefault is NOT called here, so the browser's own
  // menu still opens normally.
  commentInput.addEventListener("contextmenu", (e) => e.stopPropagation());
  // Composer sits first, above loaded comments - visible even on a
  // post with zero comments yet.
  commentsSection.appendChild(commentComposer);
  commentsSection.appendChild(commentsList);
  commentsSection.appendChild(loadMoreBtn);

  commentThreadElements[post.id] = { btnEl: commentsBtn, listEl: commentsList, loadMoreBtn, sectionEl: commentsSection };
  commentsBtn.addEventListener("click", () => toggleCommentThread(post.id));
  loadMoreBtn.addEventListener("click", () => loadMoreComments(post.id));
  commentSendBtn.addEventListener("click", () => submitComment(post.id, commentInput));
  commentInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitComment(post.id, commentInput); });

  card.appendChild(top);
  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(date);
  card.appendChild(dividerTop);
  card.appendChild(reactionsRow);
  card.appendChild(dividerMid);
  card.appendChild(commentsRow);
  card.appendChild(commentsSection);
  // Whole-card right-click, not just the 3-dot button - individual
  // comment rows call stopPropagation in their own contextmenu handler,
  // so right-clicking a comment inside this post opens the comment's
  // menu, not this one.
  card.addEventListener("contextmenu", (e) => showPostContextMenu(e, post));
  return card;
}

// New post - just created, or pushed via announcement_created. Goes at
// the bottom, matching chat's newest-at-bottom direction.
function appendNewAnnouncementPost(post) {
  currentAnnouncementPosts.push(post);
  const container = document.getElementById("announcements-posts");
  container.appendChild(buildAnnouncementPostCard(post));
  updateAnnouncementEndMarker();
  container.scrollTop = container.scrollHeight;
}

// Static "you're caught up" marker at the true bottom - not aware of
// "someone posted while scrolled up" yet (deferred, needs real unread
// tracking).
function updateAnnouncementEndMarker() {
  const container = document.getElementById("announcements-posts");
  const existing = container.querySelector(".announce-end-marker");
  if (existing) existing.remove();
  const marker = document.createElement("div");
  marker.className = "announce-end-marker";
  marker.textContent = "You're up to date!";
  container.appendChild(marker);
}

// Initial fetch on opening an Announcements channel. Ascending
// (oldest-first) order, same convention as get_channel_history.
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
    container.scrollTop = container.scrollHeight;
  } catch (e) { /* leave empty on failure */ }
}

// Scroll-toward-top pagination, same cursor/scroll-preservation pattern
// as loadOlderChannelMessages.
async function loadOlderAnnouncementPosts() {
  if (announcementIsLoadingMore || !announcementHasMoreHistory || currentAnnouncementPosts.length === 0) return;
  const oldest = currentAnnouncementPosts[0];
  if (!oldest.id) return;
  announcementIsLoadingMore = true;

  const container = document.getElementById("announcements-posts");
  const prevScrollHeight = container.scrollHeight;
  const prevScrollTop = container.scrollTop;

  try {
    const response = await fetch(`https://${serverAddress}/get_announcement/${currentChannelId}?before_id=${oldest.id}`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    if (data.posts.length < 25) announcementHasMoreHistory = false;
    currentAnnouncementPosts = data.posts.concat(currentAnnouncementPosts);
    // Reverse-inserted so the batch ends up in ascending order at the top.
    for (let i = data.posts.length - 1; i >= 0; i--) {
      const card = buildAnnouncementPostCard(data.posts[i]);
      if (container.firstChild) {
        container.insertBefore(card, container.firstChild);
      } else {
        container.appendChild(card);
      }
    }
    container.scrollTop = container.scrollHeight - prevScrollHeight + prevScrollTop;
  } catch (e) { /* leave state as-is on failure */ }

  announcementIsLoadingMore = false;
}

document.getElementById("announcements-posts").addEventListener("scroll", () => {
  const el = document.getElementById("announcements-posts");
  if (el.scrollTop < 40) loadOlderAnnouncementPosts();
});

// Edit stays visible-but-disabled since it doesn't exist yet, so this
// menu is never empty even for someone who can't delete - unlike a
// comment's menu, which just hides the trigger entirely instead.
function showPostContextMenu(e, post) {
  e.preventDefault();
  e.stopPropagation();
  const canDelete = post.sender_id === myUserId || myUserId === currentServerOwnerId;
  openContextMenu(e.clientX, e.clientY, {
    avatarText: avatarLetter(post.username),
    title: post.username,
    timestamp: formatClusterTime(parseUtcTimestamp(post.created_at)),
    subtitle: truncateForContextMenu(post.title)
  }, [
    { label: "Edit Post", disabled: true },
    canDelete && { label: "Delete Post", danger: true, onSelect: () => deletePostFromContextMenu(post) }
  ]);
}

// delete_post excludes the deleter from its broadcast (same as
// delete_comment), so the deleter does its own local cleanup here
// instead of waiting for the ws event like everyone else does.
async function deletePostFromContextMenu(post) {
  try {
    const response = await fetch(`https://${serverAddress}/delete_post/${post.id}`, {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) {
      console.error(`Failed to delete post: ${response.status}`);
      return;
    }
  } catch (e) {
    console.error("Failed to delete post, network error:", e);
    return;
  }
  removePostFromView(post.id);
}

// Shared by the deleter's own path above and the announcement_deleted
// ws.onmessage branch in boot.js, so the two paths can't drift apart.
// Also clears this post's comment-thread bookkeeping - the post cascade-
// deletes its comments server-side, so nothing should keep referencing
// them client-side either.
function removePostFromView(postId) {
  currentAnnouncementPosts = currentAnnouncementPosts.filter(p => p.id !== postId);
  const card = document.querySelector(`.announce-post[data-post-id="${postId}"]`);
  if (card) card.remove();
  delete commentThreadState[postId];
  delete commentThreadElements[postId];
}
