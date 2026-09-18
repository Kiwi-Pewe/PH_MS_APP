// ==================================================================
// profile-edit.js - Palette, drag/swap/resize, and page tools.
// Dragging is local until Save. Occupied drop swaps the two tiles.
// ==================================================================

const PROFILE_PALETTE = [
  {
    id: "identity",
    label: "Identity",
    items: [
      { type: "banner", label: "Banner" },
      { type: "avatar", label: "Avatar" },
      { type: "display_name", label: "Display name" }
    ]
  },
  {
    id: "about",
    label: "About",
    items: [
      { type: "bio", label: "Bio" }
    ]
  },
  {
    id: "social",
    label: "Social",
    items: [
      { type: "friends", label: "Friends" }
    ]
  },
  {
    id: "later",
    label: "Later",
    later: ["Badges", "Connections", "Games", "Media"]
  }
];

function currentProfilePage() {
  return profilePageById(profileDraft, profileActivePageId);
}

function markProfileDirty() {
  profileDirty = true;
  renderProfileBoard();
  renderProfilePages();
}

function renderProfilePalette() {
  const host = document.getElementById("profile-palette-body");
  if (!host) return;
  host.innerHTML = "";
  PROFILE_PALETTE.forEach(group => {
    const wrap = document.createElement("div");
    wrap.className = "profile-palette-group is-open";
    const toggle = document.createElement("button");
    toggle.type = "button";
    const caret = document.createElement("span");
    caret.className = "profile-palette-caret";
    caret.textContent = "▾";
    toggle.appendChild(document.createTextNode(group.label));
    toggle.appendChild(caret);
    const items = document.createElement("div");
    items.className = "profile-palette-items";
    toggle.addEventListener("click", () => wrap.classList.toggle("is-open"));
    if (group.items) {
      group.items.forEach(item => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "profile-palette-item";
        btn.textContent = item.label;
        btn.addEventListener("click", () => {
          const page = currentProfilePage();
          if (!page) return;
          placeProfileTile(page, item.type);
          markProfileDirty();
        });
        items.appendChild(btn);
      });
    }
    if (group.later) {
      group.later.forEach(label => {
        const note = document.createElement("div");
        note.className = "profile-palette-later";
        note.textContent = label;
        items.appendChild(note);
      });
    }
    wrap.appendChild(toggle);
    wrap.appendChild(items);
    host.appendChild(wrap);
  });
}

function profileCellFromPoint(clientX, clientY) {
  const board = document.getElementById("profile-board");
  const rect = board.getBoundingClientRect();
  const styles = window.getComputedStyle(board);
  const padX = parseFloat(styles.paddingLeft) || 0;
  const padY = parseFloat(styles.paddingTop) || 0;
  const gap = parseFloat(styles.gap) || 8;
  const innerW = board.clientWidth - padX - (parseFloat(styles.paddingRight) || 0);
  const colW = (innerW - gap * (PROFILE_COLS - 1)) / PROFILE_COLS;
  const rowH = 56;
  const x = Math.max(0, Math.min(PROFILE_COLS - 1, Math.floor((clientX - rect.left - padX + board.scrollLeft) / (colW + gap))));
  const y = Math.max(0, Math.floor((clientY - rect.top - padY + board.scrollTop) / (rowH + gap)));
  return { x, y };
}

function tryMoveTile(tile, x, y) {
  const page = currentProfilePage();
  if (!page) return false;
  const next = { x, y, w: tile.w, h: tile.h };
  if (!profileFits(next)) {
    next.x = Math.max(0, Math.min(PROFILE_COLS - tile.w, x));
    next.y = Math.max(0, y);
    if (!profileFits(next)) return false;
  }
  const hits = profileColliders(page, next, tile.id);
  if (!hits.length) {
    tile.x = next.x;
    tile.y = next.y;
    return true;
  }
  if (hits.length === 1) {
    swapProfileTiles(tile, hits[0]);
    if (profileColliders(page, tile, tile.id).length || profileColliders(page, hits[0], hits[0].id).length) {
      swapProfileTiles(tile, hits[0]);
      return false;
    }
    return true;
  }
  return false;
}

