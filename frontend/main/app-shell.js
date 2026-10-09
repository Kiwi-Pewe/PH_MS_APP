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
  updateHomeBadge();
  if (typeof publishViewerFocus === "function") publishViewerFocus();
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
    switchMainView(btn.dataset.view);
    if (btn.dataset.view && typeof hideMemberList === "function") hideMemberList();
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
  document.getElementById("server-sidebar-view").style.display = "none";
  document.getElementById("dm-sidebar-view").style.display = "flex";

  resetChatView();
  if (typeof setTopbarTab === "function") setTopbarTab("messages");
  syncAppAddress();
  return true;
}

document.getElementById("home-icon").addEventListener("click", () => goHome());

let appAddressLock = false;

function setAppAddress(path) {
  if (!path || appAddressLock) return;
  if (window.location.pathname === path) return;
  history.pushState({ oneira: path }, "", path);
}

function syncAppAddress() {
  if (appAddressLock) return;
  const profileView = document.getElementById("view-profile");
  if (profileView && profileView.classList.contains("active") && typeof profileUser !== "undefined" && profileUser && profileUser.username) {
    setAppAddress("/profile/" + encodeURIComponent(profileUser.username));
    return;
  }
  if (typeof currentServerId !== "undefined" && currentServerId && typeof currentServerData !== "undefined" && currentServerData && currentServerData.url_slug) {
    setAppAddress("/" + currentServerData.url_slug);
    return;
  }
  if (typeof currentServerId !== "undefined" && currentServerId) {
    setAppAddress("/server/" + encodeURIComponent(currentServerId));
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
    if (parts[0] === "profile" && parts[1]) {
      const response = await fetch(`https://${serverAddress}/user_by_username/${encodeURIComponent(decodeURIComponent(parts[1]))}`, { credentials: "include" });
      if (!response.ok) return;
      const data = await response.json();
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
