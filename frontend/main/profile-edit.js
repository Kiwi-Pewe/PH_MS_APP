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
    id: "text",
    label: "Text",
    items: [
      { type: "header", label: "Header" },
      { type: "body", label: "Body" },
      { type: "footnote", label: "Footnote" },
      { type: "list", label: "List" }
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
      { type: "friends", label: "Friends" },
      { type: "link_tree", label: "Link Tree" }
    ]
  },
  {
    id: "decoration",
    label: "Decoration",
    items: [
      { type: "divider", label: "Divider" },
      { type: "spacer", label: "Spacer" }
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
    type: tile.type,
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
  const size = clampProfileTileSize(tile.type, w, h, tile.x);
  const next = {
    type: tile.type,
    x: tile.x,
    y: tile.y,
    w: size.w,
    h: size.h,
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
      const size = clampProfileTileSize(tile.type, cell.x - origin.x + 1, cell.y - origin.y + 1, origin.x);
      el.style.gridColumn = (origin.x + 1) + " / span " + size.w;
      el.style.gridRow = (origin.y + 1) + " / span " + size.h;
    }
  }

  function onUp(e) {
    if (!mode) return;
    const dragging = mode === "move";
    const dist = startPt ? Math.hypot(e.clientX - startPt.x, e.clientY - startPt.y) : 0;
    const rerender = !dragging || dist >= 6;
    if (dragging) {
      if (dist < 6) {
        if (typeof editProfileIdentity === "function") editProfileIdentity(tile);
      } else {
        const next = moveTarget(e.clientX, e.clientY);
        if (tryMoveTile(tile, next.x, next.y)) profileDirty = true;
      }
    } else {
      const cell = profileCellFromPoint(e.clientX, e.clientY);
      if (tryResizeTile(tile, cell.x - origin.x + 1, cell.y - origin.y + 1)) profileDirty = true;
    }
    mode = null;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    if (rerender) renderProfileBoard();
  }

  el.addEventListener("pointerdown", (e) => {
    if (e.button === 2) return;
    if (e.detail >= 2) return;
    if (e.target.closest(".profile-resize")) return;
    if (el.classList.contains("is-typing") && e.target.closest("textarea, input")) return;
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

function profileTileHasOptions(type) {
  return type === "header" || type === "body" || type === "footnote" || type === "list" || type === "divider" || type === "link_tree";
}

function profileSelectField(labelText, options, selected) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const select = document.createElement("select");
  select.className = "settings-select";
  options.forEach(opt => {
    const row = document.createElement("option");
    row.value = opt.value;
    row.textContent = opt.label;
    if (String(selected) === String(opt.value)) row.selected = true;
    select.appendChild(row);
  });
  label.appendChild(select);
  return { label, select };
}

function fillLinkTreeOptions(box, tile) {
  const links = (Array.isArray(tile.props.links) ? tile.props.links : []).map(row => ({
    platform: row.platform || "Other",
    username: row.username || "",
    url: row.url || ""
  }));
  const list = document.createElement("div");
  list.className = "profile-link-editor";
  function paintList() {
    list.innerHTML = "";
    if (!links.length) {
      const empty = document.createElement("div");
      empty.className = "settings-opt-desc";
      empty.textContent = "No links yet.";
      list.appendChild(empty);
      return;
    }
    links.forEach((row, index) => {
      const line = document.createElement("div");
      line.className = "profile-link-edit-row";
      const label = document.createElement("div");
      label.className = "profile-link-edit-label";
      label.textContent = (row.platform || "Link") + (row.username ? " · " + row.username : "");
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "Remove";
      del.addEventListener("click", () => {
        links.splice(index, 1);
        paintList();
      });
      line.appendChild(label);
      line.appendChild(del);
      list.appendChild(line);
    });
  }
  paintList();
  box.appendChild(list);

  const platformField = profileSelectField(
    "Platform",
    PROFILE_LINK_PLATFORMS.map(name => ({ value: name, label: name })),
    "YouTube"
  );
  const userLabel = document.createElement("label");
  userLabel.textContent = "Username";
  const userInput = document.createElement("input");
  userInput.type = "text";
  userInput.maxLength = 32;
  userInput.placeholder = "your name on that site";
  userLabel.appendChild(userInput);
  const urlLabel = document.createElement("label");
  urlLabel.textContent = "Link";
  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.placeholder = "https://";
  urlLabel.appendChild(urlInput);
  const add = document.createElement("button");
  add.type = "button";
  add.className = "profile-link-add";
  add.textContent = "Add link";
  add.addEventListener("click", () => {
    const url = (urlInput.value || "").trim();
    if (!url) {
      urlInput.focus();
      return;
    }
    if (links.length >= 12) return;
    links.push({
      platform: platformField.select.value || "Other",
      username: (userInput.value || "").trim(),
      url
    });
    userInput.value = "";
    urlInput.value = "";
    paintList();
  });
  box.appendChild(platformField.label);
  box.appendChild(userLabel);
  box.appendChild(urlLabel);
  box.appendChild(add);
  return () => ({ links: links.slice() });
}

function openProfileTileOptions(tile) {
  tile.props = tile.props || {};
  const overlay = document.createElement("div");
  overlay.className = "settings-form-overlay";
  const box = document.createElement("div");
  box.className = "settings-form";
  const heading = document.createElement("h3");
  heading.textContent = "Options";
  box.appendChild(heading);

  let readValues = () => ({});
  if (tile.type === "header") {
    const field = profileSelectField("Header style", [
      { value: "1", label: "Heading 1 — large" },
      { value: "2", label: "Heading 2 — medium" },
      { value: "3", label: "Heading 3 — small" }
    ], tile.props.level || 1);
    box.appendChild(field.label);
    readValues = () => ({ level: Number(field.select.value) || 1 });
  } else if (tile.type === "list") {
    const field = profileSelectField("List style", [
      { value: "bullet", label: "Bullets" },
      { value: "number", label: "Numbered" }
    ], tile.props.style || "bullet");
    box.appendChild(field.label);
    readValues = () => ({ style: field.select.value === "number" ? "number" : "bullet" });
  } else if (tile.type === "divider") {
    const field = profileSelectField("Line style", [
      { value: "solid", label: "Solid" },
      { value: "dashed", label: "Dashed" },
      { value: "dotted", label: "Dotted" }
    ], tile.props.style || "solid");
    box.appendChild(field.label);
    readValues = () => ({ style: field.select.value });
  } else if (tile.type === "link_tree") {
    box.classList.add("is-wide");
    readValues = fillLinkTreeOptions(box, tile);
  } else {
    const label = document.createElement("label");
    label.className = "settings-check";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = !!tile.props.show_border;
    const name = document.createElement("span");
    name.textContent = "Show border";
    label.appendChild(check);
    label.appendChild(name);
    box.appendChild(label);
    readValues = () => ({ show_border: !!check.checked });
  }

  const actions = document.createElement("div");
  actions.className = "settings-form-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => overlay.remove());
  const save = document.createElement("button");
  save.type = "button";
  save.className = "settings-form-save";
  save.textContent = "Save";
  save.addEventListener("click", () => {
    Object.assign(tile.props, readValues());
    overlay.remove();
    markProfileDirty();
  });
  actions.appendChild(cancel);
  actions.appendChild(save);
  box.appendChild(actions);
  overlay.appendChild(box);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function showProfileTileMenu(e, tile) {
  const meta = PROFILE_TILE_TYPES[tile.type] || { label: "Element" };
  if (typeof openContextMenu !== "function") return;
  const items = [];
  if (profileTileHasOptions(tile.type)) {
    items.push({
      label: "Options",
      onSelect: () => openProfileTileOptions(tile)
    });
  }
  items.push(
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
  );
  openContextMenu(e.clientX, e.clientY, {
    avatarText: (meta.label || "?").slice(0, 1),
    title: meta.label
  }, items);
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
