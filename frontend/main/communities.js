let isCommunitiesOpen = false;
let communityListingRow = null;
let communityPage = 1;
let communityPages = 0;
let communityQuery = "";
let communityFetchGen = 0;
let communitySearchTimer = 0;
let communityJoinBusy = false;
let communityApplyRow = null;
let communityFacets = { tags: [], timezones: [] };
let communityFilter = { type: "", tags: [], timezone: "" };
let communityPickerKind = "";

const COMMUNITY_TYPE_PILLS = [
  ["community", "Community"],
  ["gaming", "Gaming"],
  ["social", "Social"],
  ["chill", "Chill"],
  ["roleplay", "Roleplay"],
  ["hangout", "Hangout"],
  ["friends", "Friends"],
  ["anime", "Anime"],
  ["art", "Art"],
  ["music", "Music"],
  ["other", "Other"]
];

const COMMUNITY_POST_ROWS = ["following", "timeline", "explore"];
const COMMUNITY_ROW_PANES = {
  following: "posts",
  timeline: "posts",
  explore: "posts",
  rooms: "rooms",
  garterphone: "garterphone",
  servers: "servers",
  settings: "settings"
};

let communityRow = "servers";
let communityOpenPost = null;
const COMMUNITY_TOPIC_MAX = 4;
let communityComposeTopics = [];
let communityComposeTopicDraft = null;
let communityOpenRoom = null;
let communityMuteWords = [];
let communityMuteTopics = [];
let communityRooms = [];

function communityEmojiCount(text) {
  let count = 0;
  for (const ch of String(text || "")) {
    const code = ch.codePointAt(0);
    if (code === 0x200d || code === 0xfe0f || (code >= 0x1f3fb && code <= 0x1f3ff)) continue;
    if ((code >= 0x1f300 && code <= 0x1faff) || (code >= 0x2600 && code <= 0x27bf) || (code >= 0x1f1e6 && code <= 0x1f1ff)) count += 1;
  }
  return count;
}

function communityRowTitle(id) {
  if (id === "timeline") return "Timeline";
  if (id === "explore") return "Explore";
  if (id === "rooms") return "Rooms";
  if (id === "garterphone") return "GarterPhone";
  if (id === "settings") return "Settings";
  if (id === "servers") return "Servers";
  return "Following";
}

function communityRowHelp(id) {
  if (id === "timeline") return "Public posts in topics you follow.";
  if (id === "explore") return "All Posts from all user";
  return "This page contains your own posts, as well as people you follow";
}

function communityPostSearchText() {
  const input = document.getElementById("community-post-search");
  return input ? String(input.value || "").trim().toLowerCase() : "";
}

function communityPostMatches(post, query) {
  if (!query) return true;
  const person = communityPostPerson(post);
  const fields = [person.name, person.handle, post && post.body];
  if (fields.some((field) => String(field || "").toLowerCase().indexOf(query) >= 0)) return true;
  const tags = (post && post.topics) || [];
  return tags.some((topic) => String(topic || "").toLowerCase().indexOf(query) >= 0);
}

function showCommunityRow(id) {
  if (!COMMUNITY_ROW_PANES[id]) id = "servers";
  communityRow = id;
  if (typeof closeCommunityFilterPicker === "function") closeCommunityFilterPicker();
  document.querySelectorAll("#community-sidebar-view [data-community-row]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-community-row") === id);
  });
  const pane = COMMUNITY_ROW_PANES[id];
  const paneServers = document.getElementById("community-pane-servers");
  const panePosts = document.getElementById("community-pane-posts");
  const paneRooms = document.getElementById("community-pane-rooms");
  const paneGarter = document.getElementById("community-pane-garterphone");
  const paneSettings = document.getElementById("community-pane-settings");
  communityOpenRoom = null;
  const paneChat = document.getElementById("community-pane-room-chat");
  if (paneServers) paneServers.hidden = pane !== "servers";
  if (panePosts) panePosts.hidden = pane !== "posts";
  if (paneRooms) paneRooms.hidden = pane !== "rooms";
  if (paneGarter) paneGarter.hidden = pane !== "garterphone";
  if (paneSettings) paneSettings.hidden = pane !== "settings";
  if (paneChat) paneChat.hidden = true;
  if (typeof hideMemberList === "function") hideMemberList();
  paintCommunityRoomNav();
  if (pane !== "posts") {
    closeCommunityCompose();
    closeCommunityPost();
  }
  if (pane === "posts") {
    paintCommunityPosts();
    if (typeof loadCommunityPosts === "function") loadCommunityPosts(communityRow, true);
  }
  if (pane === "rooms") paintCommunityRooms();
  if (pane === "settings") paintCommunitySettings();
  if (pane === "garterphone") {
    const status = document.getElementById("community-garter-status");
    if (status) status.textContent = "You will be paired with a stranger. Either of you can end it.";
  }
}

function paintCommunityPosts() {
  const title = document.getElementById("community-post-title");
  if (title) title.textContent = communityRowTitle(communityRow);
  const help = document.getElementById("community-post-help");
  if (help) help.textContent = communityRowHelp(communityRow);
  const list = document.getElementById("community-post-list");
  if (!list) return;
  list.replaceChildren();
  const query = communityPostSearchText();
  const loaded = (typeof communityPostRows !== "undefined" && communityPostRows) || [];
  const rows = loaded.filter((post) => communityPostMatches(post, query));
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "community-list-help";
    empty.textContent = loaded.length ? "No posts match." : "No posts yet.";
    list.appendChild(empty);
    return;
  }
  rows.forEach((post) => list.appendChild(paintCommunityPostCard(post)));
}

function communityPostBodyText(post) {
  let text = String(post.body || "");
  (post.hashtags || []).forEach((tag) => {
    const hash = "#" + String(tag || "").replace(/^#+/, "");
    if (!hash || hash === "#") return;
    const safe = hash.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(safe, "i").test(text)) text += (text ? " " : "") + hash;
  });
  return text;
}

function wrapCommunityHashtags(host) {
  if (!host) return;
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const parent = node.parentElement;
    if (parent && parent.closest("a, code, .md-code, .md-codeblock, .community-post-hash")) return;
    const text = node.nodeValue || "";
    if (!/#([A-Za-z0-9_]+)/.test(text)) return;
    const frag = document.createDocumentFragment();
    text.split(/(#[A-Za-z0-9_]+)/g).forEach((part) => {
      if (!part) return;
      if (/^#[A-Za-z0-9_]+$/.test(part)) {
        const mark = document.createElement("span");
        mark.className = "community-post-hash";
        mark.textContent = part;
        frag.appendChild(mark);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    });
    node.parentNode.replaceChild(frag, node);
  });
}

function communityHashtagsFromBody(text) {
  const out = [];
  const re = /#([A-Za-z0-9_]+)/g;
  let match;
  while ((match = re.exec(String(text || "")))) {
    if (!out.some((tag) => tag.toLowerCase() === match[1].toLowerCase())) out.push(match[1]);
  }
  return out;
}

