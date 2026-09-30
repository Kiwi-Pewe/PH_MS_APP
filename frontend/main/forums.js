// ==================================================================
// forums.js - Forum channel: post composer, post cards, card pagination.
// ==================================================================

// Same two-state bar as Announcements (search <-> title+body) and the
// same .announce-composer-* CSS, but its own elements and its own submit:
// submitCreateAnnouncement is hard-wired to the announcement input ids
// and posts to /post_announcement, so there was nothing to share beyond
// the styling. Same relationship #composer and #channel-composer have.
function paintForumAccess() {
  const btn = document.getElementById("forum-new-post-btn");
  if (btn) {
    btn.style.display = (typeof canCreateTopics === "function" && canCreateTopics()) ? "inline-flex" : "none";
  }
  const composer = document.getElementById("forum-composer-editing");
  if (composer && composer.style.display !== "none" && typeof canCreateTopics === "function" && !canCreateTopics()) {
    hideForumComposerEditing();
  }
  if (currentChannelType === "forums" && typeof canReadForums === "function" && !canReadForums()) {
    if (typeof afterServerStructureChange === "function") afterServerStructureChange();
    return;
  }
  if (openForumPostId && typeof enableChannelComposer === "function") {
    enableChannelComposer(openForumPostTitle || currentChannelName || "");
  }
}

function applyForumChannelSettings(settings) {
  forumChannelSettings = {
    guidelines: (settings && settings.guidelines) || "",
    require_tags: !!(settings && settings.require_tags),
    default_reaction: (settings && settings.default_reaction) || "",
    tags: Array.isArray(settings && settings.tags) ? settings.tags.slice() : [],
  };
  paintForumFilterBar();
  paintForumComposerTags();
  paintForumGuidelinesBox();
}

function paintForumGuidelinesBox() {
  const box = document.getElementById("forum-guidelines-box");
  if (!box) return;
  const text = (forumChannelSettings.guidelines || "").trim();
  if (!text) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.textContent = text;
}

function paintForumFilterBar() {
  const bar = document.getElementById("forum-filter-bar");
  const host = document.getElementById("forum-tag-filters");
  if (!bar || !host) return;
  const tags = forumChannelSettings.tags || [];
  bar.hidden = false;
  host.replaceChildren();
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "forum-tag-chip" + (forumFilterTagId == null ? " is-active" : "");
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => {
    forumFilterTagId = null;
    loadForumPosts(currentChannelId);
  });
  host.appendChild(allBtn);
  tags.forEach((tag) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "forum-tag-chip" + (Number(forumFilterTagId) === Number(tag.id) ? " is-active" : "");
    btn.textContent = ((tag.emoji || "") + " " + (tag.name || "")).trim();
    btn.addEventListener("click", () => {
      forumFilterTagId = tag.id;
      loadForumPosts(currentChannelId);
    });
    host.appendChild(btn);
  });
}

function paintForumComposerTags() {
  const host = document.getElementById("forum-composer-tags");
  if (!host) return;
  const tags = forumChannelSettings.tags || [];
  if (!tags.length) {
    host.hidden = true;
    host.replaceChildren();
    forumComposerTagIds = [];
    return;
  }
  host.hidden = false;
  host.replaceChildren();
  const label = document.createElement("div");
  label.className = "forum-composer-tags-label";
  label.textContent = forumChannelSettings.require_tags ? "Tags (required)" : "Tags";
  host.appendChild(label);
  const row = document.createElement("div");
  row.className = "forum-composer-tags-row";
  tags.forEach((tag) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const on = forumComposerTagIds.some((id) => Number(id) === Number(tag.id));
    btn.className = "forum-tag-chip" + (on ? " is-active" : "");
    btn.textContent = ((tag.emoji || "") + " " + (tag.name || "")).trim();
    btn.addEventListener("click", () => {
      if (on) forumComposerTagIds = forumComposerTagIds.filter((id) => Number(id) !== Number(tag.id));
      else if (forumComposerTagIds.length < 5) forumComposerTagIds.push(tag.id);
      paintForumComposerTags();
    });
    row.appendChild(btn);
  });
  host.appendChild(row);
}

function paintForumPostTags(host, post) {
  if (!host) return;
  host.replaceChildren();
  const tags = Array.isArray(post.tags) ? post.tags : [];
  tags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "forum-post-tag-chip";
    chip.textContent = ((tag.emoji || "") + " " + (tag.name || "")).trim();
    host.appendChild(chip);
  });
}

function forumListQueryParams(extra) {
  const params = new URLSearchParams(extra || {});
  const q = (forumSearchQuery || "").trim();
  if (q) params.set("q", q);
  if (forumFilterTagId != null) params.set("tag_id", String(forumFilterTagId));
  return params;
}

document.getElementById("forum-new-post-btn").addEventListener("click", showForumComposerEditing);
document.getElementById("forum-composer-cancel-btn").addEventListener("click", hideForumComposerEditing);
document.getElementById("forum-post-btn").addEventListener("click", submitCreateForumPost);

const forumSearchInput = document.getElementById("forum-search-input");
if (forumSearchInput) {
  let forumSearchTimer = null;
  forumSearchInput.addEventListener("input", () => {
    forumSearchQuery = forumSearchInput.value || "";
    if (forumSearchTimer) clearTimeout(forumSearchTimer);
    forumSearchTimer = setTimeout(() => {
      if (currentChannelType === "forums" && currentChannelId && !openForumPostId) {
        loadForumPosts(currentChannelId);
      }
    }, 250);
  });
  forumSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      forumSearchQuery = forumSearchInput.value || "";
      if (currentChannelType === "forums" && currentChannelId && !openForumPostId) {
        loadForumPosts(currentChannelId);
      }
    }
  });
}

