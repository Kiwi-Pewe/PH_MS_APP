// ==================================================================
// mini-profile.js - Left-click card. Guilded shell, Discord status /
// description, no widgets on this pass. Roles + is owner-only until
// Self-assignable is un-greyed. Notes are private to you.
// ==================================================================

const MINI_PROFILE_ROLE_CAP = 5;

let miniProfileOpen = false;
let miniProfileData = null;
let miniProfileUserId = null;
let miniProfileAnchor = null;
let miniProfileRolesExpanded = false;
let miniProfileBoundDoc = false;

function miniProfileServerId() {
  return currentServerId || null;
}

function miniProfileApi(path, options) {
  return fetch("https://" + serverAddress + path, Object.assign({
    credentials: "include",
    headers: { "Content-Type": "application/json" }
  }, options || {}));
}

function closeMiniProfileRolePicker() {
  const picker = document.getElementById("mini-profile-role-picker");
  if (picker) {
    picker.hidden = true;
    picker.innerHTML = "";
  }
}

function flushMiniProfileNote() {
  const note = document.querySelector("#mini-profile .mini-profile-note");
  if (!note || !miniProfileUserId || !miniProfileData || miniProfileData.is_self) return;
  if (note.value === (miniProfileData.note || "")) return;
  saveMiniProfileNote(miniProfileUserId, note.value);
}

function closeMiniProfile() {
  flushMiniProfileNote();
  miniProfileOpen = false;
  miniProfileData = null;
  miniProfileUserId = null;
  miniProfileAnchor = null;
  miniProfileRolesExpanded = false;
  closeMiniProfileRolePicker();
  const card = document.getElementById("mini-profile");
  if (card) {
    card.hidden = true;
    card.innerHTML = "";
  }
}

function miniProfileClickOutside(e) {
  if (!miniProfileOpen) return;
  const card = document.getElementById("mini-profile");
  const picker = document.getElementById("mini-profile-role-picker");
  if (card && card.contains(e.target)) return;
  if (picker && picker.contains(e.target)) return;
  if (typeof activeMenuEl !== "undefined" && activeMenuEl && activeMenuEl.contains(e.target)) return;
  closeMiniProfile();
}

function miniProfileOnKey(e) {
  if (e.key !== "Escape") return;
  const picker = document.getElementById("mini-profile-role-picker");
  if (picker && !picker.hidden) {
    closeMiniProfileRolePicker();
    return;
  }
  closeMiniProfile();
}

function bindMiniProfileChrome() {
  if (miniProfileBoundDoc) return;
  miniProfileBoundDoc = true;
  document.addEventListener("mousedown", miniProfileClickOutside);
  document.addEventListener("keydown", miniProfileOnKey);
}

function positionMiniProfile(anchorEl) {
  const card = document.getElementById("mini-profile");
  if (!card || card.hidden || !anchorEl) return;
  const z = typeof pageZoom === "function" ? pageZoom() : 1;
  const ar = anchorEl.getBoundingClientRect();
  const cr = card.getBoundingClientRect();
  let left = ar.right + 8;
  if (ar.left > window.innerWidth * 0.55) left = ar.left - cr.width - 8;
  if (left + cr.width > window.innerWidth - 8) left = window.innerWidth - cr.width - 8;
  if (left < 8) left = 8;
  let top = ar.top;
  if (top + cr.height > window.innerHeight - 8) top = window.innerHeight - cr.height - 8;
  if (top < 8) top = 8;
  card.style.left = (left / z) + "px";
  card.style.top = (top / z) + "px";
}

function miniProfileIconButton(kind, title) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mini-profile-icon-btn";
  btn.title = title;
  if (kind === "profile") {
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4.4 0-8 2.1-8 4.7V21h16v-2.3c0-2.6-3.6-4.7-8-4.7z"/></svg>';
  } else {
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="18" cy="12" r="2" fill="currentColor"/></svg>';
  }
  return btn;
}

