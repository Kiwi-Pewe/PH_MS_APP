// ==================================================================
// profile-board.js - 32-column snap grid, collision, and tile paint.
// Identity tiles sit on the Guilded seam with CSS, not shared cells.
// ==================================================================

const PROFILE_COLS = 32;
const PROFILE_ROW_H = 36;
const PROFILE_GAP = 0;
const PROFILE_TILE_TYPES = {
  banner: { w: 32, h: 3, label: "Banner" },
  avatar: { w: 5, h: 2, label: "Avatar" },
  display_name: { w: 16, h: 2, label: "Display name" },
  bio: { w: 11, h: 5, label: "Bio" },
  friends: { w: 11, h: 5, label: "Friends" }
};

function profileNewId(prefix) {
  return prefix + "_" + Math.random().toString(16).slice(2, 10);
}

function cloneProfileLayout(layout) {
  const copy = JSON.parse(JSON.stringify(layout || { pages: [] }));
  copy.grid_cols = PROFILE_COLS;
  return copy;
}

function profilePageById(layout, pageId) {
  const pages = (layout && layout.pages) || [];
  return pages.find(page => page.id === pageId) || pages[0] || null;
}

function profileTilesOverlap(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function profileTileAllowsOverlap(tile) {
  return !!(tile && tile.allow_overlap);
}

function profileColliders(page, candidate, skipId) {
  return (page.tiles || []).filter(tile => {
    if (tile.id === skipId) return false;
    if (!profileTilesOverlap(tile, candidate)) return false;
    if (profileTileAllowsOverlap(candidate) || profileTileAllowsOverlap(tile)) return false;
    return true;
  });
}

function profileFits(tile) {
  return tile.x >= 0 && tile.y >= 0 && tile.w >= 1 && tile.h >= 1 && tile.x + tile.w <= PROFILE_COLS;
}

function profileFirstFit(page, w, h, skipId) {
  const maxY = (page.tiles || []).reduce((n, tile) => Math.max(n, tile.y + tile.h), 0) + 8;
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= PROFILE_COLS - w; x++) {
      const probe = { x, y, w, h };
      if (!profileColliders(page, probe, skipId).length) return { x, y };
    }
  }
  return { x: 0, y: maxY };
}

function defaultProfileTileProps(type, existing) {
  if (type === "bio") return { text: "" };
  if (type === "banner") {
    const color = existing && existing.color ? existing.color : "#1e6b8a";
    return { color };
  }
  return {};
}

function placeProfileTile(page, type) {
  const size = PROFILE_TILE_TYPES[type] || { w: 4, h: 3 };
  const spot = profileFirstFit(page, size.w, size.h);
  const tile = {
    id: profileNewId("tile"),
    type,
    x: spot.x,
    y: spot.y,
    w: size.w,
    h: size.h,
    allow_overlap: false,
    props: defaultProfileTileProps(type)
  };
  page.tiles = (page.tiles || []).concat([tile]);
  return tile;
}

function resetProfileTile(tile) {
  const size = PROFILE_TILE_TYPES[tile.type] || { w: 4, h: 3 };
  tile.w = size.w;
  tile.h = size.h;
  tile.allow_overlap = false;
  tile.props = defaultProfileTileProps(tile.type, tile.props);
}

function profileTileStyle(tile) {
  return {
    gridColumn: (tile.x + 1) + " / span " + tile.w,
    gridRow: (tile.y + 1) + " / span " + tile.h
  };
}

function applyProfileTileStyle(el, tile) {
  el.style.gridColumn = (tile.x + 1) + " / span " + tile.w;
  el.style.gridRow = (tile.y + 1) + " / span " + tile.h;
}

function profileOwnerName() {
  if (!profileUser) return myDisplayName || myUsername || "—";
  return profileUser.display_name || profileUser.username || "—";
}

function profileOwnerHandle() {
  if (!profileUser) return myUsername || "";
  return profileUser.username || "";
}

function paintProfileFriends(host) {
  const people = profileFriends || [];
  if (!people.length) {
    const empty = document.createElement("div");
    empty.className = "settings-opt-desc";
    empty.textContent = "No friends to show yet.";
    host.appendChild(empty);
    return;
  }
  people.forEach(person => {
    const row = document.createElement("div");
    row.className = "profile-friend-row";
    const dot = document.createElement("div");
    dot.className = "avatar-dot";
    const shown = person.display_name || person.username || "?";
    dot.textContent = typeof avatarLetter === "function" ? avatarLetter(shown) : shown.slice(0, 1);
    const name = document.createElement("div");
    name.textContent = shown;
    row.appendChild(dot);
    row.appendChild(name);
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      if (person.id && typeof openUserProfile === "function") openUserProfile(person.id);
    });
    host.appendChild(row);
  });
}

