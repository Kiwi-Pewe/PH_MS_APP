const COMMUNITY_SETTINGS_SECTIONS = {
  posts: "Post settings",
  rooms: "Room settings",
  phone: "Phone Settings",
  finder: "Server Finder settings"
};

let communitySettingsSection = "posts";

function showCommunitySettingsSection(id) {
  if (!COMMUNITY_SETTINGS_SECTIONS[id]) id = "posts";
  communitySettingsSection = id;
  document.querySelectorAll("#community-settings-nav [data-community-settings]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-community-settings") === id);
  });
  const title = document.getElementById("community-settings-page-title");
  if (title) title.textContent = COMMUNITY_SETTINGS_SECTIONS[id];
  const page = document.getElementById("community-settings-page");
  if (page) page.replaceChildren();
}

function openCommunitySettings() {
  const overlay = document.getElementById("community-settings-overlay");
  if (!overlay) return;
  showCommunitySettingsSection("posts");
  overlay.hidden = false;
}

function closeCommunitySettings() {
  const overlay = document.getElementById("community-settings-overlay");
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
}

function communitySettingsOpen() {
  const overlay = document.getElementById("community-settings-overlay");
  return !!(overlay && !overlay.hidden);
}

document.getElementById("community-settings-open").addEventListener("click", () => openCommunitySettings());
document.getElementById("community-settings-close").addEventListener("click", () => closeCommunitySettings());
document.getElementById("community-settings-overlay").addEventListener("mousedown", (e) => {
  if (e.target && e.target.id === "community-settings-overlay") closeCommunitySettings();
});
document.getElementById("community-settings-nav").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-community-settings]");
  if (!btn) return;
  showCommunitySettingsSection(btn.getAttribute("data-community-settings"));
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !communitySettingsOpen()) return;
  e.preventDefault();
  e.stopPropagation();
  closeCommunitySettings();
}, true);