function paintCommunityPostBody(host, post) {
  const text = communityPostBodyText(post);
  if (post.explicit) {
    const cover = document.createElement("span");
    cover.className = "md-explicit";
    cover.textContent = text;
    cover.addEventListener("click", (e) => {
      e.stopPropagation();
      cover.classList.toggle("is-open");
    });
    host.appendChild(cover);
    return;
  }
  if (typeof mdAppend === "function") {
    mdAppend(host, text, {});
    wrapCommunityHashtags(host);
    return;
  }
  const parts = text.split(/(#[A-Za-z0-9_]+)/g);
  parts.forEach((part) => {
    if (!part) return;
    if (/^#[A-Za-z0-9_]+$/.test(part)) {
      const mark = document.createElement("span");
      mark.className = "community-post-hash";
      mark.textContent = part;
      host.appendChild(mark);
    } else {
      host.appendChild(document.createTextNode(part));
    }
  });
}

function communityPostLink(post) {
  const person = communityPostPerson(post);
  const code = (post && post.code) || "";
  const origin = (window.location && window.location.origin) || "https://oneira.cc";
  return origin + "/posts/" + encodeURIComponent(person.handle) + "/" + code;
}

function communityPostComments(post) {
  if (!post || !Array.isArray(post.comments)) return [];
  return post.comments;
}

function communityPostPerson(post) {
  const mine = !!(post && (post.mine || (myUserId && post.author_id === myUserId)));
  const handle = (post && (post.username || post.handle)) || (mine ? (myUsername || "you") : "user");
  const name = (post && (post.display_name || post.name || post.username || post.handle)) || (mine ? (myDisplayName || myUsername || "You") : "User");
  return { mine, name, handle };
}

function fillCommunityPostHead(host, post, opts) {
  if (!host) return;
  opts = opts || {};
  const person = communityPostPerson(post);
  host.replaceChildren();
  const who = document.createElement("div");
  who.className = "community-post-who";
  const face = document.createElement("div");
  face.className = "community-post-face" + (post && post.author_id ? " is-person" : "");
  if (typeof paintUserFace === "function") paintUserFace(face, post, { userId: post && post.author_id, name: person.name });
  else face.textContent = communityLetter(person.name);
  if (post && post.author_id && typeof openMiniProfile === "function") {
    face.addEventListener("click", (e) => {
      e.stopPropagation();
      openMiniProfile(post.author_id, face);
    });
  }
  const names = document.createElement("div");
  names.className = "community-post-names";
  const nameEl = document.createElement("span");
  nameEl.className = "community-post-name" + (post && post.author_id ? " is-person" : "");
  nameEl.textContent = person.name;
  if (post && post.author_id && typeof openMiniProfile === "function") {
    nameEl.addEventListener("click", (e) => {
      e.stopPropagation();
      openMiniProfile(post.author_id, nameEl);
    });
  }
  const handleEl = document.createElement("span");
  handleEl.className = "community-post-handle";
  handleEl.textContent = "@" + person.handle;
  names.appendChild(nameEl);
  names.appendChild(handleEl);
  who.appendChild(face);
  who.appendChild(names);
  if (post && post.time) {
    const rule = document.createElement("span");
    rule.className = "community-post-rule";
    rule.textContent = "|";
    const timeEl = document.createElement("span");
    timeEl.className = "community-post-time";
    timeEl.textContent = post.time;
    who.appendChild(rule);
    who.appendChild(timeEl);
  }
  const more = document.createElement("button");
  more.type = "button";
  more.className = "icon-btn community-post-more";
  more.title = "More";
  more.innerHTML = "&#8942;";
  more.addEventListener("click", (e) => openCommunityPostMenu(e, post));
  who.appendChild(more);
  host.appendChild(who);
  if (post && post.topics && post.topics.length) {
    const row = document.createElement("div");
    row.className = "community-post-pills";
    post.topics.forEach((topic) => {
      const pill = document.createElement("span");
      pill.className = "community-tag";
      pill.textContent = topic;
      row.appendChild(pill);
    });
    host.appendChild(row);
  }
}

function fillCommunityPostMid(host, post) {
  if (!host) return;
  host.replaceChildren();
  const body = document.createElement("div");
  body.className = "community-post-body";
  paintCommunityPostBody(body, post);
  host.appendChild(body);
  const visual = (post && post.attachments || []).filter((row) => row && row.url && row.kind !== "audio");
  if (visual.length && typeof buildPostMedia === "function") {
    const media = buildPostMedia(visual);
    if (media) {
      media.classList.add("community-post-visual");
      host.appendChild(media);
    }
  } else if (post && post.media) {
    const media = document.createElement("div");
    media.className = "community-post-media" + (post.explicit ? " md-explicit-media" : "");
    const label = document.createElement("span");
    if (post.explicit) label.className = "md-explicit-media-label";
    label.textContent = post.explicit ? "Explicit image" : (post.video ? "Video" : "Image");
    media.appendChild(label);
    if (post.explicit) {
      media.addEventListener("click", (e) => {
        e.stopPropagation();
        media.classList.toggle("is-open");
      });
    }
    host.appendChild(media);
  }
  const tracks = (post && post.tracks && post.tracks.length)
    ? post.tracks
    : (post && post.attachments || []).filter((row) => row && row.kind === "audio" && row.url);
  if (tracks.length && typeof mountOneiraMusicPlayer === "function") {
    const player = document.createElement("div");
    player.className = "community-post-music";
    host.appendChild(player);
    mountOneiraMusicPlayer(player, { tracks });
  } else if (post && post.music) {
    const song = document.createElement("div");
    song.className = "community-post-media";
    song.textContent = post.music;
    host.appendChild(song);
  }
}

function fillCommunityPostActs(host, post, opts) {
  if (!host) return;
  opts = opts || {};
  host.replaceChildren();
  [
    ["replies", "Reply", post && post.replies],
    ["reposts", "Repost", post && post.reposts],
    ["likes", "Like", post && post.likes],
    ["dislikes", "Dislike", post && post.dislikes]
  ].forEach((item) => {
    const key = item[0];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "community-post-act";
    const paint = () => {
      const n = Number(post && post[key]) || 0;
      btn.textContent = item[1] + (n ? " " + n : "");
    };
    paint();
    if (key === "likes" || key === "dislikes") {
      btn.classList.toggle("is-on", !!(post && (key === "likes" ? post.liked : post.disliked)));
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof voteCommunityPost === "function") voteCommunityPost(post, key === "likes" ? "like" : "dislike");
      });
    } else if (key !== "replies") btn.disabled = true;
    else btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (opts.detail) {
        const input = document.getElementById("community-post-comment-input");
        if (input) input.focus();
      } else {
        openCommunityPost(post);
      }
    });
    host.appendChild(btn);
  });
}

function paintCommunityPostCard(post) {
  const card = document.createElement("article");
  card.className = "community-post";
  const head = document.createElement("div");
  head.className = "community-post-head";
  fillCommunityPostHead(head, post);
  const mid = document.createElement("div");
  mid.className = "community-post-mid";
  fillCommunityPostMid(mid, post);
  const foot = document.createElement("div");
  foot.className = "community-post-foot";
  fillCommunityPostActs(foot, post);
  card.appendChild(head);
  card.appendChild(mid);
  card.appendChild(foot);
  card.addEventListener("click", (e) => {
    if (e.target.closest("button, .md-explicit, .md-explicit-media, .post-media, .oneira-music, .community-post-music, .community-post-face, .community-post-name")) return;
    openCommunityPost(post);
  });
  card.addEventListener("contextmenu", (e) => openCommunityPostMenu(e, post));
  return card;
}

function deleteCommunityPost(post) {
  if (typeof removeCommunityPost === "function") removeCommunityPost(post);
}

function openCommunityPostMenu(e, post) {
  e.preventDefault();
  e.stopPropagation();
  if (typeof openContextMenu !== "function") return;
  const person = communityPostPerson(post);
  const rows = [];
  if (person.mine) {
    rows.push({ label: "Edit", disabled: true });
    rows.push({
      label: "Delete",
      danger: true,
      onSelect: () => deleteCommunityPost(post)
    });
  } else {
    rows.push({ label: "Follow", disabled: true });
  }
  rows.push({
    label: "Copy Post Link",
    onSelect: () => {
      const text = communityPostLink(post);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
    }
  });
  rows.push({ label: "Report", disabled: true, danger: true });
  openContextMenu(e.clientX, e.clientY, {
    avatarText: communityLetter(person.name),
    title: person.name,
    subtitle: "@" + person.handle
  }, rows);
}

function paintCommunityPostComment(row) {
  const person = communityPostPerson(row);
  const el = document.createElement("div");
  el.className = "community-post-comment";
  const face = document.createElement("div");
  face.className = "community-post-face" + (row && row.author_id ? " is-person" : "");
  if (typeof paintUserFace === "function") paintUserFace(face, row, { userId: row && row.author_id, name: person.name });
  else face.textContent = communityLetter(person.name);
  if (row && row.author_id && typeof openMiniProfile === "function") {
    face.addEventListener("click", (e) => {
      e.stopPropagation();
      openMiniProfile(row.author_id, face);
    });
  }
  const main = document.createElement("div");
  main.className = "community-post-comment-main";
  const by = document.createElement("div");
  by.className = "community-post-by";
  const nameEl = document.createElement("span");
  nameEl.className = "community-post-name" + (row && row.author_id ? " is-person" : "");
  nameEl.textContent = person.name;
  if (row && row.author_id && typeof openMiniProfile === "function") {
    nameEl.addEventListener("click", (e) => {
      e.stopPropagation();
      openMiniProfile(row.author_id, nameEl);
    });
  }
  const timeEl = document.createElement("span");
  timeEl.className = "community-post-time";
  timeEl.textContent = row.time || "";
  by.appendChild(nameEl);
  if (row.time) by.appendChild(timeEl);
  const body = document.createElement("div");
  body.className = "community-post-comment-body";
  body.textContent = row.body || "";
  main.appendChild(by);
  main.appendChild(body);
  el.appendChild(face);
  el.appendChild(main);
  return el;
}

