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
      { type: "display_name", label: "Display name" },
      { type: "member_since", label: "Member since" }
    ]
  },
  {
    id: "text",
    label: "Text",
    items: [
      { type: "header", label: "Header" },
      { type: "body", label: "Body" },
      { type: "footnote", label: "Footnote" },
      { type: "list", label: "List" },
      { type: "spoiler", label: "Spoiler" },
      { type: "stats", label: "Stats" },
      { type: "callout", label: "Callout" },
      { type: "button", label: "Button" }
    ]
  },
  {
    id: "about",
    label: "About",
    items: [
      { type: "bio", label: "Bio" },
      { type: "details", label: "Details" },
      { type: "interests", label: "Interests" },
      { type: "looking_for", label: "Looking for" },
      { type: "fun_facts", label: "Fun facts" },
      { type: "schedule", label: "Schedule" },
      { type: "setup", label: "Setup" }
    ]
  },
  {
    id: "social",
    label: "Social",
    items: [
      { type: "friends", label: "Friends" },
      { type: "link_tree", label: "Link Tree" },
      { type: "connections", label: "Connections" },
      { type: "featured_friend", label: "Featured friend" },
      { type: "mutuals", label: "Mutuals" }
    ]
  },
  {
    id: "decoration",
    label: "Decoration",
    items: [
      { type: "divider", label: "Divider" },
      { type: "frame", label: "Frame" },
      { type: "color_block", label: "Color block" },
      { type: "icon", label: "Icon" },
      { type: "meter", label: "Meter" },
      { type: "clock", label: "Clock" },
      { type: "countdown", label: "Countdown" }
    ]
  },
  {
    id: "media",
    label: "Media",
    items: [
      { type: "image", label: "Image" },
      { type: "video", label: "Video" },
      { type: "music", label: "Music" },
      { type: "twitch", label: "Twitch" },
      { type: "gallery", label: "Gallery" },
      { type: "slideshow", label: "Slideshow" },
      { type: "youtube", label: "YouTube" },
      { type: "gif", label: "GIF" },
      { type: "artwork", label: "Artwork" }
    ]
  },
  {
    id: "community",
    label: "Community",
    items: [
      { type: "comments", label: "Comments" },
      { type: "server_list", label: "Server list" },
      { type: "featured_server", label: "Featured server" }
    ]
  },
  {
    id: "games",
    label: "Games",
    items: [
      { type: "achievements", label: "Achievements" },
      { type: "recently_played", label: "Recently played" },
      { type: "favorite_game", label: "Favorite game" },
      { type: "currently_playing", label: "Currently playing" },
      { type: "want_to_play", label: "Want to play" },
      { type: "games_played", label: "Games played" },
      { type: "game_stats", label: "Game stats" },
      { type: "library", label: "Library" },
      { type: "review", label: "Review" }
    ]
  },
  {
    id: "later",
    label: "Later",
    later: ["Contact (mail system)", "Events widget", "Applications widget", "Rep (chrome, not a tile)"]
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
    wrap.className = "profile-palette-group";
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

function profileOptHint(node, text, hintEl) {
  node.addEventListener("mouseenter", () => { hintEl.textContent = text; });
  node.addEventListener("mouseleave", () => {
    if (hintEl.textContent === text) hintEl.textContent = "";
  });
}

function fillTextFormatOptions(box, draft, type, onChange, hintEl) {
  const chrome = defaultTextChrome(type, draft);
  const size = profileSelectField("Size", PROFILE_TEXT_SIZES.map(pt => ({
    value: String(pt),
    label: String(pt)
  })), chrome.text_size);
  box.appendChild(size.label);
  profileOptHint(size.label, "Point size for this widget’s text, same scale Docs uses.", hintEl);
  size.select.addEventListener("change", () => {
    draft.text_size = Number(size.select.value) || 14;
    onChange();
  });
  const alignWrap = document.createElement("div");
  alignWrap.className = "profile-opt-align";
  const alignLabel = document.createElement("div");
  alignLabel.className = "profile-opt-field-label";
  alignLabel.textContent = "Alignment";
  alignWrap.appendChild(alignLabel);
  const row = document.createElement("div");
  row.className = "profile-opt-seg";
  [["left", "L", "Align text to the left."], ["center", "C", "Center text."], ["right", "R", "Align text to the right."]].forEach(item => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item[1];
    btn.className = draft.text_align === item[0] ? "is-on" : "";
    profileOptHint(btn, item[2], hintEl);
    btn.addEventListener("click", () => {
      draft.text_align = item[0];
      Array.from(row.children).forEach(child => child.classList.toggle("is-on", child === btn));
      onChange();
    });
    row.appendChild(btn);
  });
  alignWrap.appendChild(row);
  box.appendChild(alignWrap);
}

