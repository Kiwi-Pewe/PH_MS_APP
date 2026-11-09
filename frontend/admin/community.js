const COMMUNITY_PAGE = 25;
const COMMUNITY_LOCK_KINDS = [
  { id: "", label: "All locks" },
  { id: "post", label: "Posts" },
  { id: "comment", label: "Comments" },
  { id: "rooms", label: "Rooms" },
  { id: "phone", label: "Phone" }
];
const COMMUNITY_LOCK_NAMES = {
  post: "Posts",
  comment: "Comments",
  rooms: "Rooms",
  phone: "Phone"
};
const COMMUNITY_VIEWS = {
  posts: {
    crumbs: ["Admin", "Community", "Posts"],
    title: "Posts",
    note: "Search a user to review their Community posts.",
    list: "Posts",
    empty: "Select a post.",
    none: "User has no posts."
  },
  rooms: {
    crumbs: ["Admin", "Community", "Rooms"],
    title: "Rooms",
    note: "Search a user to review rooms they own or joined.",
    list: "Rooms",
    empty: "Select a room.",
    none: "User is not in any rooms."
  },
  phone: {
    crumbs: ["Admin", "Community", "Phone"],
    title: "Phone",
    note: "Search a user to review recent Phone a User records.",
    list: "Phone records",
    empty: "Select a phone record.",
    none: "No phone records."
  },
  locks: {
    crumbs: ["Admin", "Community", "Locks"],
    title: "Locks",
    note: "Search accounts locked from posts, comments, rooms, or Phone.",
    list: "Locks",
    empty: "Select a user.",
    none: "User has no Community locks."
  }
};

let communityScope = "posts";
let communityBy = "id";
let communityQuery = "";
let communityFlaggedOnly = false;
let communityLockedOnly = true;
let communityLockKind = "";
let communityOffset = 0;
let communityHasMore = false;
let communityLoading = false;
let communityRows = [];
let communitySelectedId = 0;
let communitySelected = null;
let communityItems = [];
let communityOpenId = "";
let communityEvents = [];
let communityTimer = 0;

function communityView() {
  return COMMUNITY_VIEWS[communityScope] || COMMUNITY_VIEWS.posts;
}

function communityPhoneLabel(row) {
  const other = row && row.other;
  if (row && row.kind === "wait") return "Waiting for a match";
  return (other && (other.display_name || other.username)) || "Phone record";
}

function communityPhoneStatus(status) {
  const key = String(status || "").toLowerCase();
  if (key === "active") return "Active";
  if (key === "waiting") return "Waiting";
  if (key === "ended") return "Ended";
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : "Ended";
}

function communityLockUntil(lock) {
  if (!lock) return "Not locked";
  if (lock.permanent) return "Permanent";
  if (lock.lift_at) return usersBanUntil(lock.lift_at) || "Until lift";
  return "Locked";
}

function paintCommunityRows() {
  const host = document.getElementById("community-search-list");
  if (!host) return;
  host.innerHTML = "";
  communityRows.forEach((row) => {
    const online = usersPresence(row);
    const btn = adminEl("button", "users-row" + (row.id === communitySelectedId ? " is-on" : "") + (online === "offline" && row.id !== communitySelectedId ? " is-off" : ""));
    btn.type = "button";
    const face = adminEl("div", "users-face");
    usersFace(face, row, row.username || row.display_name);
    face.appendChild(adminEl("div", "status-dot status-" + online));
    btn.appendChild(face);
    const text = adminEl("div", "users-row-text");
    text.appendChild(usersRowName(row.display_name || row.username || "—", row.flagged));
    text.appendChild(adminEl("div", "users-row-handle", usersHandle(row)));
    btn.appendChild(text);
    btn.addEventListener("click", () => selectCommunityUser(row.id));
    host.appendChild(btn);
  });
  if (communityHasMore) {
    const more = adminEl("button", "users-more", "Load more");
    more.type = "button";
    more.disabled = communityLoading;
    more.addEventListener("click", () => loadCommunityUsers(true));
    host.appendChild(more);
  }
}