function paintCommunityPostThread() {
  const host = document.getElementById("community-post-comments");
  const empty = document.getElementById("community-post-comments-empty");
  if (!host) return;
  host.replaceChildren();
  const rows = communityPostComments(communityOpenPost);
  rows.forEach((row) => host.appendChild(paintCommunityPostComment(row)));
  if (empty) empty.hidden = rows.length > 0;
}

function fillCommunityPostView() {
  if (!communityOpenPost) return;
  fillCommunityPostHead(document.getElementById("community-post-view-head"), communityOpenPost, { detail: true });
  fillCommunityPostMid(document.getElementById("community-post-view-mid"), communityOpenPost);
  fillCommunityPostActs(document.getElementById("community-post-view-acts"), communityOpenPost, { detail: true });
  paintCommunityPostThread();
}

function openCommunityPost(post) {
  if (!post) return;
  communityOpenPost = post;
  const overlay = document.getElementById("community-post-overlay");
  if (!overlay) return;
  fillCommunityPostView();
  const input = document.getElementById("community-post-comment-input");
  if (input) input.value = "";
  overlay.hidden = false;
  if (typeof syncAppAddress === "function") syncAppAddress();
  if (post.code && typeof loadCommunityPostDetail === "function") loadCommunityPostDetail(post.code);
}

function closeCommunityPost() {
  const overlay = document.getElementById("community-post-overlay");
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  communityOpenPost = null;
  const head = document.getElementById("community-post-view-head");
  if (head) head.replaceChildren();
  const mid = document.getElementById("community-post-view-mid");
  if (mid) mid.replaceChildren();
  const acts = document.getElementById("community-post-view-acts");
  if (acts) acts.replaceChildren();
  const host = document.getElementById("community-post-comments");
  if (host) host.replaceChildren();
  if (typeof syncAppAddress === "function") syncAppAddress();
}

function submitCommunityPostComment() {
  if (typeof saveCommunityComment === "function") saveCommunityComment();
}

function resetCommunityCompose() {
  communityComposeTopics = [];
  communityComposeTopicDraft = null;
  const input = document.getElementById("community-compose-input");
  if (input) {
    input.value = "";
    input.style.height = "";
  }
  if (typeof clearPostMedia === "function") clearPostMedia("community");
  paintCommunityComposeTopics();
  syncCommunityCompose();
  if (typeof refreshComposerMentions === "function" && input) refreshComposerMentions(input);
}

function openCommunityCompose() {
  const overlay = document.getElementById("community-compose-overlay");
  if (!overlay) return;
  resetCommunityCompose();
  overlay.hidden = false;
  const input = document.getElementById("community-compose-input");
  if (input) {
    input.focus();
    if (typeof autoGrowPostBodyInput === "function") autoGrowPostBodyInput(input);
    if (typeof refreshComposerMentions === "function") refreshComposerMentions(input);
  }
}

function closeCommunityCompose() {
  const overlay = document.getElementById("community-compose-overlay");
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  if (typeof closeEmojiPicker === "function") closeEmojiPicker();
  resetCommunityCompose();
}

function communityComposeTopicText(raw) {
  let word = String(raw || "").trim().replace(/\s+/g, " ");
  if (word.length > 40) word = word.slice(0, 40);
  return word;
}

function communityComposeSaveTopic(raw, index) {
  const word = communityComposeTopicText(raw);
  if (!word) return false;
  const key = word.toLowerCase();
  const taken = communityComposeTopics.some((item, i) => i !== index && item.toLowerCase() === key);
  if (taken) return false;
  if (index == null) {
    if (communityComposeTopics.length >= COMMUNITY_TOPIC_MAX) return false;
    communityComposeTopics.push(word);
  } else {
    communityComposeTopics[index] = word;
  }
  return true;
}

function paintCommunityComposeTopics() {
  const host = document.getElementById("community-compose-topics");
  if (!host) return;
  host.replaceChildren();
  const draft = communityComposeTopicDraft;
  communityComposeTopics.forEach((word, index) => {
    if (draft && draft.mode === "edit" && draft.index === index) {
      host.appendChild(communityComposeTopicField(word, index));
      return;
    }
    const pill = document.createElement("span");
    pill.className = "community-tag is-on";
    pill.textContent = word;
    pill.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof openContextMenu !== "function") return;
      openContextMenu(e.clientX, e.clientY, null, [
        {
          label: "Edit",
          onSelect: () => {
            communityComposeTopicDraft = { mode: "edit", index };
            paintCommunityComposeTopics();
          }
        },
        {
          label: "Remove",
          onSelect: () => {
            communityComposeTopics.splice(index, 1);
            communityComposeTopicDraft = null;
            paintCommunityComposeTopics();
          }
        }
      ]);
    });
    host.appendChild(pill);
  });
  if (draft && draft.mode === "add") {
    host.appendChild(communityComposeTopicField("", null));
    return;
  }
  if (communityComposeTopics.length >= COMMUNITY_TOPIC_MAX) return;
  const add = document.createElement("button");
  add.type = "button";
  add.className = "community-topic-add";
  add.title = "Add a topic";
  add.textContent = "+";
  add.addEventListener("click", (e) => {
    e.stopPropagation();
    communityComposeTopicDraft = { mode: "add" };
    paintCommunityComposeTopics();
  });
  host.appendChild(add);
}

function communityComposeTopicField(value, index) {
  const field = document.createElement("input");
  field.type = "text";
  field.className = "community-topic-input";
  field.maxLength = 40;
  field.value = value || "";
  field.autocomplete = "off";
  field.spellcheck = false;
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    if (save) communityComposeSaveTopic(field.value, index);
    communityComposeTopicDraft = null;
    paintCommunityComposeTopics();
  };
  field.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
  field.addEventListener("blur", () => finish(!!String(field.value || "").trim()));
  queueMicrotask(() => field.focus());
  return field;
}

function syncCommunityCompose() {
  const input = document.getElementById("community-compose-input");
  const count = document.getElementById("community-compose-count");
  const submit = document.getElementById("community-compose-submit");
  const raw = input ? String(input.value || "") : "";
  const n = raw.length;
  const emoji = communityEmojiCount(raw);
  if (count) count.textContent = emoji > 50 ? (emoji + "/50 emoji") : (n + "/1500");
  const body = raw.trim();
  if (submit) submit.disabled = !body || n > 1500 || emoji > 50;
}

function submitCommunityPost() {
  if (typeof saveCommunityPost === "function") saveCommunityPost();
}

function communityRoomSearchText() {
  const input = document.getElementById("community-room-search");
  return input ? String(input.value || "").trim().toLowerCase() : "";
}

function communityRoomMatches(row, query) {
  if (!query) return true;
  const name = String((row && row.name) || "").toLowerCase();
  if (name.indexOf(query) >= 0) return true;
  const tags = (row && row.topics) || [];
  return tags.some((topic) => String(topic || "").toLowerCase().indexOf(query) >= 0);
}

