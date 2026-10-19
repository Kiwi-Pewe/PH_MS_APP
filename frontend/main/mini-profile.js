// ==================================================================
// mini-profile.js - Left-click card. Guilded shell, Discord status /
// description, no widgets on this pass. Roles + is owner assign or
// self-assignable on your own card. Notes are private to you.
// ==================================================================

const MINI_PROFILE_ROLE_CAP = 5;
const MINI_WIDGET_CAP = 3;
const MINI_MUTUAL_CAP = 4;
const MINI_BODY_MAX = 200;
const MINI_WIDGET_ADD = [
  { type: "clock", label: "Clock" },
  { type: "steam_playing_now", label: "Playing Now", steam: true },
  { type: "body", label: "Body" },
  { type: "member_since", label: "Member since" },
  { type: "button", label: "Button" },
  { type: "meter", label: "Meter" },
  { type: "mutuals", label: "Mutuals" },
  { type: "featured_friend", label: "Featured friend" },
  { type: "featured_server", label: "Featured server" },
  { type: "connections", label: "Connections" }
];

let miniProfileOpen = false;
let miniProfileData = null;
let miniProfileUserId = null;
let miniProfileAnchor = null;
let miniProfileAnchorRect = null;
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
  closeMiniSubOverlay();
  flushMiniProfileNote();
  miniProfileOpen = false;
  miniProfileData = null;
  miniProfileUserId = null;
  miniProfileAnchor = null;
  miniProfileAnchorRect = null;
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
  if (e.target.closest && e.target.closest(".mini-sub-overlay, .settings-form-overlay, .profile-opt")) return;
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

function snapshotRect(rect) {
  if (!rect) return null;
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
}

function liveAnchorRect(anchorEl) {
  if (anchorEl && anchorEl.isConnected) {
    const ar = anchorEl.getBoundingClientRect();
    if (ar.width || ar.height) {
      miniProfileAnchorRect = snapshotRect(ar);
      return miniProfileAnchorRect;
    }
  }
  return miniProfileAnchorRect;
}

function positionMiniProfile(anchorEl) {
  const card = document.getElementById("mini-profile");
  if (!card || card.hidden) return;
  const ar = liveAnchorRect(anchorEl || miniProfileAnchor);
  if (!ar) return;
  const z = typeof pageZoom === "function" ? pageZoom() : 1;
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
  if (typeof memberListScope !== "undefined" && memberListScope === "party" && typeof showMemberContextMenu === "function") {
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

function paintMiniProfileHighest(card, data) {
  if (!card) return;
  const identity = card.querySelector(".mini-profile-identity");
  if (!identity) return;
  const existing = identity.querySelector(".mini-profile-highest");
  if (!data.in_server || !data.highest_role) {
    if (existing) existing.remove();
    return;
  }
  const roleLine = existing || document.createElement("div");
  roleLine.className = "mini-profile-highest";
  roleLine.textContent = data.highest_role.name || "Role";
  roleLine.style.color = data.highest_role.color || "";
  if (!existing) {
    const nameRow = identity.querySelector(".mini-profile-name-row");
    if (nameRow) identity.insertBefore(roleLine, nameRow);
    else identity.appendChild(roleLine);
  }
}

function paintMiniProfileRolesOnly(data) {
  const card = document.getElementById("mini-profile");
  if (!card || !data) return;
  paintMiniProfileHighest(card, data);
  const next = data.in_server ? buildMiniProfileRoles(data) : null;
  const prev = card.querySelector(".mini-profile-roles");
  if (prev && next) prev.replaceWith(next);
  else if (prev && !next) prev.remove();
  else if (!prev && next) {
    const footer = card.querySelector(".mini-profile-footer");
    if (footer) card.insertBefore(next, footer);
    else card.appendChild(next);
  }
}

function bindMiniProfileEditTarget(el, type, editing) {
  if (!editing || !el) return;
  el.classList.add("is-mini-edit");
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof showMiniProfileIdentityMenu === "function") showMiniProfileIdentityMenu(e, type);
  });
}