function fakeMenuEvent(el) {
  const rect = el.getBoundingClientRect();
  return {
    preventDefault: function () {},
    stopPropagation: function () {},
    clientX: rect.right,
    clientY: rect.bottom
  };
}

function openMiniProfileMenu(btn, data) {
  const user = data.user || {};
  const isSelf = !!data.is_self;
  const member = (typeof memberList !== "undefined" ? memberList : []).find((row) => row.id === user.id) || {
    id: user.id,
    username: user.username,
    status: data.presence || "offline",
    is_owner: false
  };
  const ev = fakeMenuEvent(btn);
  if (data.in_server && typeof showMemberContextMenu === "function") {
    showMemberContextMenu(ev, member);
    return;
  }
  if (typeof showProfileContextMenu === "function") {
    showProfileContextMenu(ev, user.id, user.username, isSelf);
  }
}

async function openOwnProfilePageEdit() {
  closeMiniProfile();
  if (!isProfileOpen || !profileIsOwn) {
    if (typeof openUserProfile === "function") await openUserProfile(myUserId);
  }
  profileActivePageId = "profile";
  if (!profileEditing && typeof enterProfileEdit === "function") enterProfileEdit();
  else if (typeof paintProfileChrome === "function") paintProfileChrome();
}

async function openOwnMiniProfileEdit() {
  closeMiniProfile();
  if (!isProfileOpen || !profileIsOwn) {
    if (typeof openUserProfile === "function") await openUserProfile(myUserId);
  }
  if (typeof openMiniProfileEditorPage === "function") openMiniProfileEditorPage();
}

function paintMiniProfile(data) {
  const card = document.getElementById("mini-profile");
  if (!card) return;
  paintMiniProfileInto(card, data, { page: false });
}

function paintMiniProfileInto(card, data, opts) {
  if (!card) return;
  const page = !!(opts && opts.page);
  card.innerHTML = "";
  card.classList.add("mini-profile-card");
  card.classList.toggle("is-page", page);
  const user = data.user || {};
  const name = user.display_name || user.username || "";
  const presence = data.presence === "online" || data.presence === "away" || data.presence === "dnd"
    ? data.presence
    : "offline";

  const banner = document.createElement("div");
  banner.className = "mini-profile-banner";
  banner.style.background = data.banner_color || "#1e6b8a";
  card.appendChild(banner);

  const identity = document.createElement("div");
  identity.className = "mini-profile-identity";

  const avatar = document.createElement("div");
  avatar.className = "mini-profile-avatar";
  avatar.textContent = typeof avatarLetter === "function" ? avatarLetter(name) : (name || "?").slice(0, 1);
  const pip = document.createElement("div");
  pip.className = "status-dot status-" + presence;
  avatar.appendChild(pip);
  identity.appendChild(avatar);

  if (data.in_server && data.highest_role) {
    const roleLine = document.createElement("div");
    roleLine.className = "mini-profile-highest";
    roleLine.textContent = data.highest_role.name || "Role";
    if (data.highest_role.color) roleLine.style.color = data.highest_role.color;
    identity.appendChild(roleLine);
  }

  const nameRow = document.createElement("div");
  nameRow.className = "mini-profile-name-row";
  const nameEl = document.createElement("div");
  nameEl.className = "mini-profile-name";
  nameEl.textContent = name;
  nameRow.appendChild(nameEl);
  const actions = document.createElement("div");
  actions.className = "mini-profile-actions";
  const profileBtn = miniProfileIconButton("profile", "Profile");
  profileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (page) {
      profileActivePageId = "profile";
      if (typeof paintProfileChrome === "function") paintProfileChrome();
      return;
    }
    closeMiniProfile();
    if (typeof openUserProfile === "function") openUserProfile(user.id);
  });
  const moreBtn = miniProfileIconButton("more", "More");
  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeMiniProfileRolePicker();
    openMiniProfileMenu(moreBtn, data);
  });
  actions.appendChild(profileBtn);
  actions.appendChild(moreBtn);
  nameRow.appendChild(actions);
  identity.appendChild(nameRow);

  if (user.status) {
    const status = document.createElement("div");
    status.className = "mini-profile-status";
    status.textContent = user.status;
    identity.appendChild(status);
  }
  if (data.about) {
    const about = document.createElement("div");
    about.className = "mini-profile-about";
    about.textContent = data.about;
    identity.appendChild(about);
  }
  card.appendChild(identity);

  if (data.in_server) {
    card.appendChild(buildMiniProfileRoles(data));
  }

  if (page) return;

  const footer = document.createElement("div");
  footer.className = "mini-profile-footer";
  if (data.is_self) {
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "pill-btn mini-profile-edit-btn";
    edit.textContent = "Edit Profile";
    edit.addEventListener("click", () => openOwnProfilePageEdit());
    const editMini = document.createElement("button");
    editMini.type = "button";
    editMini.className = "ghost-btn mini-profile-edit-btn";
    editMini.textContent = "Edit Mini Profile";
    editMini.addEventListener("click", () => openOwnMiniProfileEdit());
    footer.appendChild(edit);
    footer.appendChild(editMini);
  } else {
    const label = document.createElement("div");
    label.className = "mini-profile-section-label";
    label.textContent = "Note";
    const note = document.createElement("textarea");
    note.className = "mini-profile-note";
    note.rows = 2;
    note.maxLength = 256;
    note.placeholder = "Click to add a note";
    note.value = data.note || "";
    note.addEventListener("click", (e) => e.stopPropagation());
    note.addEventListener("blur", () => saveMiniProfileNote(user.id, note.value));
    footer.appendChild(label);
    footer.appendChild(note);
  }
  card.appendChild(footer);
}

