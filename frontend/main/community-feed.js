let communityExploreSample = [];

function communityTagKey(raw) {
  return String(raw || "").replace(/^#+/, "").trim();
}

function communityPostTags(post) {
  const tags = [];
  const seen = {};
  const add = (raw) => {
    const word = communityTagKey(raw);
    if (!word) return;
    const key = word.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    tags.push(word);
  };
  (post && post.topics || []).forEach(add);
  (post && post.hashtags || []).forEach(add);
  const body = String((post && post.body) || "");
  const re = /#([A-Za-z0-9_]+)/g;
  let match;
  while ((match = re.exec(body))) add(match[1]);
  return tags;
}

function communityRankTags(posts) {
  const counts = {};
  (posts || []).forEach((post) => {
    communityPostTags(post).forEach((word) => {
      const key = word.toLowerCase();
      if (!counts[key]) counts[key] = { tag: word, n: 0 };
      counts[key].n += 1;
      counts[key].tag = word;
    });
  });
  return Object.keys(counts).map((key) => counts[key]).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag));
}

function communityFeedSamplePosts() {
  const mine = (typeof communityPostRows !== "undefined" && communityPostRows) || [];
  const extra = communityExploreSample || [];
  const seen = {};
  const out = [];
  mine.concat(extra).forEach((post) => {
    const code = post && post.code;
    if (code && seen[code]) return;
    if (code) seen[code] = true;
    out.push(post);
  });
  return out;
}

function communityFeedMyTopics(posts) {
  const mineId = myUserId;
  const minePosts = (posts || []).filter((post) => post && (post.mine || (mineId && post.author_id === mineId)));
  return communityRankTags(minePosts.length ? minePosts : posts).slice(0, 3);
}

function communityFeedPeopleForTopic(posts, topic, limit) {
  const key = communityTagKey(topic).toLowerCase();
  const people = [];
  const seen = {};
  (posts || []).forEach((post) => {
    const id = post && post.author_id;
    if (!id || (myUserId && id === myUserId) || seen[id]) return;
    const has = communityPostTags(post).some((word) => word.toLowerCase() === key);
    if (!has) return;
    seen[id] = true;
    people.push(post);
  });
  return people.slice(0, limit || 5);
}

function communityFeedSharedTopics(post, posts) {
  const mineId = myUserId;
  const mine = {};
  (posts || []).forEach((row) => {
    if (!(row && (row.mine || (mineId && row.author_id === mineId)))) return;
    communityPostTags(row).forEach((word) => { mine[word.toLowerCase()] = word; });
  });
  const shared = [];
  communityPostTags(post).forEach((word) => {
    const key = word.toLowerCase();
    if (mine[key] && shared.indexOf(mine[key]) < 0) shared.push(mine[key]);
  });
  return shared.slice(0, 3);
}

async function loadCommunityExploreSample() {
  let response;
  try {
    response = await fetch("https://" + serverAddress + "/community_posts?lens=explore", { credentials: "include" });
  } catch (e) {
    return [];
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  communityExploreSample = ((data && data.posts) || []).map((row) => {
    return typeof communityPostReady === "function" ? communityPostReady(row) : row;
  });
  return communityExploreSample;
}

function openCommunityHashtagExplore(tag) {
  const hash = communityTagKey(tag);
  if (!hash) return;
  closeCommunityTopicsCard();
  closeCommunityPeopleCard();
  const q = "#" + hash;
  if (typeof communitySearchState !== "undefined" && communitySearchState.post) {
    const state = communitySearchState.post;
    state.pending = "";
    state.author = "";
    state.topic = "";
    state.has = [];
    state.submitted = { q: q, author: "", topic: "", has: [] };
  }
  const nodes = typeof communitySearchNodes === "function" ? communitySearchNodes("post") : null;
  if (nodes && nodes.input) nodes.input.value = q;
  if (typeof communitySearchPaint === "function") communitySearchPaint("post");
  if (typeof communitySearchMenu === "function") communitySearchMenu("post", false);
  if (typeof communityRow !== "undefined" && communityRow === "explore") {
    if (typeof loadCommunityPosts === "function") loadCommunityPosts("explore", true);
    return;
  }
  if (typeof showCommunityRow === "function") showCommunityRow("explore");
}

function communityFeedTrendRow(rank, item) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "community-feed-trend";
  const n = document.createElement("span");
  n.className = "community-feed-trend-n";
  n.textContent = String(rank).padStart(2, "0");
  const copy = document.createElement("span");
  copy.className = "community-feed-trend-copy";
  const name = document.createElement("span");
  name.className = "community-feed-trend-name";
  name.textContent = "#" + item.tag;
  const meta = document.createElement("span");
  meta.className = "community-feed-trend-meta";
  const count = Number(item.n) || 0;
  meta.textContent = count + (count === 1 ? " post" : " posts") + " · Trending now";
  copy.appendChild(name);
  copy.appendChild(meta);
  btn.appendChild(n);
  btn.appendChild(copy);
  btn.addEventListener("click", () => openCommunityHashtagExplore(item.tag));
  return btn;
}