function paintCommunityRooms() {
  const create = document.getElementById("community-room-create");
  if (create) create.disabled = true;
  const list = document.getElementById("community-rooms-list");
  if (!list) return;
  list.replaceChildren();
  const query = communityRoomSearchText();
  const rows = communityRooms.filter((row) => !row.hidden && communityRoomMatches(row, query));
  rows.forEach((row) => {
    const card = document.createElement("article");
    card.className = "community-room";
    const head = document.createElement("div");
    head.className = "community-room-head";
    const title = document.createElement("div");
    title.className = "community-room-title";
    const name = document.createElement("div");
    name.className = "community-room-name";
    name.textContent = row.name || "Room";
    const by = document.createElement("div");
    by.className = "community-room-by";
    by.textContent = "By: " + (row.handle || "user");
    title.appendChild(name);
    title.appendChild(by);
    const more = document.createElement("button");
    more.type = "button";
    more.className = "icon-btn community-room-more";
    more.title = "More";
    more.innerHTML = "&#8942;";
    more.addEventListener("click", (e) => openCommunityRoomMenu(e, row));
    head.appendChild(title);
    head.appendChild(more);
    const mid = document.createElement("div");
    mid.className = "community-room-mid";
    const about = document.createElement("div");
    about.className = "community-room-about" + (row.about ? "" : " is-empty");
    about.textContent = row.about || "No description.";
    mid.appendChild(about);
    const foot = document.createElement("div");
    foot.className = "community-room-foot";
    const pills = document.createElement("div");
    pills.className = "community-post-pills";
    (row.topics || []).forEach((topic) => {
      const pill = document.createElement("span");
      pill.className = "community-tag";
      pill.textContent = topic;
      pills.appendChild(pill);
    });
    const meta = document.createElement("div");
    meta.className = "community-room-meta";
    meta.textContent = (Number(row.n) || 0) + "/15";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = row.joined ? "ghost-btn" : "pill-btn";
    const full = row.n >= 15 && !row.joined;
    btn.disabled = full;
    btn.textContent = full ? "Full" : (row.joined ? "Leave" : "Join");
    btn.addEventListener("click", () => {
      if (row.joined) leaveCommunityRoom(row);
      else joinCommunityRoom(row);
    });
    foot.appendChild(pills);
    foot.appendChild(meta);
    foot.appendChild(btn);
    card.appendChild(head);
    card.appendChild(mid);
    card.appendChild(foot);
    list.appendChild(card);
  });
}

function communityRoomMine(row) {
  return !!(row && (row.owned || (myUsername && row.handle === myUsername)));
}

function joinCommunityRoom(row) {
  if (!row || row.joined || row.n >= 15) return;
  row.joined = true;
  row.n = Math.min(15, (Number(row.n) || 0) + 1);
  paintCommunityRooms();
  paintCommunityRoomNav();
}

function leaveCommunityRoom(row) {
  if (!row || !row.joined) return;
  row.joined = false;
  row.n = Math.max(0, (Number(row.n) || 1) - 1);
  if (communityOpenRoom === row.id) showCommunityRow("rooms");
  else {
    paintCommunityRooms();
    paintCommunityRoomNav();
  }
}

function closeCommunityRoom(row) {
  if (!row || !communityRoomMine(row)) return;
  const at = communityRooms.indexOf(row);
  if (at >= 0) communityRooms.splice(at, 1);
  if (communityOpenRoom === row.id) showCommunityRow("rooms");
  else {
    paintCommunityRooms();
    paintCommunityRoomNav();
  }
}

function openCommunityRoomMenu(e, row) {
  e.preventDefault();
  e.stopPropagation();
  if (typeof openContextMenu !== "function") return;
  const rows = [];
  if (communityRoomMine(row)) {
    rows.push({ label: "Edit", disabled: true });
    rows.push({
      label: "Close",
      danger: true,
      onSelect: () => closeCommunityRoom(row)
    });
  }
  rows.push({
    label: row.hidden ? "Unhide" : "Hide",
    onSelect: () => {
      row.hidden = !row.hidden;
      paintCommunityRooms();
    }
  });
  rows.push({ label: "Report", disabled: true, danger: true });
  openContextMenu(e.clientX, e.clientY, null, rows);
}

function paintCommunityRoomNav() {
  const host = document.getElementById("community-nav-rooms");
  if (!host) return;
  const joined = communityRooms.filter((row) => row.joined);
  host.replaceChildren();
  host.hidden = joined.length === 0;
  if (!joined.length) return;
  const label = document.createElement("div");
  label.className = "community-nav-label";
  label.textContent = "Rooms";
  host.appendChild(label);
  joined.forEach((row) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-item" + (communityOpenRoom === row.id ? " active" : "");
    btn.setAttribute("data-community-room", row.id);
    btn.textContent = row.name || "Room";
    host.appendChild(btn);
  });
}

function communityRoomLines(row) {
  return (row && row.lines) || [];
}

function communityRoomMembers() {
  return [{
    id: myUserId || "",
    username: myUsername || "you",
    display_name: myDisplayName || myUsername || "You",
    status: "online",
    mine: true
  }];
}

function communityRoomMessage(line) {
  const mine = !!line.mine;
  return {
    isMine: mine,
    username: mine ? (myUsername || "you") : (line.name || "user"),
    nickname: mine ? (myDisplayName || myUsername || "You") : (line.name || "user"),
    senderId: mine ? (myUserId || "") : "",
    content: line.body || "",
    time: line.at instanceof Date ? line.at : new Date(),
    chatKind: "party",
    reactions: [],
    edited: false
  };
}

function paintCommunityRoomMembers(row) {
  if (typeof showMemberListPanel !== "function" || typeof renderMemberList !== "function") return;
  memberListScope = "room";
  memberListScopeId = row ? row.id : null;
  memberList = row ? communityRoomMembers(row) : [];
  showMemberListPanel();
  renderMemberList();
}

function paintCommunityRoomChat() {
  const row = communityRooms.find((item) => item.id === communityOpenRoom);
  const title = document.getElementById("community-room-chat-title");
  const log = document.getElementById("community-room-chat-log");
  const body = log && log.parentElement;
  if (title) title.textContent = row ? (row.name || "Room") : "Room";
  if (log) {
    log.replaceChildren();
    if (row && typeof startNewCluster === "function") {
      communityRoomLines(row).forEach((line) => startNewCluster(log, communityRoomMessage(line)));
    }
  }
  if (body) body.scrollTop = body.scrollHeight;
  if (row) paintCommunityRoomMembers(row);
}

function openCommunityRoomChat(id) {
  const row = communityRooms.find((item) => item.id === id && item.joined);
  if (!row) return;
  communityOpenRoom = row.id;
  communityRow = "";
  document.querySelectorAll("#community-sidebar-view [data-community-row]").forEach((btn) => {
    btn.classList.remove("active");
  });
  ["community-pane-servers", "community-pane-posts", "community-pane-rooms", "community-pane-garterphone", "community-pane-settings"].forEach((paneId) => {
    const pane = document.getElementById(paneId);
    if (pane) pane.hidden = true;
  });
  const chat = document.getElementById("community-pane-room-chat");
  if (chat) chat.hidden = false;
  closeCommunityCompose();
  closeCommunityPost();
  paintCommunityRoomNav();
  paintCommunityRoomChat();
  const input = document.getElementById("community-room-chat-input");
  if (input) input.focus();
}

function sendCommunityRoomLine() {
  const row = communityRooms.find((item) => item.id === communityOpenRoom);
  const input = document.getElementById("community-room-chat-input");
  const body = input ? String(input.value || "").trim() : "";
  if (!row || !body) return;
  communityRoomLines(row).push({ mine: true, name: myUsername || "you", body: body, at: new Date() });
  if (input) input.value = "";
  paintCommunityRoomChat();
}

function createCommunityRoom() {
  return;
}

function paintCommunitySettings() {
  const host = document.getElementById("community-settings-body");
  if (!host) return;
  host.replaceChildren();
  host.appendChild(paintCommunityMuteBlock("Words", communityMuteWords, "words"));
  host.appendChild(paintCommunityMuteBlock("Topics", communityMuteTopics, "topics"));
}