function startMiniProfileBioEdit(el) {
  if (!el || el.querySelector("textarea")) return;
  const tile = typeof miniProfileBioTile === "function" ? miniProfileBioTile() : { props: { text: "" } };
  const area = document.createElement("textarea");
  area.className = "mini-profile-bio-edit";
  area.value = (tile.props && tile.props.text) || "";
  area.maxLength = 1000;
  area.placeholder = "Write something about yourself.";
  area.addEventListener("click", (e) => e.stopPropagation());
  area.addEventListener("keydown", (e) => {
    if (e.key === "Escape") area.blur();
    e.stopPropagation();
  });
  area.addEventListener("input", () => {
    tile.props.text = area.value;
    profileDirty = true;
  });
  area.addEventListener("blur", () => {
    tile.props.text = area.value;
    if (typeof markProfileDirty === "function") markProfileDirty();
    else if (typeof renderProfileBoard === "function") renderProfileBoard();
  });
  el.innerHTML = "";
  el.classList.remove("is-empty");
  el.appendChild(area);
  area.focus();
}

function showMiniProfileBioMenu(e) {
  if (!profileIsOwn || typeof openContextMenu !== "function") return;
  e.preventDefault();
  e.stopPropagation();
  const tile = typeof miniProfileBioTile === "function" ? miniProfileBioTile() : null;
  openContextMenu(e.clientX, e.clientY, {
    avatarText: "B",
    title: "Bio"
  }, [
    { label: "Edit Bio", onSelect: () => {
      const about = document.querySelector(".mini-profile-card.is-page .mini-profile-about");
      startMiniProfileBioEdit(about);
    } },
    tile && typeof openProfileTileOptions === "function" && {
      label: "Options",
      onSelect: () => openProfileTileOptions(tile)
    }
  ]);
}

function bindMiniProfileBio(el, editing) {
  if (!editing || !el) return;
  el.classList.add("is-mini-edit");
  el.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    startMiniProfileBioEdit(el);
  });
  el.addEventListener("contextmenu", (e) => showMiniProfileBioMenu(e));
}

function paintMiniProfileInto(card, data, opts) {
  if (!card) return;
  const page = !!(opts && opts.page);
  const editing = !!(opts && opts.editing);
  card.innerHTML = "";
  card.classList.add("mini-profile-card");
  card.classList.toggle("is-page", page);
  card.classList.toggle("is-editing", editing);
  const user = data.user || {};
  const name = user.display_name || user.username || "";
  const presence = data.presence === "online" || data.presence === "away" || data.presence === "dnd"
    ? data.presence
    : "offline";

  const banner = document.createElement("div");
  banner.className = "mini-profile-banner";
  banner.style.background = data.banner_color || "#1e6b8a";
  const ident = data.identity || {};
  const bannerMedia = ident.banner || (editing && typeof getIdentityMedia === "function" ? getIdentityMedia("banner") : null);
  if (typeof paintIdentityMedia === "function") paintIdentityMedia(banner, bannerMedia, { border: false });
  if (typeof applyIdentityBorder === "function") applyIdentityBorder(banner, bannerMedia);
  bindMiniProfileEditTarget(banner, "banner", editing);
  card.appendChild(banner);

  const identity = document.createElement("div");
  identity.className = "mini-profile-identity";

  const face = document.createElement("div");
  face.className = "mini-profile-face";

  const avatar = document.createElement("div");
  avatar.className = "mini-profile-avatar";
  if (typeof paintUserFace === "function") {
    paintUserFace(avatar, { username: name, avatar: ident.avatar || (editing && typeof getIdentityMedia === "function" ? getIdentityMedia("avatar") : null) }, { name: name });
  } else {
    avatar.textContent = typeof avatarLetter === "function" ? avatarLetter(name) : (name || "?").slice(0, 1);
  }
  const pip = document.createElement("div");
  pip.className = "status-dot status-" + presence;
  avatar.appendChild(pip);
  bindMiniProfileEditTarget(avatar, "avatar", editing);
  face.appendChild(avatar);

  const side = document.createElement("div");
  side.className = "mini-profile-side";
  if (user.status || editing) {
    if (user.id && typeof rememberUserStatus === "function") rememberUserStatus(user.id, user.status);
    const status = document.createElement("div");
    status.className = "mini-profile-status" + (user.status ? "" : " is-empty");
    status.textContent = user.status || "Status";
    side.appendChild(status);
  }
  if (user.pronouns || editing) {
    const pronouns = document.createElement("div");
    pronouns.className = "mini-profile-pronouns" + (user.pronouns ? "" : " is-empty");
    pronouns.textContent = user.pronouns || "Pronouns";
    side.appendChild(pronouns);
  }
  if (side.childNodes.length) face.appendChild(side);
  identity.appendChild(face);

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
  if (editing) {
    nameEl.style.cursor = "pointer";
    nameEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof showMiniProfileIdentityMenu === "function") showMiniProfileIdentityMenu(e, "display_name");
    });
  }
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

  card.appendChild(identity);

  const widgetHost = buildMiniProfileWidgets(data, { page: page, editing: editing });
  if (widgetHost) card.appendChild(widgetHost);

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