function paintProfileTileContent(tile, el) {
  el.innerHTML = "";
  if (tile.type === "banner") {
    el.style.background = (tile.props && tile.props.color) || "#1e6b8a";
    return;
  }
  el.style.background = "";
  if (tile.type === "avatar") {
    const face = document.createElement("div");
    face.className = "profile-tile-avatar";
    face.textContent = typeof avatarLetter === "function" ? avatarLetter(profileOwnerName()) : (profileOwnerName() || "?").slice(0, 1);
    el.appendChild(face);
    return;
  }
  if (tile.type === "display_name") {
    const name = document.createElement("div");
    name.className = "profile-tile-name";
    name.textContent = profileOwnerName();
    const handle = document.createElement("div");
    handle.className = "profile-tile-handle";
    handle.textContent = "@" + profileOwnerHandle();
    el.appendChild(name);
    el.appendChild(handle);
    return;
  }
  const head = document.createElement("div");
  head.className = "profile-tile-head";
  head.textContent = tile.type === "bio" ? "About" : "Friends";
  const body = document.createElement("div");
  body.className = "profile-tile-body";
  if (tile.type === "bio") {
    if (profileEditing && profileIsOwn) {
      const area = document.createElement("textarea");
      area.value = (tile.props && tile.props.text) || "";
      area.maxLength = 1000;
      area.placeholder = "Write something about yourself.";
      area.addEventListener("pointerdown", (e) => e.stopPropagation());
      area.addEventListener("input", () => {
        tile.props = tile.props || {};
        tile.props.text = area.value;
        profileDirty = true;
      });
      body.appendChild(area);
    } else {
      body.textContent = (tile.props && tile.props.text) || "No bio yet.";
    }
  } else {
    paintProfileFriends(body);
  }
  el.appendChild(head);
  el.appendChild(body);
}

function renderProfileBoard() {
  const board = document.getElementById("profile-board");
  if (!board) return;
  board.innerHTML = "";
  board.classList.toggle("is-editing", !!(profileEditing && profileIsOwn));
  board.style.setProperty("--profile-row", PROFILE_ROW_H + "px");
  board.style.gridAutoRows = PROFILE_ROW_H + "px";
  board.style.gap = PROFILE_GAP + "px";
  const layout = profileDraft || profileSavedLayout;
  const page = profilePageById(layout, profileActivePageId);
  const tiles = (page && page.tiles) || [];
  if (profileEditing && profileIsOwn) paintProfileGrid(board, page);
  if (!tiles.length) {
    const empty = document.createElement("div");
    empty.className = "profile-board-empty";
    empty.textContent = profileEditing
      ? "Drop pieces from the palette onto this page."
      : "Nothing on this page yet.";
    board.appendChild(empty);
  }
  tiles.forEach((tile, index) => {
    const el = document.createElement("div");
    el.className = "profile-tile is-" + tile.type + (profileEditing ? " is-editing" : "") + (tile.allow_overlap ? " allows-overlap" : "");
    el.dataset.tileId = tile.id;
    el.style.zIndex = String(10 + index);
    applyProfileTileStyle(el, tile);
    paintProfileTileContent(tile, el);
    if (profileEditing && profileIsOwn && typeof bindProfileTileDrag === "function") {
      const handle = document.createElement("div");
      handle.className = "profile-resize";
      el.appendChild(handle);
      bindProfileTileDrag(el, tile, handle);
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof showProfileTileMenu === "function") showProfileTileMenu(e, tile);
      });
    }
    if (!profileEditing && profileIsOwn && typeof bindProfileQuickEdit === "function") {
      bindProfileQuickEdit(el, tile);
    }
    board.appendChild(el);
  });
}

function paintProfileGrid(board, page) {
  const rows = Math.max(18, (page && page.tiles || []).reduce((n, tile) => Math.max(n, tile.y + tile.h), 0) + 10);
  const overlay = document.createElement("div");
  overlay.className = "profile-grid-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.gridTemplateRows = "repeat(" + rows + ", " + PROFILE_ROW_H + "px)";
  const count = PROFILE_COLS * rows;
  for (let i = 0; i < count; i++) {
    overlay.appendChild(document.createElement("div"));
  }
  board.appendChild(overlay);
}
