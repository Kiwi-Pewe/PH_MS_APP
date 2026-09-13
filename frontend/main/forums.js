// ==================================================================
// forums.js - Forum channel: post composer, post cards, card pagination.
// ==================================================================

// Same two-state bar as Announcements (search <-> title+body) and the
// same .announce-composer-* CSS, but its own elements and its own submit:
// submitCreateAnnouncement is hard-wired to the announcement input ids
// and posts to /post_announcement, so there was nothing to share beyond
// the styling. Same relationship #composer and #channel-composer have.
document.getElementById("forum-new-post-btn").addEventListener("click", showForumComposerEditing);
document.getElementById("forum-composer-cancel-btn").addEventListener("click", hideForumComposerEditing);
document.getElementById("forum-post-btn").addEventListener("click", submitCreateForumPost);

function showForumComposerEditing() {
  document.getElementById("forum-title-input").value = "";
  document.getElementById("forum-body-input").value = "";
  // Clearing the inline height (rather than setting a number) hands
  // sizing back to rows="3", so reopening the composer after a long
  // draft starts small again instead of staying expanded.
  document.getElementById("forum-body-input").style.height = "";
  if (typeof clearPostMedia === "function") clearPostMedia("forum");
  document.getElementById("forum-composer-default").style.display = "none";
  document.getElementById("forum-composer-editing").style.display = "flex";
  document.getElementById("forum-title-input").focus();
}

// Same shape as autoGrowComposer: measure with height cleared, then set
// the measured height. The ceiling and the switch to scrolling live in
// CSS (.announce-composer-body-input), so this can't overgrow - it expands
// twice off rows="3" and then the max-height takes over.
function autoGrowForumBody() {
  autoGrowPostBodyInput(document.getElementById("forum-body-input"));
}

document.getElementById("forum-body-input").addEventListener("input", autoGrowForumBody);

function hideForumComposerEditing() {
  document.getElementById("forum-composer-editing").style.display = "none";
  document.getElementById("forum-composer-default").style.display = "flex";
  if (typeof clearPostMedia === "function") clearPostMedia("forum");
}

