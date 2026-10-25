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
let communityDraftPosts = [];
let communityRoomSeq = 7;
let communityMuteWords = [
  { word: "spoilers", mode: "hide" },
  { word: "nsfw", mode: "cover" },
  { word: "politics", mode: "hide" }
];
let communityMuteTopics = [
  { word: "horror", mode: "cover" },
  { word: "gambling", mode: "hide" }
];

const COMMUNITY_PLACEHOLDER_ROOMS = [
  { id: "r1", name: "Late Night Vent", topics: ["vent", "advice"], n: 12, joined: false },
  { id: "r2", name: "Pixel Art Drop", topics: ["art"], n: 3, joined: false },
  { id: "r3", name: "Music Share", topics: ["music"], n: 15, joined: false },
  { id: "r4", name: "Co-op LFG", topics: ["games"], n: 8, joined: false },
  { id: "r5", name: "Study With Me", topics: ["study"], n: 1, joined: false },
  { id: "r6", name: "After Dark Chat", topics: ["nsfw"], n: 14, joined: false }
];
let communityRooms = COMMUNITY_PLACEHOLDER_ROOMS.map((row) => Object.assign({}, row, { topics: row.topics.slice() }));

const COMMUNITY_PLACEHOLDER_POSTS = [
  { code: "k7m2q9w4xp", name: "You", handle: "you", mine: true, color: "#5865f2", time: "2m", body: "checking how a short post sits at the top of Following.", replies: 0, reposts: 0, likes: 2, lenses: ["following", "explore"] },
  { code: "aj2f7saw06", name: "You", handle: "you", mine: true, color: "#5865f2", time: "18m", body: "longer one for wrap testing.\n\ncomposer lives on Following, Timeline, and Explore. one post, three lenses. permalink shape is oneira.cc/posts/name/code.", hashtags: ["oneira"], topics: ["design"], replies: 4, reposts: 1, likes: 11, lenses: ["following", "timeline", "explore"] },
  { code: "n4c8h2v0qm", name: "You", handle: "you", mine: true, color: "#5865f2", time: "yesterday", body: "image post from me so we can line up the media box with the name row.", media: true, replies: 1, reposts: 0, likes: 6, lenses: ["following", "explore"] },
  { code: "b3p6t1x8kd", name: "Mira", handle: "mira", color: "#eb459e", time: "4m", body: "gm", replies: 12, reposts: 2, likes: 48, lenses: ["following", "explore"] },
  { code: "c9w5r7j2la", name: "Nova", handle: "nova", color: "#57f287", time: "9m", body: "new mix is mostly night drives and rain samples. if you have a track that belongs next to that, drop it.\n\nstill looking for something with a heavy low end and almost no vocal.", hashtags: ["music", "nowplaying"], topics: ["music"], replies: 7, reposts: 3, likes: 29, lenses: ["following", "timeline", "explore"] },
  { code: "d2h8m4q6ye", name: "Reed", handle: "reed", color: "#fee75c", time: "21m", body: "anyone up for a short co-op later. two slots. voice optional.", hashtags: ["lfg"], topics: ["games"], replies: 15, reposts: 0, likes: 8, lenses: ["timeline", "explore"] },
  { code: "e6k1n9s3wf", name: "Ash", handle: "ash", color: "#ed4245", time: "36m", body: "the sky from the roof an hour ago.", media: true, replies: 3, reposts: 6, likes: 41, lenses: ["following", "explore"] },
  { code: "f8t4p2c7ub", name: "Jules", handle: "jules", color: "#9b59b6", time: "51m", body: "explicit cover test. click the grey bar to open the text, click again to close it.", explicit: true, replies: 2, reposts: 0, likes: 5, lenses: ["timeline", "explore"] },
  { code: "g1y5v8h3zd", name: "Kite", handle: "kite", color: "#3498db", time: "1h", body: "this layout is growing on me.", replies: 0, reposts: 14, likes: 122, lenses: ["following", "explore"] },
  { code: "h7a3l6r9qi", name: "Wren", handle: "wren", color: "#1abc9c", time: "1h", body: "commission slot open this week. characters only, no mechs.", media: true, hashtags: ["art", "commissions"], topics: ["art"], replies: 9, reposts: 4, likes: 67, lenses: ["following", "timeline", "explore"] },
  { code: "i4s9d2m5ok", name: "Sol", handle: "sol", color: "#e67e22", time: "2h", body: "explore-only stranger post. should not show on Following if we slice this right.", replies: 1, reposts: 0, likes: 3, lenses: ["explore"] },
  { code: "j8c6w1t4pn", name: "Piper", handle: "piper", color: "#2ecc71", time: "2h", body: "quick sauce:\n- butter\n- garlic\n- tomato paste\n- pasta water until it looks wrong, then it looks right", topics: ["food"], replies: 6, reposts: 8, likes: 54, lenses: ["following", "timeline", "explore"] },
  { code: "k2n7f5b8xg", name: "Vex", handle: "vex", color: "#8e44ad", time: "3h", body: "do not read this if you have not finished the new episode.", explicit: true, topics: ["horror"], replies: 11, reposts: 2, likes: 19, lenses: ["timeline", "explore"] },
  { code: "l5q3y9h1vc", name: "Mira", handle: "mira", color: "#eb459e", time: "3h", body: "wait, we can actually sit and talk in here without a server?", replies: 28, reposts: 5, likes: 73, lenses: ["following", "explore"] },
  { code: "m9p4k7s2wd", name: "Nova", handle: "nova", color: "#57f287", time: "4h", body: "hashtag pile for spacing.", hashtags: ["night", "rain", "drive", "mix"], replies: 0, reposts: 1, likes: 9, lenses: ["following", "timeline", "explore"] },
  { code: "n6t8a1r5je", name: "Reed", handle: "reed", color: "#fee75c", time: "5h", body: "long wrap. the feed column should hold a paragraph without shoving the action row off the card or clipping the permalink. if this line keeps going it is because we need to see five-plus lines of body before a scroll appears on the composer, not on the post itself. posts can be long. the card grows.", topics: ["design"], replies: 2, reposts: 0, likes: 4, lenses: ["timeline", "explore"] },
  { code: "o3h2c9v6lf", name: "Ash", handle: "ash", color: "#ed4245", time: "6h", body: "need a second monitor recommendation that is not a curved gaming slab.", replies: 17, reposts: 1, likes: 13, lenses: ["following", "explore"] },
  { code: "p7w5m4d8qb", name: "Jules", handle: "jules", color: "#9b59b6", time: "7h", body: "one line from someone you do not follow.", replies: 0, reposts: 0, likes: 1, lenses: ["explore"] },
  { code: "q1z6s3n9tk", name: "Kite", handle: "kite", color: "#3498db", time: "8h", body: "photo behind an explicit cover.", media: true, explicit: true, topics: ["nsfw"], replies: 4, reposts: 2, likes: 16, lenses: ["timeline", "explore"] },
  { code: "r8e4b7y2uh", name: "Wren", handle: "wren", color: "#1abc9c", time: "9h", body: "saving this layout before it changes.", replies: 0, reposts: 0, likes: 7, lenses: ["following", "explore"] },
  { code: "s5l9p1c6wi", name: "Sol", handle: "sol", color: "#e67e22", time: "11h", body: "library until midnight. headphones on, chat off.", topics: ["study"], replies: 3, reposts: 0, likes: 22, lenses: ["timeline", "explore"] },
  { code: "t2k8f4m7xj", name: "Piper", handle: "piper", color: "#2ecc71", time: "14h", body: "unpopular: most \"cozy\" games are just menus with extra steps and a fireplace loop. still playing them.", hashtags: ["games"], replies: 31, reposts: 9, likes: 88, lenses: ["explore"] },
  { code: "u9d3w6q1yk", name: "Vex", handle: "vex", color: "#8e44ad", time: "16h", body: "two tags, no topic, following slice.", hashtags: ["late", "chat"], replies: 1, reposts: 0, likes: 4, lenses: ["following", "explore"] },
  { code: "v4n7h2s8zl", name: "Mira", handle: "mira", color: "#eb459e", time: "yesterday", body: "if you are new here: Rooms are walk-in. Servers are the real communities. do not mix those up.", topics: ["advice"], replies: 8, reposts: 12, likes: 95, lenses: ["timeline", "explore"] },
  { code: "w6c1r5t9am", name: "Nova", handle: "nova", color: "#57f287", time: "yesterday", body: "dropped a longer clip. still stitching the last two minutes.", media: true, hashtags: ["wip"], topics: ["music"], replies: 5, reposts: 3, likes: 33, lenses: ["following", "timeline", "explore"] }
];

