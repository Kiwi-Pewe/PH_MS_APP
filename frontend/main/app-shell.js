// ==================================================================
// app-shell.js - Main-view switching and the chrome around it.
// ==================================================================

function publishViewerFocus() {
  if (typeof ws === "undefined" || !ws || ws.readyState !== 1) return;
  const view = document.querySelector(".main-view.active");
  const onChannel = view && view.id === "view-channel";
  const channelId = onChannel && typeof currentChannelId !== "undefined" ? currentChannelId : null;
  ws.send(JSON.stringify({ type: "focus", channel_id: channelId || null }));
}

function switchMainView(viewName) {
  if (viewName !== "profile" && typeof pauseAllOneiraPlayers === "function") {
    pauseAllOneiraPlayers();
  }
  if (viewName === "profile" && typeof restoreAllOneiraPlayers === "function") {
    restoreAllOneiraPlayers();
  }
  document.querySelectorAll(".main-view").forEach(v => v.classList.remove("active"));
  document.getElementById(`view-${viewName}`).classList.add("active");
  if (viewName !== "community" && typeof restoreCommunityRoomComposer === "function") restoreCommunityRoomComposer();
  updateHomeBadge();
  if (typeof publishViewerFocus === "function") publishViewerFocus();
  if (typeof refreshAttentionGifs === "function") refreshAttentionGifs();
}

let placeGen = 0;
let bodyGen = 0;
const placeCache = { servers: {}, messages: {}, profiles: {}, mini: {} };

function currentPlaceToken() {
  return { place: placeGen, body: bodyGen };
}

function placeIsCurrent(token) {
  return !!(token && Number(token.place) === Number(placeGen));
}

function bodyIsCurrent(token) {
  return !!(token && Number(token.place) === Number(placeGen) && Number(token.body) === Number(bodyGen));
}

function placeMessageKey(kind, id) {
  return String(kind) + ":" + String(id);
}

function rememberPlaceMessages(kind, id, rows) {
  placeCache.messages[placeMessageKey(kind, id)] = Array.isArray(rows) ? rows.slice() : [];
}

function recallPlaceMessages(kind, id) {
  const rows = placeCache.messages[placeMessageKey(kind, id)];
  return Array.isArray(rows) ? rows.slice() : null;
}

function fillPlaceHold(host, count) {
  if (!host) return;
  host.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "place-hold";
  const widths = ["is-wide", "is-mid", "is-short", "is-wide", "is-mid"];
  const n = Math.max(3, Number(count) || 5);
  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.className = "place-hold-row " + widths[i % widths.length];
    wrap.appendChild(row);
  }
  host.appendChild(wrap);
}

function showPlaceSidebar(kind) {
  const map = {
    home: "dm-sidebar-view",
    server: "server-sidebar-view",
    settings: "settings-sidebar-view",
    profile: "profile-sidebar-view",
    community: "community-sidebar-view"
  };
  const shown = map[kind];
  if (!shown) return;
  ["dm-sidebar-view", "server-sidebar-view", "settings-sidebar-view", "profile-sidebar-view", "community-sidebar-view"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === shown ? "flex" : "none";
  });
  const footer = document.getElementById("account-footer");
  if (footer) footer.style.display = kind === "settings" ? "none" : "flex";
}

function applyPlaceChrome(opts) {
  opts = opts || {};
  if (opts.sidebar) showPlaceSidebar(opts.sidebar);
  if (opts.view) switchMainView(opts.view);
  if (opts.topbar != null && typeof setTopbarTab === "function") setTopbarTab(opts.topbar);
  if (opts.titleEl && opts.title != null) {
    const el = document.getElementById(opts.titleEl);
    if (el) el.textContent = opts.title;
  }
  if (opts.hold) {
    (Array.isArray(opts.hold) ? opts.hold : [opts.hold]).forEach((id) => {
      fillPlaceHold(document.getElementById(id), opts.holdCount);
    });
  }
  if (opts.members) {
    if (typeof showMemberListPanel === "function") showMemberListPanel();
    fillPlaceHold(document.getElementById("member-list-body"), 6);
  } else if (opts.hideMembers && typeof hideMemberList === "function") {
    hideMemberList();
  }
  if (typeof refreshAttentionGifs === "function") refreshAttentionGifs();
}

function beginPlace(opts) {
  opts = opts || {};
  placeGen += 1;
  bodyGen += 1;
  if (opts.mini !== false && typeof closeMiniProfile === "function") closeMiniProfile();
  if (opts.settings && typeof closeSettingsChrome === "function") closeSettingsChrome();
  if (opts.serverSettings && typeof closeServerSettingsChrome === "function") closeServerSettingsChrome();
  if (opts.channelSettings && typeof closeChannelSettingsChrome === "function") closeChannelSettingsChrome();
  if (opts.view !== "community" && typeof closeCommunitiesChrome === "function") closeCommunitiesChrome();
  applyPlaceChrome(opts);
  return currentPlaceToken();
}

function beginBody(opts) {
  bodyGen += 1;
  applyPlaceChrome(opts || {});
  return currentPlaceToken();
}

function isOneiraAdmin() {
  return String(myUsername || "").toLowerCase() === "kiwi";
}

function syncAdminTab() {
  const btn = document.getElementById("admin-tab");
  if (!btn) return;
  btn.hidden = !isOneiraAdmin();
}