function communityPostRow(row, open) {
  const card = adminEl("div", "users-entry" + (open ? " is-open" : "") + (String(row.code) === String(communityOpenId) ? " is-on" : ""));
  const top = adminEl("div", "users-entry-top");
  const face = adminEl("div", "users-entry-face");
  usersFace(face, row, row.display_name || row.username);
  top.appendChild(face);
  const names = adminEl("div", "users-entry-copy");
  names.appendChild(adminEl("div", "users-entry-name", row.display_name || row.username || "—"));
  names.appendChild(usersReportStamp("Created", row.created_at));
  top.appendChild(names);
  const flags = adminEl("div", "users-entry-flags");
  flags.appendChild(adminEl("div", "users-entry-pill", row.code || "—"));
  top.appendChild(flags);
  card.appendChild(top);
  const bottom = adminEl("div", "users-entry-bottom");
  const text = String(row.body || "").trim();
  bottom.appendChild(adminEl("div", "users-entry-text" + (text ? "" : " is-empty"), text || "No additional information"));
  const post = adminEl("div", "users-entry-post");
  post.appendChild(document.createTextNode(adminNum(row.likes) + " likes · " + adminNum(row.dislikes) + " dislikes · " + adminNum(row.replies) + " comments"));
  bottom.appendChild(post);
  card.appendChild(bottom);
  if (!open) card.addEventListener("click", () => openCommunityItem(row.code));
  return card;
}

function communityRoomRow(row, open) {
  const card = adminEl("div", "users-entry" + (open ? " is-open" : "") + (String(row.id) === String(communityOpenId) ? " is-on" : ""));
  const top = adminEl("div", "users-entry-top");
  const names = adminEl("div", "users-entry-copy");
  names.appendChild(adminEl("div", "users-entry-name", row.name || "Room"));
  names.appendChild(usersReportStamp("Active", row.active_at || row.created_at));
  top.appendChild(names);
  const flags = adminEl("div", "users-entry-flags");
  flags.appendChild(adminEl("div", "users-entry-pill is-status " + (row.owner ? "is-open" : "is-viewed"), row.owner ? "Owner" : "Member"));
  top.appendChild(flags);
  card.appendChild(top);
  const bottom = adminEl("div", "users-entry-bottom");
  const about = String(row.about || "").trim();
  bottom.appendChild(adminEl("div", "users-entry-text" + (about ? "" : " is-empty"), about || "No additional information"));
  bottom.appendChild(adminEl("div", "users-entry-post", adminNum(row.member_count) + " members"));
  card.appendChild(bottom);
  if (!open) card.addEventListener("click", () => openCommunityItem(row.id));
  return card;
}

function communityPhoneRow(row, open) {
  const key = row.kind === "wait" ? "wait" : row.id;
  const card = adminEl("div", "users-entry" + (open ? " is-open" : "") + (String(key) === String(communityOpenId) ? " is-on" : ""));
  const top = adminEl("div", "users-entry-top");
  const face = adminEl("div", "users-entry-face");
  const other = row.other || {};
  usersFace(face, other, other.display_name || other.username || "Phone");
  top.appendChild(face);
  const names = adminEl("div", "users-entry-copy");
  names.appendChild(adminEl("div", "users-entry-name", communityPhoneLabel(row)));
  names.appendChild(usersReportStamp("Started", row.started_at || row.active_at));
  top.appendChild(names);
  const flags = adminEl("div", "users-entry-flags");
  const status = String(row.status || "").toLowerCase();
  flags.appendChild(adminEl("div", "users-entry-pill is-status is-" + (status === "active" || status === "waiting" ? "open" : "closed"), communityPhoneStatus(row.status)));
  top.appendChild(flags);
  card.appendChild(top);
  if (!open) card.addEventListener("click", () => openCommunityItem(key));
  return card;
}

function communityLockRow(kind, lock) {
  const card = adminEl("div", "users-entry is-open");
  const top = adminEl("div", "users-entry-top");
  const names = adminEl("div", "users-entry-copy");
  names.appendChild(adminEl("div", "users-entry-name", COMMUNITY_LOCK_NAMES[kind] || kind));
  names.appendChild(adminEl("div", "users-entry-stamp-v", communityLockUntil(lock)));
  top.appendChild(names);
  const flags = adminEl("div", "users-entry-flags");
  flags.appendChild(adminEl("div", "users-entry-pill is-status is-open", "Locked"));
  top.appendChild(flags);
  card.appendChild(top);
  return card;
}

