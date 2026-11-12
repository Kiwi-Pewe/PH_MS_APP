function profilePostsFeed(props) {
  const feed = String((props && props.feed) || "").trim().toLowerCase();
  if (feed === "following" || feed === "timeline") return feed;
  return "explore";
}

function profilePostsTitle(props) {
  const title = String((props && props.title) || "").trim();
  return title || "Posts";
}

function profilePostsPreview(el) {
  return !!(el && el.closest && el.closest(".is-opt-preview"));
}

function bindProfilePostsPointer(el) {
  if (!el) return;
  const stop = (e) => e.stopPropagation();
  el.addEventListener("pointerdown", stop);
  el.addEventListener("mousedown", stop);
  el.addEventListener("click", stop);
}

function profilePostsSearchParams(search) {
  const text = String(search || "").trim();
  if (!text) return null;
  if (text.charAt(0) === "@") return { author: text.slice(1).trim() };
  if (text.charAt(0) === "#") return { q: text };
  return { q: text, topic: text };
}

async function loadProfileWidgetPosts(props) {
  const params = new URLSearchParams();
  params.set("lens", profilePostsFeed(props));
  const search = profilePostsSearchParams(props && props.search);
  if (search) {
    if (search.q) params.set("q", search.q);
    if (search.author) params.set("author", search.author);
    if (search.topic) params.set("topic", search.topic);
  }
  const response = await fetch("https://" + serverAddress + "/community_posts?" + params.toString(), { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  const rows = data.posts || [];
  return rows.slice(0, 25).map((row) => {
    if (typeof communityPostReady === "function") return communityPostReady(row);
    return row;
  });
}

function paintProfilePostsList(host, posts, searching, preview) {
  host.replaceChildren();
  if (!posts.length) {
    const empty = document.createElement("div");
    empty.className = "profile-chat-room-empty";
    empty.textContent = searching ? "No posts match." : "No posts yet.";
    host.appendChild(empty);
    return;
  }
  posts.forEach((post) => {
    const card = typeof paintCommunityPostCard === "function"
      ? paintCommunityPostCard(post)
      : document.createElement("article");
    if (preview) {
      card.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, true);
    }
    host.appendChild(card);
  });
}

function paintProfilePosts(tile, el) {
  const props = typeof defaultProfileTileProps === "function"
    ? defaultProfileTileProps("posts", tile && tile.props)
    : (tile && tile.props) || {};
  const chrome = typeof profileTextChrome === "function" ? profileTextChrome(props, "posts") : null;
  if (chrome && typeof applyProfileTextPaint === "function") applyProfileTextPaint(el, chrome);
  if (typeof applyProfileWidgetSurface === "function") applyProfileWidgetSurface(el, tile);
  const showTitle = props.show_title !== false;
  if (showTitle) {
    const align = props.title_align === "center" || props.title_align === "right" ? props.title_align : "left";
    el.dataset.titleAlign = align;
  } else {
    delete el.dataset.titleAlign;
  }
  const root = document.createElement("div");
  root.className = "profile-chat-room profile-posts" + (showTitle ? " has-title" : "");
  if (showTitle) {
    const head = document.createElement("div");
    head.className = "profile-chat-room-head";
    const title = document.createElement("div");
    title.className = "oneira-wall-title";
    title.textContent = profilePostsTitle(props);
    head.appendChild(title);
    root.appendChild(head);
  }
  const body = document.createElement("div");
  body.className = "profile-chat-room-body profile-posts-list";
  bindProfilePostsPointer(body);
  const loading = document.createElement("div");
  loading.className = "profile-chat-room-empty";
  loading.textContent = "No posts yet.";
  body.appendChild(loading);
  root.appendChild(body);
  el.appendChild(root);
  const gen = (el._profilePostsGen || 0) + 1;
  el._profilePostsGen = gen;
  loadProfileWidgetPosts(props).then((posts) => {
    if (el._profilePostsGen !== gen) return;
    paintProfilePostsList(body, posts, !!String(props.search || "").trim(), profilePostsPreview(el));
  }).catch(() => {
    if (el._profilePostsGen !== gen) return;
    paintProfilePostsList(body, [], !!String(props.search || "").trim(), profilePostsPreview(el));
  });
}
