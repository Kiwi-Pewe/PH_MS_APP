let newsCal = new Date();
newsCal.setDate(1);
let newsRow = "announcements";
let newsPosts = [];
let newsQuery = "";
let newsSearchTimer = 0;
let newsUnread = 0;
let newsLoaded = false;
let newsKofiCard = null;

const NEWS_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function closeNewsChrome() {
  closeNewsDonate();
}

function closeNewsDonate() {
  const overlay = document.getElementById("news-donate-overlay");
  if (overlay) overlay.hidden = true;
}

function fillNewsDonateCard(disclaimer, href) {
  const note = document.getElementById("news-donate-disclaimer");
  const text = String(disclaimer || "").trim();
  if (note) note.textContent = text || "Disclaimer will be set later.";
  const go = document.getElementById("news-donate-continue");
  if (!go) return;
  const url = String(href || "").trim();
  go.dataset.href = url;
  go.disabled = !(url && text);
}

function loadNewsKofiCard() {
  return fetch("https://" + serverAddress + "/kofi/card", { credentials: "include" }).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    newsKofiCard = data || null;
    return newsKofiCard;
  }).catch(() => null);
}

function openNewsDonate() {
  const overlay = document.getElementById("news-donate-overlay");
  if (!overlay) return;
  const card = newsKofiCard || {};
  fillNewsDonateCard(card.disclaimer, card.page_url);
  overlay.hidden = false;
  loadNewsKofiCard().then((data) => {
    if (overlay.hidden) return;
    fillNewsDonateCard(data && data.disclaimer, data && data.page_url);
  });
}

function newsViewOpen() {
  const view = document.getElementById("view-news");
  return !!(view && view.classList.contains("active"));
}

function setNewsBadge(count) {
  newsUnread = Math.max(0, Number(count) || 0);
  const el = document.getElementById("news-tab-badge");
  if (!el) return;
  el.textContent = newsUnread > 99 ? "99+" : String(newsUnread);
  el.hidden = newsUnread < 1;
}

function loadNewsBadge() {
  fetch("https://" + serverAddress + "/news/badge", { credentials: "include" }).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    if (!data) return;
    setNewsBadge(data.unread);
  }).catch(() => {});
}

function markNewsSeen() {
  setNewsBadge(0);
  fetch("https://" + serverAddress + "/news/seen", {
    method: "POST",
    credentials: "include"
  }).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    if (data) setNewsBadge(data.unread);
  }).catch(() => {});
}

function newsWhen(raw) {
  if (typeof parseUtcTimestamp === "function" && typeof formatClusterTime === "function") {
    return formatClusterTime(parseUtcTimestamp(raw));
  }
  return raw || "";
}

