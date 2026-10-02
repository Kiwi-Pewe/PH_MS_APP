const FEED_FAMILY_LABELS = {
  activity: "Activity",
  profile: "Profile",
  moderation: "Moderation",
  feedback: "Feedback",
};

const FEED_TYPE_LABELS = {
  reaction: "Reaction",
  reply: "Reply",
  post_comment: "Post comment",
  event_invite: "Event invite",
  widget_comment: "Profile comment",
  widget_update: "Subscription update",
  profile_event: "Profile event",
  friend_accept: "Friend request accepted",
  friend_deny: "Friend request declined",
  kick: "Removed from server",
  ban: "Banned from server",
  timeout: "Timed out",
  feedback_status: "Feedback update",
  report_status: "Report update",
};

const FEED_MOD_VERBS = {
  kick: "removed you",
  ban: "banned you",
  timeout: "timed you out",
};

let mailSessionItems = [];
let mailUnseenCount = 0;
let mailTrayOpen = false;
let feedAlertRows = [];
let feedHasMore = true;
let feedLoadingMore = false;
let feedSessionFilter = null;
const FEED_PAGE_SIZE = 25;

function defaultFeedSessionFilter() {
  const prefs = {};
  const groups = typeof FEED_PREF_GROUPS !== "undefined" ? FEED_PREF_GROUPS : [];
  groups.forEach((group) => {
    (group.kinds || []).forEach((kind) => { prefs[kind.type] = true; });
  });
  if (!Object.keys(prefs).length) {
    Object.keys(FEED_TYPE_LABELS).forEach((key) => { prefs[key] = true; });
  }
  return prefs;
}

function ensureFeedSessionFilter() {
  if (!feedSessionFilter) feedSessionFilter = defaultFeedSessionFilter();
  return feedSessionFilter;
}

function feedSessionFilterEnabled(alertType) {
  const kind = String(alertType || "").toLowerCase();
  const prefs = ensureFeedSessionFilter();
  if (!Object.prototype.hasOwnProperty.call(prefs, kind)) return true;
  return !!prefs[kind];
}

function visibleFeedAlertRows() {
  return feedAlertRows.filter((row) => feedSessionFilterEnabled(row.alert_type));
}

function syncFeedFilterButton() {
  const btn = document.getElementById("feed-filter-btn");
  if (!btn) return;
  const prefs = ensureFeedSessionFilter();
  const narrowed = Object.keys(prefs).some((key) => !prefs[key]);
  btn.classList.toggle("is-active", narrowed);
}

function feedFamilyOf(alert) {
  const family = String(alert && alert.alert_family || "").toLowerCase();
  if (FEED_FAMILY_LABELS[family]) return family;
  return "activity";
}

function feedTypeLabel(alert) {
  const kind = String(alert && alert.alert_type || "").toLowerCase();
  if (alert && alert.alert_type_label) return alert.alert_type_label;
  return FEED_TYPE_LABELS[kind] || kind || "Alert";
}

function feedSenderLabel(alert) {
  return (alert && (alert.sender_display_name || alert.sender_username)) || "Someone";
}

function feedSubjectLabel(alert) {
  if (alert && alert.subject_name) return alert.subject_name;
  if (feedFamilyOf(alert) === "moderation") return "Unknown server";
  return feedSenderLabel(alert);
}

function feedAlertTime(alert) {
  if (!alert || !alert.created_at) return "";
  if (typeof formatClusterTime === "function" && typeof parseUtcTimestamp === "function") {
    return formatClusterTime(parseUtcTimestamp(alert.created_at));
  }
  return String(alert.created_at);
}

function formatFeedDuration(seconds) {
  let secs = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!secs) return "";
  const days = Math.floor(secs / 86400);
  secs -= days * 86400;
  const hours = Math.floor(secs / 3600);
  secs -= hours * 3600;
  const minutes = Math.floor(secs / 60);
  const parts = [];
  if (days) parts.push(days + (days === 1 ? " day" : " days"));
  if (hours) parts.push(hours + (hours === 1 ? " hour" : " hours"));
  if (minutes) parts.push(minutes + (minutes === 1 ? " minute" : " minutes"));
  if (!parts.length) parts.push("less than a minute");
  return parts.join(", ");
}