function fillWidgetDesignOptions(box, tile, draft, onChange, hintEl) {
  const fake = { type: tile.type, props: draft };
  let readValues = () => ({});
  if (tile.type === "divider") {
    const field = profileSelectField("Line style", [
      { value: "solid", label: "Solid" },
      { value: "dashed", label: "Dashed" },
      { value: "dotted", label: "Dotted" }
    ], draft.style || "solid");
    box.appendChild(field.label);
    profileOptHint(field.label, "How the divider line is drawn.", hintEl);
    field.select.addEventListener("change", () => {
      draft.style = field.select.value;
      onChange();
    });
    return;
  }
  if (tile.type === "banner" || tile.type === "avatar") {
    readValues = fillBorderOptions(box, fake);
    profileOptHint(box, "Border sits on the image itself, not a panel behind it.", hintEl);
  } else if (tile.type === "display_name") {
    readValues = fillNameClusterOptions(box, fake);
  } else if (tile.type === "link_tree") {
    box.classList.add("is-wide");
    readValues = fillLinkTreeOptions(box, fake);
  } else if (tile.type === "header") {
    const field = profileSelectField("Header style", [
      { value: "1", label: "Heading 1 — large" },
      { value: "2", label: "Heading 2 — medium" },
      { value: "3", label: "Heading 3 — small" }
    ], draft.level || 1);
    box.appendChild(field.label);
    profileOptHint(field.label, "Heading size relative to this widget’s text size.", hintEl);
    field.select.addEventListener("change", () => {
      draft.level = Number(field.select.value) || 1;
      onChange();
    });
    return;
  } else if (tile.type === "list") {
    const field = profileSelectField("List style", [
      { value: "bullet", label: "Bullets" },
      { value: "number", label: "Numbered" }
    ], draft.style || "bullet");
    box.appendChild(field.label);
    profileOptHint(field.label, "Markers in front of each list item.", hintEl);
    field.select.addEventListener("change", () => {
      draft.style = field.select.value === "number" ? "number" : "bullet";
      onChange();
    });
    return;
  } else if (tile.type === "spoiler") {
    const label = document.createElement("label");
    label.className = "settings-check";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = !!draft.start_open;
    label.appendChild(check);
    label.appendChild(document.createTextNode(" Start open"));
    box.appendChild(label);
    profileOptHint(label, "When on, visitors see the hidden text already revealed.", hintEl);
    check.addEventListener("change", () => {
      draft.start_open = !!check.checked;
      onChange();
    });
    return;
  } else if (tile.type === "callout") {
    const field = profileSelectField("Callout tone", [
      { value: "tip", label: "Tip" },
      { value: "warning", label: "Warning" }
    ], draft.tone || "tip");
    box.appendChild(field.label);
    profileOptHint(field.label, "Tip uses the accent bar. Warning uses the away color.", hintEl);
    field.select.addEventListener("change", () => {
      draft.tone = field.select.value === "warning" ? "warning" : "tip";
      onChange();
    });
    return;
  } else {
    const empty = document.createElement("div");
    empty.className = "profile-opt-empty";
    empty.textContent = "No layout settings for this widget yet.";
    box.appendChild(empty);
    return;
  }
  box.addEventListener("input", () => {
    Object.assign(draft, readValues());
    onChange();
  });
  box.addEventListener("change", () => {
    Object.assign(draft, readValues());
    onChange();
  });
}