function paintCommunityMuteBlock(title, rows, kind) {
  const block = document.createElement("section");
  block.className = "community-settings-block";
  const head = document.createElement("h3");
  head.className = "community-settings-title";
  head.textContent = title;
  const help = document.createElement("p");
  help.className = "community-list-help";
  help.textContent = kind === "topics"
    ? "Posts in these topics can be hidden or covered."
    : "Posts that contain these words can be hidden or covered.";
  const add = document.createElement("div");
  add.className = "community-pane-toolbar";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "community-search";
  input.maxLength = 40;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = kind === "topics" ? "Add a topic" : "Add a word";
  input.disabled = true;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pill-btn";
  btn.textContent = "Add";
  btn.disabled = true;
  btn.addEventListener("click", () => {
    const word = String(input.value || "").trim().toLowerCase();
    if (!word) return;
    if (rows.some((row) => row.word === word)) {
      input.value = "";
      return;
    }
    rows.push({ word: word, mode: "hide" });
    input.value = "";
    paintCommunitySettings();
  });
  add.appendChild(input);
  add.appendChild(btn);
  block.appendChild(head);
  block.appendChild(help);
  block.appendChild(add);
  rows.forEach((row, index) => {
    const line = document.createElement("div");
    line.className = "community-mute-row";
    const label = document.createElement("span");
    label.className = "community-tag is-on";
    label.textContent = row.word;
    const hideBtn = document.createElement("button");
    hideBtn.type = "button";
    hideBtn.className = "ghost-btn" + (row.mode === "hide" ? " is-active" : "");
    hideBtn.textContent = "Hide";
    hideBtn.addEventListener("click", () => {
      row.mode = "hide";
      paintCommunitySettings();
    });
    const coverBtn = document.createElement("button");
    coverBtn.type = "button";
    coverBtn.className = "ghost-btn" + (row.mode === "cover" ? " is-active" : "");
    coverBtn.textContent = "Cover";
    coverBtn.addEventListener("click", () => {
      row.mode = "cover";
      paintCommunitySettings();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost-btn";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      rows.splice(index, 1);
      paintCommunitySettings();
    });
    line.appendChild(label);
    line.appendChild(hideBtn);
    line.appendChild(coverBtn);
    line.appendChild(remove);
    block.appendChild(line);
  });
  return block;
}

function communityLetter(name) {
  if (typeof avatarLetter === "function") return avatarLetter(name);
  return String(name || "?").slice(0, 1).toUpperCase();
}

function applyCommunityBanner(el, row, opts) {
  if (!el) return;
  opts = opts || {};
  const url = (row && row.banner_url) || "";
  const color = (row && row.banner_color) || "";
  const still = typeof bannerStillOf === "function" ? bannerStillOf(row) : "";
  el.classList.toggle("has-banner", !!(url || color));
  if (typeof paintGifBannerStrip === "function") {
    paintGifBannerStrip(el, url, color, still, {
      kind: opts.kind || "finder",
      host: opts.host || el,
      open: !!opts.open
    });
  } else {
    el.style.backgroundImage = url ? "url(" + JSON.stringify(url) + ")" : "";
    el.style.backgroundColor = (!url && color) ? color : "";
  }
}

function paintCommunityFace(host, row, opts) {
  if (!host) return;
  opts = opts || {};
  host.replaceChildren();
  if (row && row.icon_url) {
    const img = document.createElement("img");
    img.alt = "";
    if (typeof bindAttentionGif === "function" && typeof isGifSrc === "function" && isGifSrc(row.icon_url)) {
      bindAttentionGif(img, {
        live: row.icon_url,
        still: typeof iconStillOf === "function" ? iconStillOf(row) : "",
        kind: opts.kind || "finder",
        host: opts.host || host,
        open: !!opts.open
      });
    } else {
      img.src = row.icon_url;
    }
    host.appendChild(img);
  } else {
    host.textContent = communityLetter(row && row.name);
  }
}

function communityJoinLink(row) {
  const origin = window.location.origin || "https://oneira.cc";
  if (row && row.url_slug) return origin + "/" + row.url_slug;
  if (row && row.id) return origin + "/server/" + encodeURIComponent(row.id);
  return origin + "/community";
}

function closeCommunityListingComments() {
  const thread = document.getElementById("community-listing-comments");
  if (thread) thread.hidden = true;
}

function closeCommunityListing() {
  closeCommunityListingComments();
  const overlay = document.getElementById("community-listing-overlay");
  if (overlay) overlay.hidden = true;
  communityListingRow = null;
  if (typeof refreshAttentionGifs === "function") refreshAttentionGifs();
}

function closeCommunitiesChrome() {
  closeCommunityApply();
  closeCommunityListing();
  closeCommunityFilterPicker();
  closeCommunityCompose();
  closeCommunityPost();
  communityOpenRoom = null;
  if (typeof hideMemberList === "function") hideMemberList();
  isCommunitiesOpen = false;
}

function paintCommunityTags(host, tags) {
  if (!host) return;
  host.replaceChildren();
  (tags || []).forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "community-tag";
    chip.textContent = tag;
    host.appendChild(chip);
  });
}

function paintCommunityAbout(host, row) {
  if (!host) return;
  const text = String((row && row.about) || "").trim();
  host.classList.toggle("is-empty", !text);
  host.textContent = text || "no description given...";
}

function communityVoteTip(row) {
  const up = Number(row && row.vote_up) || 0;
  const down = Number(row && row.vote_down) || 0;
  return up + " up · " + down + " down";
}

function applyCommunityVote(row, data) {
  if (!row || !data) return;
  row.votes = data.votes;
  row.vote_up = data.vote_up;
  row.vote_down = data.vote_down;
  row.my_vote = data.my_vote;
  document.querySelectorAll('[data-community-votes="' + row.id + '"]').forEach((host) => {
    paintCommunityVotes(host, row);
  });
}