function buildMiniProfileRoles(data) {
  const wrap = document.createElement("div");
  wrap.className = "mini-profile-roles";
  const label = document.createElement("div");
  label.className = "mini-profile-section-label";
  label.textContent = "Roles";
  wrap.appendChild(label);

  const row = document.createElement("div");
  row.className = "mini-profile-role-row";
  if (data.can_assign && (data.assignable || []).length) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "mini-profile-role-add";
    add.title = "Add role";
    add.textContent = "+";
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMiniProfileRolePicker(add, data);
    });
    row.appendChild(add);
  }

  const roles = data.roles || [];
  const shown = miniProfileRolesExpanded ? roles : roles.slice(0, MINI_PROFILE_ROLE_CAP);
  shown.forEach((role) => row.appendChild(buildMiniProfileRolePill(role, data)));
  if (roles.length > MINI_PROFILE_ROLE_CAP) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "mini-profile-role-more";
    more.textContent = miniProfileRolesExpanded ? "Show less" : "...";
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      miniProfileRolesExpanded = !miniProfileRolesExpanded;
      paintMiniProfile(miniProfileData);
      positionMiniProfile(miniProfileAnchor);
    });
    row.appendChild(more);
  }
  wrap.appendChild(row);
  return wrap;
}

function buildMiniProfileRolePill(role, data) {
  const pill = document.createElement("span");
  pill.className = "mini-profile-role-pill";
  const dot = document.createElement("span");
  dot.className = "mini-profile-role-dot";
  if (role.color) dot.style.background = role.color;
  const name = document.createElement("span");
  name.textContent = role.name || "Role";
  pill.appendChild(dot);
  pill.appendChild(name);
  if (data.can_assign && !role.is_members) {
    pill.classList.add("is-removable");
    pill.title = "Remove role";
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      setMiniProfileRole(role.id, false);
    });
  }
  return pill;
}