function miniWidgetTiles(data) {
  const rows = data && Array.isArray(data.widgets)
    ? data.widgets
    : (typeof miniProfileWidgets === "function" ? miniProfileWidgets() : []);
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    props: row.props || {},
    slot: typeof miniWidgetSlotOf === "function" ? miniWidgetSlotOf(row, -1) : row.slot,
    live: row.live,
    w: 8,
    h: row.type === "steam_playing_now" ? 4 : 3,
    x: 0,
    y: 0
  }));
}

function miniWidgetLabel(type) {
  const row = MINI_WIDGET_ADD.find((item) => item.type === type);
  if (row) return row.label;
  return (typeof PROFILE_TILE_TYPES !== "undefined" && PROFILE_TILE_TYPES[type] && PROFILE_TILE_TYPES[type].label) || type;
}

function formatMiniMemberSince(raw) {
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function miniPersonName(person) {
  if (!person) return "";
  return person.display_name || person.username || "User";
}

function paintMiniPersonRow(person, onClick) {
  const row = document.createElement("div");
  row.className = "profile-friend-row mini-widget-person";
  const dot = document.createElement("div");
  dot.className = "avatar-dot";
  const shown = miniPersonName(person);
  if (typeof paintUserFace === "function") paintUserFace(dot, person, { name: shown, userId: person.id });
  else dot.textContent = shown.slice(0, 1);
  const name = document.createElement("div");
  name.className = "profile-friend-name";
  name.textContent = shown;
  row.appendChild(dot);
  row.appendChild(name);
  if (onClick) {
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(person);
    });
  }
  return row;
}

function paintMiniEmpty(el, text) {
  const note = document.createElement("div");
  note.className = "settings-opt-desc";
  note.textContent = text;
  el.appendChild(note);
}

function paintMiniMutuals(el, tile, live, editing) {
  if (typeof applyProfileWidgetSurface === "function") applyProfileWidgetSurface(el, tile);
  if (typeof applyProfileTextPaint === "function") applyProfileTextPaint(el, typeof profileTextChrome === "function" ? profileTextChrome(tile.props, tile.type) : {});
  const people = (live && Array.isArray(live.people) ? live.people : []).slice();
  const total = live && live.total != null ? Number(live.total) : people.length;
  const head = document.createElement("div");
  head.className = "profile-tile-head";
  head.textContent = "Mutuals";
  el.appendChild(head);
  const body = document.createElement("div");
  body.className = "profile-tile-body";
  if (!people.length) {
    paintMiniEmpty(body, editing ? "Other people see friends you share." : "No mutuals to show.");
  } else {
    people.slice(0, MINI_MUTUAL_CAP).forEach((person) => {
      body.appendChild(paintMiniPersonRow(person, (row) => {
        if (typeof closeMiniProfile === "function") closeMiniProfile();
        if (row.id && typeof openUserProfile === "function") openUserProfile(row.id);
      }));
    });
    if (total > MINI_MUTUAL_CAP) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "mini-mutual-more";
      more.textContent = "+" + (total - MINI_MUTUAL_CAP) + " more";
      more.addEventListener("click", (e) => {
        e.stopPropagation();
        openMiniMutualsSubmenu(people, total);
      });
      body.appendChild(more);
    }
  }
  el.appendChild(body);
}

