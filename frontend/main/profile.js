// ==================================================================
// profile.js - Open own or someone else's profile. Pages rail takes
// the settings-nav slot. Server rail stays in view; edit expands it.
// ==================================================================

function profileApi(path, options) {
  return fetch("https://" + serverAddress + path, Object.assign({
    credentials: "include",
    headers: { "Content-Type": "application/json" }
  }, options || {}));
}

const MINI_PROFILE_PAGE_ID = "mini_profile";

function ensureMiniProfilePage(layout) {
  const pages = (layout && layout.pages) ? layout.pages.slice() : [];
  const existing = pages.find(page => page.id === MINI_PROFILE_PAGE_ID);
  if (existing) {
    existing.title = "Mini Profile";
    existing.visibility = "owner";
    existing.tiles = [];
    layout.pages = pages;
    return layout;
  }
  let insertAt = pages.length;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].visibility === "owner") {
      insertAt = i;
      break;
    }
  }
  pages.splice(insertAt, 0, {
    id: MINI_PROFILE_PAGE_ID,
    title: "Mini Profile",
    visibility: "owner",
    tiles: []
  });
  layout.pages = pages;
  return layout;
}

function isMiniProfilePageId(pageId) {
  return pageId === MINI_PROFILE_PAGE_ID;
}

function isMiniProfileIdentityTile(type) {
  return type === "banner" || type === "avatar" || type === "display_name";
}

function miniProfileIdentitySubject(type) {
  if (type === "banner") return "Banner";
  if (type === "avatar") return "Profile Picture";
  if (type === "display_name") return "Name";
  if (type === "bio") return "Bio";
  return "Mini Profile";
}

function showMiniProfileIdentityMenu(e, type) {
  if (!profileIsOwn || typeof openContextMenu !== "function") return;
  if (e && e.preventDefault) e.preventDefault();
  if (e && e.stopPropagation) e.stopPropagation();
  const subject = miniProfileIdentitySubject(type);
  const name = (typeof profileOwnerName === "function" && profileOwnerName()) || myDisplayName || myUsername || subject;
  openContextMenu(e.clientX, e.clientY, {
    avatarText: typeof avatarLetter === "function" ? avatarLetter(name) : (name || "?").slice(0, 1),
    title: subject
  }, [
    { label: "Edit " + subject, onSelect: () => openMiniProfileEditorPage() }
  ]);
}

function openMiniProfileEditorPage() {
  if (!profileIsOwn) return;
  if (typeof closeMiniProfile === "function") closeMiniProfile();
  profileActivePageId = MINI_PROFILE_PAGE_ID;
  if (!profileEditing) enterProfileEdit();
  else paintProfileChrome();
}

function applyProfilePayload(data) {
  profileUser = data.user || null;
  profileOwnerId = profileUser ? profileUser.id : null;
  profileIsOwn = !!(profileUser && profileUser.id === myUserId);
  profileLimited = !!data.limited;
  profileFriends = data.friends || [];
  profileSavedLayout = data.layout || { pages: [], grid_cols: PROFILE_COLS };
  if (profileIsOwn) profileSavedLayout = ensureMiniProfilePage(profileSavedLayout);
  profileDraft = cloneProfileLayout(profileSavedLayout);
  profileDirty = false;
  const pages = profileDraft.pages || [];
  if (!pages.some(page => page.id === profileActivePageId)) {
    profileActivePageId = pages[0] ? pages[0].id : "profile";
  }
}

async function loadOwnProfile() {
  const response = await profileApi("/profile_layout");
  if (!response.ok) throw new Error("Could not load profile.");
  applyProfilePayload(await response.json());
}

async function loadPublicProfile(userId) {
  const response = await profileApi("/profile/" + userId);
  if (!response.ok) throw new Error("Could not load profile.");
  applyProfilePayload(await response.json());
}