function tryResizeTile(tile, w, h) {
  const page = currentProfilePage();
  if (!page) return false;
  const next = { x: tile.x, y: tile.y, w: Math.max(1, w), h: Math.max(1, h) };
  if (!profileFits(next)) return false;
  if (profileColliders(page, next, tile.id).length) return false;
  tile.w = next.w;
  tile.h = next.h;
  return true;
}

function bindProfileTileDrag(el, tile, handle) {
  let mode = null;
  let origin = null;
  let startPt = null;

  function onMove(e) {
    if (!mode) return;
    const cell = profileCellFromPoint(e.clientX, e.clientY);
    if (mode === "move") {
      const x = Math.max(0, Math.min(PROFILE_COLS - tile.w, cell.x));
      el.style.gridColumn = (x + 1) + " / span " + tile.w;
      el.style.gridRow = (Math.max(0, cell.y) + 1) + " / span " + tile.h;
    } else {
      const w = Math.max(1, Math.min(PROFILE_COLS - origin.x, cell.x - origin.x + 1));
      const h = Math.max(1, cell.y - origin.y + 1);
      el.style.gridColumn = (origin.x + 1) + " / span " + w;
      el.style.gridRow = (origin.y + 1) + " / span " + h;
    }
  }

  function onUp(e) {
    if (!mode) return;
    const cell = profileCellFromPoint(e.clientX, e.clientY);
    const dist = startPt ? Math.hypot(e.clientX - startPt.x, e.clientY - startPt.y) : 0;
    if (mode === "move") {
      if (dist < 6 && typeof editProfileIdentity === "function") editProfileIdentity(tile);
      else if (tryMoveTile(tile, cell.x, cell.y)) profileDirty = true;
    } else if (tryResizeTile(tile, Math.max(1, cell.x - origin.x + 1), Math.max(1, cell.y - origin.y + 1))) {
      profileDirty = true;
    }
    mode = null;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    renderProfileBoard();
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".profile-resize")) return;
    if (e.target.closest("textarea") || e.target.closest("input")) return;
    e.preventDefault();
    mode = "move";
    origin = { x: tile.x, y: tile.y, w: tile.w, h: tile.h };
    startPt = { x: e.clientX, y: e.clientY };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });

  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    mode = "resize";
    origin = { x: tile.x, y: tile.y, w: tile.w, h: tile.h };
    startPt = { x: e.clientX, y: e.clientY };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });
}

function addProfilePage() {
  if (typeof openSettingsForm !== "function") return;
  openSettingsForm("Add page", [
    { name: "title", label: "Page name", value: "New page", maxlength: 32 }
  ], "Add", async (values) => {
    const title = (values.title || "Page").trim() || "Page";
    profileDraft.pages.push({
      id: profileNewId("page"),
      title,
      visibility: "public",
      tiles: []
    });
    profileActivePageId = profileDraft.pages[profileDraft.pages.length - 1].id;
    markProfileDirty();
  });
}

function renameProfilePage(pageId) {
  const page = profilePageById(profileDraft, pageId);
  if (!page || typeof openSettingsForm !== "function") return;
  openSettingsForm("Rename page", [
    { name: "title", label: "Page name", value: page.title, maxlength: 32 }
  ], "Save", async (values) => {
    page.title = (values.title || page.title).trim() || page.title;
    markProfileDirty();
  });
}

function moveProfilePage(pageId, dir) {
  const pages = profileDraft.pages || [];
  const index = pages.findIndex(page => page.id === pageId);
  const next = index + dir;
  if (index < 0 || next < 0 || next >= pages.length) return;
  const row = pages.splice(index, 1)[0];
  pages.splice(next, 0, row);
  markProfileDirty();
}