function paintMiniFeaturedFriend(el, tile, live, editing) {
  if (typeof applyProfileWidgetSurface === "function") applyProfileWidgetSurface(el, tile);
  if (typeof applyProfileTextPaint === "function") applyProfileTextPaint(el, typeof profileTextChrome === "function" ? profileTextChrome(tile.props, tile.type) : {});
  const head = document.createElement("div");
  head.className = "profile-tile-head";
  head.textContent = "Featured friend";
  el.appendChild(head);
  const body = document.createElement("div");
  body.className = "profile-tile-body";
  let person = live;
  if (!person && typeof profileFriends !== "undefined") {
    const id = Number((tile.props || {}).user_id);
    person = (profileFriends || []).find((row) => Number(row.id) === id) || null;
  }
  if (!person) {
    paintMiniEmpty(body, editing ? "Pick a friend in Options." : "No friend selected.");
  } else {
    body.appendChild(paintMiniPersonRow(person, (row) => {
      if (typeof closeMiniProfile === "function") closeMiniProfile();
      if (row.id && typeof openUserProfile === "function") openUserProfile(row.id);
    }));
  }
  el.appendChild(body);
}

function paintMiniFeaturedServer(el, tile, live, editing) {
  if (typeof applyProfileWidgetSurface === "function") applyProfileWidgetSurface(el, tile);
  if (typeof applyProfileTextPaint === "function") applyProfileTextPaint(el, typeof profileTextChrome === "function" ? profileTextChrome(tile.props, tile.type) : {});
  const head = document.createElement("div");
  head.className = "profile-tile-head";
  head.textContent = "Featured server";
  el.appendChild(head);
  const body = document.createElement("div");
  body.className = "profile-tile-body";
  const show = (server) => {
    body.innerHTML = "";
    if (!server || !server.id) {
      paintMiniEmpty(body, editing ? "Pick a server in Options." : "No server selected.");
      return;
    }
    if (typeof paintProfileServerRows === "function") paintProfileServerRows(body, [server]);
    else {
      const name = document.createElement("div");
      name.className = "profile-friend-name";
      name.textContent = server.name || "Server";
      body.appendChild(name);
    }
  };
  show(live);
  const code = String((tile.props || {}).server_id || "").trim();
  if (!live && editing && code && typeof serverAddress === "string") {
    fetch("https://" + serverAddress + "/get_servers", { credentials: "include" })
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => {
        if (!body.isConnected) return;
        const server = ((data && data.servers) || []).find((row) => String(row.id) === code);
        show(server || null);
      })
      .catch(() => {});
  }
  el.appendChild(body);
}

function paintMiniConnection(el, tile, live, editing) {
  if (typeof applyProfileWidgetSurface === "function") applyProfileWidgetSurface(el, tile);
  if (typeof applyProfileTextPaint === "function") applyProfileTextPaint(el, typeof profileTextChrome === "function" ? profileTextChrome(tile.props, tile.type) : {});
  const head = document.createElement("div");
  head.className = "profile-tile-head";
  head.textContent = "Connection";
  el.appendChild(head);
  const body = document.createElement("div");
  body.className = "profile-tile-body";
  const paintLive = (row) => {
    body.innerHTML = "";
    if (!row || !row.provider) {
      paintMiniEmpty(body, editing ? "Pick a linked account in Options." : "No connection selected.");
      return;
    }
    const slug = String(row.provider);
    const label = slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : "Connection";
    const line = document.createElement("div");
    line.className = "profile-friend-row";
    const name = document.createElement("div");
    name.className = "profile-friend-name";
    name.textContent = row.name ? (label + " · " + row.name) : label;
    line.appendChild(name);
    body.appendChild(line);
  };
  paintLive(live);
  const slug = String((tile.props || {}).provider || "").trim();
  if (!live && editing && slug && typeof serverAddress === "string") {
    fetch("https://" + serverAddress + "/connections", { credentials: "include" })
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => {
        if (!body.isConnected) return;
        paintLive(((data && data.connections) || []).find((row) => String(row.provider) === slug) || null);
      })
      .catch(() => {});
  }
  el.appendChild(body);
}