async function voteCommunityServer(row, next) {
  if (!row || !row.id) return;
  const current = Number(row.my_vote) || 0;
  const vote = current === next ? 0 : next;
  try {
    const response = await fetch(`https://${serverAddress}/community_vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ server_id: row.id, vote: vote })
    });
    if (!response.ok) return;
    const data = await response.json();
    applyCommunityVote(row, data);
  } catch (e) {}
}

function paintCommunityVotes(host, row) {
  if (!host) return;
  host.replaceChildren();
  host.setAttribute("data-community-votes", row && row.id ? String(row.id) : "");
  const up = document.createElement("button");
  up.type = "button";
  up.className = "community-vote community-vote-up" + ((row && row.my_vote) > 0 ? " is-on" : "");
  up.textContent = "\u25B2";
  up.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    voteCommunityServer(row, 1);
  });
  const count = document.createElement("span");
  count.className = "community-vote-count";
  count.textContent = String(row && row.votes != null ? row.votes : 0);
  const down = document.createElement("button");
  down.type = "button";
  down.className = "community-vote community-vote-down" + ((row && row.my_vote) < 0 ? " is-on" : "");
  down.textContent = "\u25BC";
  down.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    voteCommunityServer(row, -1);
  });
  const tip = document.createElement("div");
  tip.className = "community-vote-tip";
  tip.textContent = communityVoteTip(row);
  host.appendChild(up);
  host.appendChild(count);
  host.appendChild(down);
  host.appendChild(tip);
}

function fillCommunityJoinButton(btn, row) {
  if (!btn || !row) return;
  btn.disabled = false;
  if (row.joined) {
    btn.textContent = "Open";
    return;
  }
  btn.textContent = row.applications_enabled ? "Apply" : "Join";
}

function communityTypeLabel(type) {
  if (typeof serverTypeLabel === "function") return serverTypeLabel(type);
  const row = COMMUNITY_TYPE_PILLS.find((item) => item[0] === String(type || "").toLowerCase());
  return row ? row[1] : String(type || "").replace(/-/g, " ");
}

function communityTimezoneLabel(zone) {
  if (typeof serverTimezoneLabel === "function") return serverTimezoneLabel(zone);
  return String(zone || "").trim();
}

function paintCommunityType(host, row) {
  if (!host) return;
  const label = communityTypeLabel(row && row.server_type);
  host.hidden = !label;
  host.textContent = label;
}

function paintCommunityExplicit(host, row) {
  if (!host) return;
  const on = !!(row && row.explicit);
  host.hidden = !on;
  host.textContent = on ? "EXPLICIT" : "";
}

function paintCommunityZone(host, row) {
  if (!host) return;
  const label = communityTimezoneLabel(row && row.timezone);
  host.hidden = !label;
  host.textContent = label;
}

function communityHasMarks(row) {
  return !!(communityTypeLabel(row && row.server_type) || (row && row.explicit));
}

function communityApplyQuestions(row) {
  const form = row && row.application_form && typeof row.application_form === "object"
    ? row.application_form
    : {};
  return Array.isArray(form.questions) ? form.questions : [];
}

function setCommunityApplyStatus(text) {
  const status = document.getElementById("community-apply-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function closeCommunityApply() {
  const overlay = document.getElementById("community-apply-overlay");
  if (overlay) overlay.hidden = true;
  communityApplyRow = null;
  setCommunityApplyStatus("");
}

function paintCommunityApply(row) {
  const host = document.getElementById("community-apply-questions");
  const title = document.getElementById("community-apply-title");
  if (title) title.textContent = row && row.name ? ("Apply to " + row.name) : "Apply";
  if (!host) return;
  host.replaceChildren();
  const questions = communityApplyQuestions(row);
  if (!questions.length) {
    const empty = document.createElement("p");
    empty.className = "server-settings-help";
    empty.textContent = "Submit an application to join this server.";
    host.appendChild(empty);
    return;
  }
  questions.forEach((question) => {
    const card = document.createElement("div");
    card.className = "community-apply-question";
    card.setAttribute("data-question-id", question.id || "");
    card.setAttribute("data-question-type", question.type || "");
    const prompt = document.createElement("div");
    prompt.className = "community-apply-prompt";
    prompt.textContent = question.prompt || "";
    card.appendChild(prompt);
    if (question.type === "multi" || question.type === "choice") {
      const options = document.createElement("div");
      options.className = "community-apply-options";
      (question.options || []).forEach((option) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "community-tag" + (question.type === "choice" ? " community-apply-choice" : "");
        btn.setAttribute("data-apply-option", option);
        btn.textContent = option;
        btn.addEventListener("click", () => {
          if (question.type === "choice") {
            options.querySelectorAll("[data-apply-option]").forEach((item) => item.classList.toggle("is-on", item === btn));
          } else {
            btn.classList.toggle("is-on");
          }
        });
        options.appendChild(btn);
      });
      card.appendChild(options);
    } else if (question.type === "signature") {
      const input = document.createElement("input");
      input.className = "server-settings-input";
      input.type = "text";
      input.setAttribute("data-apply-value", "");
      input.autocomplete = "off";
      input.spellcheck = false;
      input.placeholder = typeof myUsername === "string" ? myUsername : "Username";
      card.appendChild(input);
    } else {
      const area = document.createElement("textarea");
      area.className = "server-settings-input server-settings-textarea";
      area.rows = 5;
      area.setAttribute("data-apply-value", "");
      area.placeholder = "Write your answer";
      card.appendChild(area);
    }
    host.appendChild(card);
  });
}

function openCommunityApply(row) {
  if (!row || !row.id) return;
  communityApplyRow = row;
  setCommunityApplyStatus("");
  paintCommunityApply(row);
  const overlay = document.getElementById("community-apply-overlay");
  if (overlay) overlay.hidden = false;
}

function collectCommunityApplyAnswers() {
  const host = document.getElementById("community-apply-questions");
  const answers = [];
  if (!host) return answers;
  host.querySelectorAll(".community-apply-question").forEach((card) => {
    const id = card.getAttribute("data-question-id") || "";
    const type = card.getAttribute("data-question-type") || "";
    if (type === "multi") {
      const values = [];
      card.querySelectorAll("[data-apply-option].is-on").forEach((btn) => {
        values.push(btn.getAttribute("data-apply-option") || "");
      });
      answers.push({ id: id, values: values });
    } else if (type === "choice") {
      const on = card.querySelector("[data-apply-option].is-on");
      answers.push({ id: id, value: on ? (on.getAttribute("data-apply-option") || "") : "" });
    } else {
      const field = card.querySelector("[data-apply-value]");
      answers.push({ id: id, value: field ? String(field.value || "") : "" });
    }
  });
  return answers;
}

async function submitCommunityApply() {
  const row = communityApplyRow;
  if (!row || !row.id || communityJoinBusy) return;
  communityJoinBusy = true;
  setCommunityApplyStatus("");
  try {
    const response = await fetch(`https://${serverAddress}/apply_community`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ server_id: row.id, answers: collectCommunityApplyAnswers() })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not submit the application.");
    if (data.joined) {
      row.joined = true;
      closeCommunityApply();
      await enterCommunityServer(row);
      return;
    }
    closeCommunityApply();
    closeCommunityListing();
  } catch (e) {
    setCommunityApplyStatus(e.message || "Could not submit the application.");
  } finally {
    communityJoinBusy = false;
  }
}

function openCommunityListing(row) {
  communityListingRow = row || null;
  const overlay = document.getElementById("community-listing-overlay");
  const header = document.getElementById("community-listing-header");
  const title = document.getElementById("community-listing-title");
  const online = document.getElementById("community-listing-online");
  const icon = document.getElementById("community-listing-icon");
  const about = document.getElementById("community-listing-about");
  const join = document.getElementById("community-listing-join");
  if (!overlay || !row) return;
  if (title) title.textContent = row.name;
  if (online) online.textContent = String(row.online || 0) + " online";
  paintCommunityFace(icon, row, { kind: "finder", open: true, host: header });
  paintCommunityType(document.getElementById("community-listing-type"), row);
  paintCommunityExplicit(document.getElementById("community-listing-explicit"), row);
  paintCommunityZone(document.getElementById("community-listing-zone"), row);
  paintCommunityAbout(about, row);
  applyCommunityBanner(header, row, { kind: "finder", open: true, host: header });
  if (header) header.classList.toggle("has-marks", communityHasMarks(row));
  paintCommunityTags(document.getElementById("community-listing-tags"), row.tags);
  paintCommunityVotes(document.getElementById("community-listing-votes"), row);
  fillCommunityJoinButton(join, row);
  closeCommunityListingComments();
  overlay.hidden = false;
  if (typeof refreshAttentionGifs === "function") refreshAttentionGifs();
}

function openCommunityCardMenu(e, row) {
  if (typeof openContextMenu !== "function") return;
  openContextMenu(e.clientX, e.clientY, {
    image: row.icon_url || "",
    avatarText: communityLetter(row.name),
    title: row.name,
    subtitle: String(row.online || 0) + " online"
  }, [
    {
      label: "Copy join link",
      onSelect: () => {
        const text = communityJoinLink(row);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
      }
    },
    { label: "Report", disabled: true, danger: true }
  ]);
}

async function enterCommunityServer(row) {
  if (!row || !row.id) return;
  closeCommunityListing();
  if (typeof loadServers === "function") await loadServers();
  if (typeof openServer === "function") await openServer(row.id);
}

async function joinCommunityServer(row) {
  if (!row || !row.id || communityJoinBusy) return;
  if (row.joined) {
    await enterCommunityServer(row);
    return;
  }
  if (row.applications_enabled) {
    openCommunityApply(row);
    return;
  }
  communityJoinBusy = true;
  try {
    const response = await fetch(`https://${serverAddress}/join_community`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ server_id: row.id })
    });
    if (!response.ok) return;
    row.joined = true;
    await enterCommunityServer(row);
  } finally {
    communityJoinBusy = false;
  }
}

