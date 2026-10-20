let isCommunitiesOpen = false;
let communityListingRow = null;
let communityPage = 1;
let communityPages = 0;
let communityQuery = "";
let communityFetchGen = 0;
let communitySearchTimer = 0;
let communityJoinBusy = false;

function communityLetter(name) {
  if (typeof avatarLetter === "function") return avatarLetter(name);
  return String(name || "?").slice(0, 1).toUpperCase();
}

function applyCommunityBanner(el, row) {
  if (!el) return;
  const url = (row && row.banner_url) || "";
  const color = (row && row.banner_color) || "";
  el.classList.toggle("has-banner", !!(url || color));
  el.style.backgroundImage = url ? "url(" + JSON.stringify(url) + ")" : "";
  el.style.backgroundColor = (!url && color) ? color : "";
}

function paintCommunityFace(host, row) {
  if (!host) return;
  host.replaceChildren();
  if (row && row.icon_url) {
    const img = document.createElement("img");
    img.src = row.icon_url;
    img.alt = "";
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
  btn.textContent = row.joined ? "Open" : "Join";
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
  paintCommunityFace(icon, row);
  if (about) about.textContent = row.about || "";
  applyCommunityBanner(header, row);
  paintCommunityTags(document.getElementById("community-listing-tags"), row.tags);
  paintCommunityVotes(document.getElementById("community-listing-votes"), row);
  fillCommunityJoinButton(join, row);
  closeCommunityListingComments();
  overlay.hidden = false;
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
  applyCommunityBanner(head, row);
  const face = document.createElement("div");
  face.className = "community-card-face";
  const icon = document.createElement("div");
  icon.className = "avatar-dot";
  paintCommunityFace(icon, row);
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
  const body = document.createElement("div");
  body.className = "community-card-body";
  const tags = document.createElement("div");
  tags.className = "community-card-tags";
  paintCommunityTags(tags, row.tags);
  const about = document.createElement("div");
  about.className = "community-card-about";
  about.textContent = row.about || "";
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

function paintCommunityRelated() {
  const host = document.getElementById("community-related");
  if (!host) return;
  host.replaceChildren();
  host.hidden = true;
}

function paintCommunityPager() {
  const host = document.getElementById("community-pager");
  if (!host) return;
  host.replaceChildren();
  if (communityPages < 1) {
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
  paintCommunityRelated();
  paintCommunityPager();
}

async function loadCommunityPage(page) {
  if (!isCommunitiesOpen) return;
  communityPage = Math.max(1, Number(page) || 1);
  const token = ++communityFetchGen;
  const qs = new URLSearchParams();
  qs.set("page", String(communityPage));
  if (communityQuery) qs.set("q", communityQuery);
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
  paintCommunityGrid(Array.isArray(data.servers) ? data.servers : []);
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
document.getElementById("community-search").addEventListener("input", () => {
  const search = document.getElementById("community-search");
  communityQuery = search ? String(search.value || "").trim() : "";
  window.clearTimeout(communitySearchTimer);
  communitySearchTimer = window.setTimeout(() => loadCommunityPage(1), 250);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const overlay = document.getElementById("community-listing-overlay");
  if (overlay && !overlay.hidden) closeCommunityListing();
});