function paintMiniMemberSince(el, tile, live) {
  if (typeof applyProfileWidgetSurface === "function") applyProfileWidgetSurface(el, tile);
  if (typeof applyProfileTextPaint === "function") applyProfileTextPaint(el, typeof profileTextChrome === "function" ? profileTextChrome(tile.props, tile.type) : {});
  const head = document.createElement("div");
  head.className = "profile-tile-head";
  head.textContent = "Member since";
  el.appendChild(head);
  const date = document.createElement("div");
  date.className = "profile-since-date";
  const raw = (live && live.member_since) || tile._memberSince || "";
  date.textContent = formatMiniMemberSince(raw) || (typeof profileOwnerMemberSince === "function" ? profileOwnerMemberSince() : "") || "—";
  el.appendChild(date);
}

function paintMiniCarryTile(el, tile) {
  const fake = {
    id: tile.id,
    type: tile.type,
    props: tile.props || {},
    w: tile.w || 8,
    h: tile.h || 3,
    x: 0,
    y: 0
  };
  if (tile.type === "body") fake.maxChars = MINI_BODY_MAX;
  if (typeof paintProfileTileContent === "function") paintProfileTileContent(fake, el);
}

function paintMiniProfileWidgetTile(host, tile, data, editing) {
  host.className = "profile-tile is-" + tile.type + " mini-profile-widget-tile";
  host.innerHTML = "";
  const live = tile.live;
  if (tile.type === "mutuals") {
    paintMiniMutuals(host, tile, live, editing);
    return;
  }
  if (tile.type === "featured_friend") {
    paintMiniFeaturedFriend(host, tile, live, editing);
    return;
  }
  if (tile.type === "featured_server") {
    paintMiniFeaturedServer(host, tile, live, editing);
    return;
  }
  if (tile.type === "connections") {
    paintMiniConnection(host, tile, live, editing);
    return;
  }
  if (tile.type === "member_since") {
    const since = (live && live.member_since) || (data && data.user && data.user.member_since) || "";
    tile._memberSince = since;
    paintMiniMemberSince(host, tile, { member_since: since });
    return;
  }
  if (tile.type === "steam_playing_now" && live) {
    const prevData = typeof steamPlayingData !== "undefined" ? steamPlayingData : null;
    const prevOwner = typeof steamPlayingOwnerId !== "undefined" ? steamPlayingOwnerId : "";
    steamPlayingData = live;
    steamPlayingOwnerId = String((data && data.user && data.user.id) || "");
    paintMiniCarryTile(host, tile);
    steamPlayingData = prevData;
    steamPlayingOwnerId = prevOwner;
    return;
  }
  paintMiniCarryTile(host, tile);
}

function miniStoreTile(id) {
  const rows = typeof miniProfileWidgets === "function" ? miniProfileWidgets() : [];
  return rows.find((row) => row.id === id) || null;
}

function showMiniWidgetMenu(e, tile) {
  if (typeof openContextMenu !== "function") return;
  e.preventDefault();
  e.stopPropagation();
  const stored = miniStoreTile(tile.id) || tile;
  const items = [];
  if (typeof openProfileTileOptions === "function") {
    items.push({
      label: "Options",
      onSelect: () => openProfileTileOptions(stored)
    });
  }
  items.push({
    label: "Remove",
    danger: true,
    onSelect: () => removeMiniProfileWidget(stored.id)
  });
  openContextMenu(e.clientX, e.clientY, {
    avatarText: miniWidgetLabel(tile.type).slice(0, 1),
    title: miniWidgetLabel(tile.type)
  }, items);
}

function removeMiniProfileWidget(id) {
  const store = typeof miniProfileStore === "function" ? miniProfileStore(profileDraft || profileSavedLayout) : null;
  if (!store || !Array.isArray(store.widgets)) return;
  store.widgets = store.widgets.filter((row) => row.id !== id);
  if (typeof markProfileDirty === "function") markProfileDirty();
}

function miniProfileSlotList() {
  if (typeof ensureMiniWidgetSlots === "function") return ensureMiniWidgetSlots();
  const rows = typeof miniProfileWidgets === "function" ? miniProfileWidgets() : [];
  const slots = [null, null, null];
  rows.forEach((row) => {
    const n = typeof miniWidgetSlotOf === "function" ? miniWidgetSlotOf(row, -1) : -1;
    if (n >= 0 && !slots[n]) slots[n] = row;
  });
  return slots;
}