function profileTileHasOptions(type) {
  return profileUsesTextChrome(type) || type === "divider" || type === "link_tree" || type === "banner" || type === "avatar" || type === "display_name";
}

function fillBorderOptions(box, tile) {
  const props = tile.props || {};
  const label = document.createElement("label");
  label.className = "settings-check";
  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = !!props.show_border;
  const name = document.createElement("span");
  name.textContent = "Show border";
  label.appendChild(check);
  label.appendChild(name);
  box.appendChild(label);
  const thick = document.createElement("label");
  thick.textContent = "Thickness";
  const thickInput = document.createElement("input");
  thickInput.type = "number";
  thickInput.min = "1";
  thickInput.max = "12";
  thickInput.value = String(props.border_width || 3);
  thick.appendChild(thickInput);
  box.appendChild(thick);
  const color = document.createElement("label");
  color.textContent = "Color";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = props.border_color || "#ffffff";
  color.appendChild(colorInput);
  box.appendChild(color);
  return () => ({
    show_border: !!check.checked,
    border_width: Number(thickInput.value) || 3,
    border_color: colorInput.value || "#ffffff"
  });
}

function fillNameClusterOptions(box, tile) {
  const props = tile.props || {};
  const statusCheckLabel = document.createElement("label");
  statusCheckLabel.className = "settings-check";
  const statusCheck = document.createElement("input");
  statusCheck.type = "checkbox";
  statusCheck.checked = !!props.show_status;
  statusCheckLabel.appendChild(statusCheck);
  statusCheckLabel.appendChild(document.createTextNode(" Show status"));
  box.appendChild(statusCheckLabel);
  const statusLabel = document.createElement("label");
  statusLabel.textContent = "Status";
  const statusInput = document.createElement("input");
  statusInput.type = "text";
  statusInput.maxLength = 80;
  statusInput.value = profileOwnerStatus();
  statusLabel.appendChild(statusInput);
  box.appendChild(statusLabel);
  const proCheckLabel = document.createElement("label");
  proCheckLabel.className = "settings-check";
  const proCheck = document.createElement("input");
  proCheck.type = "checkbox";
  proCheck.checked = !!props.show_pronouns;
  proCheckLabel.appendChild(proCheck);
  proCheckLabel.appendChild(document.createTextNode(" Show pronouns"));
  box.appendChild(proCheckLabel);
  const proLabel = document.createElement("label");
  proLabel.textContent = "Pronouns";
  const proInput = document.createElement("input");
  proInput.type = "text";
  proInput.maxLength = 32;
  proInput.value = profileOwnerPronouns();
  proLabel.appendChild(proInput);
  box.appendChild(proLabel);
  return () => ({
    show_status: !!statusCheck.checked,
    show_pronouns: !!proCheck.checked,
    identity: { status: statusInput.value, pronouns: proInput.value }
  });
}

function growNameClusterTile(tile) {
  let need = 2;
  if (tile.props && tile.props.show_status) need += 1;
  const maxH = (PROFILE_TILE_TYPES.display_name && PROFILE_TILE_TYPES.display_name.maxH) || 5;
  if (tile.h < need) tile.h = Math.min(maxH, need);
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
        box.dispatchEvent(new Event("change"));
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
    box.dispatchEvent(new Event("change"));
  });
  box.appendChild(platformField.label);
  box.appendChild(userLabel);
  box.appendChild(urlLabel);
  box.appendChild(add);
  return () => ({ links: links.slice() });
}