function feedAlertBody(alert) {
  const family = feedFamilyOf(alert);
  const kind = String(alert && alert.alert_type || "").toLowerCase();
  if (family === "moderation") {
    const who = feedSenderLabel(alert);
    const verb = FEED_MOD_VERBS[kind] || "moderated you";
    const reason = String(alert && alert.reason || "").trim();
    const duration = formatFeedDuration(alert && alert.duration_seconds);
    let text = who + " " + verb;
    if (reason) text += " for: " + reason;
    if (duration) text += " for " + duration;
    return text + ".";
  }
  if (kind === "friend_accept") {
    return feedSenderLabel(alert) + " accepted your friend request.";
  }
  if (kind === "friend_deny") {
    return feedSenderLabel(alert) + " declined your friend request.";
  }
  if (kind === "feedback_status" || kind === "report_status") {
    const status = String(alert && alert.reason || "").trim() || "updated";
    const noun = kind === "report_status" ? "report" : "feedback";
    return feedSenderLabel(alert) + " updated your " + noun + " to " + status + ".";
  }
  if (kind === "reaction") {
    const emoji = String(alert && alert.reason || "").trim();
    return emoji
      ? (feedSenderLabel(alert) + " reacted " + emoji + " to your message.")
      : (feedSenderLabel(alert) + " reacted to your message.");
  }
  if (kind === "reply") {
    return feedSenderLabel(alert) + " replied to your message.";
  }
  if (kind === "post_comment") {
    return feedSenderLabel(alert) + " commented on your post.";
  }
  if (kind === "event_invite") {
    let name = "an event";
    try {
      const raw = alert && alert.context;
      const ctx = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (ctx && ctx.name) name = ctx.name;
    } catch (err) {}
    return feedSenderLabel(alert) + " invited you to " + name + ".";
  }
  if (kind === "widget_comment") {
    let ownerId = null;
    try {
      const raw = alert && alert.context;
      const ctx = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (ctx && ctx.owner_id != null) ownerId = Number(ctx.owner_id);
    } catch (err) {}
    if (ownerId != null && typeof myUserId !== "undefined" && Number(myUserId) === ownerId) {
      return feedSenderLabel(alert) + " commented on your profile.";
    }
    return feedSenderLabel(alert) + " commented on a profile you're watching.";
  }
  return String(alert && alert.context || "").trim();
}

function paintFeedSubjectFace(host, alert) {
  if (!host) return;
  host.replaceChildren();
  const family = feedFamilyOf(alert);
  if ((alert && alert.face_kind) === "server" || family === "moderation") {
    const url = alert && alert.subject_icon_url;
    const name = feedSubjectLabel(alert);
    if (url) {
      const img = document.createElement("img");
      img.className = "feed-server-icon-img";
      img.src = url;
      img.alt = "";
      host.appendChild(img);
      return;
    }
    const letter = document.createElement("span");
    letter.className = "face-letter";
    letter.textContent = name.charAt(0).toUpperCase();
    host.appendChild(letter);
    return;
  }
  if (alert && alert.sender_id && typeof paintUserFace === "function") {
    paintUserFace(host, {
      avatar: alert.sender_avatar,
      username: alert.sender_username,
      display_name: alert.sender_display_name,
    }, { name: feedSenderLabel(alert), userId: alert.sender_id });
    return;
  }
  host.textContent = (FEED_FAMILY_LABELS[family] || "?").charAt(0);
}

function clearMailSession() {
  mailSessionItems = [];
  mailUnseenCount = 0;
  mailTrayOpen = false;
  const tray = document.getElementById("mail-tray");
  if (tray) tray.hidden = true;
  paintMailBadge();
  paintMailTray();
}

function paintMailBadge() {
  const badge = document.getElementById("mail-badge");
  if (!badge) return;
  if (mailUnseenCount > 0) {
    badge.hidden = false;
    badge.textContent = mailUnseenCount > 9 ? "9+" : String(mailUnseenCount);
  } else {
    badge.hidden = true;
    badge.textContent = "0";
  }
}