function placeMiniProfileWidget(type, slot) {
  const dest = Math.max(0, Math.min(2, Math.round(Number(slot))));
  const store = typeof miniProfileStore === "function" ? miniProfileStore(profileDraft || profileSavedLayout) : null;
  if (!store || !type) return;
  if (!Array.isArray(store.widgets)) store.widgets = [];
  const slots = miniProfileSlotList();
  const existing = store.widgets.find((row) => row.type === type);
  const occupant = slots[dest];
  if (existing) {
    const from = typeof miniWidgetSlotOf === "function" ? miniWidgetSlotOf(existing, dest) : dest;
    existing.slot = dest;
    if (occupant && occupant.id !== existing.id) occupant.slot = from;
  } else {
    if (occupant) store.widgets = store.widgets.filter((row) => row.id !== occupant.id);
    store.widgets.push({
      id: typeof profileNewId === "function" ? profileNewId("tile") : ("tile_" + Date.now()),
      type: type,
      slot: dest,
      props: typeof defaultProfileTileProps === "function" ? defaultProfileTileProps(type) : {}
    });
  }
  if (typeof markProfileDirty === "function") markProfileDirty();
}

function moveMiniProfileWidget(id, slot) {
  const dest = Math.max(0, Math.min(2, Math.round(Number(slot))));
  const store = typeof miniProfileStore === "function" ? miniProfileStore(profileDraft || profileSavedLayout) : null;
  if (!store || !Array.isArray(store.widgets)) return;
  const moving = store.widgets.find((row) => row.id === id);
  if (!moving) return;
  const from = typeof miniWidgetSlotOf === "function" ? miniWidgetSlotOf(moving, 0) : 0;
  if (from === dest) return;
  const occupant = miniProfileSlotList()[dest];
  moving.slot = dest;
  if (occupant && occupant.id !== moving.id) occupant.slot = from;
  if (typeof markProfileDirty === "function") markProfileDirty();
}

function miniDropSlotAt(x, y) {
  const nodes = document.elementsFromPoint(x, y) || [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const slot = node && node.closest ? node.closest(".mini-widget-slot") : null;
    if (slot && slot.dataset.slot != null) return Number(slot.dataset.slot);
  }
  return null;
}

function clearMiniDropHighlight() {
  document.querySelectorAll(".mini-widget-slot.is-drop").forEach((node) => node.classList.remove("is-drop"));
}

function highlightMiniDropSlot(x, y) {
  clearMiniDropHighlight();
  const dest = miniDropSlotAt(x, y);
  if (dest == null) return;
  const el = document.querySelector('.mini-widget-slot[data-slot="' + dest + '"]');
  if (el) el.classList.add("is-drop");
}

let miniWidgetDragging = false;

function isMiniWidgetDragging() {
  return !!miniWidgetDragging;
}

function miniDragZoom() {
  return typeof pageZoom === "function" ? pageZoom() : 1;
}

function applyMiniDragGhost(ghost) {
  if (!ghost || !ghost.isConnected) return;
  const z = miniDragZoom();
  ghost.style.transform = "translate3d(" + ((ghost._x - (ghost._grabX || 0)) / z) + "px," + ((ghost._y - (ghost._grabY || 0)) / z) + "px,0)";
}

function makeMiniDragGhost(label, e) {
  const ghost = document.createElement("div");
  ghost.className = "mini-palette-ghost";
  ghost.textContent = label;
  ghost._grabX = 8;
  ghost._grabY = 8;
  ghost._x = e.clientX;
  ghost._y = e.clientY;
  ghost._raf = 0;
  document.body.appendChild(ghost);
  applyMiniDragGhost(ghost);
  return ghost;
}

function moveMiniDragGhost(ghost, x, y) {
  if (!ghost) return;
  ghost._x = x;
  ghost._y = y;
  if (ghost._raf) return;
  ghost._raf = requestAnimationFrame(() => {
    ghost._raf = 0;
    applyMiniDragGhost(ghost);
    highlightMiniDropSlot(ghost._x, ghost._y);
  });
}

function stopMiniDragGhost(ghost) {
  if (ghost && ghost._raf) {
    cancelAnimationFrame(ghost._raf);
    ghost._raf = 0;
  }
  if (ghost && ghost.isConnected) ghost.remove();
  miniWidgetDragging = false;
  document.body.classList.remove("is-mini-dragging");
  clearMiniDropHighlight();
}