function communityPostCode() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
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

function showCommunityRow(id) {
  if (!COMMUNITY_ROW_PANES[id]) id = "servers";
  communityRow = id;
  if (typeof closeCommunityFilterPicker === "function") closeCommunityFilterPicker();
  document.querySelectorAll("#community-nav [data-community-row]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-community-row") === id);
  });
  const pane = COMMUNITY_ROW_PANES[id];
  const paneServers = document.getElementById("community-pane-servers");
  const panePosts = document.getElementById("community-pane-posts");
  const paneRooms = document.getElementById("community-pane-rooms");
  const paneGarter = document.getElementById("community-pane-garterphone");
  const paneSettings = document.getElementById("community-pane-settings");
  if (paneServers) paneServers.hidden = pane !== "servers";
  if (panePosts) panePosts.hidden = pane !== "posts";
  if (paneRooms) paneRooms.hidden = pane !== "rooms";
  if (paneGarter) paneGarter.hidden = pane !== "garterphone";
  if (paneSettings) paneSettings.hidden = pane !== "settings";
  if (pane === "posts") paintCommunityPosts();
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
  const list = document.getElementById("community-post-list");
  if (!list) return;
  list.replaceChildren();
  const rows = communityDraftPosts.concat(COMMUNITY_PLACEHOLDER_POSTS).filter((post) => {
    return !post.lenses || post.lenses.indexOf(communityRow) >= 0;
  });
  rows.forEach((post) => list.appendChild(paintCommunityPostCard(post)));
}

