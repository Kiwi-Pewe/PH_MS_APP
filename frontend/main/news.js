let newsCal = new Date();
newsCal.setDate(1);
let newsRow = "announcements";
let newsPosts = [];
let newsEvents = [];
let newsQuery = "";
let newsSearchTimer = 0;
let newsUnread = 0;
let newsLoaded = false;
let newsKofiCard = null;
let newsOverlaysBound = false;
let newsDeleteId = 0;
let newsEditRow = null;
let newsDetailEvent = null;
let newsDetailEditing = false;
let newsDetailColor = "orange";
let newsSaving = false;

const NEWS_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const NEWS_EVENT_COLORS = {
  red: "#ed4245",
  orange: "#f26522",
  yellow: "#fee75c",
  green: "#23a559"
};

function newsParseWhen(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const iso = /Z|[+-]\d{2}:?\d{2}$/.test(text) ? text.replace(" ", "T") : text.replace(" ", "T") + "Z";
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? null : when;
}

function newsDayKey(raw) {
  const when = newsParseWhen(raw);
  if (!when) return "";
  return when.getFullYear() + "-" + String(when.getMonth() + 1).padStart(2, "0") + "-" + String(when.getDate()).padStart(2, "0");
}

function newsLocalDayKey(day) {
  return day.getFullYear() + "-" + String(day.getMonth() + 1).padStart(2, "0") + "-" + String(day.getDate()).padStart(2, "0");
}

function newsEventHex(color) {
  return NEWS_EVENT_COLORS[color] || NEWS_EVENT_COLORS.orange;
}

function closeNewsChrome() {
  closeNewsDonate();
  closeNewsEventDetail();
  closeNewsEdit();
  closeNewsDelete();
  if (typeof closeAnnounceComments === "function" && String(typeof currentAnnounceCommentsPostId !== "undefined" ? currentAnnounceCommentsPostId : "").indexOf("news:") === 0) {
    closeAnnounceComments();
  }
}

function closeNewsDonate() {
  const overlay = document.getElementById("news-donate-overlay");
  if (overlay) overlay.hidden = true;
}

function fillNewsMarkdown(el, text) {
  if (!el) return;
  el.replaceChildren();
  const source = String(text || "");
  if (!source) return;
  if (typeof mdAppend === "function") mdAppend(el, source);
  else if (typeof fillMentionText === "function") fillMentionText(el, source, {}, {}, { rich: true });
  else el.textContent = source;
}

function fillNewsDonateCard(disclaimer, href) {
  const note = document.getElementById("news-donate-disclaimer");
  const text = String(disclaimer || "").trim();
  if (note) {
    if (text) fillNewsMarkdown(note, text);
    else note.textContent = "Disclaimer will be set later.";
  }
  const go = document.getElementById("news-donate-continue");
  if (!go) return;
  const url = String(href || "").trim();
  go.dataset.href = url;
  go.disabled = !(url && text);
}

function paintNewsBroadcastBanner(message) {
  const host = document.getElementById("news-broadcast");
  if (!host) return;
  const text = String(message || "").trim();
  host.replaceChildren();
  if (!text) return;
  fillNewsMarkdown(host, text);
}