function paintCommunityItems() {
  const host = document.getElementById("community-item-list");
  if (!host) return;
  host.innerHTML = "";
  const view = communityView();
  if (!communitySelectedId) {
    host.appendChild(adminEl("div", "users-empty", "Select a user."));
    return;
  }
  if (communityScope === "locks") {
    const locks = (communitySelected && communitySelected.community_locks) || {};
    const kinds = COMMUNITY_LOCK_KINDS.map((item) => item.id).filter(Boolean).filter((kind) => locks[kind]);
    if (!kinds.length) {
      host.appendChild(adminEl("div", "users-empty", view.none));
      return;
    }
    kinds.forEach((kind) => host.appendChild(communityLockRow(kind, locks[kind])));
    return;
  }
  if (!communityItems.length) {
    host.appendChild(adminEl("div", "users-empty", view.none));
    return;
  }
  communityItems.forEach((row) => {
    if (communityScope === "posts") host.appendChild(communityPostRow(row, false));
    else if (communityScope === "rooms") host.appendChild(communityRoomRow(row, false));
    else host.appendChild(communityPhoneRow(row, false));
  });
}

function paintCommunityLog() {
  const host = document.getElementById("community-log");
  if (!host) return;
  host.innerHTML = "";
  const view = communityView();
  if (communityScope === "locks") {
    if (communitySelected) paintUsersAccount(host, communitySelected);
    else usersSelectEmpty(host);
    return;
  }
  if (!communityOpenId) {
    host.appendChild(adminEl("div", "users-empty", view.empty));
    return;
  }
  const reports = usersCard({ title: view.list, fill: true, className: "users-reports-card is-open" });
  const head = reports.querySelector(".users-card-head");
  if (head) {
    head.classList.add("has-back");
    const back = adminEl("button", "users-reports-back", "Back");
    back.type = "button";
    back.addEventListener("click", () => {
      communityOpenId = "";
      communityEvents = [];
      paintCommunityItems();
      paintCommunityLog();
    });
    head.insertBefore(back, head.firstChild);
  }
  const tickets = adminEl("div", "users-entry-list");
  if (communityScope === "posts") {
    const row = communityItems.find((item) => String(item.code) === String(communityOpenId));
    if (row) tickets.appendChild(communityPostRow(row, true));
  } else if (communityScope === "rooms") {
    const row = communityItems.find((item) => String(item.id) === String(communityOpenId));
    if (row) tickets.appendChild(communityRoomRow(row, true));
  } else {
    const row = communityItems.find((item) => String(item.kind === "wait" ? "wait" : item.id) === String(communityOpenId));
    if (row) tickets.appendChild(communityPhoneRow(row, true));
  }
  reports.appendChild(tickets);
  const history = adminEl("div", "users-history");
  if (communityOpenId === "wait") {
    history.appendChild(adminEl("div", "users-empty", "Waiting for a match."));
  } else if (typeof paintUsersHistory === "function") {
    const events = communityEvents.map((row) => ({
      actor_username: row.actor_username || row.username,
      actor_display_name: row.actor_display_name || row.display_name,
      avatar: row.avatar,
      created_at: row.created_at,
      message: row.message || row.body || "",
      changes: row.changes || []
    }));
    paintUsersHistory(history, events);
  }
  reports.appendChild(history);
  host.appendChild(reports);
}

function openCommunityItem(id) {
  communityOpenId = id == null ? "" : String(id);
  communityEvents = [];
  paintCommunityItems();
  paintCommunityLog();
  if (!communityOpenId || communityOpenId === "wait") return;
  let path = "";
  if (communityScope === "posts") path = "/admin/community/post/" + encodeURIComponent(communityOpenId);
  else if (communityScope === "rooms") path = "/admin/community/room/" + encodeURIComponent(communityOpenId);
  else path = "/admin/community/phone/" + encodeURIComponent(communityOpenId);
  const openId = communityOpenId;
  adminApi(path).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    if (communityOpenId !== openId) return;
    if (communityScope === "posts") {
      const post = data && data.post;
      if (post) {
        communityItems = communityItems.map((item) => item.code === post.code ? post : item);
        communityEvents = (post.comments || []).map((row) => ({
          actor_username: row.username,
          actor_display_name: row.display_name,
          avatar: row.avatar,
          created_at: row.created_at,
          message: row.body || "",
          changes: []
        }));
      }
    } else {
      communityEvents = (data && data.events) || [];
      if (communityScope === "rooms" && data && data.room) {
        communityItems = communityItems.map((item) => item.id === data.room.id ? Object.assign({}, item, data.room) : item);
      }
    }
    paintCommunityItems();
    paintCommunityLog();
  }).catch(() => {
    if (communityOpenId === openId) paintCommunityLog();
  });
}

