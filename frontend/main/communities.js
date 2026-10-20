let isCommunitiesOpen = false;
let communityListingRow = null;

const COMMUNITY_LOOK_TAGS = ["community", "chill", "gaming", "music", "art", "hangout", "friends", "roleplay"];

const COMMUNITY_LOOK_ROWS = [
  { name: "Northwatch", about: "A quiet hall for long talks, voice nights, and people who actually stick around.", online: 42, votes: 18, tags: ["community", "chill"], banner: "#3b2a55" },
  { name: "Saltmarsh Table", about: "Weekly games, one-shots, and a board for finding a group.", online: 11, votes: 7, tags: ["roleplay", "hangout"], banner: "" },
  { name: "Violet Radio", about: "Share tracks, swap playlists, and sit in a listening room.", online: 27, votes: 22, tags: ["music", "chill"], banner: "#1f3a4c" },
  { name: "Ink & Paper", about: "Writers and illustrators posting work and giving notes.", online: 9, votes: 4, tags: ["art", "community"], banner: "" },
  { name: "Third Shift", about: "Late-night hangout for people whose clock does not match the rest of the map.", online: 33, votes: 15, tags: ["hangout", "friends"], banner: "#4a2c2a" },
  { name: "Harbor Lights", about: "Small server for friends who already know each other and still want a public door.", online: 6, votes: 2, tags: ["friends", "chill"], banner: "" },
  { name: "Queue Up", about: "Find a match, warm up, and keep the lobby open after the game.", online: 58, votes: 31, tags: ["gaming", "hangout"], banner: "#243a28" },
  { name: "Glasshouse", about: "Plants, photos, and slow chat. No rush.", online: 14, votes: 9, tags: ["art", "chill"], banner: "#2e3f2f" },
  { name: "The Cut", about: "Film nights and short reviews. Bring something you actually finished.", online: 19, votes: 11, tags: ["community", "art"], banner: "" },
  { name: "Low Tide", about: "A smaller room for people who prefer fewer pings and longer threads.", online: 5, votes: 3, tags: ["chill", "community"], banner: "#2a3348" },
  { name: "Forge Row", about: "Makers posting builds, failures, and the next attempt.", online: 21, votes: 13, tags: ["art", "community"], banner: "" },
  { name: "Night Market", about: "Trading, showcases, and a stall for whatever you are working on.", online: 37, votes: 16, tags: ["community", "gaming"], banner: "#3a2f1f" },
  { name: "Redline", about: "Racing, setups, and a voice channel that stays open on weekends.", online: 16, votes: 8, tags: ["gaming", "friends"], banner: "" },
  { name: "Stillwater", about: "Study with someone else in the room. Cameras optional.", online: 24, votes: 14, tags: ["chill", "hangout"], banner: "#1e2f3a" },
  { name: "Copper Kettle", about: "Cooking notes, terrible experiments, and the one recipe that worked.", online: 8, votes: 5, tags: ["community", "friends"], banner: "" },
  { name: "Eastgate", about: "Local hangout with a public listing so new people can walk in.", online: 12, votes: 6, tags: ["hangout", "community"], banner: "#33283d" },
  { name: "Parchment", about: "Tabletop prep, maps, and a place to park your campaign notes.", online: 17, votes: 10, tags: ["roleplay", "community"], banner: "" },
  { name: "Signal Hill", about: "Radio drama, voice acting, and people who like hearing a story out loud.", online: 7, votes: 4, tags: ["music", "art"], banner: "#2c2438" },
  { name: "Open Floor", about: "Dance clips, practice rooms, and people who will watch your run.", online: 29, votes: 19, tags: ["art", "hangout"], banner: "" },
  { name: "Ashwood", about: "Horror nights and a spoiler wall. Read the pins.", online: 13, votes: 8, tags: ["community", "chill"], banner: "#3a1f1f" },
  { name: "Blue Spar", about: "Sparring, VODs, and a board for challenge nights.", online: 22, votes: 12, tags: ["gaming", "community"], banner: "" },
  { name: "Lantern Yard", about: "Seasonal events, small giveaways, and a porch that stays lit.", online: 31, votes: 17, tags: ["friends", "hangout"], banner: "#3a321c" },
  { name: "Driftwood", about: "Travel notes and photos from people who are rarely in the same timezone.", online: 10, votes: 5, tags: ["community", "friends"], banner: "" },
  { name: "The Annex", about: "Overflow room for a bigger circle. Same people, quieter channels.", online: 4, votes: 1, tags: ["chill", "friends"], banner: "#263040" }
];

function communityLetter(name) {
  if (typeof avatarLetter === "function") return avatarLetter(name);
  return String(name || "?").slice(0, 1).toUpperCase();
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
}

