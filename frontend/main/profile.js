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
    { label: "Edit " + subject, onSelect: () => {
      openMiniProfileEditorPage();
      const tile = typeof findIdentityBoardTile === "function"
        ? findIdentityBoardTile(type)
        : { type: type, props: {} };
      if (typeof openProfileTileOptions === "function") openProfileTileOptions(tile);
    } }
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
  if (profileUser && typeof rememberUserStatus === "function") rememberUserStatus(profileUser.id, profileUser.status);
  if (typeof clearProfileCommentCache === "function") clearProfileCommentCache();
  if (typeof clearProfileServerCache === "function") clearProfileServerCache();
  profileIsOwn = !!(profileUser && profileUser.id === myUserId);
  profileLimited = !!data.limited;
  profileFriends = data.friends || [];
  profileSavedLayout = data.layout || { pages: [], grid_cols: PROFILE_COLS };
  if (typeof stampClockNamedTimezones === "function") stampClockNamedTimezones(profileSavedLayout);
  if (profileIsOwn) profileSavedLayout = ensureMiniProfilePage(profileSavedLayout);
  profileDraft = cloneProfileLayout(profileSavedLayout);
  profileDirty = false;
  if (profileIsOwn) {
    if (typeof rememberOwnIdentity === "function") rememberOwnIdentity(profileSavedLayout);
    if (typeof paintOwnFooterAvatar === "function") paintOwnFooterAvatar();
  }
  const pages = profileDraft.pages || [];
  if (!pages.some(page => page.id === profileActivePageId)) {
    profileActivePageId = pages[0] ? pages[0].id : "profile";
  }
}

async function loadOwnProfile() {
  const response = await profileApi("/profile_layout");
  if (!response.ok) throw new Error("Could not load profile.");
  const data = await response.json();
  applyProfilePayload(data);
  if (typeof placeCache !== "undefined" && data.user && data.user.id) placeCache.profiles[String(data.user.id)] = data;
}

async function loadPublicProfile(userId) {
  const response = await profileApi("/profile/" + userId);
  if (!response.ok) throw new Error("Could not load profile.");
  const data = await response.json();
  applyProfilePayload(data);
  if (typeof placeCache !== "undefined" && data.user && data.user.id) placeCache.profiles[String(data.user.id)] = data;
}

function hideProfileChromeBits() {
  const side = document.getElementById("profile-sidebar-view");
  if (side) side.style.display = "none";
  document.getElementById("main-grid").classList.remove("is-profile-edit");
  const palette = document.getElementById("profile-palette");
  if (palette) palette.hidden = true;
  profileEditing = false;
  closeBlockedUsersSubmenu();
}