function beginMiniPaletteDrag(e, type, btn) {
  if (!e || e.button !== 0 || !type) return;
  if (btn && btn.disabled) return;
  e.preventDefault();
  miniWidgetDragging = true;
  document.body.classList.add("is-mini-dragging");
  const ghost = makeMiniDragGhost((btn && btn.textContent) || miniWidgetLabel(type), e);
  function onMove(ev) {
    moveMiniDragGhost(ghost, ev.clientX, ev.clientY);
  }
  function onUp(ev) {
    document.removeEventListener("pointermove", onMove, true);
    document.removeEventListener("pointerup", onUp, true);
    document.removeEventListener("pointercancel", onUp, true);
    const x = ev.clientX;
    const y = ev.clientY;
    stopMiniDragGhost(ghost);
    const dest = miniDropSlotAt(x, y);
    if (dest == null) return;
    placeMiniProfileWidget(type, dest);
  }
  document.addEventListener("pointermove", onMove, true);
  document.addEventListener("pointerup", onUp, true);
  document.addEventListener("pointercancel", onUp, true);
}

function bindMiniSlotMove(slotEl, tile) {
  if (!slotEl || !tile) return;
  slotEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest("textarea, input, button, a, select")) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let ghost = null;
    let moved = false;
    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && (dx * dx + dy * dy) < 36) return;
      if (!moved) {
        moved = true;
        miniWidgetDragging = true;
        document.body.classList.add("is-mini-dragging");
        ghost = makeMiniDragGhost(miniWidgetLabel(tile.type), ev);
        slotEl.classList.add("is-dragging");
      }
      moveMiniDragGhost(ghost, ev.clientX, ev.clientY);
    }
    function onUp(ev) {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
      slotEl.classList.remove("is-dragging");
      const x = ev.clientX;
      const y = ev.clientY;
      stopMiniDragGhost(ghost);
      if (!moved) return;
      const dest = miniDropSlotAt(x, y);
      if (dest == null) return;
      moveMiniProfileWidget(tile.id, dest);
    }
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
  });
}

function closeMiniSubOverlay() {
  document.querySelectorAll(".mini-sub-overlay").forEach((node) => node.remove());
}

function openMiniSubOverlay(title, fillBody) {
  closeMiniSubOverlay();
  const overlay = document.createElement("div");
  overlay.className = "mini-sub-overlay";
  const box = document.createElement("div");
  box.className = "leave-party-modal mini-sub-modal";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  const header = document.createElement("div");
  header.className = "leave-party-header";
  const name = document.createElement("span");
  name.className = "leave-party-title";
  name.textContent = title;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "icon-btn";
  close.title = "Close";
  close.textContent = "\u00d7";
  header.appendChild(name);
  header.appendChild(close);
  const main = document.createElement("div");
  main.className = "leave-party-main";
  fillBody(main, () => overlay.remove());
  const footer = document.createElement("div");
  footer.className = "leave-party-footer";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ghost-btn";
  cancel.textContent = "Cancel";
  footer.appendChild(cancel);
  box.appendChild(header);
  box.appendChild(main);
  box.appendChild(footer);
  overlay.appendChild(box);
  const drop = () => overlay.remove();
  close.addEventListener("click", drop);
  cancel.addEventListener("click", drop);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) drop();
  });
  document.body.appendChild(overlay);
  return overlay;
}

function openMiniMutualsSubmenu(people, total) {
  openMiniSubOverlay("Mutuals", (main) => {
    const list = document.createElement("div");
    list.className = "mini-mutual-list";
    (people || []).forEach((person) => {
      list.appendChild(paintMiniPersonRow(person, (row) => {
        closeMiniSubOverlay();
        if (typeof closeMiniProfile === "function") closeMiniProfile();
        if (row.id && typeof openUserProfile === "function") openUserProfile(row.id);
      }));
    });
    if (!people.length) paintMiniEmpty(list, "No mutuals to show.");
    main.appendChild(list);
  });
}