function paintNewsPostCard(row) {
  const card = document.createElement("article");
  card.className = "announce-post";
  card.dataset.postId = String(row.id);
  const top = document.createElement("div");
  top.className = "announce-post-top";
  const avatar = document.createElement("div");
  avatar.className = "cluster-avatar";
  if (typeof paintUserFace === "function") paintUserFace(avatar, row, { name: row.display_name || row.username, userId: row.sender_id });
  else avatar.textContent = (typeof avatarLetter === "function" ? avatarLetter(row.display_name || row.username) : (row.username || "?").charAt(0).toUpperCase());
  const meta = document.createElement("div");
  meta.className = "announce-post-meta";
  const name = document.createElement("div");
  name.className = "announce-post-name";
  name.textContent = row.display_name || row.username || "Oneira";
  meta.appendChild(name);
  top.appendChild(avatar);
  top.appendChild(meta);
  const date = document.createElement("div");
  date.className = "announce-post-date";
  date.textContent = newsWhen(row.created_at);
  const head = document.createElement("div");
  head.className = "announce-post-head";
  const headline = document.createElement("div");
  headline.className = "announce-post-headline";
  head.appendChild(top);
  head.appendChild(headline);
  head.appendChild(date);
  const mid = document.createElement("div");
  mid.className = "announce-post-mid";
  const content = document.createElement("div");
  content.className = "announce-post-content";
  const divider = document.createElement("div");
  divider.className = "announce-divider";
  const reactionsRow = document.createElement("div");
  reactionsRow.className = "announce-reactions-row is-later";
  const reactions = document.createElement("div");
  reactions.className = "announce-reactions";
  const add = document.createElement("button");
  add.type = "button";
  add.className = "announce-add-reaction-btn";
  add.title = "Add Reaction";
  add.textContent = "+";
  add.disabled = true;
  reactions.appendChild(add);
  reactionsRow.appendChild(reactions);
  mid.appendChild(content);
  mid.appendChild(divider);
  mid.appendChild(reactionsRow);
  const foot = document.createElement("div");
  foot.className = "announce-post-foot is-later";
  const commentsRow = document.createElement("div");
  commentsRow.className = "announce-comments-row";
  const commentsBtn = document.createElement("button");
  commentsBtn.type = "button";
  commentsBtn.className = "announce-comments-btn";
  commentsBtn.textContent = (Number(row.comment_count) || 0) + " comments";
  commentsBtn.disabled = true;
  commentsRow.appendChild(commentsBtn);
  foot.appendChild(commentsRow);
  card.appendChild(head);
  card.appendChild(mid);
  card.appendChild(foot);
  if (typeof fillAnnouncePostContent === "function") fillAnnouncePostContent(card, row);
  else {
    const titleRow = document.createElement("div");
    titleRow.className = "announce-post-title-row";
    const title = document.createElement("div");
    title.className = "announce-post-title";
    title.textContent = row.title || "";
    titleRow.appendChild(title);
    if (row.edited) {
      const tag = document.createElement("span");
      tag.className = "edited-tag";
      tag.textContent = "edited";
      titleRow.appendChild(tag);
    }
    headline.appendChild(titleRow);
    if (row.body) {
      const body = document.createElement("div");
      body.className = "announce-post-body";
      body.textContent = row.body;
      content.appendChild(body);
    }
  }
  return card;
}

function paintNewsPostList() {
  const host = document.getElementById("news-posts");
  if (!host) return;
  host.replaceChildren();
  newsPosts.forEach((row) => host.appendChild(paintNewsPostCard(row)));
  const end = document.createElement("div");
  end.className = "announce-end-marker";
  if (!newsPosts.length && newsQuery) end.textContent = "No announcements matched that search.";
  else end.textContent = "You're up to date!";
  host.appendChild(end);
}

function prependNewsPost(row) {
  if (!row || !row.id) return;
  if (newsPosts.some((item) => Number(item.id) === Number(row.id))) return;
  newsPosts.unshift(row);
  if (!newsViewOpen() || newsRow !== "announcements") return;
  const host = document.getElementById("news-posts");
  if (!host) return;
  host.insertBefore(paintNewsPostCard(row), host.firstChild);
  const end = host.querySelector(".announce-end-marker");
  if (end) end.textContent = "You're up to date!";
}

function loadNewsPosts() {
  const params = new URLSearchParams();
  if (newsQuery) params.set("q", newsQuery);
  const qs = params.toString();
  fetch("https://" + serverAddress + "/news/posts" + (qs ? "?" + qs : ""), { credentials: "include" }).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    newsPosts = (data && data.posts) || [];
    newsLoaded = true;
    paintNewsPostList();
  }).catch(() => {
    const host = document.getElementById("news-posts");
    if (!host) return;
    host.replaceChildren();
    const end = document.createElement("div");
    end.className = "announce-end-marker";
    end.textContent = "Could not load announcements.";
    host.appendChild(end);
  });
}

function applyIncomingNewsPost(row) {
  if (!row) return;
  prependNewsPost(row);
  if (newsViewOpen()) {
    markNewsSeen();
    return;
  }
  setNewsBadge(newsUnread + 1);
  if (typeof playOneiraAlert === "function") playOneiraAlert();
}