const forumSortBtn = document.getElementById("forum-sort-btn");
if (forumSortBtn) {
  forumSortBtn.addEventListener("click", (e) => {
    if (typeof openContextMenu !== "function") return;
    const rect = forumSortBtn.getBoundingClientRect();
    openContextMenu(rect.left, rect.bottom + 4, null, [
      { label: "Recent activity", onSelect: () => loadForumPosts(currentChannelId) },
      { label: "Creation date", disabled: true },
      { label: "Top", disabled: true },
      { separator: true },
      { label: "List view", onSelect: () => {} },
      { label: "Gallery view", disabled: true },
    ]);
  });
}

function showForumComposerEditing() {
  if (typeof canCreateTopics === "function" && !canCreateTopics()) return;
  document.getElementById("forum-title-input").value = "";
  document.getElementById("forum-body-input").value = "";
  document.getElementById("forum-body-input").style.height = "";
  forumComposerTagIds = [];
  if (typeof clearPostMedia === "function") clearPostMedia("forum");
  document.getElementById("forum-composer-default").style.display = "none";
  document.getElementById("forum-composer-editing").style.display = "flex";
  paintForumGuidelinesBox();
  paintForumComposerTags();
  document.getElementById("forum-title-input").focus();
  if (typeof refreshComposerMentions === "function") refreshComposerMentions(document.getElementById("forum-body-input"));
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
  if (typeof hideMentionPicker === "function") hideMentionPicker();
  document.getElementById("forum-composer-editing").style.display = "none";
  document.getElementById("forum-composer-default").style.display = "flex";
  if (typeof clearPostMedia === "function") clearPostMedia("forum");
}

