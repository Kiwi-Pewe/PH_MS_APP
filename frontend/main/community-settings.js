const COMMUNITY_SETTINGS_SECTIONS = {
  posts: "Post settings",
  rooms: "Room settings",
  phone: "Phone Settings",
  finder: "Server Finder settings"
};

let communitySettingsSection = "posts";
let communityPostPrefs = { words: [], topics: [], comment_sort: "oldest", search_blacklist: false };
let communityPostPrefsLoaded = false;
let communityPostPrefsStatus = "";

function communityCommentSort() {
  return communityPostPrefs.comment_sort === "newest" ? "newest" : "oldest";
}

function applyCommunityPostPrefs(data) {
  if (!data || typeof data !== "object") return;
  communityPostPrefs = {
    words: Array.isArray(data.words) ? data.words : [],
    topics: Array.isArray(data.topics) ? data.topics : [],
    comment_sort: data.comment_sort === "newest" ? "newest" : "oldest",
    search_blacklist: !!data.search_blacklist
  };
  communityPostPrefsLoaded = true;
}

async function communityPostPrefsRequest(method, path, payload) {
  const options = { method, credentials: "include" };
  if (payload) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(payload);
  }
  const response = await fetch(`https://${serverAddress}/community_post_settings${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof communityErrorText === "function" ? communityErrorText(data, "Could not save.") : "Could not save.");
  return data;
}

async function loadCommunityPostPrefs() {
  try {
    applyCommunityPostPrefs(await communityPostPrefsRequest("GET", ""));
  } catch (e) {
    return;
  }
  if (communitySettingsSection === "posts" && communitySettingsOpen()) paintCommunityPostSettings();
  if (communityOpenPost && typeof paintCommunityPostThread === "function") paintCommunityPostThread();
}

function refreshCommunityPostsAfterPrefs() {
  if (typeof communityRow === "undefined" || typeof COMMUNITY_POST_ROWS === "undefined") return;
  if (COMMUNITY_POST_ROWS.indexOf(communityRow) < 0) return;
  if (typeof loadCommunityPosts === "function") loadCommunityPosts(communityRow, false);
  if (communityOpenPost && communityOpenPost.code && typeof loadCommunityPostDetail === "function") loadCommunityPostDetail(communityOpenPost.code);
}

async function saveCommunityPostPrefs(method, path, payload) {
  communityPostPrefsStatus = "";
  try {
    applyCommunityPostPrefs(await communityPostPrefsRequest(method, path, payload));
  } catch (e) {
    communityPostPrefsStatus = e.message || "Could not save.";
  }
  paintCommunityPostSettings();
  refreshCommunityPostsAfterPrefs();
}

function paintCommunityFilterList(kind, title, desc, placeholder) {
  const wrap = document.createElement("div");
  wrap.className = "settings-opt community-filter-list";
  const text = document.createElement("div");
  text.className = "settings-opt-text";
  const heading = document.createElement("div");
  heading.className = "settings-opt-title";
  heading.textContent = title;
  const body = document.createElement("div");
  body.className = "settings-opt-desc";
  body.textContent = desc;
  text.appendChild(heading);
  text.appendChild(body);
  const add = document.createElement("div");
  add.className = "community-filter-add-row";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "community-search";
  input.maxLength = 40;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = placeholder;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pill-btn";
  btn.textContent = "Add";
  const submit = () => {
    const label = String(input.value || "").trim();
    if (!label) return;
    saveCommunityPostPrefs("POST", "/filters", { kind, label });
  };
  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    submit();
  });
  add.appendChild(input);
  add.appendChild(btn);
  text.appendChild(add);
  const rows = kind === "topic" ? communityPostPrefs.topics : communityPostPrefs.words;
  const pills = document.createElement("div");
  pills.className = "community-filter-pills";
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "settings-opt-desc";
    empty.textContent = kind === "topic" ? "No blacklisted topics." : "No blacklisted words.";
    pills.appendChild(empty);
  }
  rows.forEach((label) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "community-tag is-on community-filter-pill";
    pill.title = "Remove";
    pill.textContent = label + " ×";
    pill.addEventListener("click", () => saveCommunityPostPrefs("DELETE", "/filters", { kind, label }));
    pills.appendChild(pill);
  });
  text.appendChild(pills);
  wrap.appendChild(text);
  return wrap;
}

function paintCommunityPostSettings() {
  const page = document.getElementById("community-settings-page");
  if (!page || communitySettingsSection !== "posts") return;
  page.replaceChildren();
  const section = document.createElement("section");
  section.className = "settings-block has-sections";
  const block = document.createElement("div");
  block.className = "settings-subblock";
  const head = document.createElement("div");
  head.className = "settings-subblock-title";
  head.textContent = "Blacklist";
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "Posts from other people that match your blacklist are covered as explicit on your screen until you click them.";
  block.appendChild(head);
  block.appendChild(blurb);
  block.appendChild(paintCommunityFilterList("word", "Words", "Covers any post or comment that contains one of these words.", "Add a word"));
  block.appendChild(paintCommunityFilterList("topic", "Topics", "Covers any post that has one of these topics.", "Add a topic"));
  if (communityPostPrefsStatus) {
    const status = document.createElement("div");
    status.className = "settings-form-status";
    status.textContent = communityPostPrefsStatus;
    block.appendChild(status);
  }
  section.appendChild(block);
  const more = document.createElement("div");
  more.className = "settings-subblock";
  const moreHead = document.createElement("div");
  moreHead.className = "settings-subblock-title";
  moreHead.textContent = "Posts";
  more.appendChild(moreHead);
  const sort = settingsSelect([
    { value: "oldest", label: "Oldest first" },
    { value: "newest", label: "Newest first" }
  ], communityCommentSort(), false);
  sort.addEventListener("change", () => saveCommunityPostPrefs("PATCH", "", { comment_sort: sort.value }));
  more.appendChild(settingsOpt("Sort comments", "The order comments appear in when you open a post.", sort));
  more.appendChild(settingsOpt(
    "Show blacklisted words in search",
    "Posts that match your blacklist appear in your post search results, still covered.",
    settingsToggle(communityPostPrefs.search_blacklist, false, (on) => saveCommunityPostPrefs("PATCH", "", { search_blacklist: on }))
  ));
  section.appendChild(more);
  page.appendChild(section);
}

function showCommunitySettingsSection(id) {
  if (!COMMUNITY_SETTINGS_SECTIONS[id]) id = "posts";
  communitySettingsSection = id;
  document.querySelectorAll("#community-settings-nav [data-community-settings]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-community-settings") === id);
  });
  const title = document.getElementById("community-settings-page-title");
  if (title) title.textContent = COMMUNITY_SETTINGS_SECTIONS[id];
  const page = document.getElementById("community-settings-page");
  if (page) page.replaceChildren();
  if (id === "posts") paintCommunityPostSettings();
}

function openCommunitySettings() {
  const overlay = document.getElementById("community-settings-overlay");
  if (!overlay) return;
  communityPostPrefsStatus = "";
  showCommunitySettingsSection("posts");
  overlay.hidden = false;
  loadCommunityPostPrefs();
}

function closeCommunitySettings() {
  const overlay = document.getElementById("community-settings-overlay");
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
}

function communitySettingsOpen() {
  const overlay = document.getElementById("community-settings-overlay");
  return !!(overlay && !overlay.hidden);
}

document.getElementById("community-settings-open").addEventListener("click", () => openCommunitySettings());
document.getElementById("community-settings-close").addEventListener("click", () => closeCommunitySettings());
document.getElementById("community-settings-overlay").addEventListener("mousedown", (e) => {
  if (e.target && e.target.id === "community-settings-overlay") closeCommunitySettings();
});
document.getElementById("community-settings-nav").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-community-settings]");
  if (!btn) return;
  showCommunitySettingsSection(btn.getAttribute("data-community-settings"));
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !communitySettingsOpen()) return;
  e.preventDefault();
  e.stopPropagation();
  closeCommunitySettings();
}, true);