function hideProfileChromeBits() {
  const side = document.getElementById("profile-sidebar-view");
  if (side) side.style.display = "none";
  document.getElementById("main-grid").classList.remove("is-profile-edit");
  const palette = document.getElementById("profile-palette");
  if (palette) palette.hidden = true;
  profileEditing = false;
}

function closeProfileChrome() {
  if (typeof pauseAllOneiraPlayers === "function") pauseAllOneiraPlayers();
  if (!isProfileOpen) {
    hideProfileChromeBits();
    return true;
  }
  if (profileEditing && profileDirty && !window.confirm("Discard profile changes?")) return false;
  isProfileOpen = false;
  profileEditing = false;
  profileDirty = false;
  hideProfileChromeBits();
  return true;
}

function showProfileSidebar() {
  document.getElementById("dm-sidebar-view").style.display = "none";
  document.getElementById("server-sidebar-view").style.display = "none";
  const settingsSide = document.getElementById("settings-sidebar-view");
  if (settingsSide) settingsSide.style.display = "none";
  document.getElementById("profile-sidebar-view").style.display = "flex";
  document.getElementById("account-footer").style.display = "flex";
}

function renderProfilePages() {
  const host = document.getElementById("profile-page-list");
  const tools = document.getElementById("profile-page-tools");
  if (!host) return;
  host.innerHTML = "";
  if (tools) tools.innerHTML = "";
  const layout = profileDraft || profileSavedLayout || { pages: [] };
  const pages = layout.pages || [];
  let sawOwner = false;
  pages.forEach(page => {
    if (page.visibility === "owner" && !sawOwner) {
      const label = document.createElement("div");
      label.className = "profile-page-group";
      label.textContent = "Only visible to you";
      host.appendChild(label);
      sawOwner = true;
    }
    const row = document.createElement("button");
    row.type = "button";
    row.className = "profile-page-item" + (page.id === profileActivePageId ? " is-on" : "");
    const name = document.createElement("span");
    name.textContent = page.title;
    row.appendChild(name);
    if (profileIsOwn && profileEditing) {
      const btns = document.createElement("div");
      btns.className = "profile-page-tools-row";
      const up = document.createElement("button");
      up.type = "button";
      up.textContent = "\u2191";
      up.title = "Move up";
      up.addEventListener("click", (e) => {
        e.stopPropagation();
        moveProfilePage(page.id, -1);
      });
      const down = document.createElement("button");
      down.type = "button";
      down.textContent = "\u2193";
      down.title = "Move down";
      down.addEventListener("click", (e) => {
        e.stopPropagation();
        moveProfilePage(page.id, 1);
      });
      btns.appendChild(up);
      btns.appendChild(down);
      row.appendChild(btns);
    }
    row.addEventListener("click", () => {
      profileActivePageId = page.id;
      renderProfilePages();
      renderProfileBoard();
    });
    if (profileIsOwn && profileEditing && !isMiniProfilePageId(page.id)) {
      row.addEventListener("dblclick", () => renameProfilePage(page.id));
    }
    host.appendChild(row);
  });
  if (tools && profileIsOwn && profileEditing) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "settings-row-btn";
    add.textContent = "Add page";
    add.addEventListener("click", addProfilePage);
    tools.appendChild(add);
  }
}

function paintProfileChrome() {
  const editBtn = document.getElementById("profile-edit-btn");
  const actions = document.getElementById("profile-edit-actions");
  const label = document.getElementById("profile-owner-label");
  const note = document.getElementById("profile-limited-note");
  if (editBtn) editBtn.hidden = !(profileIsOwn && !profileEditing);
  if (actions) {
    if (profileIsOwn && profileEditing) actions.removeAttribute("hidden");
    else actions.setAttribute("hidden", "");
  }
  if (label) {
    label.textContent = profileIsOwn ? "" : (profileOwnerName() + (profileLimited ? " (limited)" : ""));
  }
  if (note) note.hidden = !profileLimited;
  document.getElementById("main-grid").classList.toggle("is-profile-edit", !!(profileIsOwn && profileEditing));
  const palette = document.getElementById("profile-palette");
  if (palette) palette.hidden = !(profileIsOwn && profileEditing && !isMiniProfilePageId(profileActivePageId));
  if (profileIsOwn && profileEditing && typeof renderProfilePalette === "function") renderProfilePalette();
  renderProfilePages();
  renderProfileBoard();
}