async function submitCreateForumPost() {
  const title = document.getElementById("forum-title-input").value.trim();
  const body = document.getElementById("forum-body-input").value.trim();
  const pending = postMediaPending.forum.files;
  if (!title || (!body && !pending.length)) return;

  if (typeof isServerTimedOut === "function" && isServerTimedOut()) return;
  if (typeof canCreateTopics === "function" && !canCreateTopics()) return;
  if (forumChannelSettings.require_tags && (forumChannelSettings.tags || []).length && !forumComposerTagIds.length) {
    window.alert("Pick at least one tag for this post.");
    return;
  }
  const postBtn = document.getElementById("forum-post-btn");
  postBtn.disabled = true;
  let post;
  try {
    let attachments = [];
    if (pending.length) attachments = await uploadPendingPostFiles(pending);
    const response = await fetch(`https://${serverAddress}/create_forum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        channel_id: currentChannelId,
        title,
        body,
        attachments,
        tag_ids: forumComposerTagIds.slice(),
      })
    });
    if (!response.ok) {
      console.error(`Failed to create forum post: ${response.status}`);
      return;
    }
    post = await response.json();
  } catch (e) {
    console.error("Failed to create forum post, network error:", e);
    window.alert(e.message || "Failed to create forum post.");
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
    tags: post.tags || [],
    message_count: post.message_count,
    last_activity: post.last_activity,
    author_id: myUserId,
    author_username: myUsername,
    edited: false,
    sticky: false,
    locked: false,
    reactions: applyReactionMe(post.reactions || []),
    mention_users: post.mention_users
  });
}

// Goes to the TOP: creating a post counts as activity, so a new one is
// the most recently active thing in the channel. Only ever called for
// YOUR OWN post - other people's new posts deliberately do NOT appear
// until the channel is reloaded, since inserting a card would shift the
// list under someone who's mid-read.
function prependNewForumPost(post) {
  const container = document.getElementById("forum-posts");
  const card = buildForumPostCard(post);
  const firstNormalIdx = currentForumPosts.findIndex(p => !p.sticky);
  if (firstNormalIdx < 0) currentForumPosts.push(post);
  else currentForumPosts.splice(firstNormalIdx, 0, post);
  const firstNormal = container.querySelector(".forum-post:not(.is-sticky)");
  if (firstNormal) container.insertBefore(card, firstNormal);
  else container.appendChild(card);
  container.scrollTop = 0;
}

// Pure builder, shared by the fetch-on-load path and a freshly created
// post. createElement/textContent throughout, never innerHTML - title
// and body are user text.
function buildForumPostCard(post) {
  if (typeof applyMentionFields === "function") applyMentionFields(post, post);
  const card = document.createElement("div");
  card.className = "forum-post";
  card.dataset.postId = post.id;

  const face = document.createElement("div");
  face.className = "forum-post-avatar";
  if (typeof paintUserFace === "function") {
    paintUserFace(face, { avatar: post.avatar, username: post.author_username }, {
      name: post.author_username || "?",
      userId: post.author_id,
    });
  } else {
    face.textContent = typeof avatarLetter === "function" ? avatarLetter(post.author_username || "?") : "?";
  }
  if (typeof bindMiniProfileTarget === "function") bindMiniProfileTarget(face, post.author_id);

  const tags = document.createElement("div");
  tags.className = "forum-post-tags";

  const content = document.createElement("div");
  content.className = "forum-post-content";

  const meta = document.createElement("div");
  meta.className = "forum-post-meta";
  const reactionsHost = document.createElement("div");
  reactionsHost.className = "forum-post-reactions";
  const addReactionBtn = document.createElement("button");
  addReactionBtn.className = "announce-add-reaction-btn";
  addReactionBtn.title = "Add Reaction";
  addReactionBtn.textContent = "+";
  addReactionBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openReactionPicker(forumPostReactionTarget(post), e.clientX, e.clientY);
  });
  reactionsHost.appendChild(addReactionBtn);
  fillForumPostReactions(reactionsHost, post);
  const count = document.createElement("span");
  count.className = "forum-post-count";
  count.textContent = `${post.message_count || 0} messages`;
  // Clock time of the last message, not "3h ago" - Kiwi's call for the
  // baseline pass, which is why formatClusterTime is reused unchanged.
  const activity = document.createElement("span");
  activity.className = "forum-post-activity";
  activity.textContent = formatClusterTime(parseUtcTimestamp(post.last_activity));
  meta.appendChild(reactionsHost);
  meta.appendChild(count);
  meta.appendChild(activity);

  // Registered so a live broadcast can retext this card in place, without
  // searching the DOM and without touching its position. Not cleared on
  // channel switch - same reasoning as commentThreadElements: a rebuilt
  // card overwrites its own entry, and entries for cards no longer on
  // screen are dead weight rather than a correctness risk.
  forumCardElements[post.id] = { tagsEl: tags, countEl: count, activityEl: activity, reactionsEl: reactionsHost };

  card.addEventListener("click", (e) => {
    if (editingForumPostId === post.id) return;
    if (e.target.closest(".announce-post-menu-btn, .forum-post-reactions, .forum-post-avatar")) return;
    openForumPost(post);
  });
  card.addEventListener("contextmenu", (e) => showForumPostContextMenu(e, post));

  const main = document.createElement("div");
  main.className = "forum-post-main";
  main.appendChild(tags);
  main.appendChild(content);
  main.appendChild(meta);
  card.appendChild(face);
  card.appendChild(main);
  fillForumPostContent(card, post);
  fillForumPostFlags(card, post);
  return card;
}

// Opens a post's thread IN PLACE of the card list, rather than beside it.
// Everything below the header is the ordinary channel chat view being
// borrowed wholesale - no forum-specific renderer, composer or pagination
// exists, they're the channel ones with openForumPostId set (see state.js).
function clearOpenForumPostState() {
  openForumPostId = null;
  openForumPostTitle = null;
  openForumPostBody = null;
  openForumPostAttachment = null;
  openForumPostEdited = false;
  openForumPostMentionUsers = {};
  openForumPostMentionRoles = {};
  openForumPostLocked = false;
  openForumPostSticky = false;
  openForumPostAuthorId = null;
  openForumPostAuthorUsername = null;
  openForumPostAvatar = null;
  openForumPostNameRole = null;
  openForumPostTags = [];
  openForumPostReactions = [];
}

function applyOpenForumPostState(post) {
  if (!post) return;
  if (post.id != null) openForumPostId = post.id;
  if (post.title != null) openForumPostTitle = post.title;
  if (post.body != null) openForumPostBody = post.body || "";
  if (post.attachment !== undefined) openForumPostAttachment = post.attachment || null;
  if (post.edited != null) openForumPostEdited = !!post.edited;
  if (post.mentionUsers || post.mention_users) {
    openForumPostMentionUsers = post.mentionUsers || post.mention_users || {};
  }
  if (post.mentionRoles || post.mention_roles) {
    openForumPostMentionRoles = post.mentionRoles || post.mention_roles || {};
  }
  if (post.locked != null) openForumPostLocked = !!post.locked;
  if (post.sticky != null) openForumPostSticky = !!post.sticky;
  if (post.author_id != null) openForumPostAuthorId = post.author_id;
  if (post.author_username != null) openForumPostAuthorUsername = post.author_username;
  if (post.avatar !== undefined) openForumPostAvatar = post.avatar || null;
  if (post.name_role !== undefined || post.nameRole !== undefined) {
    openForumPostNameRole = post.name_role || post.nameRole || null;
  }
  if (post.tags) openForumPostTags = Array.isArray(post.tags) ? post.tags.slice() : [];
  if (post.reactions) openForumPostReactions = applyReactionMe(post.reactions || []);
}

function openForumPostSnapshot() {
  return {
    id: openForumPostId,
    title: openForumPostTitle,
    body: openForumPostBody || "",
    attachment: openForumPostAttachment,
    edited: openForumPostEdited,
    mentionUsers: openForumPostMentionUsers,
    mentionRoles: openForumPostMentionRoles,
    locked: openForumPostLocked,
    sticky: openForumPostSticky,
    author_id: openForumPostAuthorId,
    author_username: openForumPostAuthorUsername,
    avatar: openForumPostAvatar,
    name_role: openForumPostNameRole,
    tags: openForumPostTags,
    reactions: openForumPostReactions,
  };
}

function hideForumThreadOpener() {
  const el = document.getElementById("forum-thread-opener");
  if (!el) return;
  el.hidden = true;
  el.replaceChildren();
}

function paintForumThreadOpener() {
  const host = document.getElementById("forum-thread-opener");
  if (!host || !openForumPostId) {
    hideForumThreadOpener();
    return;
  }
  const post = openForumPostSnapshot();
  host.hidden = false;
  host.replaceChildren();

  const card = document.createElement("div");
  card.className = "forum-thread-opener-card";

  const face = document.createElement("div");
  face.className = "forum-thread-opener-avatar";
  if (typeof paintUserFace === "function") {
    paintUserFace(face, { avatar: post.avatar, username: post.author_username }, {
      name: post.author_username || "?",
      userId: post.author_id,
    });
  } else {
    face.textContent = typeof avatarLetter === "function" ? avatarLetter(post.author_username || "?") : "?";
  }
  if (typeof bindMiniProfileTarget === "function") bindMiniProfileTarget(face, post.author_id);

  const main = document.createElement("div");
  main.className = "forum-thread-opener-main";

  const flags = document.createElement("div");
  flags.className = "forum-thread-opener-tags";
  if (post.sticky) {
    const flag = document.createElement("span");
    flag.className = "forum-flag";
    flag.textContent = "Sticky";
    flags.appendChild(flag);
  }
  if (post.locked) {
    const flag = document.createElement("span");
    flag.className = "forum-flag";
    flag.textContent = "Locked";
    flags.appendChild(flag);
  }
  (post.tags || []).forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "forum-post-tag-chip";
    chip.textContent = ((tag.emoji || "") + " " + (tag.name || "")).trim();
    flags.appendChild(chip);
  });
  if (flags.childNodes.length) main.appendChild(flags);

  const titleRow = document.createElement("div");
  titleRow.className = "forum-thread-opener-title-row";
  const title = document.createElement("div");
  title.className = "forum-thread-opener-title";
  title.textContent = post.title || "";
  titleRow.appendChild(title);
  if (post.edited) {
    const tag = document.createElement("span");
    tag.className = "edited-tag";
    tag.textContent = "edited";
    titleRow.appendChild(tag);
  }
  const menuBtn = document.createElement("button");
  menuBtn.type = "button";
  menuBtn.className = "announce-post-menu-btn";
  menuBtn.title = "More";
  menuBtn.innerHTML = "&#8942;";
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const live = currentForumPosts.find((p) => Number(p.id) === Number(post.id)) || post;
    showForumPostContextMenu(e, live);
  });
  titleRow.appendChild(menuBtn);
  main.appendChild(titleRow);

  const author = document.createElement("div");
  author.className = "forum-thread-opener-author";
  author.textContent = post.author_username || "Unknown";
  if (typeof applyServerNameColor === "function") {
    applyServerNameColor(author, post.author_id, post.name_role);
  }
  if (typeof bindMiniProfileTarget === "function") bindMiniProfileTarget(author, post.author_id);
  main.appendChild(author);

  const body = document.createElement("div");
  body.className = "forum-thread-opener-body";
  if (post.body && typeof fillMentionText === "function") {
    fillMentionText(body, post.body, post.mentionUsers || {}, post.mentionRoles || {});
  } else {
    body.textContent = post.body || "";
  }
  main.appendChild(body);
  if (post.body) {
    if (typeof attachLinkEmbedsIfNeeded === "function") attachLinkEmbedsIfNeeded(body, post.body);
    if (typeof attachLinkImagesIfNeeded === "function") attachLinkImagesIfNeeded(main, post.body);
  }
  const media = typeof buildPostMedia === "function" ? buildPostMedia(post.attachment) : null;
  if (media) main.appendChild(media);

  const meta = document.createElement("div");
  meta.className = "forum-thread-opener-meta";
  const reactionsHost = document.createElement("div");
  reactionsHost.className = "forum-post-reactions";
  const addReactionBtn = document.createElement("button");
  addReactionBtn.type = "button";
  addReactionBtn.className = "announce-add-reaction-btn";
  addReactionBtn.title = "Add Reaction";
  addReactionBtn.textContent = "+";
  addReactionBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openReactionPicker(forumPostReactionTarget(post), e.clientX, e.clientY);
  });
  reactionsHost.appendChild(addReactionBtn);
  fillForumPostReactions(reactionsHost, post);
  meta.appendChild(reactionsHost);
  main.appendChild(meta);

  card.appendChild(face);
  card.appendChild(main);
  host.appendChild(card);
}

function showForumThreadOpener() {
  paintForumThreadOpener();
}

async function openForumPost(post) {
  if (typeof abandonForumEdit === "function") abandonForumEdit();
  if (typeof clearPendingAttach === "function") clearPendingAttach();
  if (typeof resetTypingOnLeave === "function") resetTypingOnLeave();
  applyOpenForumPostState(post);

  document.getElementById("forums-view").style.display = "none";
  document.getElementById("channel-body").style.display = "flex";
  document.getElementById("channel-composer").style.display = "block";
  document.getElementById("forum-back-btn").style.display = "inline-flex";
  document.getElementById("channel-header-title").textContent = openForumPostTitle || post.title || "";
  if (typeof setHeaderDescription === "function") setHeaderDescription("channel-header-desc", "");
  document.getElementById("channel-empty").style.display = "none";
  document.getElementById("channel-messages").style.display = "block";
  showForumThreadOpener();
  enableChannelComposer(openForumPostTitle || post.title || "");

  currentChannelMessages = [];
  channelHasMoreHistory = true;
  channelIsLoadingMore = false;

  try {
    const response = await fetch(`https://${serverAddress}/get_forum_messages/${post.id}`, { credentials: "include" });
    if (!response.ok) { renderChannelMessages(); return; }
    const data = await response.json();
    if (data.post) applyOpenForumPostState(data.post);
    if (data.locked != null) openForumPostLocked = !!data.locked;
    if (data.sticky != null) openForumPostSticky = !!data.sticky;
    document.getElementById("channel-header-title").textContent = openForumPostTitle || "";
    showForumThreadOpener();
    enableChannelComposer(openForumPostTitle || "");
    currentChannelMessages = (data.forum_post_messages || []).map(msg => {
      const mapped = applyDeletionFields({
        id: msg.id,
        chatKind: "forum",
        isMine: msg.author_id === myUserId,
        senderId: msg.author_id,
        username: msg.username,
        content: msg.content,
        attachment: typeof parseAttachment === "function" ? parseAttachment(msg.attachment) : msg.attachment,
        time: parseUtcTimestamp(msg.timestamp),
        avatar: msg.avatar || null,
        nameRole: msg.name_role || null
      }, msg);
      if (typeof takeMessageAvatar === "function") takeMessageAvatar(mapped, msg);
      return typeof applyMentionFields === "function" ? applyMentionFields(mapped, msg) : mapped;
    });
    if (currentChannelMessages.length < 25) channelHasMoreHistory = false;
    renderChannelMessages();
  } catch (e) { renderChannelMessages(); }
}

function closeForumPost() {
  if (typeof clearPendingReply === "function") clearPendingReply();
  if (typeof resetTypingOnLeave === "function") resetTypingOnLeave();
  clearOpenForumPostState();
  currentChannelMessages = [];
  hideForumThreadOpener();

  document.getElementById("forum-back-btn").style.display = "none";
  document.getElementById("channel-body").style.display = "none";
  document.getElementById("channel-composer").style.display = "none";
  document.getElementById("forums-view").style.display = "flex";
  document.getElementById("channel-header-title").textContent = `#${currentChannelName}`;
  if (typeof setHeaderDescription === "function") {
    const live = typeof findChannelSettingsChannel === "function" ? findChannelSettingsChannel(currentChannelId) : null;
    const topic = (live && live.topic) || "";
    setHeaderDescription("channel-header-desc", topic);
  }
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
  editingForumPostId = null;
  if (typeof clearPostMedia === "function") clearPostMedia("forumEdit");
  currentForumPosts = [];
  forumHasMore = true;
  forumIsLoadingMore = false;
  const container = document.getElementById("forum-posts");
  container.innerHTML = "";
  const searchEl = document.getElementById("forum-search-input");
  if (searchEl && searchEl.value !== forumSearchQuery) {
    forumSearchQuery = searchEl.value || "";
  }
  try {
    const params = forumListQueryParams();
    const qs = params.toString();
    const response = await fetch(`https://${serverAddress}/get_forum_post/${channelId}${qs ? ("?" + qs) : ""}`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    if (data.settings) applyForumChannelSettings(data.settings);
    else paintForumFilterBar();
    currentForumPosts = (data.forum_posts || []).map(post => {
      post.reactions = applyReactionMe(post.reactions || []);
      return post;
    });
    forumHasMore = data.has_more != null ? !!data.has_more : currentForumPosts.filter(p => !p.sticky).length >= 10;
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
  const last = [...currentForumPosts].reverse().find(p => !p.sticky) || currentForumPosts[currentForumPosts.length - 1];
  if (!last.id) return;
  forumIsLoadingMore = true;

  try {
    // URLSearchParams, not a hand-built string: last_activity is
    // space-separated ("2026-09-07 13:04:11.123456") and that space has
    // to be encoded or the query arrives truncated.
    const params = forumListQueryParams({
      before_activity: last.last_activity,
      before_id: last.id
    });
    const response = await fetch(`https://${serverAddress}/get_forum_post/${currentChannelId}?${params}`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const older = (data.forum_posts || []).map(post => {
      post.reactions = applyReactionMe(post.reactions || []);
      return post;
    });
    forumHasMore = data.has_more != null ? !!data.has_more : older.length >= 10;
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

function showForumPostContextMenu(e, post) {
  e.preventDefault();
  e.stopPropagation();
  const canEdit = post.author_id === myUserId && !post.locked;
  const canDelete = post.author_id === myUserId || (typeof canManageTopics === "function" && canManageTopics());
  const canSticky = typeof canStickyTopics === "function" && canStickyTopics();
  const canLock = typeof canLockTopics === "function" && canLockTopics();
  openContextMenu(e.clientX, e.clientY, {
    avatarText: avatarLetter(post.author_username),
    title: post.author_username,
    timestamp: formatClusterTime(parseUtcTimestamp(post.last_activity)),
    subtitle: truncateForContextMenu(post.title)
  }, [
    { label: "Add Reaction", onSelect: () => openReactionPicker(forumPostReactionTarget(post), e.clientX, e.clientY) },
    canEdit && { label: "Edit Post", onSelect: () => startForumEdit(post) },
    (typeof canPinMessages !== "function" || canPinMessages()) && {
      label: (typeof isMessagePinned === "function" && isMessagePinned("forum_post", post.id)) ? "Unpin" : "Pin",
      onSelect: () => {
        if (typeof pinOrUnpinMessage === "function") {
          pinOrUnpinMessage(
            { id: post.id, chatKind: "forum_post", senderId: post.author_id },
            !(typeof isMessagePinned === "function" && isMessagePinned("forum_post", post.id))
          );
        }
      },
    },
    canSticky && { label: post.sticky ? "Unsticky" : "Sticky", onSelect: () => setForumSticky(post, !post.sticky) },
    canLock && { label: post.locked ? "Unlock" : "Lock", onSelect: () => setForumLock(post, !post.locked) },
    canDelete && { label: "Delete Post", danger: true, onSelect: () => deleteForumPostFromContextMenu(post) }
  ]);
}

function fillForumPostFlags(card, post) {
  if (!card || !post) return;
  const tags = card.querySelector(".forum-post-tags");
  card.classList.toggle("is-sticky", !!post.sticky);
  card.classList.toggle("is-locked", !!post.locked);
  if (tags) {
    tags.replaceChildren();
    if (post.sticky) {
      const flag = document.createElement("span");
      flag.className = "forum-flag";
      flag.textContent = "Sticky";
      tags.appendChild(flag);
    }
    if (post.locked) {
      const flag = document.createElement("span");
      flag.className = "forum-flag";
      flag.textContent = "Locked";
      tags.appendChild(flag);
    }
    const realTags = Array.isArray(post.tags) ? post.tags : [];
    realTags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "forum-post-tag-chip";
      chip.textContent = ((tag.emoji || "") + " " + (tag.name || "")).trim();
      tags.appendChild(chip);
    });
  }
}

function moveForumCardToStickies(postId) {
  const container = document.getElementById("forum-posts");
  const card = container && container.querySelector(`.forum-post[data-post-id="${postId}"]`);
  const post = currentForumPosts.find(p => p.id === postId);
  if (!container || !card || !post) return;
  currentForumPosts = currentForumPosts.filter(p => p.id !== postId);
  const firstNormalIdx = currentForumPosts.findIndex(p => !p.sticky);
  if (firstNormalIdx < 0) currentForumPosts.push(post);
  else currentForumPosts.splice(firstNormalIdx, 0, post);
  const stickies = [...container.querySelectorAll(".forum-post.is-sticky")].filter(el => el !== card);
  const after = stickies[stickies.length - 1];
  if (after && after.nextSibling) container.insertBefore(card, after.nextSibling);
  else if (after) container.appendChild(card);
  else if (container.firstChild !== card) container.insertBefore(card, container.firstChild);
}

function applyForumPostFlags(postId, sticky, locked) {
  const post = currentForumPosts.find(p => p.id === postId);
  const wasSticky = post ? !!post.sticky : false;
  if (post) {
    if (sticky != null) post.sticky = !!sticky;
    if (locked != null) post.locked = !!locked;
  }
  const card = document.querySelector(`.forum-post[data-post-id="${postId}"]`);
  if (card && post) fillForumPostFlags(card, post);
  if (post && post.sticky && !wasSticky) moveForumCardToStickies(postId);
  if (openForumPostId === postId) {
    openForumPostLocked = !!(post && post.locked);
    openForumPostSticky = !!(post && post.sticky);
    if (typeof enableChannelComposer === "function") {
      enableChannelComposer(openForumPostTitle || currentChannelName || "");
    }
    paintForumThreadOpener();
    if (openForumPostLocked) {
      if (editingForumPostId === postId && typeof abandonForumEdit === "function") abandonForumEdit();
      if (typeof abandonMessageEdit === "function") abandonMessageEdit();
    }
  }
}

async function setForumSticky(post, on) {
  try {
    const response = await fetch(`https://${serverAddress}/sticky_forum/${post.id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: !!on })
    });
    if (!response.ok) return;
    const data = await response.json();
    applyForumPostFlags(post.id, data.sticky, data.locked);
  } catch (e) {
    console.error("Failed to sticky topic, network error:", e);
  }
}

async function setForumLock(post, on) {
  try {
    const response = await fetch(`https://${serverAddress}/lock_forum/${post.id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: !!on })
    });
    if (!response.ok) return;
    const data = await response.json();
    applyForumPostFlags(post.id, data.sticky, data.locked);
  } catch (e) {
    console.error("Failed to lock topic, network error:", e);
  }
}

function forumPostReactionTarget(post) {
  return {
    id: post.id,
    chatKind: "forum_post",
    senderId: post.author_id,
    reactions: post.reactions || []
  };
}

function fillForumPostReactions(host, post) {
  if (!host) return;
  host.querySelectorAll(".reaction-pill").forEach(el => el.remove());
  const addBtn = host.querySelector(".announce-add-reaction-btn");
  (post.reactions || []).forEach(r => {
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
      toggleReaction(forumPostReactionTarget(post), r.emoji);
    });
    if (addBtn) host.insertBefore(pill, addBtn);
    else host.appendChild(pill);
  });
}

function patchForumPostReactions(postId, reactions) {
  const post = currentForumPosts.find(p => p.id === postId);
  if (post) post.reactions = applyReactionMe(reactions || []);
  const els = forumCardElements[postId];
  if (els && els.reactionsEl && post) fillForumPostReactions(els.reactionsEl, post);
  if (Number(openForumPostId) === Number(postId)) {
    openForumPostReactions = applyReactionMe(reactions || []);
    paintForumThreadOpener();
  }
}

async function deleteForumPostFromContextMenu(post) {
  try {
    const response = await fetch(`https://${serverAddress}/delete_forum/${post.id}`, {
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
  removeForumPostFromView(post.id);
}

function removeForumPostFromView(postId) {
  if (editingForumPostId === postId) {
    editingForumPostId = null;
    if (typeof clearPostMedia === "function") clearPostMedia("forumEdit");
  }
  currentForumPosts = currentForumPosts.filter(p => p.id !== postId);
  const card = document.querySelector(`.forum-post[data-post-id="${postId}"]`);
  if (card) card.remove();
  delete forumCardElements[postId];
  if (openForumPostId === postId) closeForumPost();
}

function replaceForumThumb(card, post) {
  const old = card.querySelector(".forum-post-thumb");
  if (old) old.remove();
  const thumb = typeof buildForumThumb === "function" ? buildForumThumb(post.attachment) : null;
  if (thumb) card.appendChild(thumb);
}

function fillForumPostContent(card, post) {
  let wrap = card.querySelector(".forum-post-content");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "forum-post-content";
    const main = card.querySelector(".forum-post-main");
    const meta = card.querySelector(".forum-post-meta");
    if (main && meta) main.insertBefore(wrap, meta);
    else card.appendChild(wrap);
  }
  card.classList.remove("is-editing");
  wrap.replaceChildren();

  const titleRow = document.createElement("div");
  titleRow.className = "forum-post-title-row";
  const title = document.createElement("div");
  title.className = "forum-post-title";
  title.textContent = post.title;
  titleRow.appendChild(title);
  if (post.edited) {
    const tag = document.createElement("span");
    tag.className = "edited-tag";
    tag.textContent = "edited";
    titleRow.appendChild(tag);
  }
  const menuBtn = document.createElement("button");
  menuBtn.className = "announce-post-menu-btn";
  menuBtn.title = "More";
  menuBtn.innerHTML = "&#8942;";
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showForumPostContextMenu(e, post);
  });
  titleRow.appendChild(menuBtn);
  wrap.appendChild(titleRow);

  const line = document.createElement("div");
  line.className = "forum-post-line";
  const author = document.createElement("span");
  author.className = "forum-post-author";
  author.textContent = `${post.author_username || "Unknown"}:`;
  if (typeof applyServerNameColor === "function") applyServerNameColor(author, post.author_id, post.name_role || post.nameRole);
  const body = document.createElement("span");
  body.className = "forum-post-body";
  if (typeof fillMentionText === "function") fillMentionText(body, post.body, post.mentionUsers, post.mentionRoles);
  else body.textContent = post.body;
  line.appendChild(author);
  line.appendChild(body);
  wrap.appendChild(line);
  replaceForumThumb(card, post);
}

function seedForumEditMedia(post) {
  if (typeof clearPostMedia === "function") clearPostMedia("forumEdit");
  const items = typeof parsePostAttachments === "function" ? parsePostAttachments(post.attachment) : [];
  items.forEach((att) => {
    postMediaPending.forumEdit.files.push({
      existing: att,
      previewUrl: att.url
    });
  });
}

function forumEditAttachmentKeys() {
  return postMediaPending.forumEdit.files.map((item) => (
    item.existing ? item.existing.key : "__new__"
  )).join("|");
}

function originalForumAttachmentKeys(post) {
  const items = typeof parsePostAttachments === "function" ? parsePostAttachments(post.attachment) : [];
  return items.map((att) => att.key).join("|");
}

function abandonForumEdit() {
  if (typeof closeEmojiPicker === "function") closeEmojiPicker();
  if (typeof hideMentionPicker === "function") hideMentionPicker();
  const postId = editingForumPostId;
  editingForumPostId = null;
  if (typeof clearPostMedia === "function") clearPostMedia("forumEdit");
  if (!postId) return;
  const post = currentForumPosts.find(p => p.id === postId);
  const card = document.querySelector(`.forum-post[data-post-id="${postId}"]`);
  if (post && card) fillForumPostContent(card, post);
}

function startForumEdit(post) {
  if (post.locked) return;
  if (post.author_id !== myUserId) return;
  if (editingForumPostId === post.id) return;
  abandonForumEdit();
  const card = document.querySelector(`.forum-post[data-post-id="${post.id}"]`);
  if (!card) return;
  editingForumPostId = post.id;
  seedForumEditMedia(post);
  fillForumPostEditor(card, post);
}

function fillForumPostEditor(card, post) {
  const wrap = card.querySelector(".forum-post-content");
  if (!wrap) return;
  card.classList.add("is-editing");
  wrap.replaceChildren();
  const existingThumb = card.querySelector(".forum-post-thumb");
  if (existingThumb) existingThumb.remove();

  const editor = document.createElement("div");
  editor.className = "announce-composer-editing";

  const main = document.createElement("div");
  main.className = "announce-composer-editing-main";

  const fields = document.createElement("div");
  fields.className = "announce-composer-editing-fields";

  const header = document.createElement("div");
  header.className = "announce-composer-editing-header";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "icon-btn";
  cancelBtn.title = "Cancel";
  cancelBtn.innerHTML = "&times;";
  cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    abandonForumEdit();
  });
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.id = "forum-edit-title-input";
  titleInput.className = "announce-composer-title-input";
  titleInput.maxLength = 200;
  titleInput.placeholder = "Title";
  titleInput.value = post.title || "";
  titleInput.addEventListener("contextmenu", (e) => e.stopPropagation());
  header.appendChild(cancelBtn);
  header.appendChild(titleInput);

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "announce-composer-editing-body";
  const bodyInput = document.createElement("textarea");
  bodyInput.id = "forum-edit-body-input";
  bodyInput.className = "announce-composer-body-input";
  bodyInput.placeholder = "Enter a message...";
  bodyInput.rows = 3;
  bodyInput.value = typeof mentionDisplayText === "function"
    ? mentionDisplayText(post.body || "", post.mentionUsers, post.mentionRoles)
    : (post.body || "");
  bodyInput.addEventListener("input", () => autoGrowPostBodyInput(bodyInput));
  bodyInput.addEventListener("contextmenu", (e) => e.stopPropagation());
  bodyWrap.appendChild(bodyInput);

  fields.appendChild(header);
  fields.appendChild(bodyWrap);

  const strip = document.createElement("div");
  strip.className = "announce-composer-media-strip";
  strip.id = "forum-edit-media-strip";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "announce-composer-image-btn announce-composer-image-add";
  addBtn.id = "forum-edit-image-btn";
  addBtn.title = "Add image or video";
  addBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="14" height="12" rx="2"></rect><circle cx="8" cy="11" r="1.2" fill="currentColor" stroke="none"></circle><path d="M17 14l-3.5-3.5L7 17"></path><path d="M17 4v6M14 7h6"></path></svg>';
  addBtn.addEventListener("click", (e) => e.stopPropagation());
  strip.appendChild(addBtn);

  main.appendChild(fields);
  main.appendChild(strip);

  const footer = document.createElement("div");
  footer.className = "announce-composer-editing-footer";
  const emojiBtn = document.createElement("button");
  emojiBtn.type = "button";
  emojiBtn.className = "composer-icon-btn";
  emojiBtn.id = "forum-edit-emoji-btn";
  emojiBtn.title = "Emoji";
  emojiBtn.textContent = "🙂";
  emojiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (typeof openEmojiPicker === "function") openEmojiPicker(emojiBtn, bodyInput, e.clientX, e.clientY);
  });
  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "pill-btn";
  confirmBtn.textContent = "Confirm";
  confirmBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    confirmForumEdit(post);
  });
  footer.appendChild(emojiBtn);
  footer.appendChild(confirmBtn);

  editor.appendChild(main);
  editor.appendChild(footer);
  wrap.appendChild(editor);

  if (typeof bindPostMediaButton === "function") bindPostMediaButton("forumEdit", addBtn);
  if (typeof bindMentionComposer === "function") bindMentionComposer(bodyInput);
  autoGrowPostBodyInput(bodyInput);
  if (typeof refreshComposerMentions === "function") refreshComposerMentions(bodyInput);
  titleInput.focus();
}