function openProfileTileOptions(tile) {
  tile.props = tile.props || {};
  const draft = Object.assign({}, tile.props);
  if (Array.isArray(draft.links)) draft.links = draft.links.map(row => Object.assign({}, row));
  if (Array.isArray(draft.rows)) draft.rows = draft.rows.map(row => Object.assign({}, row));
  if (Array.isArray(draft.items)) draft.items = draft.items.slice();
  Object.assign(draft, defaultTextChrome(tile.type, draft));
  let tab = 'design';
  const overlay = document.createElement('div');
  overlay.className = 'settings-form-overlay';
  const box = document.createElement('div');
  box.className = 'profile-opt';

  const top = document.createElement('div');
  top.className = 'profile-opt-top';
  const name = document.createElement('div');
  name.className = 'profile-opt-name';
  name.textContent = (PROFILE_TILE_TYPES[tile.type] && PROFILE_TILE_TYPES[tile.type].label) || tile.type;
  const tabs = document.createElement('div');
  tabs.className = 'profile-opt-tabs';

  const main = document.createElement('div');
  main.className = 'profile-opt-main';
  const left = document.createElement('div');
  left.className = 'profile-opt-left';
  const preview = document.createElement('div');
  preview.className = 'profile-opt-preview';
  const previewCard = document.createElement('div');
  preview.appendChild(previewCard);
  main.appendChild(left);
  main.appendChild(preview);

  const bottom = document.createElement('div');
  bottom.className = 'profile-opt-bottom';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  const hintEl = document.createElement('div');
  hintEl.className = 'profile-opt-hint';
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'settings-form-save';
  confirm.textContent = 'Confirm';
  bottom.appendChild(cancel);
  bottom.appendChild(hintEl);
  bottom.appendChild(confirm);

  function addTab(id, label, hint) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.className = tab === id ? 'is-on' : '';
    profileOptHint(btn, hint, hintEl);
    btn.addEventListener('click', () => {
      tab = id;
      Array.from(tabs.children).forEach(child => child.classList.toggle('is-on', child === btn));
      paintLeft();
    });
    tabs.appendChild(btn);
  }
  addTab('design', 'Widget Design', 'Layout and behavior for this widget.');
  if (profileHasTextFormat(tile.type)) {
    addTab('format', 'Text Format', 'Size and alignment for the text in this widget.');
  }

  function paintPreview() {
    previewCard.className = 'profile-tile is-' + tile.type + ' is-opt-preview';
    const fake = { type: tile.type, props: draft, id: tile.id, w: tile.w, h: tile.h, x: 0, y: 0 };
    const wasEditing = profileEditing;
    profileEditing = false;
    try {
      paintProfileTileContent(fake, previewCard);
    } finally {
      profileEditing = wasEditing;
    }
  }

  function paintLeft() {
    left.innerHTML = '';
    left.classList.remove('is-wide');
    if (tab === 'format' && profileHasTextFormat(tile.type)) {
      fillTextFormatOptions(left, draft, tile.type, paintPreview, hintEl);
    } else {
      fillWidgetDesignOptions(left, tile, draft, paintPreview, hintEl);
    }
  }

  cancel.addEventListener('click', () => overlay.remove());
  confirm.addEventListener('click', async () => {
    const identity = draft.identity;
    delete draft.identity;
    if (identity && typeof saveProfileIdentity === 'function') {
      confirm.disabled = true;
      try {
        await saveProfileIdentity(identity);
      } catch (e) {
        confirm.disabled = false;
        window.alert(e.message || 'Could not save.');
        return;
      }
    }
    Object.assign(tile.props, draft);
    if (tile.type === 'display_name') growNameClusterTile(tile);
    overlay.remove();
    markProfileDirty();
  });

  top.appendChild(name);
  top.appendChild(tabs);
  box.appendChild(top);
  box.appendChild(main);
  box.appendChild(bottom);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  paintLeft();
  paintPreview();
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