function buildMailAlertRow(alert) {
  const family = feedFamilyOf(alert);
  const row = document.createElement("div");
  row.className = "mail-tray-item is-" + family + (alert.read ? " is-read" : "");
  row.dataset.alertId = String(alert.id);
  row.dataset.alertFamily = family;

  const head = document.createElement("div");
  head.className = "mail-tray-item-head";
  const chip = document.createElement("span");
  chip.className = "feed-family-chip is-" + family;
  chip.textContent = FEED_FAMILY_LABELS[family] || family;
  const title = document.createElement("div");
  title.className = "mail-tray-item-title";
  title.textContent = feedTypeLabel(alert);
  head.appendChild(chip);
  head.appendChild(title);

  const line = document.createElement("div");
  line.className = "mail-tray-item-detail";
  const body = feedAlertBody(alert);
  line.textContent = body
    ? (feedSubjectLabel(alert) + " · " + body)
    : feedSubjectLabel(alert);

  row.appendChild(head);
  if (line.textContent) row.appendChild(line);
  return row;
}

function paintMailTray() {
  const list = document.getElementById("mail-tray-list");
  const clearBtn = document.getElementById("mail-clear-btn");
  if (!list || !clearBtn) return;
  list.replaceChildren();
  if (!mailSessionItems.length) {
    const empty = document.createElement("div");
    empty.className = "mail-tray-empty";
    empty.textContent = "All Caught up!";
    list.appendChild(empty);
    clearBtn.hidden = true;
    return;
  }
  mailSessionItems.forEach((item) => list.appendChild(buildMailAlertRow(item)));
  clearBtn.hidden = false;
}

function positionMailTray() {
  const tray = document.getElementById("mail-tray");
  const btn = document.getElementById("mail-tab");
  if (!tray || !btn) return;
  const rect = btn.getBoundingClientRect();
  tray.style.top = Math.round(rect.bottom + 6) + "px";
  tray.style.right = Math.round(window.innerWidth - rect.right) + "px";
  tray.style.left = "auto";
}

function closeMailTray() {
  const tray = document.getElementById("mail-tray");
  if (!tray) return;
  tray.hidden = true;
  mailTrayOpen = false;
  mailSessionItems.forEach((item) => { item.read = true; });
}

function openMailTray() {
  mailUnseenCount = 0;
  paintMailBadge();
  paintMailTray();
  positionMailTray();
  const tray = document.getElementById("mail-tray");
  if (!tray) return;
  tray.hidden = false;
  mailTrayOpen = true;
}

function toggleMailTray() {
  if (mailTrayOpen) closeMailTray();
  else openMailTray();
}

function pushMailSessionAlert(alert) {
  if (!alert || alert.id == null) return;
  const existed = mailSessionItems.some((row) => row.id === alert.id);
  const next = Object.assign({}, alert, {
    alert_family: feedFamilyOf(alert),
    alert_type_label: feedTypeLabel(alert),
    read: false,
  });
  mailSessionItems = [next, ...mailSessionItems.filter((row) => row.id !== next.id)].slice(0, 10);
  if (!existed) mailUnseenCount += 1;
  paintMailBadge();
  if (mailTrayOpen) paintMailTray();
}

function noteIncomingFeedAlert(alert) {
  if (!alert || alert.id == null) return;
  if (typeof feedAlertTypeEnabled === "function" && !feedAlertTypeEnabled(alert.alert_type)) return;
  pushMailSessionAlert(alert);
  if (feedAlertRows.some((row) => row.id === alert.id)) {
    feedAlertRows = feedAlertRows.map((row) => (row.id === alert.id ? alert : row));
  } else {
    feedAlertRows = [alert].concat(feedAlertRows);
  }
  const feedView = document.getElementById("view-feed");
  if (feedView && feedView.classList.contains("active")) {
    paintFeedPosts({ preserveScroll: true });
  }
}

function applyFeedAlertPrefsLocally() {
  mailSessionItems = mailSessionItems.filter((row) => {
    if (typeof feedAlertTypeEnabled !== "function") return true;
    return feedAlertTypeEnabled(row.alert_type);
  });
  mailUnseenCount = mailSessionItems.filter((row) => !row.read).length;
  paintMailBadge();
  paintMailTray();
  if (typeof loadFeedAlerts === "function") loadFeedAlerts();
}