function applyForumPostEdit(data) {
  const post = currentForumPosts.find(p => p.id === data.post_id);
  if (post) {
    if (editingForumPostId === post.id) {
      editingForumPostId = null;
      if (typeof clearPostMedia === "function") clearPostMedia("forumEdit");
    }
    post.title = data.title;
    post.body = data.body;
    post.attachment = data.attachment;
    post.edited = !!data.edited;
    if (typeof applyMentionFields === "function") applyMentionFields(post, data);
    const card = document.querySelector(`.forum-post[data-post-id="${post.id}"]`);
    if (card) fillForumPostContent(card, post);
  }

  if (openForumPostId === data.post_id) {
    openForumPostTitle = data.title;
    openForumPostBody = data.body || "";
    openForumPostAttachment = data.attachment || null;
    openForumPostEdited = !!data.edited;
    openForumPostMentionUsers = (post && post.mentionUsers) || data.mention_users || {};
    openForumPostMentionRoles = (post && post.mentionRoles) || data.mention_roles || {};
    if (data.tags) openForumPostTags = Array.isArray(data.tags) ? data.tags.slice() : openForumPostTags;
    const header = document.getElementById("channel-header-title");
    if (header) header.textContent = data.title;
    paintForumThreadOpener();
  }
}

async function confirmForumEdit(post) {
  const titleEl = document.getElementById("forum-edit-title-input");
  const bodyEl = document.getElementById("forum-edit-body-input");
  const title = ((titleEl && titleEl.value) || "").trim();
  const body = ((bodyEl && bodyEl.value) || "").trim();
  const pending = postMediaPending.forumEdit.files;
  if (!title || (!body && !pending.length)) return;

  const originalBody = typeof mentionDisplayText === "function"
    ? mentionDisplayText(post.body || "", post.mentionUsers, post.mentionRoles).trim()
    : (post.body || "");
  if (title === (post.title || "") && body === originalBody && forumEditAttachmentKeys() === originalForumAttachmentKeys(post)) {
    abandonForumEdit();
    return;
  }

  let attachments = [];
  try {
    if (pending.length) attachments = await uploadPendingPostFiles(pending);
  } catch (e) {
    window.alert(e.message || "Upload failed.");
    return;
  }

  let data;
  try {
    const response = await fetch(`https://${serverAddress}/edit_forum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ post_id: post.id, title, body, attachments })
    });
    if (!response.ok) {
      console.error(`Failed to edit post: ${response.status}`);
      return;
    }
    data = await response.json();
  } catch (e) {
    console.error("Failed to edit post, network error:", e);
    return;
  }

  post.title = data.title;
  post.body = data.body;
  post.attachment = data.attachment;
  post.edited = !!data.edited;
  if (typeof applyMentionFields === "function") applyMentionFields(post, data);
  abandonForumEdit();
}
