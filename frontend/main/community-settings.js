const COMMUNITY_SETTINGS_SECTIONS = {
  general: "General",
  topics: "Favorite Topics",
  blacklist: "Blacklist"
};

let communitySettingsSection = "general";
let communityPostPrefs = { words: [], topics: [], comment_sort: "oldest", search_blacklist: false, blacklist_hide: false };
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
    search_blacklist: !!data.search_blacklist,
    blacklist_hide: !!data.blacklist_hide
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
  paintOpenCommunitySettings();
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
  paintOpenCommunitySettings();
  refreshCommunityPostsAfterPrefs();
}

function paintCommunityFilterList(kind, title, desc, placeholder, rows, save) {
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
    save("POST", "/filters", { kind, label });
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
  const pills = document.createElement("div");
  pills.className = "community-filter-pills";
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "settings-opt-desc";
    empty.textContent = kind === "topic" ? "No blacklisted topics." : (kind === "tag" ? "No blacklisted tags." : "No blacklisted words.");
    pills.appendChild(empty);
  }
  rows.forEach((label) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "community-tag is-on community-filter-pill";
    pill.title = "Remove";
    pill.textContent = label + " ×";
    pill.addEventListener("click", () => save("DELETE", "/filters", { kind, label }));
    pills.appendChild(pill);
  });
  text.appendChild(pills);
  wrap.appendChild(text);
  return wrap;
}

function communitySettingsSubblock(title) {
  const block = document.createElement("div");
  block.className = "settings-subblock";
  const head = document.createElement("div");
  head.className = "settings-subblock-title";
  head.textContent = title;
  block.appendChild(head);
  return block;
}

function communitySettingsStatus(message) {
  if (!message) return null;
  const status = document.createElement("div");
  status.className = "settings-form-status";
  status.textContent = message;
  return status;
}

function appendCommunityPostGeneral(section) {
  const block = communitySettingsSubblock("Posts");
  const sort = settingsSelect([
    { value: "oldest", label: "Oldest first" },
    { value: "newest", label: "Newest first" }
  ], communityCommentSort(), false);
  sort.addEventListener("change", () => saveCommunityPostPrefs("PATCH", "", { comment_sort: sort.value }));
  block.appendChild(settingsOpt("Sort comments", "The order comments appear in when you open a post.", sort));
  block.appendChild(settingsOpt(
    "Show blacklisted words in search",
    "Posts that match your blacklist appear in your post search results, still covered.",
    settingsToggle(communityPostPrefs.search_blacklist, false, (on) => saveCommunityPostPrefs("PATCH", "", { search_blacklist: on }))
  ));
  const status = communitySettingsStatus(communityPostPrefsStatus);
  if (status) block.appendChild(status);
  section.appendChild(block);
}

function appendCommunityPostBlacklist(section) {
  const block = communitySettingsSubblock("Posts");
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "Posts from other people that match your blacklist are covered as explicit on your screen until you click them. Your own posts and comments are never covered.";
  block.appendChild(blurb);
  block.appendChild(paintCommunityFilterList("word", "Words", "Covers any post or comment that contains one of these words.", "Add a word", communityPostPrefs.words, saveCommunityPostPrefs));
  block.appendChild(paintCommunityFilterList("topic", "Topics", "Covers any post that has one of these topics.", "Add a topic", communityPostPrefs.topics, saveCommunityPostPrefs));
  block.appendChild(settingsOpt(
    "Hide blacklisted posts",
    "Posts that match your blacklist are removed from Following, Timeline, and Explore instead of being covered.",
    settingsToggle(communityPostPrefs.blacklist_hide, false, (on) => saveCommunityPostPrefs("PATCH", "", { blacklist_hide: on }))
  ));
  const status = communitySettingsStatus(communityPostPrefsStatus);
  if (status) block.appendChild(status);
  section.appendChild(block);
}

function paintCommunityGeneralSettings() {
  const page = document.getElementById("community-settings-page");
  if (!page || communitySettingsSection !== "general") return;
  page.replaceChildren();
  const section = document.createElement("section");
  section.className = "settings-block has-sections";
  appendCommunityPostGeneral(section);
  if (typeof appendCommunityRoomGeneral === "function") appendCommunityRoomGeneral(section);
  if (typeof appendCommunityPhoneGeneral === "function") appendCommunityPhoneGeneral(section);
  if (typeof appendCommunityFinderGeneral === "function") appendCommunityFinderGeneral(section);
  page.appendChild(section);
}