async function submitCreateForumPost() {
  const title = document.getElementById("forum-title-input").value.trim();
  const body = document.getElementById("forum-body-input").value.trim();
  const pending = pendingFiles("forum");
  if (!title || (!body && !pending.length)) return;

  const postBtn = document.getElementById("forum-post-btn");
  postBtn.disabled = true;
  let post;
  try {
    const attachment = await uploadPendingFiles("forum");
    const response = await fetch(`https://${serverAddress}/create_forum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ channel_id: currentChannelId, title, body, attachment })
    });
    if (!response.ok) {
      console.error(`Failed to create forum post: ${response.status}`);
      return;
    }
    post = await response.json();
  } catch (e) {
    console.error("Failed to create forum post, network error:", e);
    return;
  } finally {
    postBtn.disabled = false;
  }
  hideForumComposerEditing();
  // create_forum's response carries no author fields - it only returns
  // what it stored. Filled in from the session here, the same gap
  // submitCreateAnnouncement covers for its own locally-built card.
  prependNewForumPost({
    id: post.id,
    title: post.title,
    body: post.body,
    attachment: post.attachment,
    tags: post.tags,
    message_count: post.message_count,
    last_activity: post.last_activity,
    author_id: myUserId,
    author_username: myUsername
  });
}

// Goes to the TOP: creating a post counts as activity, so a new one is
// the most recently active thing in the channel. Only ever called for
// YOUR OWN post - other people's new posts deliberately do NOT appear
// until the channel is reloaded, since inserting a card would shift the
// list under someone who's mid-read.
function prependNewForumPost(post) {
  currentForumPosts.unshift(post);
  const container = document.getElementById("forum-posts");
  const card = buildForumPostCard(post);
  if (container.firstChild) {
    container.insertBefore(card, container.firstChild);
  } else {
    container.appendChild(card);
  }
  container.scrollTop = 0;
}

// Pure builder, shared by the fetch-on-load path and a freshly created
// post. createElement/textContent throughout, never innerHTML - title
// and body are user text.
function buildForumPostCard(post) {
  const card = document.createElement("div");
  card.className = "forum-post";
  card.dataset.postId = post.id;

  // Deliberately empty. The column exists and always comes back "",
  // since real tag management is tied to the future roles/permissions
  // work. Rendered anyway so a card is the same height now as it will
  // be once tags land, rather than growing later.
  const tags = document.createElement("div");
  tags.className = "forum-post-tags";

  const title = document.createElement("div");
  title.className = "forum-post-title";
  title.textContent = post.title;

  // Author and body share ONE line that clips at the card's edge with an
  // ellipsis. That single clipped line is what makes every card the same
  // height regardless of body length - no fixed pixel height needed.
  const line = document.createElement("div");
  line.className = "forum-post-line";
  // Trailing colon so the line reads "username: message" instead of the
  // two running together as one sentence.
  const author = document.createElement("span");
  author.className = "forum-post-author";
  author.textContent = `${post.author_username || "Unknown"}:`;
  const body = document.createElement("span");
  body.className = "forum-post-body";
  body.textContent = post.body;
  line.appendChild(author);
  line.appendChild(body);

  const meta = document.createElement("div");
  meta.className = "forum-post-meta";
  // Reuses the announcement post's own reaction button outright, class
  // and all, rather than a lookalike - both are inert placeholders for
  // the same future cross-cutting reactions feature, so they should
  // become real in one edit rather than two.
  const reactions = document.createElement("button");
  reactions.className = "announce-add-reaction-btn";
  reactions.title = "React (coming soon)";
  reactions.textContent = "+";
  // The whole card opens the thread, so this has to stop the click here
  // or reacting would navigate away instead.
  reactions.addEventListener("click", (e) => e.stopPropagation());
  const count = document.createElement("span");
  count.className = "forum-post-count";
  count.textContent = `${post.message_count || 0} messages`;
  // Clock time of the last message, not "3h ago" - Kiwi's call for the
  // baseline pass, which is why formatClusterTime is reused unchanged.
  const activity = document.createElement("span");
  activity.className = "forum-post-activity";
  activity.textContent = formatClusterTime(parseUtcTimestamp(post.last_activity));
  meta.appendChild(reactions);
  meta.appendChild(count);
  meta.appendChild(activity);

  // Registered so a live broadcast can retext this card in place, without
  // searching the DOM and without touching its position. Not cleared on
  // channel switch - same reasoning as commentThreadElements: a rebuilt
  // card overwrites its own entry, and entries for cards no longer on
  // screen are dead weight rather than a correctness risk.
  forumCardElements[post.id] = { tagsEl: tags, countEl: count, activityEl: activity };

  card.addEventListener("click", () => openForumPost(post));

  const main = document.createElement("div");
  main.className = "forum-post-main";
  main.appendChild(tags);
  main.appendChild(title);
  main.appendChild(line);
  main.appendChild(meta);
  card.appendChild(main);
  const thumb = typeof buildForumThumb === "function" ? buildForumThumb(post.attachment) : null;
  if (thumb) card.appendChild(thumb);
  return card;
}

// Opens a post's thread IN PLACE of the card list, rather than beside it.
// Everything below the header is the ordinary channel chat view being
// borrowed wholesale - no forum-specific renderer, composer or pagination
// exists, they're the channel ones with openForumPostId set (see state.js).
async function openForumPost(post) {
  openForumPostId = post.id;
  openForumPostTitle = post.title;
  openForumPostBody = post.body || "";
  openForumPostAttachment = post.attachment || null;

  document.getElementById("forums-view").style.display = "none";
  document.getElementById("channel-body").style.display = "flex";
  document.getElementById("channel-composer").style.display = "block";
  document.getElementById("forum-back-btn").style.display = "inline-flex";
  document.getElementById("channel-header-title").textContent = post.title;
  document.getElementById("channel-empty").style.display = "none";
  document.getElementById("channel-messages").style.display = "block";
  enableChannelComposer(post.title);

  currentChannelMessages = [];
  channelHasMoreHistory = true;
  channelIsLoadingMore = false;

  try {
    const response = await fetch(`https://${serverAddress}/get_forum_messages/${post.id}`, { credentials: "include" });
    if (!response.ok) { renderChannelMessages(); return; }
    const data = await response.json();
    currentChannelMessages = (data.forum_post_messages || []).map(msg => ({
      id: msg.id,
      isMine: msg.author_id === myUserId,
      senderId: msg.author_id,
      username: msg.username,
      content: msg.content,
      time: parseUtcTimestamp(msg.timestamp)
    }));
    if (currentChannelMessages.length < 25) channelHasMoreHistory = false;
    renderChannelMessages();
  } catch (e) { renderChannelMessages(); }
}

// Deliberately does NOT re-fetch the card list on the way back. Returning
// from a thread is not a channel reload, and re-sorting here would shuffle
// the list under someone who just stepped away to read one post - the exact
// thing the no-live-reorder rule exists to prevent. Counts and times on the
// cards are already current via patchForumCard.
function closeForumPost() {
  openForumPostId = null;
  openForumPostTitle = null;
  openForumPostBody = null;
  openForumPostAttachment = null;
  currentChannelMessages = [];

  document.getElementById("forum-back-btn").style.display = "none";
  document.getElementById("channel-body").style.display = "none";
  document.getElementById("channel-composer").style.display = "none";
  document.getElementById("forums-view").style.display = "flex";
  document.getElementById("channel-header-title").textContent = `#${currentChannelName}`;
}

document.getElementById("forum-back-btn").addEventListener("click", closeForumPost);

// Retexts one card in place from a forum_post_updated broadcast. Touches
// the DOM only, never the card's position. currentForumPosts is left stale
// on purpose: its last entry is loadMoreForumPosts' pagination cursor, and
// bumping that entry's activity to "now" would make the next page re-fetch
// posts already on screen. Nothing reads the array for display.
function patchForumCard(postId, messageCount, lastActivity) {
  const els = forumCardElements[postId];
  if (!els) return;
  els.countEl.textContent = `${messageCount} messages`;
  els.activityEl.textContent = formatClusterTime(parseUtcTimestamp(lastActivity));
}

// Initial fetch on opening a Forums channel. This is also the ONLY thing
// that sorts the list - re-running it (by switching channels and coming
// back) is how a stale order gets refreshed, which is why no dedicated
// refresh button is needed yet.
async function loadForumPosts(channelId) {
  currentForumPosts = [];
  forumHasMore = true;
  forumIsLoadingMore = false;
  const container = document.getElementById("forum-posts");
  container.innerHTML = "";
  try {
    const response = await fetch(`https://${serverAddress}/get_forum_post/${channelId}`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    currentForumPosts = data.forum_posts || [];
    // Backend pages these 10 at a time, not the 25 used everywhere else.
    if (currentForumPosts.length < 10) forumHasMore = false;
    currentForumPosts.forEach(post => container.appendChild(buildForumPostCard(post)));
    container.scrollTop = 0;
  } catch (e) { /* leave the list empty on failure */ }
}

// Scroll-toward-BOTTOM pagination - the opposite direction from every
// other paginated list here, because this list runs most-active-first
// from the top instead of oldest-first. Appending to the bottom also
// means no scroll-position juggling: the browser leaves scrollTop alone.
async function loadMoreForumPosts() {
  if (forumIsLoadingMore || !forumHasMore || currentForumPosts.length === 0) return;
  const last = currentForumPosts[currentForumPosts.length - 1];
  if (!last.id) return;
  forumIsLoadingMore = true;

  try {
    // URLSearchParams, not a hand-built string: last_activity is
    // space-separated ("2026-09-07 13:04:11.123456") and that space has
    // to be encoded or the query arrives truncated.
    const params = new URLSearchParams({
      before_activity: last.last_activity,
      before_id: last.id
    });
    const response = await fetch(`https://${serverAddress}/get_forum_post/${currentChannelId}?${params}`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const older = data.forum_posts || [];
    if (older.length < 10) forumHasMore = false;
    currentForumPosts = currentForumPosts.concat(older);
    const container = document.getElementById("forum-posts");
    older.forEach(post => container.appendChild(buildForumPostCard(post)));
  } catch (e) { /* leave state as-is on failure */ }

  forumIsLoadingMore = false;
}

// 40px from the bottom rather than exactly at it, matching the same
// early-trigger threshold the upward-scrolling lists use.
document.getElementById("forum-posts").addEventListener("scroll", () => {
  const el = document.getElementById("forum-posts");
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) loadMoreForumPosts();
});