function paintCommunityCard(row) {
  const card = document.createElement("div");
  card.className = "community-card";
  const head = document.createElement("div");
  head.className = "community-card-head";
  applyCommunityBanner(head, row, { kind: "finder", host: card });
  head.classList.toggle("has-marks", communityHasMarks(row));
  const face = document.createElement("div");
  face.className = "community-card-face";
  const icon = document.createElement("div");
  icon.className = "avatar-dot";
  paintCommunityFace(icon, row, { kind: "finder", host: card });
  const names = document.createElement("div");
  names.className = "community-card-names";
  const name = document.createElement("div");
  name.className = "community-card-name";
  name.textContent = row.name;
  const online = document.createElement("div");
  online.className = "community-card-online";
  online.textContent = String(row.online || 0) + " online";
  names.appendChild(name);
  names.appendChild(online);
  face.appendChild(icon);
  face.appendChild(names);
  const marks = document.createElement("div");
  marks.className = "community-card-marks";
  const type = document.createElement("span");
  type.className = "community-type";
  paintCommunityType(type, row);
  marks.appendChild(type);
  const explicit = document.createElement("span");
  explicit.className = "community-explicit";
  paintCommunityExplicit(explicit, row);
  marks.appendChild(explicit);
  const zone = document.createElement("span");
  zone.className = "community-zone";
  paintCommunityZone(zone, row);
  const tools = document.createElement("div");
  tools.className = "community-card-tools";
  const votes = document.createElement("div");
  votes.className = "community-card-votes";
  paintCommunityVotes(votes, row);
  const more = document.createElement("button");
  more.type = "button";
  more.className = "community-card-more";
  more.textContent = "\u22EE";
  more.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCommunityCardMenu(e, row);
  });
  tools.appendChild(votes);
  tools.appendChild(more);
  tools.addEventListener("click", (e) => e.stopPropagation());
  head.appendChild(face);
  head.appendChild(tools);
  head.appendChild(marks);
  head.appendChild(zone);
  const body = document.createElement("div");
  body.className = "community-card-body";
  const tags = document.createElement("div");
  tags.className = "community-card-tags";
  paintCommunityTags(tags, row.tags);
  const about = document.createElement("div");
  about.className = "community-card-about";
  paintCommunityAbout(about, row);
  body.appendChild(tags);
  body.appendChild(about);
  const foot = document.createElement("div");
  foot.className = "community-card-foot";
  const join = document.createElement("button");
  join.type = "button";
  join.className = "pill-btn community-card-join";
  fillCommunityJoinButton(join, row);
  join.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    joinCommunityServer(row);
  });
  foot.appendChild(join);
  foot.addEventListener("click", (e) => e.stopPropagation());
  card.appendChild(head);
  card.appendChild(body);
  card.appendChild(foot);
  card.addEventListener("click", () => openCommunityListing(row));
  card.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openCommunityCardMenu(e, row);
  });
  return card;
}

function paintCommunityPager() {
  const host = document.getElementById("community-pager");
  if (!host) return;
  host.replaceChildren();
  if (communityPages <= 1) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "ghost-btn";
  prev.textContent = "Previous";
  prev.disabled = communityPage <= 1;
  prev.addEventListener("click", () => {
    if (communityPage <= 1) return;
    loadCommunityPage(communityPage - 1);
  });
  const page = document.createElement("span");
  page.className = "community-pager-page";
  page.textContent = String(communityPage);
  const next = document.createElement("button");
  next.type = "button";
  next.className = "ghost-btn";
  next.textContent = "Next";
  next.disabled = communityPage >= communityPages;
  next.addEventListener("click", () => {
    if (communityPage >= communityPages) return;
    loadCommunityPage(communityPage + 1);
  });
  host.appendChild(prev);
  host.appendChild(page);
  host.appendChild(next);
}

function paintCommunityGrid(rows) {
  const grid = document.getElementById("community-grid");
  if (!grid) return;
  grid.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty-note community-empty";
    empty.textContent = communityQuery ? "No servers match." : "No servers listed yet.";
    grid.appendChild(empty);
  } else {
    rows.forEach((row) => grid.appendChild(paintCommunityCard(row)));
  }
  const end = document.getElementById("community-list-end");
  if (end) end.hidden = communityPages > 1 && communityPage < communityPages;
  paintCommunityPager();
}

async function loadCommunityPage(page) {
  if (!isCommunitiesOpen) return;
  communityPage = Math.max(1, Number(page) || 1);
  const token = ++communityFetchGen;
  const qs = new URLSearchParams();
  qs.set("page", String(communityPage));
  if (communityQuery) qs.set("q", communityQuery);
  if (communityFilter.type) qs.set("type", communityFilter.type);
  if (communityFilter.tags.length) qs.set("tags", communityFilter.tags.join(","));
  if (communityFilter.timezone) qs.set("timezone", communityFilter.timezone);
  let data;
  try {
    const response = await fetch(`https://${serverAddress}/community_servers?${qs.toString()}`, { credentials: "include" });
    if (!response.ok) return;
    data = await response.json();
  } catch (e) {
    return;
  }
  if (token !== communityFetchGen || !isCommunitiesOpen) return;
  communityPage = Number(data.page) || 1;
  communityPages = Number(data.pages) || 0;
  communityFacets = data.facets && typeof data.facets === "object"
    ? { tags: data.facets.tags || [], timezones: data.facets.timezones || [] }
    : { tags: [], timezones: [] };
  paintCommunityGrid(Array.isArray(data.servers) ? data.servers : []);
  paintCommunityFilterPicks();
  paintCommunityFilterPicker();
}

async function openCommunities() {
  if (typeof leaveDocIfNeeded === "function" && !(await leaveDocIfNeeded())) return;
  if (typeof closeProfileChrome === "function" && !closeProfileChrome()) return;
  if (typeof closeMiniProfile === "function") closeMiniProfile();
  if (typeof hideDocsChrome === "function") hideDocsChrome();
  beginPlace({
    settings: true,
    serverSettings: true,
    channelSettings: true,
    sidebar: "community",
    view: "community",
    topbar: "communities",
    hideMembers: true
  });
  isCommunitiesOpen = true;
  currentServerId = null;
  currentServerOwnerId = null;
  currentChannelId = null;
  if (typeof setAppAddress === "function") setAppAddress("/community");
  showCommunityRow("servers");
  const search = document.getElementById("community-search");
  if (search && search.value !== communityQuery) search.value = communityQuery;
  await loadCommunityPage(communityPage);
}

document.getElementById("community-listing-close").addEventListener("click", () => closeCommunityListing());
document.getElementById("community-listing-cancel").addEventListener("click", () => closeCommunityListing());
document.getElementById("community-listing-join").addEventListener("click", () => {
  if (communityListingRow) joinCommunityServer(communityListingRow);
});
document.getElementById("community-listing-comments-btn").addEventListener("click", (e) => {
  e.preventDefault();
  const thread = document.getElementById("community-listing-comments");
  if (thread) thread.hidden = !thread.hidden;
});
document.getElementById("community-listing-comment-send").addEventListener("click", (e) => {
  e.preventDefault();
});
document.getElementById("community-listing-comment-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") e.preventDefault();
});
document.getElementById("community-listing-overlay").addEventListener("click", (e) => {
  if (e.target && e.target.id === "community-listing-overlay") closeCommunityListing();
});
document.getElementById("community-apply-close").addEventListener("click", () => closeCommunityApply());
document.getElementById("community-apply-cancel").addEventListener("click", () => closeCommunityApply());
document.getElementById("community-apply-submit").addEventListener("click", () => submitCommunityApply());
document.getElementById("community-apply-overlay").addEventListener("click", (e) => {
  if (e.target && e.target.id === "community-apply-overlay") closeCommunityApply();
});
function communityFilterMax(kind) {
  if (kind === "tags") return 5;
  return 1;
}

function communityFilterCount(kind) {
  if (kind === "tags") return communityFilter.tags.length;
  if (kind === "type") return communityFilter.type ? 1 : 0;
  return communityFilter.timezone ? 1 : 0;
}

function communityFilterHas(kind, value) {
  if (kind === "tags") return communityFilter.tags.indexOf(value) >= 0;
  if (kind === "type") return communityFilter.type === value;
  return communityFilter.timezone === value;
}

function closeCommunityFilterPicker() {
  const picker = document.getElementById("community-filter-picker");
  if (picker) picker.hidden = true;
  communityPickerKind = "";
}

function toggleCommunityFilterValue(kind, value) {
  if (!value) return;
  if (kind === "tags") {
    const at = communityFilter.tags.indexOf(value);
    if (at >= 0) communityFilter.tags.splice(at, 1);
    else if (communityFilter.tags.length < 5) communityFilter.tags.push(value);
  } else if (kind === "type") {
    communityFilter.type = communityFilter.type === value ? "" : value;
  } else {
    communityFilter.timezone = communityFilter.timezone === value ? "" : value;
  }
  paintCommunityFilterPicks();
  paintCommunityFilterPicker();
  loadCommunityPage(1);
}