function showFeedAlertMenu(e, alert) {
  e.preventDefault();
  e.stopPropagation();
  if (typeof openContextMenu !== "function") return;
  openContextMenu(e.clientX, e.clientY, null, [
    {
      label: "Delete",
      danger: true,
      onSelect: () => deleteFeedAlert(alert.id),
    },
  ]);
}

function buildFeedAlertCard(alert) {
  const family = feedFamilyOf(alert);
  const card = document.createElement("div");
  card.className = "announce-post feed-alert-card is-" + family;
  card.dataset.alertId = String(alert.id);
  card.dataset.alertFamily = family;
  card.addEventListener("contextmenu", (e) => showFeedAlertMenu(e, alert));

  const top = document.createElement("div");
  top.className = "announce-post-top";

  const face = document.createElement("div");
  face.className = "cluster-avatar feed-alert-face is-" + family;
  paintFeedSubjectFace(face, alert);

  const meta = document.createElement("div");
  meta.className = "announce-post-meta";
  const name = document.createElement("div");
  name.className = "announce-post-name";
  name.textContent = feedSubjectLabel(alert);
  const role = document.createElement("div");
  role.className = "announce-post-role";
  role.textContent = FEED_FAMILY_LABELS[family] || family;
  meta.appendChild(name);
  meta.appendChild(role);

  const chip = document.createElement("span");
  chip.className = "feed-family-chip is-" + family;
  chip.textContent = FEED_FAMILY_LABELS[family] || family;

  top.appendChild(face);
  top.appendChild(meta);
  top.appendChild(chip);

  const divider = document.createElement("div");
  divider.className = "announce-divider";

  const content = document.createElement("div");
  content.className = "announce-post-content";
  const titleRow = document.createElement("div");
  titleRow.className = "announce-post-title-row";
  const title = document.createElement("div");
  title.className = "announce-post-title";
  title.textContent = feedTypeLabel(alert);
  titleRow.appendChild(title);
  content.appendChild(titleRow);

  const bodyText = feedAlertBody(alert);
  if (bodyText) {
    const body = document.createElement("div");
    body.className = "announce-post-body";
    body.textContent = bodyText;
    content.appendChild(body);
  }

  const date = document.createElement("div");
  date.className = "announce-post-date";
  date.textContent = feedAlertTime(alert);

  card.appendChild(top);
  card.appendChild(divider);
  card.appendChild(content);
  card.appendChild(date);
  return card;
}

function paintFeedPosts(opts) {
  const host = document.getElementById("feed-posts");
  if (!host) return;
  const preserveScroll = !!(opts && opts.preserveScroll);
  const prevTop = host.scrollTop;
  const prevHeight = host.scrollHeight;
  host.replaceChildren();
  const rows = visibleFeedAlertRows();
  if (!feedAlertRows.length) {
    const empty = document.createElement("div");
    empty.className = "announce-end-marker";
    empty.id = "feed-empty";
    empty.textContent = "All caught up";
    host.appendChild(empty);
    syncFeedFilterButton();
    return;
  }
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "announce-end-marker";
    empty.id = "feed-empty";
    empty.textContent = "No alerts match this filter";
    host.appendChild(empty);
    syncFeedFilterButton();
    return;
  }
  rows.forEach((alert) => host.appendChild(buildFeedAlertCard(alert)));
  if (preserveScroll) {
    host.scrollTop = prevTop + (host.scrollHeight - prevHeight);
  } else {
    host.scrollTop = 0;
  }
  syncFeedFilterButton();
}

function openFeedFilterMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  if (typeof openContextMenu !== "function") return;
  if (typeof activeMenuEl !== "undefined" && activeMenuEl) {
    closeContextMenu();
    return;
  }
  const groups = typeof FEED_PREF_GROUPS !== "undefined" ? FEED_PREF_GROUPS : [];
  if (!groups.length) return;
  const prefs = ensureFeedSessionFilter();
  const btn = e.currentTarget || document.getElementById("feed-filter-btn");
  const rect = btn ? btn.getBoundingClientRect() : { left: e.clientX, bottom: e.clientY };
  const options = groups.map((group) => ({
    label: group.label,
    submenu: (group.kinds || []).map((kind) => ({
      type: "check",
      label: kind.label,
      checked: !!prefs[kind.type],
      onSelect: (row) => {
        prefs[kind.type] = !!row.checked;
        feedSessionFilter = prefs;
        paintFeedPosts({ preserveScroll: true });
      },
    })),
  }));
  openContextMenu(rect.left, rect.bottom + 4, null, options);
}