function loadNewsBroadcast() {
  fetch("https://" + serverAddress + "/news/broadcast", { credentials: "include" }).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    paintNewsBroadcastBanner(data && data.message);
  }).catch(() => {});
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
  reactionsRow.className = "announce-reactions-row";
  const reactions = document.createElement("div");
  reactions.className = "announce-reactions";
  const add = document.createElement("button");
  add.type = "button";
  add.className = "announce-add-reaction-btn";
  add.title = "Add Reaction";
  add.textContent = "+";
  add.addEventListener("click", (e) => {
    e.stopPropagation();
    if (typeof openReactionPicker === "function") openReactionPicker(newsReactionTarget(row), e.clientX, e.clientY);
  });
  reactions.appendChild(add);
  fillNewsReactions(reactions, row);
  reactionsRow.appendChild(reactions);
  mid.appendChild(content);
  mid.appendChild(divider);
  mid.appendChild(reactionsRow);
  const foot = document.createElement("div");
  foot.className = "announce-post-foot";
  const commentsRow = document.createElement("div");
  commentsRow.className = "announce-comments-row";
  const commentsBtn = document.createElement("button");
  commentsBtn.type = "button";
  commentsBtn.className = "announce-comments-btn";
  commentsBtn.textContent = (Number(row.comment_count) || 0) + " comments";
  commentsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (typeof toggleCommentThread === "function") toggleCommentThread(row.id, "news");
  });
  commentsRow.appendChild(commentsBtn);
  if (typeof commentThreadElements !== "undefined" && typeof commentThreadKey === "function") {
    const key = commentThreadKey(row.id, "news");
    const els = commentThreadElements[key] || (commentThreadElements[key] = {});
    els.btnEl = commentsBtn;
  }
  foot.appendChild(commentsRow);
  card.appendChild(head);
  card.appendChild(mid);
  card.appendChild(foot);
  const titleRow = document.createElement("div");
  titleRow.className = "announce-post-title-row";
  const title = document.createElement("div");
  title.className = "announce-post-title";
  title.style.textAlign = row.title_align || "left";
  fillNewsMarkdown(title, row.title || "");
  titleRow.appendChild(title);
  if (row.edited) {
    const tag = document.createElement("span");
    tag.className = "edited-tag";
    tag.textContent = "edited";
    titleRow.appendChild(tag);
  }
  headline.appendChild(titleRow);
  if (row.event && row.event.name) {
    const chip = document.createElement("div");
    chip.className = "news-event-chip is-" + (row.event.color || "orange");
    chip.style.background = newsEventHex(row.event.color);
    chip.textContent = row.event.name;
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      openNewsEventDetail(row.event);
    });
    headline.appendChild(chip);
  }
  if (row.body) {
    const body = document.createElement("div");
    body.className = "announce-post-body";
    body.style.textAlign = row.body_align || "left";
    fillNewsMarkdown(body, row.body);
    content.appendChild(body);
  }
  const media = typeof buildPostMedia === "function" ? buildPostMedia(row.attachment) : null;
  if (media) content.appendChild(media);
  card.addEventListener("contextmenu", (e) => showNewsPostContextMenu(e, row));
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
  row.reactions = typeof applyReactionMe === "function" ? applyReactionMe(row.reactions || []) : (row.reactions || []);
  newsPosts.unshift(row);
  if (row.event && row.event.starts_at && !newsEvents.some((item) => Number(item.id) === Number(row.id))) {
    newsEvents.push(row.event);
    if (newsRow === "events") paintNewsMonth();
  }
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
    newsPosts = ((data && data.posts) || []).map((row) => {
      row.reactions = typeof applyReactionMe === "function" ? applyReactionMe(row.reactions || []) : (row.reactions || []);
      return row;
    });
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

function applyIncomingNewsUpdate(row) {
  if (!row || !row.id) return;
  row.reactions = typeof applyReactionMe === "function" ? applyReactionMe(row.reactions || []) : (row.reactions || []);
  const i = newsPosts.findIndex((item) => Number(item.id) === Number(row.id));
  if (i >= 0) newsPosts[i] = row;
  else newsPosts.unshift(row);
  newsEvents = newsEvents.filter((item) => Number(item.id) !== Number(row.id));
  if (row.event && row.event.starts_at) newsEvents.push(row.event);
  if (newsViewOpen() && newsRow === "announcements") paintNewsPostList();
  if (newsRow === "events") paintNewsMonth();
  if (newsDetailEvent && Number(newsDetailEvent.id) === Number(row.id) && row.event) {
    newsDetailEvent = row.event;
  }
}

function applyIncomingNewsDelete(postId) {
  newsPosts = newsPosts.filter((item) => Number(item.id) !== Number(postId));
  newsEvents = newsEvents.filter((item) => Number(item.id) !== Number(postId));
  if (newsEditRow && Number(newsEditRow.id) === Number(postId)) closeNewsEdit();
  if (newsDetailEvent && Number(newsDetailEvent.id) === Number(postId)) closeNewsEventDetail();
  if (newsDeleteId && Number(newsDeleteId) === Number(postId)) closeNewsDelete();
  if (typeof closeAnnounceComments === "function" && typeof commentThreadKey === "function" && String(currentAnnounceCommentsPostId) === String(commentThreadKey(postId, "news"))) {
    closeAnnounceComments();
  }
  if (newsViewOpen() && newsRow === "announcements") paintNewsPostList();
  if (newsRow === "events") paintNewsMonth();
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
  const byDay = {};
  newsEvents.forEach((row) => {
    const key = newsDayKey(row.starts_at);
    if (!key) return;
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(row);
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
    (byDay[newsLocalDayKey(day)] || []).forEach((row) => {
      const item = document.createElement("div");
      item.className = "news-cal-item is-" + (row.color || "orange");
      item.style.background = newsEventHex(row.color);
      item.textContent = row.name || "Event";
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        openNewsEventDetail(row);
      });
      cell.appendChild(item);
    });
    host.appendChild(cell);
  }
}