function toggleMiniProfileRolePicker(anchorBtn, data) {
  const picker = document.getElementById("mini-profile-role-picker");
  if (!picker) return;
  if (!picker.hidden) {
    closeMiniProfileRolePicker();
    return;
  }
  picker.innerHTML = "";
  (data.assignable || []).forEach((role) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "mini-profile-role-pick";
    const dot = document.createElement("span");
    dot.className = "mini-profile-role-dot";
    if (role.color) dot.style.background = role.color;
    const name = document.createElement("span");
    name.textContent = role.name || "Role";
    item.appendChild(dot);
    item.appendChild(name);
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      setMiniProfileRole(role.id, true);
    });
    picker.appendChild(item);
  });
  picker.hidden = false;
  const z = typeof pageZoom === "function" ? pageZoom() : 1;
  const ar = anchorBtn.getBoundingClientRect();
  picker.style.left = (ar.left / z) + "px";
  picker.style.top = ((ar.bottom + 6) / z) + "px";
  const pr = picker.getBoundingClientRect();
  if (pr.right > window.innerWidth - 8) {
    picker.style.left = ((window.innerWidth - pr.width - 8) / z) + "px";
  }
  if (pr.bottom > window.innerHeight - 8) {
    picker.style.top = ((ar.top - pr.height - 6) / z) + "px";
  }
}

async function setMiniProfileRole(roleId, assigned) {
  if (!miniProfileData || !miniProfileUserId || !currentServerId) return;
  closeMiniProfileRolePicker();
  try {
    const response = await miniProfileApi("/set_server_role_member", {
      method: "POST",
      body: JSON.stringify({
        server_id: currentServerId,
        user_id: miniProfileUserId,
        role_id: roleId,
        assigned: !!assigned
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      window.alert(err.detail || "Could not change that role.");
      return;
    }
    await reloadOpenMiniProfile();
    if (typeof refreshServerMemberList === "function") refreshServerMemberList(currentServerId);
  } catch (e) {
    window.alert("Could not change that role.");
  }
}

async function saveMiniProfileNote(userId, text) {
  try {
    const response = await miniProfileApi("/mini_profile_note", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, text: text || "" })
    });
    if (!response.ok) return;
    const data = await response.json();
    if (miniProfileData && miniProfileUserId === userId) miniProfileData.note = data.note || "";
  } catch (e) { /* keep the typed note */ }
}

async function reloadOpenMiniProfile() {
  if (!miniProfileOpen || !miniProfileUserId) return;
  const data = await fetchMiniProfile(miniProfileUserId);
  if (!data || !miniProfileOpen) return;
  miniProfileData = data;
  paintMiniProfile(data);
  positionMiniProfile(miniProfileAnchor);
}

async function fetchMiniProfile(userId) {
  const serverId = miniProfileServerId();
  let path = "/mini_profile/" + encodeURIComponent(userId);
  if (serverId) path += "?server_id=" + encodeURIComponent(serverId);
  const response = await miniProfileApi(path);
  if (!response.ok) throw new Error("Could not load mini profile.");
  return response.json();
}

async function openMiniProfile(userId, anchorEl) {
  if (!userId) return;
  bindMiniProfileChrome();
  closeMiniProfileRolePicker();
  if (typeof closeContextMenu === "function") closeContextMenu();
  miniProfileOpen = true;
  miniProfileUserId = userId;
  miniProfileAnchor = anchorEl || null;
  miniProfileRolesExpanded = false;
  try {
    const data = await fetchMiniProfile(userId);
    if (!miniProfileOpen || miniProfileUserId !== userId) return;
    miniProfileData = data;
    const card = document.getElementById("mini-profile");
    card.hidden = false;
    paintMiniProfile(data);
    positionMiniProfile(anchorEl);
  } catch (e) {
    closeMiniProfile();
    window.alert(e.message || "Could not open mini profile.");
  }
}

function bindMiniProfileTarget(el, userId) {
  if (!el || !userId) return;
  el.classList.add("is-mini-profile-target");
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openMiniProfile(userId, el);
  });
}