function communityFilterChoices(kind, needle) {
  const q = String(needle || "").trim().toLowerCase();
  let rows = [];
  if (kind === "type") {
    rows = COMMUNITY_TYPE_PILLS.map((item) => ({ id: item[0], label: item[1] }));
  } else if (kind === "tags") {
    rows = (communityFacets.tags || []).map((tag) => ({ id: tag, label: tag }));
  } else {
    const seen = {};
    (communityFacets.timezones || []).forEach((zone) => {
      seen[zone] = true;
      rows.push({ id: zone, label: communityTimezoneLabel(zone) || zone });
    });
    if (typeof SERVER_TIMEZONE_OPTIONS !== "undefined") {
      SERVER_TIMEZONE_OPTIONS.forEach((item) => {
        if (seen[item[1]]) return;
        rows.push({ id: item[1], label: item[2] });
      });
    }
  }
  if (!q) return rows.slice(0, 12);
  return rows.filter((row) => {
    return row.label.toLowerCase().indexOf(q) >= 0 || String(row.id).toLowerCase().indexOf(q) >= 0;
  }).slice(0, 12);
}

function paintCommunityFilterPicks() {
  const typeHost = document.getElementById("community-filter-type-picks");
  const tagHost = document.getElementById("community-filter-tag-picks");
  const zoneHost = document.getElementById("community-filter-zone-picks");
  const fill = (host, kind, items) => {
    if (!host) return;
    host.replaceChildren();
    items.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "community-tag is-on";
      chip.textContent = item.label;
      chip.addEventListener("click", () => toggleCommunityFilterValue(kind, item.id));
      host.appendChild(chip);
    });
  };
  fill(typeHost, "type", communityFilter.type
    ? [{ id: communityFilter.type, label: communityTypeLabel(communityFilter.type) || communityFilter.type }]
    : []);
  fill(tagHost, "tags", communityFilter.tags.map((tag) => ({ id: tag, label: tag })));
  fill(zoneHost, "timezone", communityFilter.timezone
    ? [{ id: communityFilter.timezone, label: communityTimezoneLabel(communityFilter.timezone) || communityFilter.timezone }]
    : []);
}

function paintCommunityFilterPicker() {
  const host = document.getElementById("community-filter-picker-pills");
  const count = document.getElementById("community-filter-picker-count");
  const search = document.getElementById("community-filter-picker-search");
  if (count) count.textContent = communityFilterCount(communityPickerKind) + "/" + communityFilterMax(communityPickerKind);
  if (!host || !communityPickerKind) return;
  host.replaceChildren();
  communityFilterChoices(communityPickerKind, search ? search.value : "").forEach((item) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "community-tag" + (communityFilterHas(communityPickerKind, item.id) ? " is-on" : "");
    chip.textContent = item.label;
    chip.addEventListener("click", () => toggleCommunityFilterValue(communityPickerKind, item.id));
    host.appendChild(chip);
  });
}

function openCommunityFilterPicker(kind, anchor) {
  const picker = document.getElementById("community-filter-picker");
  const search = document.getElementById("community-filter-picker-search");
  if (!picker || !anchor) return;
  communityPickerKind = kind;
  if (search) search.value = "";
  paintCommunityFilterPicker();
  picker.hidden = false;
  const box = anchor.getBoundingClientRect();
  const width = picker.offsetWidth || 280;
  let left = box.left;
  if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12);
  picker.style.position = "fixed";
  picker.style.top = Math.round(box.bottom + 6) + "px";
  picker.style.left = Math.round(left) + "px";
  if (search) search.focus();
}

function paintCommunityFilterPanel() {
  const panel = document.getElementById("community-filter-panel");
  const btn = document.getElementById("community-filter-btn");
  if (!panel) return;
  const open = !panel.hidden;
  if (btn) btn.classList.toggle("is-active", open);
  if (!open) closeCommunityFilterPicker();
  paintCommunityFilterPicks();
}

document.getElementById("community-filter-btn").addEventListener("click", () => {
  const panel = document.getElementById("community-filter-panel");
  if (!panel) return;
  panel.hidden = !panel.hidden;
  paintCommunityFilterPanel();
});
document.querySelectorAll("[data-filter-add]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const kind = btn.getAttribute("data-filter-add");
    if (communityPickerKind === kind && !document.getElementById("community-filter-picker").hidden) {
      closeCommunityFilterPicker();
      return;
    }
    openCommunityFilterPicker(kind, btn);
  });
});
const communityPickerSearch = document.getElementById("community-filter-picker-search");
if (communityPickerSearch) {
  communityPickerSearch.addEventListener("input", () => paintCommunityFilterPicker());
}
document.addEventListener("mousedown", (e) => {
  const picker = document.getElementById("community-filter-picker");
  if (!picker || picker.hidden) return;
  if (picker.contains(e.target) || (e.target.closest && e.target.closest("[data-filter-add]"))) return;
  closeCommunityFilterPicker();
});
document.getElementById("community-search").addEventListener("input", () => {
  const search = document.getElementById("community-search");
  communityQuery = search ? String(search.value || "").trim() : "";
  window.clearTimeout(communitySearchTimer);
  communitySearchTimer = window.setTimeout(() => loadCommunityPage(1), 250);
});
document.getElementById("community-sidebar-view").addEventListener("click", (e) => {
  const host = document.getElementById("community-sidebar-view");
  if (!host || !host.contains(e.target)) return;
  const roomBtn = e.target.closest("[data-community-room]");
  if (roomBtn) {
    openCommunityRoomChat(roomBtn.getAttribute("data-community-room"));
    return;
  }
  const btn = e.target.closest("[data-community-row]");
  if (!btn) return;
  const id = btn.getAttribute("data-community-row");
  if (id) showCommunityRow(id);
});
document.getElementById("community-create-post").addEventListener("click", () => openCommunityCompose());
document.getElementById("community-compose-cancel").addEventListener("click", () => closeCommunityCompose());
document.getElementById("community-compose-submit").addEventListener("click", () => submitCommunityPost());
document.getElementById("community-compose-overlay").addEventListener("mousedown", (e) => {
  if (e.target && e.target.id === "community-compose-overlay") closeCommunityCompose();
});
const communityComposeInput = document.getElementById("community-compose-input");
if (communityComposeInput) {
  communityComposeInput.addEventListener("input", () => {
    syncCommunityCompose();
    if (typeof autoGrowPostBodyInput === "function") autoGrowPostBodyInput(communityComposeInput);
  });
}
paintCommunityComposeTopics();
document.getElementById("community-post-overlay").addEventListener("mousedown", (e) => {
  if (e.target && e.target.id === "community-post-overlay") closeCommunityPost();
});
document.getElementById("community-post-comment-send").addEventListener("click", () => submitCommunityPostComment());
const communityPostCommentInput = document.getElementById("community-post-comment-input");
if (communityPostCommentInput) {
  communityPostCommentInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    submitCommunityPostComment();
  });
}
document.getElementById("community-room-create").addEventListener("click", () => createCommunityRoom());
document.getElementById("community-room-chat-send").addEventListener("click", () => sendCommunityRoomLine());
const communityRoomChatInput = document.getElementById("community-room-chat-input");
if (communityRoomChatInput) {
  communityRoomChatInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    sendCommunityRoomLine();
  });
}
const communityRoomSearch = document.getElementById("community-room-search");
if (communityRoomSearch) {
  communityRoomSearch.addEventListener("input", () => paintCommunityRooms());
}
const communityPostSearch = document.getElementById("community-post-search");
if (communityPostSearch) {
  communityPostSearch.addEventListener("input", () => paintCommunityPosts());
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const postView = document.getElementById("community-post-overlay");
  if (postView && !postView.hidden) {
    closeCommunityPost();
    return;
  }
  const compose = document.getElementById("community-compose-overlay");
  if (compose && !compose.hidden) {
    closeCommunityCompose();
    return;
  }
  const apply = document.getElementById("community-apply-overlay");
  if (apply && !apply.hidden) {
    closeCommunityApply();
    return;
  }
  const picker = document.getElementById("community-filter-picker");
  if (picker && !picker.hidden) {
    closeCommunityFilterPicker();
    return;
  }
  const overlay = document.getElementById("community-listing-overlay");
  if (overlay && !overlay.hidden) closeCommunityListing();
});