function loadNewsEvents() {
  fetch("https://" + serverAddress + "/news/events", { credentials: "include" }).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    newsEvents = (data && data.events) || [];
    if (newsRow === "events") paintNewsMonth();
  }).catch(() => {});
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
  if (newsRow === "events") {
    paintNewsMonth();
    loadNewsEvents();
  }
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

function newsStamp(date, time) {
  if (!date || !time) return "";
  const local = new Date(date + "T" + time);
  if (Number.isNaN(local.getTime())) return "";
  return local.toISOString();
}

function newsLocalDate(when) {
  if (!when) return "";
  return when.getFullYear() + "-" + String(when.getMonth() + 1).padStart(2, "0") + "-" + String(when.getDate()).padStart(2, "0");
}

function newsLocalTime(when) {
  if (!when) return "";
  return String(when.getHours()).padStart(2, "0") + ":" + String(when.getMinutes()).padStart(2, "0");
}

function newsEventStarted(event) {
  const when = newsParseWhen(event && event.starts_at);
  return !!(when && when.getTime() <= Date.now());
}

function newsEventWhenText(event) {
  const start = newsParseWhen(event && event.starts_at);
  const end = newsParseWhen(event && event.ends_at);
  if (!start) return "—";
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const day = days[start.getDay()] + ", " + NEWS_MONTHS[start.getMonth()] + " " + start.getDate();
  function clock(when) {
    let h = when.getHours();
    const m = String(when.getMinutes()).padStart(2, "0");
    const am = h < 12 ? "AM" : "PM";
    h = h % 12 || 12;
    return h + ":" + m + " " + am;
  }
  return day + " · " + clock(start) + (end ? " – " + clock(end) : "");
}

function newsCanManage() {
  return typeof isOneiraAdmin === "function" && isOneiraAdmin();
}

function newsReactionTarget(post) {
  return {
    id: post.id,
    chatKind: "news",
    senderId: post.sender_id,
    reactions: post.reactions || []
  };
}

function fillNewsReactions(host, post) {
  if (!host) return;
  host.querySelectorAll(".reaction-pill").forEach((el) => el.remove());
  const addBtn = host.querySelector(".announce-add-reaction-btn");
  (post.reactions || []).forEach((r) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "reaction-pill" + (r.me ? " mine" : "");
    const emoji = document.createElement("span");
    emoji.className = "reaction-emoji";
    emoji.textContent = r.emoji;
    const count = document.createElement("span");
    count.className = "reaction-count";
    count.textContent = String(r.count);
    pill.appendChild(emoji);
    pill.appendChild(count);
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof toggleReaction === "function") toggleReaction(newsReactionTarget(post), r.emoji);
    });
    if (addBtn) host.insertBefore(pill, addBtn);
    else host.appendChild(pill);
  });
}

function patchNewsReactions(postId, reactions) {
  const post = newsPosts.find((item) => Number(item.id) === Number(postId));
  if (post) post.reactions = typeof applyReactionMe === "function" ? applyReactionMe(reactions || []) : (reactions || []);
  const card = document.querySelector("#news-posts .announce-post[data-post-id=\"" + postId + "\"]");
  const host = card && card.querySelector(".announce-reactions");
  if (host && post) fillNewsReactions(host, post);
}