function closeProfileChrome() {
  if (typeof pauseAllOneiraPlayers === "function") pauseAllOneiraPlayers();
  if (!isProfileOpen) {
    hideProfileChromeBits();
    return true;
  }
  if (profileEditing && profileDirty && !window.confirm("Discard profile changes?")) return false;
  if (profileEditing && profileDraft && typeof dropIdentityDrafts === "function") dropIdentityDrafts(profileDraft);
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

const PROFILE_PUBLIC_CAP = 4;
const PROFILE_PRIVATE_CAP = 5;
let profilePageDragId = "";
let profilePageSuppressClick = false;

function profilePageFixed(page) {
  return !!page && (page.id === "profile" || isMiniProfilePageId(page.id));
}

function profileSideOpen(pages, owner) {
  const count = (pages || []).filter(page => (page.visibility === "owner") === !!owner).length;
  return count < (owner ? PROFILE_PRIVATE_CAP : PROFILE_PUBLIC_CAP);
}

function profileOrderedPages(pages) {
  const rows = pages || [];
  return rows.filter(page => page.visibility !== "owner").concat(rows.filter(page => page.visibility === "owner"));
}

function bindProfilePageRail() {
  if (bindProfilePageRail.ready) return;
  const host = document.getElementById("profile-page-list");
  if (!host) return;
  bindProfilePageRail.ready = true;
  host.addEventListener("contextmenu", (e) => {
    if (!profileIsOwn || !profileEditing) return;
    if (e.target.closest(".profile-page-item")) return;
    e.preventDefault();
    const pages = (profileDraft && profileDraft.pages) || [];
    const full = !profileSideOpen(pages, false) && !profileSideOpen(pages, true);
    if (typeof openContextMenu !== "function") return;
    openContextMenu(e.clientX, e.clientY, null, [
      {
        label: "Create a new page",
        disabled: full,
        onSelect: () => { if (!full && typeof openProfilePageCreate === "function") openProfilePageCreate(); }
      }
    ]);
  });
}

function clearProfilePageDropMarks(host) {
  host.querySelectorAll(".profile-page-item").forEach(row => {
    row.classList.remove("dnd-drop-before", "dnd-drop-after", "dnd-dragging");
  });
}

function bindProfilePageDrag(row, page, host) {
  if (!profileIsOwn || !profileEditing) return;
  row.draggable = true;
  row.addEventListener("dragstart", (e) => {
    profilePageDragId = page.id;
    profilePageSuppressClick = false;
    row.classList.add("dnd-dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", page.id); } catch (err) {}
  });
  row.addEventListener("dragend", () => {
    profilePageDragId = "";
    profilePageSuppressClick = true;
    clearProfilePageDropMarks(host);
    setTimeout(() => { profilePageSuppressClick = false; }, 0);
  });
  row.addEventListener("dragover", (e) => {
    if (!profilePageDragId || profilePageDragId === page.id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    host.querySelectorAll(".profile-page-item").forEach(item => {
      item.classList.remove("dnd-drop-before", "dnd-drop-after");
    });
    row.classList.add(before ? "dnd-drop-before" : "dnd-drop-after");
  });
  row.addEventListener("drop", (e) => {
    if (!profilePageDragId || profilePageDragId === page.id) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const movedId = profilePageDragId;
    profilePageDragId = "";
    clearProfilePageDropMarks(host);
    placeProfilePage(movedId, page.id, !before);
  });
}

function placeProfilePage(movedId, targetId, after) {
  const pages = (profileDraft && profileDraft.pages) || [];
  const moved = pages.find(page => page.id === movedId);
  const target = pages.find(page => page.id === targetId);
  if (!moved || !target || moved.id === target.id) return;
  const wantOwner = target.visibility === "owner";
  if (profilePageFixed(moved) && (moved.visibility === "owner") !== wantOwner) return;
  const sameSide = (moved.visibility === "owner") === wantOwner;
  if (!sameSide && !profileSideOpen(pages, wantOwner)) return;
  moved.visibility = wantOwner ? "owner" : "public";
  const publics = pages.filter(page => page.visibility !== "owner" && page.id !== moved.id);
  const privates = pages.filter(page => page.visibility === "owner" && page.id !== moved.id);
  const bucket = wantOwner ? privates : publics;
  let index = bucket.findIndex(page => page.id === target.id);
  if (index < 0) index = bucket.length;
  else if (after) index += 1;
  bucket.splice(index, 0, moved);
  profileDraft.pages = publics.concat(privates);
  if (typeof markProfileDirty === "function") markProfileDirty();
}

function renderProfilePages() {
  const host = document.getElementById("profile-page-list");
  const tools = document.getElementById("profile-page-tools");
  if (!host) return;
  bindProfilePageRail();
  host.innerHTML = "";
  const layout = profileDraft || profileSavedLayout || { pages: [] };
  if (tools) {
    const showAdd = profileIsOwn && profileEditing;
    const showMore = profileIsOwn && !profileEditing;
    tools.hidden = !(showAdd || showMore);
    tools.innerHTML = "";
    if (showAdd) {
      const pages = layout.pages || [];
      const full = !profileSideOpen(pages, false) && !profileSideOpen(pages, true);
      const add = document.createElement("button");
      add.type = "button";
      add.className = "settings-row-btn profile-page-add";
      add.textContent = "Add Page";
      add.disabled = full;
      add.addEventListener("click", () => {
        if (!full && typeof openProfilePageCreate === "function") openProfilePageCreate();
      });
      tools.appendChild(add);
    }
    if (showMore) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "profile-page-item profile-more-tab";
      more.textContent = "More";
      more.addEventListener("click", openProfileMoreMenu);
      tools.appendChild(more);
    }
  }
  const ordered = profileOrderedPages(layout.pages || []);
  const privateStart = ordered.findIndex(page => page.visibility === "owner");
  ordered.forEach((page, index) => {
    if (index === privateStart) {
      const line = document.createElement("div");
      line.className = "profile-page-split";
      host.appendChild(line);
      const label = document.createElement("div");
      label.className = "profile-page-group";
      label.textContent = "Only visible to you";
      host.appendChild(label);
    }
    const row = document.createElement("button");
    row.type = "button";
    row.className = "profile-page-item" + (page.id === profileActivePageId ? " is-on" : "");
    row.dataset.pageId = page.id;
    const name = document.createElement("span");
    name.textContent = page.title;
    row.appendChild(name);
    row.addEventListener("click", () => {
      if (profilePageSuppressClick) {
        profilePageSuppressClick = false;
        return;
      }
      profileActivePageId = page.id;
      renderProfilePages();
      renderProfileBoard();
    });
    row.addEventListener("contextmenu", (e) => {
      if (!profileIsOwn || !profileEditing || profilePageFixed(page)) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof openContextMenu !== "function") return;
      openContextMenu(e.clientX, e.clientY, {
        avatarText: (page.title || "?").slice(0, 1),
        title: page.title
      }, [
        { label: "Options", onSelect: () => { if (typeof openProfilePageModify === "function") openProfilePageModify(page.id); } },
        { label: "Remove", danger: true, onSelect: () => { if (typeof removeProfilePage === "function") removeProfilePage(page.id); } }
      ]);
    });
    bindProfilePageDrag(row, page, host);
    host.appendChild(row);
  });
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
  if (palette) palette.hidden = !(profileIsOwn && profileEditing);
  if (profileIsOwn && profileEditing && typeof renderProfilePalette === "function") renderProfilePalette();
  renderProfilePages();
  renderProfileBoard();
}

