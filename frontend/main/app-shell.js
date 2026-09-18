// ==================================================================
// app-shell.js - Main-view switching and the chrome around it.
// ==================================================================

function switchMainView(viewName) {
  document.querySelectorAll(".main-view").forEach(v => v.classList.remove("active"));
  document.getElementById(`view-${viewName}`).classList.add("active");
  updateHomeBadge();
}

document.querySelectorAll("#secondary-nav .nav-item").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!(await leaveDocIfNeeded())) return;
    if (btn.dataset.view === "settings") {
      if (typeof openSettings === "function") await openSettings();
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
  });
});

async function goHome() {
  if (!(await leaveDocIfNeeded())) return false;
  hideDocsChrome();
  selectRailIcon("home", document.getElementById("home-icon"));

  // Remembering the last DM/party open is deferred (see Handoff) -
  // Home always resets to blank, same as before servers existed.
  currentServerId = null;
  currentServerOwnerId = null;
  currentChannelId = null;
  currentChannelType = null;
  currentChannelName = null;
  if (typeof closeSettingsChrome === "function") closeSettingsChrome();
  if (typeof closeProfileChrome === "function" && !closeProfileChrome()) return false;
  document.getElementById("server-sidebar-view").style.display = "none";
  document.getElementById("dm-sidebar-view").style.display = "flex";

  resetChatView();
  if (typeof setTopbarTab === "function") setTopbarTab("messages");
  return true;
}

document.getElementById("home-icon").addEventListener("click", () => goHome());