document.querySelectorAll("#secondary-nav .nav-item").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!btn.dataset.view) return;
    if (!(await leaveDocIfNeeded())) return;
    if (btn.dataset.view === "settings") {
      if (typeof openSettings === "function") await openSettings();
      return;
    }
    if (btn.dataset.view === "feed") {
      if (typeof openFeedView === "function") openFeedView();
      return;
    }
    document.querySelectorAll("#secondary-nav .nav-item").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".dm-item").forEach(d => d.classList.remove("active"));
    btn.classList.add("active");
    beginPlace({
      sidebar: "home",
      view: btn.dataset.view,
      hideMembers: true
    });
    if (btn.dataset.view === "friends") refreshFriendsView();
  });
});

document.querySelectorAll("#topbar .tab").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (btn.dataset.tab === "settings") {
      if (typeof openSettings === "function") await openSettings();
      return;
    }
    if (btn.dataset.tab === "profile") {
      if (typeof openOwnProfile === "function") await openOwnProfile();
      return;
    }
    if (btn.dataset.tab === "communities") {
      if (typeof openCommunities === "function") await openCommunities();
      return;
    }
    if (btn.dataset.tab === "messages") {
      await goHome();
    }
    if (btn.id === "mail-tab") {
      if (typeof toggleMailTray === "function") toggleMailTray();
      return;
    }
    if (btn.id === "feedback-tab") {
      if (typeof openFeedbackCard === "function") openFeedbackCard();
    }
    if (btn.id === "admin-tab") {
      window.location.href = "../admin/app.html";
    }
  });
});

async function goHome() {
  if (typeof closeMiniProfile === "function") closeMiniProfile();
  if (!(await leaveDocIfNeeded())) return false;
  hideDocsChrome();
  selectRailIcon("home", document.getElementById("home-icon"));

  currentServerId = null;
  currentServerOwnerId = null;
  currentServerPerms = {};
  currentServerHighestRole = null;
  currentServerTimeoutUntil = null;
  mentionRoleList = [];
  currentChannelId = null;
  currentChannelType = null;
  currentChannelName = null;
  if (typeof closeSettingsChrome === "function") closeSettingsChrome();
  if (typeof closeServerSettingsChrome === "function") closeServerSettingsChrome();
  if (typeof closeChannelSettingsChrome === "function") closeChannelSettingsChrome();
  if (typeof closeProfileChrome === "function" && !closeProfileChrome()) return false;
  beginPlace({
    sidebar: "home",
    view: "feed",
    topbar: "messages",
    hideMembers: true
  });

  resetChatView();
  syncAppAddress();
  return true;
}

document.getElementById("home-icon").addEventListener("click", () => goHome());

let appAddressLock = false;

function setAppAddress(path, replace) {
  if (!path || appAddressLock) return;
  if (window.location.pathname === path) return;
  if (replace) history.replaceState({ oneira: path }, "", path);
  else history.pushState({ oneira: path }, "", path);
}

function syncAppAddress() {
  if (appAddressLock) return;
  const profileView = document.getElementById("view-profile");
  if (profileView && profileView.classList.contains("active") && typeof profileUser !== "undefined" && profileUser && profileUser.username) {
    setAppAddress("/profile/" + encodeURIComponent(profileUser.username));
    return;
  }
  if (typeof isCommunitiesOpen !== "undefined" && isCommunitiesOpen) {
    if (typeof communityOpenPost !== "undefined" && communityOpenPost && communityOpenPost.code && typeof communityPostPerson === "function") {
      const person = communityPostPerson(communityOpenPost);
      setAppAddress("/posts/" + encodeURIComponent(person.handle) + "/" + communityOpenPost.code);
      return;
    }
    setAppAddress("/community");
    return;
  }
  if (typeof currentServerId !== "undefined" && currentServerId && typeof currentServerData !== "undefined" && currentServerData && currentServerData.url_slug) {
    setAppAddress("/" + currentServerData.url_slug, true);
    return;
  }
  if (typeof currentServerId !== "undefined" && currentServerId) {
    setAppAddress("/server/" + encodeURIComponent(currentServerId), true);
    return;
  }
  setAppAddress("/messages");
}

async function applyAppAddress() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("join_type") || params.get("connection")) return;
  const parts = (window.location.pathname || "").split("/").filter(Boolean);
  if (!parts.length || parts[0] === "main") {
    setAppAddress("/messages");
    return;
  }
  appAddressLock = true;
  try {
    if (parts[0] === "messages") {
      await goHome();
      return;
    }
    if (parts[0] === "community") {
      if (typeof openCommunities === "function") await openCommunities();
      return;
    }
    if (parts[0] === "posts" && parts[1] && parts[2]) {
      if (typeof openCommunities === "function") await openCommunities();
      if (typeof openCommunityPostByCode === "function") await openCommunityPostByCode(decodeURIComponent(parts[2]));
      return;
    }
    if (parts[0] === "profile" && parts[1]) {
      const token = beginPlace({
        sidebar: "profile",
        view: "profile",
        hold: ["profile-board"]
      });
      const response = await fetch(`https://${serverAddress}/user_by_username/${encodeURIComponent(decodeURIComponent(parts[1]))}`, { credentials: "include" });
      if (!placeIsCurrent(token)) return;
      if (!response.ok) return;
      const data = await response.json();
      if (!placeIsCurrent(token)) return;
      if (data && data.id && typeof openUserProfile === "function") await openUserProfile(data.id);
      return;
    }
    if (parts[0] === "server" && parts[1] && typeof openServer === "function") {
      await openServer(decodeURIComponent(parts[1]));
      return;
    }
    if (parts.length === 1) {
      const response = await fetch(`https://${serverAddress}/server_by_slug/${encodeURIComponent(parts[0])}`, { credentials: "include" });
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.id && typeof openServer === "function") await openServer(data.id);
    }
  } finally {
    appAddressLock = false;
    syncAppAddress();
  }
}

window.addEventListener("popstate", () => {
  applyAppAddress();
});