async function openUserProfile(userId) {
  if (typeof leaveDocIfNeeded === "function" && !(await leaveDocIfNeeded())) return;
  if (isProfileOpen && profileEditing && profileDirty) {
    if (!window.confirm("Discard profile changes?")) return;
  }
  if (typeof closeSettingsChrome === "function") closeSettingsChrome();
  if (typeof closeServerSettingsChrome === "function") closeServerSettingsChrome();
  if (typeof hideMemberList === "function") hideMemberList();
  if (typeof hideDocsChrome === "function") hideDocsChrome();
  try {
    if (!userId || userId === myUserId) await loadOwnProfile();
    else await loadPublicProfile(userId);
  } catch (e) {
    window.alert(e.message || "Could not open profile.");
    return;
  }
  isProfileOpen = true;
  profileEditing = false;
  showProfileSidebar();
  setTopbarTab(profileIsOwn ? "profile" : "");
  switchMainView("profile");
  paintProfileChrome();
}

async function openOwnProfile() {
  await openUserProfile(myUserId);
}

async function saveProfileIdentity(identity) {
  const response = await profileApi("/profile_identity", {
    method: "POST",
    body: JSON.stringify(identity || {})
  });
  if (!response.ok) throw new Error("Could not save profile.");
  const data = await response.json();
  if (data.user && profileUser) {
    profileUser.status = data.user.status || "";
    profileUser.pronouns = data.user.pronouns || "";
    profileUser.aliases = data.user.aliases || [];
  }
}

function enterProfileEdit() {
  if (!profileIsOwn) return;
  profileEditing = true;
  profileDraft = cloneProfileLayout(profileSavedLayout);
  profileDirty = false;
  paintProfileChrome();
}

function exitProfileEdit(restore) {
  profileEditing = false;
  if (restore) {
    profileDraft = cloneProfileLayout(profileSavedLayout);
    profileDirty = false;
  }
  paintProfileChrome();
}

async function saveProfileLayout() {
  if (!profileIsOwn) return;
  const saveBtn = document.getElementById("profile-save-btn");
  if (saveBtn) saveBtn.disabled = true;
  try {
    stampOwnLocalTimeTimezone(profileDraft);
    const response = await profileApi("/profile_layout", {
      method: "POST",
      body: JSON.stringify(Object.assign({ grid_cols: PROFILE_COLS }, profileDraft || { pages: [] }))
    });
    if (!response.ok) throw new Error("Could not save profile.");
    applyProfilePayload(await response.json());
    profileEditing = false;
    paintProfileChrome();
  } catch (e) {
    window.alert(e.message || "Could not save profile.");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function editProfileIdentity(tile, e) {
  if (!profileIsOwn) return;
  if (isMiniProfileIdentityTile(tile.type)) {
    showMiniProfileIdentityMenu(e, tile.type);
  }
}

function bindProfileQuickEdit(el, tile) {
  if (!isMiniProfileIdentityTile(tile.type)) return;
  el.style.cursor = "pointer";
  el.addEventListener("click", (e) => showMiniProfileIdentityMenu(e, tile.type));
}

document.getElementById("profile-edit-btn").addEventListener("click", enterProfileEdit);
document.getElementById("profile-cancel-btn").addEventListener("click", () => exitProfileEdit(true));
document.getElementById("profile-save-btn").addEventListener("click", () => saveProfileLayout());
document.getElementById("footer-profile-btn").addEventListener("click", () => openOwnProfile());