async function loadFeedAlerts() {
  feedHasMore = true;
  feedLoadingMore = false;
  try {
    const response = await fetch(`https://${serverAddress}/feed_alerts?limit=${FEED_PAGE_SIZE}`, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not load feed.");
    feedAlertRows = Array.isArray(data.alerts) ? data.alerts : [];
    if (feedAlertRows.length < FEED_PAGE_SIZE) feedHasMore = false;
  } catch (err) {
    feedAlertRows = [];
    feedHasMore = false;
  }
  paintFeedPosts();
}

async function loadOlderFeedAlerts() {
  if (feedLoadingMore || !feedHasMore || !feedAlertRows.length) return;
  const oldest = feedAlertRows[feedAlertRows.length - 1];
  if (!oldest || oldest.id == null) return;
  feedLoadingMore = true;
  try {
    const response = await fetch(
      `https://${serverAddress}/feed_alerts?limit=${FEED_PAGE_SIZE}&before_id=${oldest.id}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    const older = Array.isArray(data.alerts) ? data.alerts : [];
    if (older.length < FEED_PAGE_SIZE) feedHasMore = false;
    if (!older.length) {
      feedHasMore = false;
      return;
    }
    const seen = new Set(feedAlertRows.map((row) => row.id));
    const next = older.filter((row) => row && row.id != null && !seen.has(row.id));
    if (!next.length) {
      feedHasMore = false;
      return;
    }
    feedAlertRows = feedAlertRows.concat(next);
    paintFeedPosts({ preserveScroll: true });
  } catch (err) {
    /* leave state as-is */
  } finally {
    feedLoadingMore = false;
  }
}

async function deleteFeedAlert(alertId) {
  try {
    const response = await fetch(`https://${serverAddress}/feed_alerts/${alertId}/delete`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) return;
    feedAlertRows = feedAlertRows.filter((row) => row.id !== alertId);
    mailSessionItems = mailSessionItems.filter((row) => row.id !== alertId);
    paintFeedPosts({ preserveScroll: true });
    paintMailTray();
    paintMailBadge();
  } catch (err) {}
}

function openFeedView() {
  if (typeof hideMemberList === "function") hideMemberList();
  if (typeof clearPendingReply === "function") clearPendingReply();
  if (typeof resetTypingOnLeave === "function") resetTypingOnLeave();
  openChatType = null;
  openChatId = null;
  openChatName = null;
  document.querySelectorAll("#secondary-nav .nav-item").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".dm-item").forEach((d) => d.classList.remove("active"));
  const feedBtn = document.querySelector('#secondary-nav .nav-item[data-view="feed"]');
  if (feedBtn) feedBtn.classList.add("active");
  const feedView = document.getElementById("view-feed");
  const alreadyOnFeed = !!(feedView && feedView.classList.contains("active"));
  if (!alreadyOnFeed) clearMailSession();
  switchMainView("feed");
  loadFeedAlerts();
}

document.getElementById("mail-clear-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  clearMailSession();
});

document.addEventListener("mousedown", (e) => {
  if (!mailTrayOpen) return;
  const tray = document.getElementById("mail-tray");
  const btn = document.getElementById("mail-tab");
  if (tray && tray.contains(e.target)) return;
  if (btn && btn.contains(e.target)) return;
  closeMailTray();
});

window.addEventListener("resize", () => {
  if (mailTrayOpen) positionMailTray();
});

const feedPostsEl = document.getElementById("feed-posts");
if (feedPostsEl) {
  feedPostsEl.addEventListener("scroll", () => {
    const host = document.getElementById("feed-posts");
    if (!host) return;
    if (host.scrollHeight - host.scrollTop - host.clientHeight < 80) loadOlderFeedAlerts();
  });
}

const feedFilterBtn = document.getElementById("feed-filter-btn");
if (feedFilterBtn) {
  feedFilterBtn.addEventListener("click", openFeedFilterMenu);
}

paintMailTray();
paintMailBadge();
syncFeedFilterButton();