async function openUserProfile(userId, preload) {
  if (typeof leaveDocIfNeeded === "function" && !(await leaveDocIfNeeded())) return;
  if (isProfileOpen && profileEditing && profileDirty) {
    if (!window.confirm("Discard profile changes?")) return;
  }
  if (typeof closeServerSettingsChrome === "function") closeServerSettingsChrome();
  if (typeof closeChannelSettingsChrome === "function") closeChannelSettingsChrome();
  if (typeof hideDocsChrome === "function") hideDocsChrome();
  const targetId = !userId || userId === myUserId ? myUserId : userId;
  const readyData = preload && preload.user ? preload : null;
  const cached = readyData || (typeof placeCache !== "undefined" ? placeCache.profiles[String(targetId)] : null);
  const token = beginPlace({
    settings: true,
    sidebar: "profile",
    view: "profile",
    topbar: targetId === myUserId ? "profile" : "",
    hideMembers: true,
    hold: cached ? null : ["profile-board"]
  });
  isProfileOpen = true;
  profileEditing = false;
  if (cached) {
    applyProfilePayload(cached);
    paintProfileChrome();
    if (typeof syncAppAddress === "function") syncAppAddress();
  }
  if (readyData) {
    if (typeof placeCache !== "undefined" && readyData.user && readyData.user.id) placeCache.profiles[String(readyData.user.id)] = readyData;
    return;
  }
  try {
    if (!userId || userId === myUserId) await loadOwnProfile();
    else await loadPublicProfile(userId);
  } catch (e) {
    if (!placeIsCurrent(token)) return;
    window.alert(e.message || "Could not open profile.");
    return;
  }
  if (!placeIsCurrent(token)) return;
  paintProfileChrome();
  if (typeof syncAppAddress === "function") syncAppAddress();
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
    if (typeof rememberUserStatus === "function") rememberUserStatus(profileUser.id, profileUser.status);
    if (typeof ws !== "undefined" && ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "status_line" }));
    }
    profileUser.pronouns = data.user.pronouns || "";
    profileUser.aliases = data.user.aliases || [];
  }
}

function enterProfileEdit() {
  if (!profileIsOwn) return;
  profileEditing = true;
  if (typeof resetProfileSteamLink === "function") resetProfileSteamLink();
  profileDraft = cloneProfileLayout(profileSavedLayout);
  profileDirty = false;
  paintProfileChrome();
}

function exitProfileEdit(restore) {
  profileEditing = false;
  if (restore) {
    if (profileDraft && typeof dropIdentityDrafts === "function") dropIdentityDrafts(profileDraft);
    profileDraft = cloneProfileLayout(profileSavedLayout);
    profileDirty = false;
  }
  paintProfileChrome();
  if (typeof paintOwnFooterAvatar === "function") paintOwnFooterAvatar();
}