function showNewsPostContextMenu(e, row) {
  e.preventDefault();
  e.stopPropagation();
  if (typeof openContextMenu !== "function") return;
  const letter = typeof avatarLetter === "function" ? avatarLetter(row.display_name || row.username) : (row.username || "?").charAt(0).toUpperCase();
  const manage = newsCanManage();
  openContextMenu(e.clientX, e.clientY, {
    avatarText: letter,
    title: row.display_name || row.username || "kiwi",
    timestamp: newsWhen(row.created_at),
    subtitle: typeof truncateForContextMenu === "function" ? truncateForContextMenu(row.title) : row.title
  }, [
    { label: "Add Reaction", onSelect: () => openReactionPicker(newsReactionTarget(row), e.clientX, e.clientY) },
    manage && { label: "Edit Post", onSelect: () => openNewsEdit(row) },
    manage && { label: "Delete Post", danger: true, onSelect: () => openNewsDelete(row) }
  ]);
}

function newsShowEventError(text) {
  const err = document.getElementById("news-event-error");
  if (!err) return;
  err.textContent = text || "";
  err.hidden = !text;
}

function newsSetDetailColor(value) {
  newsDetailColor = NEWS_EVENT_COLORS[value] ? value : "orange";
  document.querySelectorAll("#news-detail-colors .news-event-swatch").forEach((btn) => {
    btn.classList.toggle("is-on", btn.getAttribute("data-color") === newsDetailColor);
  });
}

function newsFillEventForm(event) {
  const start = newsParseWhen(event && event.starts_at);
  const end = newsParseWhen(event && event.ends_at);
  const name = document.getElementById("news-detail-name");
  const date = document.getElementById("news-detail-date");
  const startEl = document.getElementById("news-detail-start");
  const endEl = document.getElementById("news-detail-end");
  const desc = document.getElementById("news-detail-desc");
  if (name) name.value = (event && event.name) || "";
  if (date) date.value = newsLocalDate(start);
  if (startEl) startEl.value = newsLocalTime(start);
  if (endEl) endEl.value = newsLocalTime(end);
  if (desc) desc.value = (event && event.description) || "";
  newsSetDetailColor((event && event.color) || "orange");
  if (typeof mdRefreshComposer === "function") mdRefreshComposer(desc);
}

function newsShowEventMode(editing) {
  newsDetailEditing = !!editing;
  const view = document.getElementById("news-event-view");
  const form = document.getElementById("news-event-form");
  const cancel = document.getElementById("news-event-cancel");
  const action = document.getElementById("news-event-action");
  if (view) view.hidden = newsDetailEditing;
  if (form) form.hidden = !newsDetailEditing;
  if (cancel) cancel.textContent = newsDetailEditing ? "Cancel" : "Close";
  if (action) action.textContent = newsDetailEditing ? "Save" : "Edit";
}

function closeNewsEventDetail() {
  const overlay = document.getElementById("news-event-overlay");
  if (overlay) overlay.hidden = true;
  newsDetailEvent = null;
  newsDetailEditing = false;
  newsShowEventError("");
}

function openNewsEventDetail(event) {
  if (!event) return;
  bindNewsOverlays();
  newsDetailEvent = event;
  newsShowEventError("");
  newsShowEventMode(false);
  const overlay = document.getElementById("news-event-overlay");
  const heading = document.getElementById("news-event-heading");
  const when = document.getElementById("news-event-when");
  const note = document.getElementById("news-event-note");
  const dot = document.getElementById("news-event-dot");
  const action = document.getElementById("news-event-action");
  if (heading) heading.textContent = event.name || "Event";
  if (when) when.textContent = newsEventWhenText(event);
  if (note) {
    const text = String(event.description || "").trim();
    if (text) fillNewsMarkdown(note, text);
    else note.textContent = "No additional information";
  }
  if (dot) dot.style.background = newsEventHex(event.color);
  if (action) action.hidden = !newsCanManage() || newsEventStarted(event);
  newsFillEventForm(event);
  if (overlay) overlay.hidden = false;
}

function newsEventCancel() {
  if (newsDetailEditing) {
    newsShowEventError("");
    newsFillEventForm(newsDetailEvent);
    newsShowEventMode(false);
    return;
  }
  closeNewsEventDetail();
}