function paintCommunityFavoriteTopics() {
  const page = document.getElementById("community-settings-page");
  if (!page || communitySettingsSection !== "topics") return;
  page.replaceChildren();
  const section = document.createElement("section");
  section.className = "settings-block has-sections";
  const block = communitySettingsSubblock("Favorite Topics");
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "Topics you follow. Timeline shows public posts in these topics from anyone. Grow your circle suggests people from up to three of them.";
  block.appendChild(blurb);
  const wrap = document.createElement("div");
  wrap.className = "settings-opt community-filter-list";
  const text = document.createElement("div");
  text.className = "settings-opt-text";
  const heading = document.createElement("div");
  heading.className = "settings-opt-title";
  heading.textContent = "Topics";
  const body = document.createElement("div");
  body.className = "settings-opt-desc";
  body.textContent = "Add the subjects you want on Timeline. Topic names can have spaces. Hashtags stay in the post body as #one_word.";
  const add = document.createElement("div");
  add.className = "community-filter-add-row";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "community-search";
  input.maxLength = 40;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Add a topic";
  input.disabled = true;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pill-btn";
  btn.textContent = "Add";
  btn.disabled = true;
  add.appendChild(input);
  add.appendChild(btn);
  const pills = document.createElement("div");
  pills.className = "community-filter-pills";
  const empty = document.createElement("div");
  empty.className = "settings-opt-desc";
  empty.textContent = "No favorite topics.";
  pills.appendChild(empty);
  text.appendChild(heading);
  text.appendChild(body);
  text.appendChild(add);
  text.appendChild(pills);
  wrap.appendChild(text);
  block.appendChild(wrap);
  section.appendChild(block);
  page.appendChild(section);
}

function paintCommunityBlacklistSettings() {
  const page = document.getElementById("community-settings-page");
  if (!page || communitySettingsSection !== "blacklist") return;
  page.replaceChildren();
  const section = document.createElement("section");
  section.className = "settings-block has-sections";
  appendCommunityPostBlacklist(section);
  if (typeof appendCommunityRoomBlacklist === "function") appendCommunityRoomBlacklist(section);
  if (typeof appendCommunityPhoneBlacklist === "function") appendCommunityPhoneBlacklist(section);
  if (typeof appendCommunityFinderBlacklist === "function") appendCommunityFinderBlacklist(section);
  page.appendChild(section);
}

function paintOpenCommunitySettings() {
  if (!communitySettingsOpen()) return;
  if (communitySettingsSection === "topics") paintCommunityFavoriteTopics();
  else if (communitySettingsSection === "blacklist") paintCommunityBlacklistSettings();
  else paintCommunityGeneralSettings();
}

function showCommunitySettingsSection(id) {
  if (!COMMUNITY_SETTINGS_SECTIONS[id]) id = "general";
  communitySettingsSection = id;
  document.querySelectorAll("#community-settings-nav [data-community-settings]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-community-settings") === id);
  });
  const title = document.getElementById("community-settings-page-title");
  if (title) title.textContent = COMMUNITY_SETTINGS_SECTIONS[id];
  paintOpenCommunitySettings();
}

function openCommunitySettings() {
  const overlay = document.getElementById("community-settings-overlay");
  if (!overlay) return;
  communityPostPrefsStatus = "";
  if (typeof communityRoomPrefsStatus !== "undefined") communityRoomPrefsStatus = "";
  if (typeof communityPhonePrefsStatus !== "undefined") communityPhonePrefsStatus = "";
  if (typeof communityFinderPrefsStatus !== "undefined") communityFinderPrefsStatus = "";
  overlay.hidden = false;
  showCommunitySettingsSection("general");
  loadCommunityPostPrefs();
  if (typeof loadCommunityRoomPrefs === "function") loadCommunityRoomPrefs();
  if (typeof loadCommunityPhonePrefs === "function") loadCommunityPhonePrefs();
  if (typeof loadCommunityFinderPrefs === "function") loadCommunityFinderPrefs();
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