function paintCommunityFeedTrending(posts) {
  const host = document.getElementById("community-feed-trend-list");
  if (!host) return;
  host.replaceChildren();
  const ranked = communityRankTags(posts).slice(0, 3);
  if (!ranked.length) {
    const empty = document.createElement("p");
    empty.className = "community-feed-card-empty";
    empty.textContent = "No hashtags yet.";
    host.appendChild(empty);
    return;
  }
  ranked.forEach((item, index) => host.appendChild(communityFeedTrendRow(index + 1, item)));
}

function paintCommunityFeedPerson(post, posts) {
  const person = typeof communityPostPerson === "function" ? communityPostPerson(post) : { name: "User", handle: "user" };
  const row = document.createElement("div");
  row.className = "community-feed-person";
  const face = document.createElement("div");
  face.className = "community-post-face" + (post && post.author_id ? " is-person" : "");
  if (typeof paintUserFace === "function") paintUserFace(face, post, { userId: post && post.author_id, name: person.name });
  else face.textContent = typeof communityLetter === "function" ? communityLetter(person.name) : "?";
  const copy = document.createElement("div");
  copy.className = "community-feed-person-copy";
  const nameEl = document.createElement("div");
  nameEl.className = "community-feed-person-name" + (post && post.author_id ? " is-person" : "");
  nameEl.textContent = person.name;
  const handleEl = document.createElement("div");
  handleEl.className = "community-feed-person-handle";
  handleEl.textContent = "@" + person.handle;
  copy.appendChild(nameEl);
  copy.appendChild(handleEl);
  const interest = document.createElement("div");
  interest.className = "community-feed-person-interest";
  communityFeedSharedTopics(post, posts).forEach((word) => {
    const pill = document.createElement("span");
    pill.className = "community-tag";
    pill.textContent = word;
    interest.appendChild(pill);
  });
  const follow = document.createElement("button");
  follow.type = "button";
  follow.className = "community-feed-follow";
  follow.textContent = "Follow";
  follow.disabled = true;
  const openMini = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (post && post.author_id && typeof openMiniProfile === "function") openMiniProfile(post.author_id, face);
  };
  const openMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!post || !post.author_id || typeof showProfileContextMenu !== "function") return;
    showProfileContextMenu(e, post.author_id, person.handle, !!(myUserId && post.author_id === myUserId), false);
  };
  row.addEventListener("click", openMini);
  row.addEventListener("contextmenu", openMenu);
  follow.addEventListener("click", (e) => e.stopPropagation());
  row.appendChild(face);
  row.appendChild(copy);
  row.appendChild(interest);
  row.appendChild(follow);
  return row;
}

function paintCommunityFeedGrow(posts) {
  const host = document.getElementById("community-feed-grow-list");
  if (!host) return;
  host.replaceChildren();
  const seen = {};
  const rows = [];
  (posts || []).forEach((post) => {
    const id = post && post.author_id;
    if (!id || (myUserId && id === myUserId) || seen[id]) return;
    seen[id] = true;
    rows.push(post);
  });
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "community-feed-card-empty";
    empty.textContent = "People to follow will show here.";
    host.appendChild(empty);
    return;
  }
  rows.slice(0, 3).forEach((post) => host.appendChild(paintCommunityFeedPerson(post, posts)));
}