function loadCommunityRecords(userId) {
  communityItems = [];
  communityOpenId = "";
  communityEvents = [];
  paintCommunityItems();
  paintCommunityLog();
  if (!userId) return;
  if (communityScope === "locks") return;
  const path = communityScope === "posts"
    ? "/admin/user/" + userId + "/posts"
    : (communityScope === "rooms" ? "/admin/user/" + userId + "/rooms" : "/admin/user/" + userId + "/phone");
  adminApi(path).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    if (communitySelectedId !== userId) return;
    if (communityScope === "posts") communityItems = (data && data.posts) || [];
    else if (communityScope === "rooms") communityItems = (data && data.rooms) || [];
    else communityItems = (data && data.calls) || [];
    paintCommunityItems();
    paintCommunityLog();
  }).catch(() => {
    if (communitySelectedId === userId) {
      const host = document.getElementById("community-item-list");
      if (host) {
        host.innerHTML = "";
        host.appendChild(adminEl("div", "users-empty", "Could not load records."));
      }
    }
  });
}

function selectCommunityUser(userId) {
  communitySelectedId = userId;
  communitySelected = communityRows.find((row) => row.id === userId) || communitySelected;
  communityOpenId = "";
  communityEvents = [];
  paintCommunityRows();
  paintCommunityItems();
  paintCommunityLog();
  Promise.all([
    adminApi("/admin/user/" + userId).then((response) => response.ok ? response.json() : null),
    adminApi("/admin/user/" + userId + "/notes").then((response) => response.ok ? response.json() : null)
  ]).then((parts) => {
    if (communitySelectedId !== userId) return;
    const detail = parts[0];
    const notes = parts[1];
    if (detail && detail.user) communitySelected = detail.user;
    usersNoteText = (notes && notes.text) || "";
    paintCommunityLog();
    paintCommunityItems();
    loadCommunityRecords(userId);
  }).catch(() => {});
}

function loadCommunityUsers(more) {
  if (more && communityLoading) return;
  if (more && !communityHasMore) return;
  if (!more) {
    communityLoading = false;
    communityOffset = 0;
    communityRows = [];
    communityHasMore = false;
  }
  if (communityLoading) return;
  communityLoading = true;
  const params = new URLSearchParams();
  params.set("by", communityBy);
  params.set("q", communityQuery);
  params.set("offset", String(communityOffset));
  params.set("limit", String(COMMUNITY_PAGE));
  params.set("flagged", communityFlaggedOnly ? "1" : "0");
  if (communityScope === "locks") {
    params.set("locked", communityLockedOnly ? "1" : "0");
    params.set("lock", communityLockKind);
  }
  adminApi("/admin/user?" + params.toString()).then((response) => {
    if (!response.ok) return null;
    return response.json();
  }).then((data) => {
    communityLoading = false;
    const rows = (data && data.users) || [];
    communityHasMore = !!(data && data.has_more);
    communityRows = more ? communityRows.concat(rows) : rows;
    communityOffset = communityRows.length;
    paintCommunityRows();
  }).catch(() => {
    communityLoading = false;
    const host = document.getElementById("community-search-list");
    if (host && !more) {
      host.innerHTML = "";
      host.appendChild(adminEl("div", "users-empty", "Could not load users."));
    }
  });
}

function queueCommunitySearch() {
  window.clearTimeout(communityTimer);
  communityTimer = window.setTimeout(() => loadCommunityUsers(false), 250);
}

