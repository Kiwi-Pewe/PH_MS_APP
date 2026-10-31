let communityPostRows = [];
let communityLensStamp = "";
let communityPostGen = 0;

function communityErrorText(data, fallback) {
  const detail = data && data.detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail[0] && detail[0].msg) return detail[0].msg;
  return fallback;
}

function communityPostStamp(raw) {
  const date = new Date(raw || "");
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function communityPostReady(row) {
  const post = Object.assign({}, row || {});
  post.time = communityPostStamp(post.created_at);
  post.comments = (post.comments || []).map((item) => {
    const comment = Object.assign({}, item);
    comment.time = communityPostStamp(comment.created_at);
    return comment;
  });
  return post;
}

async function loadCommunityPosts(lens, fresh) {
  const gen = ++communityPostGen;
  if (typeof communityPostPrefsLoaded !== "undefined" && !communityPostPrefsLoaded && typeof loadCommunityPostPrefs === "function") loadCommunityPostPrefs();
  if (fresh) communityLensStamp = "";
  const params = new URLSearchParams();
  params.set("lens", lens || "explore");
  if (communityLensStamp) params.set("before", communityLensStamp);
  const search = typeof communitySearchParams === "function" ? communitySearchParams("post") : null;
  if (search) {
    if (search.q) params.set("q", search.q);
    if (search.author) params.set("author", search.author);
    if (search.mentions) params.set("mentions", search.mentions);
    if (search.topic) params.set("topic", search.topic);
    (search.has || []).forEach((item) => params.append("has", item));
  }
  let response;
  try {
    response = await fetch(`https://${serverAddress}/community_posts?${params.toString()}`, { credentials: "include" });
  } catch (e) {
    return;
  }
  if (gen !== communityPostGen) return;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return;
  if (gen !== communityPostGen) return;
  communityLensStamp = data.as_of || "";
  communityPostRows = (data.posts || []).map(communityPostReady);
  if (typeof paintCommunityPosts === "function") paintCommunityPosts();
}

async function loadCommunityPostDetail(code) {
  if (!code) return;
  let response;
  try {
    response = await fetch(`https://${serverAddress}/community_posts/${encodeURIComponent(code)}`, { credentials: "include" });
  } catch (e) {
    return;
  }
  if (!response.ok) return;
  const data = await response.json().catch(() => null);
  if (!data || !communityOpenPost || communityOpenPost.code !== code) return;
  const post = communityPostReady(data);
  communityOpenPost = post;
  const index = communityPostRows.findIndex((row) => row.code === code);
  if (index >= 0) communityPostRows[index] = post;
  if (typeof fillCommunityPostView === "function") fillCommunityPostView();
}

async function openCommunityPostByCode(code) {
  if (!code) return;
  let response;
  try {
    response = await fetch(`https://${serverAddress}/community_posts/${encodeURIComponent(code)}`, { credentials: "include" });
  } catch (e) {
    return;
  }
  if (!response.ok) return;
  const data = await response.json().catch(() => null);
  if (!data || typeof openCommunityPost !== "function") return;
  openCommunityPost(communityPostReady(data));
}

async function saveCommunityPost() {
  const input = document.getElementById("community-compose-input");
  const body = input ? String(input.value || "").trim() : "";
  const submit = document.getElementById("community-compose-submit");
  const count = document.getElementById("community-compose-count");
  if (!body || body.length > 1500) return;
  if (typeof communityEmojiCount === "function" && communityEmojiCount(body) > 50) return;
  if (submit) submit.disabled = true;
  try {
    const pending = (typeof postMediaPending !== "undefined" && postMediaPending.community && postMediaPending.community.files) || [];
    const attachments = typeof uploadPendingPostFiles === "function" ? await uploadPendingPostFiles(pending, "community") : [];
    const explicitBox = document.getElementById("community-compose-explicit");
    const followersBox = document.getElementById("community-compose-followers");
    const response = await fetch(`https://${serverAddress}/community_posts`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: body.slice(0, 1500),
        topics: (typeof communityComposeTopics !== "undefined" ? communityComposeTopics : []).slice(),
        attachments,
        explicit: !!(explicitBox && explicitBox.checked),
        followers_only: !!(followersBox && followersBox.checked)
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(communityErrorText(data, "Could not post."));
    const post = communityPostReady(data);
    const searching = typeof communitySearchRan === "function" && communitySearchRan("post");
    const fits = communityRow === "following" || (communityRow === "explore" && !post.followers_only);
    if (fits && !searching) communityPostRows.unshift(post);
    if (typeof closeCommunityCompose === "function") closeCommunityCompose();
    if (typeof paintCommunityPosts === "function") paintCommunityPosts();
  } catch (e) {
    if (count) count.textContent = e.message || "Could not post.";
    if (submit) submit.disabled = false;
  }
}

async function removeCommunityPost(post) {
  if (!post || !post.code) return;
  let response;
  try {
    response = await fetch(`https://${serverAddress}/community_posts/${encodeURIComponent(post.code)}`, {
      method: "DELETE",
      credentials: "include"
    });
  } catch (e) {
    return;
  }
  if (!response.ok) return;
  communityPostRows = communityPostRows.filter((row) => row.code !== post.code);
  if (communityOpenPost && communityOpenPost.code === post.code && typeof closeCommunityPost === "function") closeCommunityPost();
  if (typeof paintCommunityPosts === "function") paintCommunityPosts();
}

async function saveCommunityComment() {
  const post = communityOpenPost;
  const input = document.getElementById("community-post-comment-input");
  const body = input ? String(input.value || "").trim() : "";
  if (!post || !post.code || !body) return;
  let response;
  try {
    response = await fetch(`https://${serverAddress}/community_posts/${encodeURIComponent(post.code)}/comments`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.slice(0, 1500) })
    });
  } catch (e) {
    return;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return;
  const ready = communityPostReady(data);
  if (!communityOpenPost || communityOpenPost.code !== post.code) return;
  communityOpenPost = ready;
  const index = communityPostRows.findIndex((row) => row.code === post.code);
  if (index >= 0) communityPostRows[index] = ready;
  if (input) input.value = "";
  if (typeof fillCommunityPostView === "function") fillCommunityPostView();
  if (typeof COMMUNITY_POST_ROWS !== "undefined" && COMMUNITY_POST_ROWS.indexOf(communityRow) >= 0 && typeof paintCommunityPosts === "function") paintCommunityPosts();
}

async function voteCommunityPost(post, kind) {
  if (!post || !post.code || (kind !== "like" && kind !== "dislike") || post._voting) return;
  post._voting = true;
  try {
    const response = await fetch(`https://${serverAddress}/community_posts/${encodeURIComponent(post.code)}/${kind}`, {
      method: "POST",
      credentials: "include"
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) return;
    const ready = communityPostReady(data);
    const index = communityPostRows.findIndex((row) => row.code === post.code);
    if (index >= 0) communityPostRows[index] = ready;
    if (communityOpenPost && communityOpenPost.code === post.code) {
      communityOpenPost = ready;
      if (typeof fillCommunityPostView === "function") fillCommunityPostView();
    }
    if (typeof paintCommunityPosts === "function") paintCommunityPosts();
  } catch (e) {
    return;
  } finally {
    post._voting = false;
  }
}