function paintNewsMonth() {
  const host = document.getElementById("news-calendar-grid");
  const label = document.getElementById("news-calendar-label");
  if (label) label.textContent = NEWS_MONTHS[newsCal.getMonth()] + " " + newsCal.getFullYear();
  if (!host) return;
  host.replaceChildren();
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((name) => {
    const head = document.createElement("div");
    head.className = "calendar-dow";
    head.textContent = name;
    host.appendChild(head);
  });
  const first = new Date(newsCal.getFullYear(), newsCal.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const today = new Date();
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    if (day.getMonth() !== newsCal.getMonth()) cell.classList.add("is-outside");
    if (day.getFullYear() === today.getFullYear() && day.getMonth() === today.getMonth() && day.getDate() === today.getDate()) {
      cell.classList.add("is-today");
    }
    const top = document.createElement("div");
    top.className = "calendar-day-top";
    const number = document.createElement("div");
    number.className = "calendar-day-num";
    number.textContent = String(day.getDate());
    top.appendChild(number);
    cell.appendChild(top);
    host.appendChild(cell);
  }
}

function showNewsRow(id) {
  if (id === "donate") {
    openNewsDonate();
    return;
  }
  newsRow = id === "events" ? "events" : "announcements";
  document.querySelectorAll("#news-sidebar-view [data-news-row]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-news-row") === newsRow);
    if (btn.getAttribute("data-news-row") === "donate") btn.classList.remove("active");
  });
  const announce = document.getElementById("news-pane-announcements");
  const events = document.getElementById("news-pane-events");
  if (announce) announce.hidden = newsRow !== "announcements";
  if (events) events.hidden = newsRow !== "events";
  if (newsRow === "events") paintNewsMonth();
  if (newsRow === "announcements") loadNewsPosts();
}

async function openNews() {
  if (typeof leaveDocIfNeeded === "function" && !(await leaveDocIfNeeded())) return;
  if (typeof closeProfileChrome === "function" && !closeProfileChrome()) return;
  if (typeof closeMiniProfile === "function") closeMiniProfile();
  if (typeof hideDocsChrome === "function") hideDocsChrome();
  beginPlace({
    settings: true,
    serverSettings: true,
    channelSettings: true,
    sidebar: "news",
    view: "news",
    topbar: "news",
    hideMembers: true
  });
  currentServerId = null;
  currentServerOwnerId = null;
  currentChannelId = null;
  if (typeof setAppAddress === "function") setAppAddress("/news");
  showNewsRow("announcements");
  markNewsSeen();
  loadNewsPosts();
}

document.getElementById("news-sidebar-view").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-news-row]");
  if (!btn) return;
  showNewsRow(btn.getAttribute("data-news-row"));
});

const newsSearch = document.getElementById("news-search-input");
if (newsSearch) {
  newsSearch.addEventListener("input", () => {
    newsQuery = newsSearch.value || "";
    window.clearTimeout(newsSearchTimer);
    newsSearchTimer = window.setTimeout(() => loadNewsPosts(), 250);
  });
}

const newsPrev = document.getElementById("news-calendar-prev");
const newsNext = document.getElementById("news-calendar-next");
if (newsPrev) {
  newsPrev.addEventListener("click", () => {
    newsCal.setMonth(newsCal.getMonth() - 1);
    paintNewsMonth();
  });
}
if (newsNext) {
  newsNext.addEventListener("click", () => {
    newsCal.setMonth(newsCal.getMonth() + 1);
    paintNewsMonth();
  });
}

const newsDonateOverlay = document.getElementById("news-donate-overlay");
if (newsDonateOverlay) {
  newsDonateOverlay.addEventListener("click", (e) => {
    if (e.target && e.target.id === "news-donate-overlay") closeNewsDonate();
  });
}
const newsDonateCancel = document.getElementById("news-donate-cancel");
if (newsDonateCancel) newsDonateCancel.addEventListener("click", closeNewsDonate);
const newsDonateContinue = document.getElementById("news-donate-continue");
if (newsDonateContinue) {
  newsDonateContinue.addEventListener("click", () => {
    const href = newsDonateContinue.dataset.href || "";
    if (href) window.open(href, "_blank", "noopener,noreferrer");
    closeNewsDonate();
  });
}