async function saveProfileLayout() {
  if (!profileIsOwn) return;
  const saveBtn = document.getElementById("profile-save-btn");
  if (saveBtn) saveBtn.disabled = true;
  try {
    stampOwnLocalTimeTimezone(profileDraft);
    if (typeof stampClockNamedTimezones === "function") stampClockNamedTimezones(profileDraft);
    if (typeof flushIdentityUploads === "function") await flushIdentityUploads(profileDraft);
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
  if (tile.type === "display_name") {
    if (typeof openProfileTileOptions === "function") openProfileTileOptions(tile);
    return;
  }
  if (isMiniProfileIdentityTile(tile.type)) {
    showMiniProfileIdentityMenu(e, tile.type);
  }
}

function bindProfileQuickEdit(el, tile) {
  if (!isMiniProfileIdentityTile(tile.type) || tile.type === "display_name") return;
  el.style.cursor = "pointer";
  el.addEventListener("click", (e) => showMiniProfileIdentityMenu(e, tile.type));
}

function openProfileMoreMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  if (typeof openContextMenu !== "function") return;
  if (typeof activeMenuEl !== "undefined" && activeMenuEl) {
    closeContextMenu();
    return;
  }
  const btn = e.currentTarget;
  const rect = btn ? btn.getBoundingClientRect() : { left: e.clientX, top: e.clientY };
  openContextMenu(rect.left, rect.top, null, [
    { label: "Blocked Users", onSelect: () => openBlockedUsersSubmenu() }
  ]);
}

function closeBlockedUsersSubmenu() {
  const overlay = document.getElementById("blocked-users-overlay");
  if (overlay) overlay.hidden = true;
}

function paintBlockedUsersBody(people) {
  const body = document.getElementById("blocked-users-body");
  if (!body) return;
  body.replaceChildren();
  const rows = Array.isArray(people) ? people : [];
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "blocked-users-empty";
    empty.textContent = "You haven't blocked anyone.";
    body.appendChild(empty);
    return;
  }
  rows.forEach((person) => {
    const row = document.createElement("div");
    row.className = "blocked-users-row";
    const who = document.createElement("div");
    who.className = "blocked-users-who";
    const face = document.createElement("div");
    face.className = "avatar-dot";
    const label = person.display_name || person.username || "?";
    if (typeof paintUserFace === "function") paintUserFace(face, person, { name: label, userId: person.id });
    else face.textContent = typeof avatarLetter === "function" ? avatarLetter(label) : String(label).slice(0, 1);
    const names = document.createElement("div");
    const display = document.createElement("div");
    display.className = "blocked-users-name";
    display.textContent = label;
    names.appendChild(display);
    if (person.display_name && person.username && person.display_name !== person.username) {
      const handle = document.createElement("div");
      handle.className = "blocked-users-handle";
      handle.textContent = person.username;
      names.appendChild(handle);
    }
    who.appendChild(face);
    who.appendChild(names);
    const unblock = document.createElement("button");
    unblock.type = "button";
    unblock.className = "settings-row-btn";
    unblock.textContent = "Unblock";
    unblock.addEventListener("click", async () => {
      unblock.disabled = true;
      try {
        const response = await fetch(`https://${serverAddress}/unblock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ blocked_user: person.id })
        });
        if (!response.ok) throw new Error("Could not unblock.");
        if (typeof forgetBlockedUser === "function") forgetBlockedUser(person.id);
        paintBlockedUsersBody(rows.filter((entry) => entry.id !== person.id));
      } catch (err) {
        unblock.disabled = false;
      }
    });
    row.appendChild(who);
    row.appendChild(unblock);
    body.appendChild(row);
  });
}

async function openBlockedUsersSubmenu() {
  const overlay = document.getElementById("blocked-users-overlay");
  if (!overlay) return;
  paintBlockedUsersBody([]);
  overlay.hidden = false;
  try {
    const response = await fetch(`https://${serverAddress}/messaging_settings`, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error();
    const blocked = Array.isArray(data.blocked) ? data.blocked : [];
    if (typeof setBlockedUserIds === "function") setBlockedUserIds(blocked.map((row) => row.id));
    paintBlockedUsersBody(blocked);
  } catch (err) {
    paintBlockedUsersBody([]);
  }
}

function bindBlockedUsersSubmenu() {
  if (bindBlockedUsersSubmenu.ready) return;
  bindBlockedUsersSubmenu.ready = true;
  const overlay = document.getElementById("blocked-users-overlay");
  const closeBtn = document.getElementById("blocked-users-close");
  if (closeBtn) closeBtn.addEventListener("click", closeBlockedUsersSubmenu);
  if (overlay) {
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) closeBlockedUsersSubmenu();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const card = document.getElementById("blocked-users-overlay");
    if (card && !card.hidden) closeBlockedUsersSubmenu();
  });
}

bindBlockedUsersSubmenu();

document.getElementById("profile-edit-btn").addEventListener("click", enterProfileEdit);
document.getElementById("profile-cancel-btn").addEventListener("click", () => exitProfileEdit(true));
document.getElementById("profile-save-btn").addEventListener("click", () => saveProfileLayout());
document.getElementById("footer-profile-btn").addEventListener("click", () => openOwnProfile());