function miniWidgetSlotsFromTiles(tiles) {
  const slots = [null, null, null];
  const leftover = [];
  (tiles || []).forEach((tile) => {
    const n = typeof miniWidgetSlotOf === "function" ? miniWidgetSlotOf(tile, -1) : -1;
    if (n >= 0 && !slots[n]) slots[n] = tile;
    else leftover.push(tile);
  });
  leftover.forEach((tile) => {
    const i = slots.findIndex((item) => !item);
    if (i < 0) return;
    tile.slot = i;
    slots[i] = tile;
  });
  return slots;
}

function buildMiniWidgetSlot(index, tile, data, editing) {
  const slot = document.createElement("div");
  slot.className = "mini-widget-slot" + (tile ? " is-filled" : " is-empty");
  slot.dataset.slot = String(index);
  if (!tile) {
    slot.textContent = "Drop a widget here.";
    return slot;
  }
  const host = document.createElement("div");
  paintMiniProfileWidgetTile(host, tile, data, editing);
  if (editing) host.addEventListener("contextmenu", (e) => showMiniWidgetMenu(e, tile));
  slot.appendChild(host);
  if (editing) bindMiniSlotMove(slot, tile);
  return slot;
}

function buildMiniProfileWidgets(data, opts) {
  const page = !!(opts && opts.page);
  const editing = !!(opts && opts.editing);
  if (page && editing && typeof ensureMiniWidgetSlots === "function") ensureMiniWidgetSlots();
  const slots = miniWidgetSlotsFromTiles(miniWidgetTiles(data));
  if (!editing) {
    const filled = slots.filter(Boolean);
    if (!filled.length) return null;
    const wrap = document.createElement("div");
    wrap.className = "mini-profile-widgets";
    filled.forEach((tile) => {
      const split = document.createElement("div");
      split.className = "mini-profile-section-split";
      wrap.appendChild(split);
      const slot = typeof miniWidgetSlotOf === "function" ? miniWidgetSlotOf(tile, 0) : 0;
      wrap.appendChild(buildMiniWidgetSlot(slot, tile, data, false));
    });
    return wrap;
  }
  const wrap = document.createElement("div");
  wrap.className = "mini-profile-widgets is-edit";
  for (let i = 0; i < MINI_WIDGET_CAP; i++) {
    const split = document.createElement("div");
    split.className = "mini-profile-section-split";
    wrap.appendChild(split);
    wrap.appendChild(buildMiniWidgetSlot(i, slots[i], data, true));
  }
  return wrap;
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
      paintMiniProfileRolesOnly(miniProfileData);
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
  const removable = (data.removable_ids || []).map(String).includes(String(role.id));
  if (removable && !role.is_members) {
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
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      window.alert(result.detail || "Could not change that role.");
      return;
    }
    await reloadOpenMiniProfile();
    if (typeof applyMemberRolesUpdated === "function") {
      applyMemberRolesUpdated(currentServerId, miniProfileUserId, result.hoist_role || null, result.name_role || null, { skipMini: true });
    }
    if (typeof patchServerRosterRoles === "function") {
      patchServerRosterRoles(
        currentServerId,
        miniProfileUserId,
        result.roles || null,
        result.highest_role,
        result.hoist_role || null,
        result.name_role || null
      );
    }
    if (miniProfileUserId === myUserId && typeof refreshServerPerms === "function") refreshServerPerms();
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
  paintMiniProfileRolesOnly(data);
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
  const card = document.getElementById("mini-profile");
  if (!card) return;
  card.hidden = false;
  card.classList.add("mini-profile-card");
  const cached = typeof placeCache !== "undefined" ? placeCache.mini[String(userId)] : null;
  if (cached) {
    miniProfileData = cached;
    paintMiniProfile(cached);
  } else if (typeof fillPlaceHold === "function") {
    fillPlaceHold(card, 5);
  } else {
    card.innerHTML = "";
  }
  positionMiniProfile(anchorEl);
  try {
    const data = await fetchMiniProfile(userId);
    if (!miniProfileOpen || miniProfileUserId !== userId) return;
    if (typeof placeCache !== "undefined") placeCache.mini[String(userId)] = data;
    miniProfileData = data;
    paintMiniProfile(data);
    positionMiniProfile(anchorEl);
  } catch (e) {
    if (!miniProfileOpen || miniProfileUserId !== userId) return;
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
