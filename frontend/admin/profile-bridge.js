let serverAddress = (typeof API_HOST === "string" && API_HOST) ? API_HOST : "";
let currentServerId = null;
let myUserId = null;
let myUsername = "";
let myDisplayName = "";
let languageTimePrefs = { time_format: "12" };
let isProfileOpen = false;
let profileOwnerId = null;
let profileIsOwn = false;
let profileLimited = false;
let profileUser = null;
let profileSavedLayout = null;
let profileDraft = null;
let profileFriends = [];
let profileActivePageId = "profile";
let profileEditing = false;
let profileDirty = false;

function profileApi(path, options) {
  return fetch("https://" + serverAddress + path, Object.assign({
    credentials: "include",
    headers: { "Content-Type": "application/json" }
  }, options || {}));
}

function isMiniProfilePageId(pageId) {
  return pageId === "mini_profile";
}

function profileOrderedPages(pages) {
  const rows = pages || [];
  return rows.filter((page) => page.visibility !== "owner").concat(rows.filter((page) => page.visibility === "owner"));
}

function isMiniProfileIdentityTile(type) {
  return type === "banner" || type === "avatar" || type === "display_name";
}

function profileOwnerName() {
  return (profileUser && (profileUser.display_name || profileUser.username)) || "";
}

function profileOwnerHandle() {
  return (profileUser && profileUser.username) || "";
}

function profileHasConnection(provider) {
  return provider === "youtube" || provider === "steam";
}

function adminSyncProfileOwner() {
  if (!adminUser) return;
  myUserId = adminUser.id || null;
  myUsername = adminUser.username || "";
  myDisplayName = adminUser.display_name || myUsername;
  serverAddress = (typeof API_HOST === "string" && API_HOST) ? API_HOST : serverAddress;
}