function paintCommunityBoard(main) {
  const view = communityView();
  main.className = "is-users is-community";
  main.appendChild(adminPageHead({
    crumbs: view.crumbs,
    title: view.title,
    note: view.note,
    clock: "est"
  }));
  const board = adminEl("div", "users-search");
  const left = adminEl("div", "users-stack is-left");
  const search = usersCard({});
  const fields = adminEl("div", "users-search-fields");
  fields.appendChild(adminEl("div", "users-field-k", "Search by"));
  const select = adminEl("select", "users-search-by");
  [
    { id: "id", label: "Account ID", hint: "Account ID" },
    { id: "username", label: "Username", hint: "Username" },
    { id: "display_name", label: "Display name", hint: "Display name" }
  ].forEach((opt) => {
    const item = document.createElement("option");
    item.value = opt.id;
    item.textContent = opt.label;
    if (opt.id === communityBy) item.selected = true;
    select.appendChild(item);
  });
  fields.appendChild(select);
  fields.appendChild(adminEl("div", "users-field-k", "Query"));
  const input = adminEl("input", "users-search-q");
  input.type = "text";
  input.value = communityQuery;
  input.placeholder = communityBy === "username" ? "Username" : (communityBy === "display_name" ? "Display name" : "Account ID");
  select.addEventListener("change", () => {
    communityBy = select.value || "id";
    input.placeholder = communityBy === "username" ? "Username" : (communityBy === "display_name" ? "Display name" : "Account ID");
    queueCommunitySearch();
  });
  input.addEventListener("input", () => {
    communityQuery = input.value || "";
    queueCommunitySearch();
  });
  fields.appendChild(input);
  const filter = adminEl("button", "admin-filter-pill");
  filter.type = "button";
  filter.disabled = true;
  filter.appendChild(adminEl("span", "", "Filters"));
  filter.appendChild(adminIcon("down"));
  fields.appendChild(filter);
  const extra = adminEl("div", "users-search-extra");
  extra.appendChild(adminEl("div", "admin-report-rule"));
  const flaggedLine = adminEl("div", "admin-report-check");
  flaggedLine.appendChild(adminEl("span", "", "Flagged Users"));
  const flagged = usersToggle(communityFlaggedOnly);
  flagged.input.addEventListener("change", () => {
    communityFlaggedOnly = !!flagged.input.checked;
    loadCommunityUsers(false);
  });
  flaggedLine.appendChild(flagged.label);
  extra.appendChild(flaggedLine);
  if (communityScope === "locks") {
    const lockedLine = adminEl("div", "admin-report-check");
    lockedLine.appendChild(adminEl("span", "", "Locked only"));
    const locked = usersToggle(communityLockedOnly);
    locked.input.addEventListener("change", () => {
      communityLockedOnly = !!locked.input.checked;
      loadCommunityUsers(false);
    });
    lockedLine.appendChild(locked.label);
    extra.appendChild(lockedLine);
    extra.appendChild(reportsFilterSelect("Lock", communityLockKind, COMMUNITY_LOCK_KINDS, (value) => {
      communityLockKind = value;
      loadCommunityUsers(false);
    }));
  }
  fields.appendChild(extra);
  search.appendChild(fields);
  left.appendChild(search);
  const entries = usersCard({ title: "Account entries", fill: true });
  const list = adminEl("div", "users-search-list");
  list.id = "community-search-list";
  entries.appendChild(list);
  left.appendChild(entries);
  board.appendChild(left);
  const mid = adminEl("div", "users-stack is-mid");
  const listCard = usersCard({ title: view.list, fill: true });
  const items = adminEl("div", "users-entry-list");
  items.id = "community-item-list";
  listCard.appendChild(items);
  mid.appendChild(listCard);
  board.appendChild(mid);
  const right = adminEl("div", "users-stack is-right");
  right.id = "community-log";
  board.appendChild(right);
  main.appendChild(board);
  main.appendChild(adminEl("div", "overview-page-foot", "Snapshot data · Updates every 5 minutes"));
  paintCommunityRows();
  paintCommunityItems();
  paintCommunityLog();
  if (communityRows.length) paintCommunityRows();
  else loadCommunityUsers(false);
  if (communitySelectedId) loadCommunityRecords(communitySelectedId);
}

function paintCommunity(main, sectionId) {
  communityScope = COMMUNITY_VIEWS[sectionId] ? sectionId : "posts";
  communitySelectedId = 0;
  communitySelected = null;
  communityItems = [];
  communityOpenId = "";
  communityEvents = [];
  communityRows = [];
  communityOffset = 0;
  communityHasMore = false;
  paintCommunityBoard(main);
}

registerAdminPage({
  id: "community",
  label: "Community",
  sections: [
    { id: "posts", label: "Posts", icon: "share" },
    { id: "rooms", label: "Rooms", icon: "users" },
    { id: "phone", label: "Phone", icon: "phone" },
    { id: "locks", label: "Locks", icon: "lock" }
  ],
  paint: paintCommunity
});
