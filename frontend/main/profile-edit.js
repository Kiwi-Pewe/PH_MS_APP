// ==================================================================
// profile-edit.js - Palette, drag/swap/resize, and page tools.
// Dragging is local until Save. Occupied drops snap back unless
// the piece (or the one it lands on) has Allow overlap.
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
  const gap = PROFILE_GAP;
  const innerW = board.clientWidth - padX - (parseFloat(styles.paddingRight) || 0);
  const colW = (innerW - gap * (PROFILE_COLS - 1)) / PROFILE_COLS;
  const stepX = colW + gap;
  const stepY = PROFILE_ROW_H + gap;
  const x = Math.max(0, Math.min(PROFILE_COLS - 1, Math.floor((clientX - rect.left - padX + board.scrollLeft) / stepX)));
  const y = Math.max(0, Math.floor((clientY - rect.top - padY + board.scrollTop) / stepY));
  return { x, y };
}

function tryMoveTile(tile, x, y) {
  const page = currentProfilePage();
  if (!page) return false;
  const next = {
    x: Math.max(0, Math.min(PROFILE_COLS - tile.w, x)),
    y: Math.max(0, y),
    w: tile.w,
    h: tile.h,
    allow_overlap: tile.allow_overlap
  };
  if (!profileFits(next)) return false;
  if (profileColliders(page, Object.assign({}, tile, next), tile.id).length) return false;
  tile.x = next.x;
  tile.y = next.y;
  return true;
}

function tryResizeTile(tile, w, h) {
  const page = currentProfilePage();
  if (!page) return false;
  const next = {
    x: tile.x,
    y: tile.y,
    w: Math.max(1, w),
    h: Math.max(1, h),
    allow_overlap: tile.allow_overlap
  };
  if (!profileFits(next)) return false;
  if (profileColliders(page, Object.assign({}, tile, next), tile.id).length) return false;
  tile.w = next.w;
  tile.h = next.h;
  return true;
}

function bindProfileTileDrag(el, tile, handle) {
  let mode = null;
  let origin = null;
  let startPt = null;
  let grabOffset = { x: 0, y: 0 };

  function moveTarget(clientX, clientY) {
    const cell = profileCellFromPoint(clientX, clientY);
    return {
      x: Math.max(0, Math.min(PROFILE_COLS - tile.w, cell.x - grabOffset.x)),
      y: Math.max(0, cell.y - grabOffset.y)
    };
  }

  function onMove(e) {
    if (!mode) return;
    const cell = profileCellFromPoint(e.clientX, e.clientY);
    if (mode === "move") {
      const next = moveTarget(e.clientX, e.clientY);
      el.style.gridColumn = (next.x + 1) + " / span " + tile.w;
      el.style.gridRow = (next.y + 1) + " / span " + tile.h;
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
      else {
        const next = moveTarget(e.clientX, e.clientY);
        if (tryMoveTile(tile, next.x, next.y)) profileDirty = true;
      }
    } else if (tryResizeTile(tile, Math.max(1, cell.x - origin.x + 1), Math.max(1, cell.y - origin.y + 1))) {
      profileDirty = true;
    }
    mode = null;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    renderProfileBoard();
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.button === 2) return;
    if (e.target.closest(".profile-resize")) return;
    if (e.target.closest("textarea") || e.target.closest("input")) return;
    e.preventDefault();
    mode = "move";
    origin = { x: tile.x, y: tile.y, w: tile.w, h: tile.h };
    startPt = { x: e.clientX, y: e.clientY };
    const grab = profileCellFromPoint(e.clientX, e.clientY);
    grabOffset = {
      x: Math.max(0, Math.min(Math.max(tile.w - 1, 0), grab.x - tile.x)),
      y: Math.max(0, Math.min(Math.max(tile.h - 1, 0), grab.y - tile.y))
    };
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

function showProfileTileMenu(e, tile) {
  const meta = PROFILE_TILE_TYPES[tile.type] || { label: "Element" };
  if (typeof openContextMenu !== "function") return;
  openContextMenu(e.clientX, e.clientY, {
    avatarText: (meta.label || "?").slice(0, 1),
    title: meta.label
  }, [
    {
      label: tile.allow_overlap ? "Allow overlap \u2713" : "Allow overlap",
      onSelect: () => {
        tile.allow_overlap = !tile.allow_overlap;
        markProfileDirty();
      }
    },
    {
      label: "Reset element",
      onSelect: () => {
        resetProfileTile(tile);
        markProfileDirty();
      }
    },
    {
      label: "Remove element",
      danger: true,
      onSelect: () => {
        const page = currentProfilePage();
        if (!page) return;
        page.tiles = (page.tiles || []).filter(row => row.id !== tile.id);
        markProfileDirty();
      }
    }
  ]);
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