function closeCommunitiesChrome() {
  closeCommunityListing();
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

function paintCommunityVotes(host, votes) {
  if (!host) return;
  host.replaceChildren();
  const up = document.createElement("button");
  up.type = "button";
  up.className = "community-vote community-vote-up";
  up.disabled = true;
  up.textContent = "\u25B2";
  const count = document.createElement("span");
  count.className = "community-vote-count";
  count.textContent = String(votes || 0);
  const down = document.createElement("button");
  down.type = "button";
  down.className = "community-vote community-vote-down";
  down.disabled = true;
  down.textContent = "\u25BC";
  host.appendChild(up);
  host.appendChild(count);
  host.appendChild(down);
}

function openCommunityListing(row) {
  communityListingRow = row || null;
  const overlay = document.getElementById("community-listing-overlay");
  const header = document.getElementById("community-listing-header");
  const title = document.getElementById("community-listing-title");
  const online = document.getElementById("community-listing-online");
  const icon = document.getElementById("community-listing-icon");
  const about = document.getElementById("community-listing-about");
  if (!overlay || !row) return;
  if (title) title.textContent = row.name;
  if (online) online.textContent = String(row.online) + " online";
  if (icon) {
    icon.replaceChildren();
    icon.textContent = communityLetter(row.name);
  }
  if (about) about.textContent = row.about;
  if (header) {
    header.classList.toggle("has-banner", !!row.banner);
    header.style.background = row.banner || "";
  }
  paintCommunityTags(document.getElementById("community-listing-tags"), row.tags);
  paintCommunityVotes(document.getElementById("community-listing-votes"), row.votes);
  closeCommunityListingComments();
  overlay.hidden = false;
}

function openCommunityCardMenu(e, row) {
  if (typeof openContextMenu !== "function") return;
  openContextMenu(e.clientX, e.clientY, {
    avatarText: communityLetter(row.name),
    title: row.name,
    subtitle: String(row.online) + " online"
  }, [
    { label: "Copy join link", disabled: true },
    { label: "Report", disabled: true, danger: true }
  ]);
}

function paintCommunityCard(row) {
  const card = document.createElement("div");
  card.className = "community-card";
  const head = document.createElement("div");
  head.className = "community-card-head" + (row.banner ? " has-banner" : "");
  if (row.banner) head.style.background = row.banner;
  const face = document.createElement("div");
  face.className = "community-card-face";
  const icon = document.createElement("div");
  icon.className = "avatar-dot";
  icon.textContent = communityLetter(row.name);
  const names = document.createElement("div");
  names.className = "community-card-names";
  const name = document.createElement("div");
  name.className = "community-card-name";
  name.textContent = row.name;
  const online = document.createElement("div");
  online.className = "community-card-online";
  online.textContent = String(row.online) + " online";
  names.appendChild(name);
  names.appendChild(online);
  face.appendChild(icon);
  face.appendChild(names);
  const tools = document.createElement("div");
  tools.className = "community-card-tools";
  const votes = document.createElement("div");
  votes.className = "community-card-votes";
  paintCommunityVotes(votes, row.votes);
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
  const body = document.createElement("div");
  body.className = "community-card-body";
  const tags = document.createElement("div");
  tags.className = "community-card-tags";
  paintCommunityTags(tags, row.tags);
  const about = document.createElement("div");
  about.className = "community-card-about";
  about.textContent = row.about;
  body.appendChild(tags);
  body.appendChild(about);
  const foot = document.createElement("div");
  foot.className = "community-card-foot";
  const join = document.createElement("button");
  join.type = "button";
  join.className = "pill-btn community-card-join";
  join.textContent = "Join";
  join.disabled = true;
  join.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
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

function paintCommunityRelated() {
  const host = document.getElementById("community-related");
  if (!host) return;
  host.replaceChildren();
  COMMUNITY_LOOK_TAGS.forEach((tag) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "community-tag is-later";
    chip.disabled = true;
    chip.textContent = tag;
    host.appendChild(chip);
  });
}

function paintCommunityPager() {
  const host = document.getElementById("community-pager");
  if (!host) return;
  host.replaceChildren();
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "ghost-btn";
  prev.textContent = "Previous";
  prev.disabled = true;
  const page = document.createElement("span");
  page.className = "community-pager-page";
  page.textContent = "1";
  const next = document.createElement("button");
  next.type = "button";
  next.className = "ghost-btn";
  next.textContent = "Next";
  next.disabled = true;
  host.appendChild(prev);
  host.appendChild(page);
  host.appendChild(next);
}

function paintCommunityGrid() {
  const grid = document.getElementById("community-grid");
  if (!grid) return;
  grid.replaceChildren();
  COMMUNITY_LOOK_ROWS.forEach((row) => grid.appendChild(paintCommunityCard(row)));
  paintCommunityRelated();
  paintCommunityPager();
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
  paintCommunityGrid();
}

document.getElementById("community-listing-close").addEventListener("click", () => closeCommunityListing());
document.getElementById("community-listing-cancel").addEventListener("click", () => closeCommunityListing());
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
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const overlay = document.getElementById("community-listing-overlay");
  if (overlay && !overlay.hidden) closeCommunityListing();
});