function paintCommunityPostCard(post) {
  const mine = !!post.mine;
  const name = mine ? (myDisplayName || myUsername || post.name || "You") : (post.name || "User");
  const handle = mine ? (myUsername || post.handle || "you") : (post.handle || "user");
  const card = document.createElement("article");
  card.className = "community-post";
  const face = document.createElement("div");
  face.className = "community-post-face" + (mine ? " is-mine" : "");
  face.style.background = post.color || "#5865f2";
  face.textContent = communityLetter(name);
  if (mine && myUserId && typeof openMiniProfile === "function") {
    face.addEventListener("click", (e) => {
      e.stopPropagation();
      openMiniProfile(myUserId, face);
    });
  }
  const main = document.createElement("div");
  main.className = "community-post-main";
  const by = document.createElement("div");
  by.className = "community-post-by";
  const nameEl = document.createElement("span");
  nameEl.className = "community-post-name" + (mine ? " is-mine" : "");
  nameEl.textContent = name;
  if (mine && myUserId && typeof openMiniProfile === "function") {
    nameEl.addEventListener("click", (e) => {
      e.stopPropagation();
      openMiniProfile(myUserId, nameEl);
    });
  }
  const handleEl = document.createElement("span");
  handleEl.className = "community-post-handle";
  handleEl.textContent = "@" + handle;
  const timeEl = document.createElement("span");
  timeEl.className = "community-post-time";
  timeEl.textContent = post.time || "";
  by.appendChild(nameEl);
  by.appendChild(handleEl);
  if (post.time) by.appendChild(timeEl);
  const body = document.createElement("div");
  body.className = "community-post-body";
  if (post.explicit) {
    const cover = document.createElement("span");
    cover.className = "md-explicit";
    cover.textContent = post.body || "";
    cover.addEventListener("click", (e) => {
      e.stopPropagation();
      cover.classList.toggle("is-open");
    });
    body.appendChild(cover);
  } else {
    body.textContent = post.body || "";
  }
  main.appendChild(by);
  main.appendChild(body);
  if (post.media) {
    const media = document.createElement("div");
    media.className = "community-post-media" + (post.explicit ? " md-explicit-media" : "");
    const label = document.createElement("span");
    if (post.explicit) label.className = "md-explicit-media-label";
    label.textContent = post.explicit ? "Explicit image" : "Image";
    media.appendChild(label);
    if (post.explicit) {
      media.addEventListener("click", (e) => {
        e.stopPropagation();
        media.classList.toggle("is-open");
      });
    }
    main.appendChild(media);
  }
  const pills = [].concat(post.topics || [], (post.hashtags || []).map((tag) => "#" + tag));
  if (pills.length) {
    const row = document.createElement("div");
    row.className = "community-post-pills";
    pills.forEach((label) => {
      const pill = document.createElement("span");
      pill.className = "community-tag";
      pill.textContent = label;
      row.appendChild(pill);
    });
    main.appendChild(row);
  }
  const link = document.createElement("div");
  link.className = "community-post-link";
  link.textContent = "oneira.cc/posts/" + handle + "/" + (post.code || communityPostCode());
  main.appendChild(link);
  const actions = document.createElement("div");
  actions.className = "community-post-actions";
  [
    ["replies", "Reply", post.replies],
    ["reposts", "Repost", post.reposts],
    ["likes", "Like", post.likes]
  ].forEach((item) => {
    const key = item[0];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "community-post-act";
    const paint = () => {
      const n = Number(post[key]) || 0;
      btn.textContent = item[1] + (n ? " " + n : "");
    };
    paint();
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      post[key] = (Number(post[key]) || 0) + 1;
      paint();
    });
    actions.appendChild(btn);
  });
  main.appendChild(actions);
  card.appendChild(face);
  card.appendChild(main);
  return card;
}