async function paintCommunityFeedRail() {
  paintCommunityFeedTrending(communityFeedSamplePosts());
  paintCommunityFeedGrow(communityFeedSamplePosts());
  await loadCommunityExploreSample();
  paintCommunityFeedTrending(communityFeedSamplePosts());
  paintCommunityFeedGrow(communityFeedSamplePosts());
}

function closeCommunityTopicsCard() {
  const overlay = document.getElementById("community-topics-overlay");
  if (overlay) overlay.hidden = true;
}

function closeCommunityPeopleCard() {
  const overlay = document.getElementById("community-people-overlay");
  if (overlay) overlay.hidden = true;
}

async function openCommunityTopicsCard() {
  const overlay = document.getElementById("community-topics-overlay");
  const host = document.getElementById("community-topics-list");
  if (!overlay || !host) return;
  host.replaceChildren();
  overlay.hidden = false;
  if (!communityExploreSample.length) await loadCommunityExploreSample();
  const ranked = communityRankTags(communityFeedSamplePosts()).slice(0, 10);
  if (!ranked.length) {
    const empty = document.createElement("p");
    empty.className = "community-list-help";
    empty.textContent = "No hashtags yet.";
    host.appendChild(empty);
    return;
  }
  ranked.forEach((item, index) => host.appendChild(communityFeedTrendRow(index + 1, item)));
}

async function openCommunityPeopleCard() {
  const overlay = document.getElementById("community-people-overlay");
  const host = document.getElementById("community-people-list");
  if (!overlay || !host) return;
  host.replaceChildren();
  overlay.hidden = false;
  if (!communityExploreSample.length) await loadCommunityExploreSample();
  const posts = communityFeedSamplePosts();
  const topics = communityFeedMyTopics(posts);
  if (!topics.length) {
    const empty = document.createElement("p");
    empty.className = "community-list-help";
    empty.textContent = "Follow topics from posts you write to find people here.";
    host.appendChild(empty);
    return;
  }
  topics.forEach((item) => {
    const block = document.createElement("section");
    block.className = "community-feed-people-topic";
    const title = document.createElement("h3");
    title.textContent = item.tag;
    block.appendChild(title);
    const people = communityFeedPeopleForTopic(posts, item.tag, 5);
    if (!people.length) {
      const empty = document.createElement("p");
      empty.className = "community-list-help";
      empty.textContent = "No people yet.";
      block.appendChild(empty);
    } else {
      people.forEach((post) => block.appendChild(paintCommunityFeedPerson(post, posts)));
    }
    host.appendChild(block);
  });
}

function bindCommunityFeedRail() {
  const explore = document.getElementById("community-feed-explore-topics");
  if (explore) explore.addEventListener("click", () => openCommunityTopicsCard());
  const find = document.getElementById("community-feed-find-people");
  if (find) find.addEventListener("click", () => openCommunityPeopleCard());
  const topicsCancel = document.getElementById("community-topics-cancel");
  if (topicsCancel) topicsCancel.addEventListener("click", () => closeCommunityTopicsCard());
  const peopleCancel = document.getElementById("community-people-cancel");
  if (peopleCancel) peopleCancel.addEventListener("click", () => closeCommunityPeopleCard());
  const topicsOverlay = document.getElementById("community-topics-overlay");
  if (topicsOverlay) topicsOverlay.addEventListener("mousedown", (e) => {
    if (e.target && e.target.id === "community-topics-overlay") closeCommunityTopicsCard();
  });
  const peopleOverlay = document.getElementById("community-people-overlay");
  if (peopleOverlay) peopleOverlay.addEventListener("mousedown", (e) => {
    if (e.target && e.target.id === "community-people-overlay") closeCommunityPeopleCard();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const topics = document.getElementById("community-topics-overlay");
    if (topics && !topics.hidden) {
      closeCommunityTopicsCard();
      e.stopPropagation();
      return;
    }
    const people = document.getElementById("community-people-overlay");
    if (people && !people.hidden) closeCommunityPeopleCard();
  }, true);
}

bindCommunityFeedRail();