function newsEventAction() {
  if (!newsDetailEvent || !newsCanManage()) return;
  if (!newsDetailEditing) {
    if (newsEventStarted(newsDetailEvent)) return;
    newsShowEventMode(true);
    return;
  }
  const name = (document.getElementById("news-detail-name") || {}).value || "";
  const date = (document.getElementById("news-detail-date") || {}).value || "";
  const start = (document.getElementById("news-detail-start") || {}).value || "";
  const end = (document.getElementById("news-detail-end") || {}).value || "";
  const desc = (document.getElementById("news-detail-desc") || {}).value || "";
  const startsAt = newsStamp(date, start);
  const endsAt = newsStamp(date, end);
  if (!name.trim()) {
    newsShowEventError("Event name is required.");
    return;
  }
  if (!startsAt || !endsAt) {
    newsShowEventError("Event date and times are required.");
    return;
  }
  if (new Date(endsAt) <= new Date(startsAt)) {
    newsShowEventError("Event end must be after start.");
    return;
  }
  if (newsSaving) return;
  newsSaving = true;
  const action = document.getElementById("news-event-action");
  if (action) action.disabled = true;
  newsShowEventError("");
  fetch("https://" + serverAddress + "/news/events/edit", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      post_id: newsDetailEvent.id,
      name: name.trim(),
      starts_at: startsAt,
      ends_at: endsAt,
      description: desc.trim(),
      color: newsDetailColor
    })
  }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
    newsSaving = false;
    if (action) action.disabled = false;
    if (!result.ok) {
      const detail = result.data && result.data.detail;
      newsShowEventError(typeof detail === "string" ? detail : "Could not save that event.");
      return;
    }
    applyIncomingNewsUpdate(result.data);
    openNewsEventDetail((result.data && result.data.event) || newsDetailEvent);
  }).catch(() => {
    newsSaving = false;
    if (action) action.disabled = false;
    newsShowEventError("Could not save that event.");
  });
}

function newsShowEditError(text) {
  const err = document.getElementById("news-edit-error");
  if (!err) return;
  err.textContent = text || "";
  err.hidden = !text;
}

function closeNewsEdit() {
  const overlay = document.getElementById("news-edit-overlay");
  if (overlay) overlay.hidden = true;
  newsEditRow = null;
  newsShowEditError("");
}

function openNewsEdit(row) {
  if (!row || !row.id || !newsCanManage()) return;
  bindNewsOverlays();
  newsEditRow = row;
  newsShowEditError("");
  const heading = document.getElementById("news-edit-heading");
  const body = document.getElementById("news-edit-body");
  if (heading) heading.value = row.title || "";
  if (body) body.value = row.body || "";
  if (typeof mdRefreshComposer === "function") {
    mdRefreshComposer(heading);
    mdRefreshComposer(body);
  }
  const overlay = document.getElementById("news-edit-overlay");
  if (overlay) overlay.hidden = false;
  if (heading) heading.focus();
}

function saveNewsEdit() {
  if (!newsEditRow || newsSaving) return;
  const heading = document.getElementById("news-edit-heading");
  const body = document.getElementById("news-edit-body");
  const title = heading ? heading.value.trim() : "";
  const text = body ? body.value.trim() : "";
  const attachments = (newsEditRow.attachment || []).map((item) => ({
    key: item.key,
    mime: item.mime,
    size: item.size || 0,
    name: item.name || ""
  }));
  if (!title) {
    newsShowEditError("Title is required.");
    return;
  }
  if (!text && !attachments.length) {
    newsShowEditError("Post is empty.");
    return;
  }
  newsSaving = true;
  const save = document.getElementById("news-edit-save");
  if (save) save.disabled = true;
  newsShowEditError("");
  fetch("https://" + serverAddress + "/news/posts/edit", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      post_id: newsEditRow.id,
      title: title,
      body: text,
      comments_open: newsEditRow.comments_open !== false,
      title_align: newsEditRow.title_align || "left",
      body_align: newsEditRow.body_align || "left",
      attachments: attachments
    })
  }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
    newsSaving = false;
    if (save) save.disabled = false;
    if (!result.ok) {
      const detail = result.data && result.data.detail;
      newsShowEditError(typeof detail === "string" ? detail : "Could not save that announcement.");
      return;
    }
    applyIncomingNewsUpdate(result.data);
    closeNewsEdit();
  }).catch(() => {
    newsSaving = false;
    if (save) save.disabled = false;
    newsShowEditError("Could not save that announcement.");
  });
}