function submitCommunityPost() {
  const input = document.getElementById("community-post-input");
  const body = input ? String(input.value || "").trim() : "";
  if (!body) return;
  communityDraftPosts.unshift({
    code: communityPostCode(),
    mine: true,
    color: "#5865f2",
    time: "now",
    body: body.slice(0, 1500),
    replies: 0,
    reposts: 0,
    likes: 0,
    lenses: COMMUNITY_POST_ROWS.slice()
  });
  if (input) input.value = "";
  syncCommunityPostCount();
  paintCommunityPosts();
}

function syncCommunityPostCount() {
  const input = document.getElementById("community-post-input");
  const count = document.getElementById("community-post-count");
  if (!count) return;
  const n = input ? String(input.value || "").length : 0;
  count.textContent = n + "/1500";
}

function paintCommunityRooms() {
  const list = document.getElementById("community-rooms-list");
  if (!list) return;
  list.replaceChildren();
  communityRooms.forEach((row) => {
    const card = document.createElement("article");
    card.className = "community-room";
    const main = document.createElement("div");
    main.className = "community-room-main";
    const name = document.createElement("div");
    name.className = "community-room-name";
    name.textContent = row.name;
    const meta = document.createElement("div");
    meta.className = "community-room-meta";
    const bits = [];
    if (row.topics && row.topics.length) bits.push(row.topics.join(" · "));
    bits.push(row.n + "/15");
    meta.textContent = bits.join(" · ");
    main.appendChild(name);
    if (row.topics && row.topics.length) {
      const pills = document.createElement("div");
      pills.className = "community-post-pills";
      row.topics.forEach((topic) => {
        const pill = document.createElement("span");
        pill.className = "community-tag";
        pill.textContent = topic;
        pills.appendChild(pill);
      });
      main.appendChild(pills);
    }
    main.appendChild(meta);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = row.joined ? "ghost-btn" : "pill-btn";
    const full = row.n >= 15 && !row.joined;
    btn.disabled = full;
    btn.textContent = full ? "Full" : (row.joined ? "Leave" : "Join");
    btn.addEventListener("click", () => {
      if (row.joined) {
        row.joined = false;
        row.n = Math.max(0, (Number(row.n) || 1) - 1);
      } else {
        if (row.n >= 15) return;
        row.joined = true;
        row.n = Math.min(15, (Number(row.n) || 0) + 1);
      }
      paintCommunityRooms();
    });
    card.appendChild(main);
    card.appendChild(btn);
    list.appendChild(card);
  });
}

function createCommunityRoom() {
  const input = document.getElementById("community-room-name");
  const name = input ? String(input.value || "").trim() : "";
  if (!name) return;
  communityRoomSeq += 1;
  communityRooms.unshift({
    id: "r" + communityRoomSeq,
    name: name.slice(0, 80),
    topics: [],
    n: 1,
    joined: true,
    owned: true
  });
  if (input) input.value = "";
  paintCommunityRooms();
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
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pill-btn";
  btn.textContent = "Add";
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
document.getElementById("community-nav").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-community-row]");
  if (!btn || !document.getElementById("community-nav").contains(btn)) return;
  const id = btn.getAttribute("data-community-row");
  if (id) showCommunityRow(id);
});
const communityPostInput = document.getElementById("community-post-input");
if (communityPostInput) {
  communityPostInput.addEventListener("input", () => syncCommunityPostCount());
}
document.getElementById("community-post-submit").addEventListener("click", () => submitCommunityPost());
document.getElementById("community-room-create").addEventListener("click", () => createCommunityRoom());
const communityRoomName = document.getElementById("community-room-name");
if (communityRoomName) {
  communityRoomName.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    createCommunityRoom();
  });
}
document.getElementById("community-garter-start").addEventListener("click", () => {
  const status = document.getElementById("community-garter-status");
  if (status) status.textContent = "No one is available right now.";
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
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