function closeNewsDelete() {
  const overlay = document.getElementById("news-delete-overlay");
  if (overlay) overlay.hidden = true;
  newsDeleteId = 0;
}

function openNewsDelete(row) {
  if (!row || !row.id || !newsCanManage()) return;
  bindNewsOverlays();
  newsDeleteId = Number(row.id) || 0;
  const overlay = document.getElementById("news-delete-overlay");
  if (overlay) overlay.hidden = false;
}

function confirmNewsDelete() {
  if (!newsDeleteId || newsSaving) return;
  newsSaving = true;
  const confirm = document.getElementById("news-delete-confirm");
  if (confirm) confirm.disabled = true;
  fetch("https://" + serverAddress + "/news/posts/delete", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: newsDeleteId })
  }).then((response) => response.json().then((data) => ({ ok: response.ok, data: data }))).then((result) => {
    newsSaving = false;
    if (confirm) confirm.disabled = false;
    if (!result.ok) return;
    const gone = result.data && result.data.post_id ? result.data.post_id : newsDeleteId;
    closeNewsDelete();
    applyIncomingNewsDelete(gone);
  }).catch(() => {
    newsSaving = false;
    if (confirm) confirm.disabled = false;
  });
}

function bindNewsOverlays() {
  if (newsOverlaysBound) return;
  newsOverlaysBound = true;
  if (typeof bindComposerMarkdown === "function") {
    bindComposerMarkdown(document.getElementById("news-edit-heading"));
    bindComposerMarkdown(document.getElementById("news-edit-body"));
    bindComposerMarkdown(document.getElementById("news-detail-desc"));
  }
  document.querySelectorAll("#news-detail-colors .news-event-swatch").forEach((btn) => {
    btn.addEventListener("click", () => newsSetDetailColor(btn.getAttribute("data-color")));
  });
  const eventOverlay = document.getElementById("news-event-overlay");
  if (eventOverlay) eventOverlay.addEventListener("click", (e) => {
    if (e.target && e.target.id === "news-event-overlay") closeNewsEventDetail();
  });
  const eventClose = document.getElementById("news-event-close");
  const eventCancel = document.getElementById("news-event-cancel");
  const eventAction = document.getElementById("news-event-action");
  if (eventClose) eventClose.addEventListener("click", closeNewsEventDetail);
  if (eventCancel) eventCancel.addEventListener("click", newsEventCancel);
  if (eventAction) eventAction.addEventListener("click", newsEventAction);
  const editOverlay = document.getElementById("news-edit-overlay");
  if (editOverlay) editOverlay.addEventListener("click", (e) => {
    if (e.target && e.target.id === "news-edit-overlay") closeNewsEdit();
  });
  const editClose = document.getElementById("news-edit-close");
  const editCancel = document.getElementById("news-edit-cancel");
  const editSave = document.getElementById("news-edit-save");
  if (editClose) editClose.addEventListener("click", closeNewsEdit);
  if (editCancel) editCancel.addEventListener("click", closeNewsEdit);
  if (editSave) editSave.addEventListener("click", saveNewsEdit);
  const deleteOverlay = document.getElementById("news-delete-overlay");
  if (deleteOverlay) deleteOverlay.addEventListener("click", (e) => {
    if (e.target && e.target.id === "news-delete-overlay") closeNewsDelete();
  });
  const deleteClose = document.getElementById("news-delete-close");
  const deleteCancel = document.getElementById("news-delete-cancel");
  const deleteConfirm = document.getElementById("news-delete-confirm");
  if (deleteClose) deleteClose.addEventListener("click", closeNewsDelete);
  if (deleteCancel) deleteCancel.addEventListener("click", closeNewsDelete);
  if (deleteConfirm) deleteConfirm.addEventListener("click", confirmNewsDelete);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const deleteOpen = document.getElementById("news-delete-overlay");
    if (deleteOpen && !deleteOpen.hidden) {
      closeNewsDelete();
      return;
    }
    const editOpen = document.getElementById("news-edit-overlay");
    if (editOpen && !editOpen.hidden) {
      closeNewsEdit();
      return;
    }
    const eventOpen = document.getElementById("news-event-overlay");
    if (eventOpen && !eventOpen.hidden) newsEventCancel();
  });
}

bindNewsOverlays();
