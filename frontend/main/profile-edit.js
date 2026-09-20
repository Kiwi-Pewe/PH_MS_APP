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
      { type: "member_since", label: "Member since" },
      { type: "local_time", label: "Local Time" }
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
      { type: "button", label: "Button" }
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
      { type: "rail", label: "Rail" },
      { type: "frame", label: "Frame" },
      { type: "color_block", label: "Color block" },
      { type: "icon", label: "Icon" },
      { type: "meter", label: "Meter" },
      { type: "clock", label: "Clock" }
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
  const pad = profileBoardPad();
  const scale = profileBoardScale || 1;
  const x = (clientX - rect.left) / scale - (parseFloat(window.getComputedStyle(board).paddingLeft) || 0);
  const y = (clientY - rect.top) / scale - pad.y;
  const col = Math.max(0, Math.min(PROFILE_COLS - 1, Math.floor(x / PROFILE_ROW_H)));
  const row = Math.max(0, Math.floor(y / PROFILE_ROW_H));
  return { x: col, y: row };
}

function tryMoveTile(tile, x, y) {
  const page = currentProfilePage();
  if (!page) return false;
  const next = Object.assign({}, tile, {
    x: Math.max(0, Math.min(PROFILE_COLS - tile.w, x)),
    y: Math.max(0, y)
  });
  if (!profileFits(next)) return false;
  if (profileColliders(page, next, tile.id).length) return false;
  tile.x = next.x;
  tile.y = next.y;
  return true;
}

function tryResizeTile(tile, w, h) {
  const page = currentProfilePage();
  if (!page) return false;
  const size = clampProfileTileSize(tile.type, w, h, tile.x, tile);
  const next = Object.assign({}, tile, {
    w: size.w,
    h: size.h
  });
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
      const size = clampProfileTileSize(tile.type, cell.x - origin.x + 1, cell.y - origin.y + 1, origin.x, tile);
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

function profileHasWidgetSettings(type) {
  return type === "banner" || type === "image" || type === "divider" || type === "rail" || type === "display_name" || type === "link_tree" || type === "friends" || type === "button" || type === "local_time" || type === "details" || type === "body" || type === "icon" || type === "clock";
}

function bindDraftReaders(box, draft, readValues, onChange) {
  box.addEventListener("input", () => {
    Object.assign(draft, readValues());
    onChange();
  });
  box.addEventListener("change", () => {
    Object.assign(draft, readValues());
    onChange();
  });
}

function fillWidgetOptions(box, tile, draft, onChange, hintEl) {
  const fake = { type: tile.type, props: draft };
  if (tile.type === "banner") {
    fillBannerOptions(box, draft, onChange, hintEl);
    return;
  }
  if (tile.type === "image") {
    fillImageOptions(box, draft, onChange, hintEl);
    return;
  }
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
  if (tile.type === "rail") {
    fillRailOptions(box, draft, onChange, hintEl);
    return;
  }
  if (tile.type === "display_name") {
    bindDraftReaders(box, draft, fillNameClusterOptions(box, fake), onChange);
    return;
  }
  if (tile.type === "link_tree") {
    bindDraftReaders(box, draft, fillLinkTreeOptions(box, fake, hintEl), onChange);
    return;
  }
  if (tile.type === "friends") {
    fillFriendsOptions(box, draft, onChange, hintEl);
    return;
  }
  if (tile.type === "button") {
    fillButtonOptions(box, draft, onChange, hintEl);
    return;
  }
  if (tile.type === "local_time" || tile.type === "details") {
    fillLocalTimeOptions(box, draft, onChange, hintEl);
    return;
  }
  if (tile.type === "body") {
    fillBodyTitleOptions(box, draft, onChange, hintEl);
    return;
  }
  if (tile.type === "icon") {
    fillIconOptions(box, draft, onChange, hintEl);
    return;
  }
  if (tile.type === "clock") {
    fillClockOptions(box, draft, onChange, hintEl);
    return;
  }
  const empty = document.createElement("div");
  empty.className = "profile-opt-empty";
  empty.textContent = "No extra settings for this widget yet.";
  box.appendChild(empty);
}

function fillBannerOptions(box, draft, onChange, hintEl) {
  draft.color = profileBorderColor(draft.color) || "#1e6b8a";
  const colorLabel = document.createElement("div");
  colorLabel.className = "profile-opt-field-label";
  colorLabel.textContent = "Color";
  const colorRow = document.createElement("div");
  colorRow.className = "profile-opt-color-row";
  const picker = document.createElement("input");
  picker.type = "color";
  picker.value = draft.color;
  const hex = document.createElement("input");
  hex.type = "text";
  hex.maxLength = 7;
  hex.spellcheck = false;
  hex.value = draft.color.toUpperCase();
  function setColor(next) {
    const clean = profileBorderColor(next) || draft.color;
    draft.color = clean;
    picker.value = clean;
    hex.value = clean.toUpperCase();
    onChange();
  }
  profileOptHint(colorRow, "Fill color for the banner. New accounts still get a random color.", hintEl);
  picker.addEventListener("input", () => setColor(picker.value));
  hex.addEventListener("change", () => setColor(hex.value));
  colorRow.appendChild(picker);
  colorRow.appendChild(hex);
  box.appendChild(colorLabel);
  box.appendChild(colorRow);
}

function dropProfileImageDraft(draft) {
  if (!draft) return;
  if (draft._previewUrl) URL.revokeObjectURL(draft._previewUrl);
  delete draft._previewUrl;
  delete draft._file;
}

function fillImageOptions(box, draft, onChange, hintEl) {
  const note = document.createElement("div");
  note.className = "settings-opt-desc";
  note.textContent = "Jpeg, png, gif, or webp. Max 5 MB. Fits inside the widget without stretching.";
  box.appendChild(note);

  const status = document.createElement("div");
  status.className = "profile-opt-image-name";
  const actions = document.createElement("div");
  actions.className = "profile-opt-image-actions";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/jpeg,image/png,image/gif,image/webp";
  fileInput.hidden = true;
  const choose = document.createElement("button");
  choose.type = "button";
  choose.className = "profile-link-add";
  choose.textContent = draft.key || draft.url ? "Replace image" : "Choose image";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";

  function paintStatus() {
    const has = !!(draft._file || draft.key || (draft.url && !String(draft.url).startsWith("blob:")));
    status.textContent = draft._file ? draft._file.name : (draft.name || (has ? "Image" : "No image yet."));
    choose.textContent = has || draft._file ? "Replace image" : "Choose image";
    remove.hidden = !has && !draft._file;
  }

  profileOptHint(choose, "Pick a picture for this widget.", hintEl);
  choose.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    const reason = typeof rejectProfileImage === "function" ? rejectProfileImage(file) : "Upload is not available.";
    if (reason) {
      window.alert(reason);
      return;
    }
    if (draft._previewUrl) URL.revokeObjectURL(draft._previewUrl);
    draft._file = file;
    draft._previewUrl = URL.createObjectURL(file);
    draft.url = draft._previewUrl;
    draft.name = file.name || "Image";
    draft.mime = typeof fileMime === "function" ? fileMime(file) : file.type;
    draft.size = file.size;
    paintStatus();
    onChange();
  });
  remove.addEventListener("click", () => {
    dropProfileImageDraft(draft);
    draft.key = "";
    draft.url = "";
    draft.mime = "";
    draft.size = 0;
    draft.name = "";
    paintStatus();
    onChange();
  });
  actions.appendChild(choose);
  actions.appendChild(remove);
  box.appendChild(fileInput);
  box.appendChild(actions);
  box.appendChild(status);
  paintStatus();
}

function fillRailOptions(box, draft, onChange, hintEl) {
  if (draft.orientation !== "vertical") draft.orientation = "horizontal";
  draft.thickness = clampProfileBorderWidth(draft.thickness, 4);
  draft.color = profileBorderColor(draft.color) || "#ffffff";
  const known = PROFILE_BORDER_STYLES.some(item => item.value === draft.style);
  if (!known) draft.style = "solid";

  const thickLabel = document.createElement("div");
  thickLabel.className = "profile-opt-field-label";
  thickLabel.textContent = "Thickness";
  const thickRow = document.createElement("div");
  thickRow.className = "profile-opt-slider-row";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = "10";
  slider.step = "1";
  slider.className = "settings-slider";
  slider.value = String(draft.thickness);
  const val = document.createElement("div");
  val.className = "profile-opt-slider-val";
  val.textContent = slider.value;
  profileOptHint(slider, "How thick the rail is, from 1 to 10.", hintEl);
  slider.addEventListener("input", () => {
    draft.thickness = Number(slider.value) || 4;
    val.textContent = String(draft.thickness);
    onChange();
  });
  thickRow.appendChild(slider);
  thickRow.appendChild(val);
  box.appendChild(thickLabel);
  box.appendChild(thickRow);

  const colorLabel = document.createElement("div");
  colorLabel.className = "profile-opt-field-label";
  colorLabel.textContent = "Color";
  const colorRow = document.createElement("div");
  colorRow.className = "profile-opt-color-row";
  const picker = document.createElement("input");
  picker.type = "color";
  picker.value = draft.color;
  const hex = document.createElement("input");
  hex.type = "text";
  hex.maxLength = 7;
  hex.spellcheck = false;
  hex.value = draft.color.toUpperCase();
  function setColor(next) {
    const clean = profileBorderColor(next) || draft.color;
    draft.color = clean;
    picker.value = clean;
    hex.value = clean.toUpperCase();
    onChange();
  }
  profileOptHint(colorRow, "Color of the rail.", hintEl);
  picker.addEventListener("input", () => setColor(picker.value));
  hex.addEventListener("change", () => setColor(hex.value));
  colorRow.appendChild(picker);
  colorRow.appendChild(hex);
  box.appendChild(colorLabel);
  box.appendChild(colorRow);

  const typeField = profileSelectField("Style", PROFILE_BORDER_STYLES, draft.style);
  profileOptHint(typeField.label, "Solid, dashed, dotted, or double.", hintEl);
  typeField.select.addEventListener("change", () => {
    draft.style = typeField.select.value;
    onChange();
  });
  box.appendChild(typeField.label);
}

function fillBorderExtras(host, draft, onChange, hintEl) {
  const wrap = document.createElement("div");
  wrap.className = "profile-opt-border-extras" + (draft.show_border ? " is-open" : "");

  const thickLabel = document.createElement("div");
  thickLabel.className = "profile-opt-field-label";
  thickLabel.textContent = "Thickness";
  const thickRow = document.createElement("div");
  thickRow.className = "profile-opt-slider-row";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = "10";
  slider.step = "1";
  slider.className = "settings-slider";
  slider.value = String(draft.border_width || 1);
  const val = document.createElement("div");
  val.className = "profile-opt-slider-val";
  val.textContent = slider.value;
  profileOptHint(slider, "How thick the border is, from 1 to 10.", hintEl);
  slider.addEventListener("input", () => {
    draft.border_width = Number(slider.value) || 1;
    val.textContent = String(draft.border_width);
    onChange();
  });
  thickRow.appendChild(slider);
  thickRow.appendChild(val);
  wrap.appendChild(thickLabel);
  wrap.appendChild(thickRow);

  const colorLabel = document.createElement("div");
  colorLabel.className = "profile-opt-field-label";
  colorLabel.textContent = "Color";
  const colorRow = document.createElement("div");
  colorRow.className = "profile-opt-color-row";
  const picker = document.createElement("input");
  picker.type = "color";
  picker.value = draft.border_color || "#ffffff";
  const hex = document.createElement("input");
  hex.type = "text";
  hex.maxLength = 7;
  hex.spellcheck = false;
  hex.value = (draft.border_color || "#ffffff").toUpperCase();
  function setColor(next) {
    const clean = profileBorderColor(next) || draft.border_color || "#ffffff";
    draft.border_color = clean;
    picker.value = clean;
    hex.value = clean.toUpperCase();
    onChange();
  }
  profileOptHint(picker, "Pick a border color.", hintEl);
  profileOptHint(hex, "Hex color for the border.", hintEl);
  picker.addEventListener("input", () => setColor(picker.value));
  hex.addEventListener("change", () => setColor(hex.value));
  colorRow.appendChild(picker);
  colorRow.appendChild(hex);
  wrap.appendChild(colorLabel);
  wrap.appendChild(colorRow);

  const typeField = profileSelectField("Type", PROFILE_BORDER_STYLES, draft.border_style || "solid");
  profileOptHint(typeField.label, "How the border line is drawn.", hintEl);
  typeField.select.addEventListener("change", () => {
    draft.border_style = typeField.select.value;
    onChange();
  });
  wrap.appendChild(typeField.label);
  host.appendChild(wrap);
  return wrap;
}

function fillDesignOptions(box, tile, draft, onChange, hintEl) {
  const chrome = defaultTextChrome(tile.type, draft);
  Object.assign(draft, chrome);
  if (tile.type !== "avatar" && tile.type !== "banner" && tile.type !== "display_name") {
    const bgRow = settingsOpt(
      "Background",
      "",
      settingsToggle(draft.show_background, false, (on) => {
        draft.show_background = on;
        onChange();
      })
    );
    profileOptHint(bgRow, "Fill the widget with the panel color.", hintEl);
    box.appendChild(bgRow);
  }
  const extrasHost = document.createElement("div");
  extrasHost.className = "profile-opt-border-block";
  const borderRow = settingsOpt(
    "Border",
    "",
    settingsToggle(draft.show_border, false, (on) => {
      draft.show_border = on;
      extrasHost.querySelector(".profile-opt-border-extras").classList.toggle("is-open", on);
      onChange();
    })
  );
  profileOptHint(borderRow, "Draw a line around the widget.", hintEl);
  extrasHost.appendChild(borderRow);
  fillBorderExtras(extrasHost, draft, onChange, hintEl);
  box.appendChild(extrasHost);

  const zBlock = document.createElement("div");
  zBlock.className = "profile-opt-border-block";
  draft.z_index = clampProfileZIndex(draft.z_index);
  const zInput = document.createElement("input");
  zInput.type = "text";
  zInput.className = "profile-opt-z-input";
  zInput.inputMode = "numeric";
  zInput.autocomplete = "off";
  zInput.spellcheck = false;
  zInput.value = String(draft.z_index);
  const commitZ = (raw, rewrite) => {
    const trimmed = String(raw ?? "").trim();
    if (!rewrite && trimmed === "") return false;
    if (/^-/.test(trimmed)) {
      draft.z_index = 0;
      zInput.value = "0";
      return true;
    }
    const digits = trimmed.replace(/\D/g, "");
    if (!rewrite && digits === "") return false;
    const n = digits === "" ? 0 : Number(digits);
    draft.z_index = clampProfileZIndex(n);
    if (rewrite || draft.z_index !== n || digits !== trimmed) {
      zInput.value = String(draft.z_index);
    }
    return true;
  };
  zInput.addEventListener("input", () => {
    if (!commitZ(zInput.value, false)) return;
    onChange();
  });
  zInput.addEventListener("change", () => {
    commitZ(zInput.value, true);
    onChange();
  });
  zInput.addEventListener("blur", () => {
    commitZ(zInput.value, true);
    onChange();
  });
  const zRow = settingsOpt("Z-Index", "", zInput);
  profileOptHint(zRow, "Higher sits above lower. Same number: the newer widget stays on top.", hintEl);
  zBlock.appendChild(zRow);
  box.appendChild(zBlock);
}

function profileTileHasOptions(type) {
  return !!PROFILE_TILE_TYPES[type];
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

function fillBodyTitleOptions(box, draft, onChange, hintEl) {
  draft.show_title = !!draft.show_title;
  if (draft.title_align !== "center" && draft.title_align !== "right") draft.title_align = "left";
  draft.title = String(draft.title || "");
  const extras = document.createElement("div");
  extras.className = "profile-opt-border-extras" + (draft.show_title ? " is-open" : "");

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Title";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.maxLength = 48;
  nameInput.value = draft.title;
  nameInput.placeholder = "About";
  profileOptHint(nameLabel, "Label above the body. Double-click still edits the body.", hintEl);
  nameInput.addEventListener("input", () => {
    draft.title = nameInput.value;
    onChange();
  });
  nameLabel.appendChild(nameInput);
  extras.appendChild(nameLabel);

  const alignWrap = document.createElement("div");
  alignWrap.className = "profile-opt-align";
  const alignLabel = document.createElement("div");
  alignLabel.className = "profile-opt-field-label";
  alignLabel.textContent = "Title alignment";
  alignWrap.appendChild(alignLabel);
  const row = document.createElement("div");
  row.className = "profile-opt-seg";
  [["left", "L", "Put the title on the left."], ["center", "C", "Center the title."], ["right", "R", "Put the title on the right."]].forEach(item => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item[1];
    btn.className = draft.title_align === item[0] ? "is-on" : "";
    profileOptHint(btn, item[2], hintEl);
    btn.addEventListener("click", () => {
      draft.title_align = item[0];
      Array.from(row.children).forEach(child => child.classList.toggle("is-on", child === btn));
      onChange();
    });
    row.appendChild(btn);
  });
  alignWrap.appendChild(row);
  extras.appendChild(alignWrap);

  const block = document.createElement("div");
  block.className = "profile-opt-border-block";
  const toggleRow = settingsOpt(
    "Title",
    "",
    settingsToggle(draft.show_title, false, (on) => {
      draft.show_title = on;
      extras.classList.toggle("is-open", on);
      onChange();
    })
  );
  profileOptHint(toggleRow, "Add a labeled heading and divider above the body.", hintEl);
  block.appendChild(toggleRow);
  block.appendChild(extras);
  box.appendChild(block);
}

function fillLocalTimeOptions(box, draft, onChange, hintEl) {
  const zone = profileTimezoneGuess();
  if (profileTimezoneValid(zone)) draft.timezone = zone;
  if (draft.time_format !== "24" && draft.time_format !== "system") draft.time_format = "12";
  draft.show_date = !!draft.show_date;
  if (draft.month_style !== "name") draft.month_style = "num";
  if (draft.year_style !== "2") draft.year_style = "full";

  const fmt = profileSelectField("Time Format", [
    { value: "12", label: "12H" },
    { value: "24", label: "24H" },
    { value: "system", label: "Computer" }
  ], draft.time_format);
  profileOptHint(fmt.label, "12-hour with AM/PM, 24-hour, or this computer’s setting.", hintEl);
  fmt.select.addEventListener("change", () => {
    draft.time_format = fmt.select.value;
    onChange();
  });
  box.appendChild(fmt.label);

  const extras = document.createElement("div");
  extras.className = "profile-opt-border-extras" + (draft.show_date ? " is-open" : "");
  const month = profileSelectField("Month", [
    { value: "num", label: "Numerical" },
    { value: "name", label: "Name" }
  ], draft.month_style);
  profileOptHint(month.label, "9 or Sept.", hintEl);
  month.select.addEventListener("change", () => {
    draft.month_style = month.select.value;
    onChange();
  });
  extras.appendChild(month.label);
  const year = profileSelectField("Year", [
    { value: "2", label: "2-digit" },
    { value: "full", label: "Full year" }
  ], draft.year_style);
  profileOptHint(year.label, "26 or 2026.", hintEl);
  year.select.addEventListener("change", () => {
    draft.year_style = year.select.value;
    onChange();
  });
  extras.appendChild(year.label);

  const block = document.createElement("div");
  block.className = "profile-opt-border-block";
  const row = settingsOpt(
    "Date",
    "",
    settingsToggle(draft.show_date, false, (on) => {
      draft.show_date = on;
      extras.classList.toggle("is-open", on);
      onChange();
    })
  );
  profileOptHint(row, "Show the current date under the time.", hintEl);
  block.appendChild(row);
  block.appendChild(extras);
  box.appendChild(block);
}

function fillIconOptions(box, draft, onChange, hintEl) {
  draft.emoji = profileIconEmoji(draft.emoji);
  draft.icon_size = clampProfileEntrySize(draft.icon_size);

  const pickRow = document.createElement("div");
  pickRow.className = "profile-opt-icon-pick";
  const preview = document.createElement("div");
  preview.className = "profile-opt-icon-preview";
  preview.textContent = draft.emoji;
  const hidden = document.createElement("input");
  hidden.type = "text";
  hidden.className = "profile-opt-icon-value";
  hidden.dataset.emojiReplace = "1";
  hidden.value = draft.emoji;
  hidden.maxLength = 16;
  const pick = document.createElement("button");
  pick.type = "button";
  pick.textContent = "Choose emoji";
  profileOptHint(pick, "The emoji shown on this tile. Stickers wait.", hintEl);
  pick.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof openEmojiPicker === "function") openEmojiPicker(pick, hidden);
  });
  hidden.addEventListener("input", () => {
    draft.emoji = profileIconEmoji(hidden.value);
    hidden.value = draft.emoji;
    preview.textContent = draft.emoji;
    onChange();
  });
  pickRow.appendChild(preview);
  pickRow.appendChild(pick);
  pickRow.appendChild(hidden);
  box.appendChild(pickRow);

  const sizeLabel = document.createElement("div");
  sizeLabel.className = "profile-opt-field-label";
  sizeLabel.textContent = "Size";
  const sizeRow = document.createElement("div");
  sizeRow.className = "profile-opt-slider-row";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = "10";
  slider.step = "1";
  slider.className = "settings-slider";
  slider.value = String(draft.icon_size);
  const val = document.createElement("div");
  val.className = "profile-opt-slider-val";
  val.textContent = slider.value;
  slider.addEventListener("input", () => {
    draft.icon_size = clampProfileEntrySize(slider.value);
    val.textContent = String(draft.icon_size);
    onChange();
  });
  profileOptHint(slider, "How large the emoji is inside the tile.", hintEl);
  sizeRow.appendChild(slider);
  sizeRow.appendChild(val);
  box.appendChild(sizeLabel);
  box.appendChild(sizeRow);
}

function profileIsoToLocalInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function profileLocalInputToIso(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function profileOptSection(parent) {
  const block = document.createElement("div");
  block.className = "profile-opt-border-block";
  parent.appendChild(block);
  return block;
}

function fillClockOptions(box, draft, onChange, hintEl) {
  if (draft.mode !== "countdown" && draft.mode !== "timer") draft.mode = "world";
  if (draft.time_format !== "24" && draft.time_format !== "system") draft.time_format = "12";
  if (draft.month_style !== "name") draft.month_style = "num";
  if (draft.year_style !== "2") draft.year_style = "full";
  draft.show_date = !!draft.show_date;
  draft.show_zone = !!draft.show_zone;
  draft.show_seconds = !!draft.show_seconds;
  draft.label = String(draft.label || "");
  draft.timezone = String(draft.timezone || "");
  draft.target_at = String(draft.target_at || "");
  draft.start_at = String(draft.start_at || "");

  const titleBlock = profileOptSection(box);
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Title";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.maxLength = 48;
  nameInput.value = draft.label;
  nameInput.placeholder = "Optional";
  profileOptHint(nameLabel, "Small caption above the time. Leave blank to hide.", hintEl);
  nameInput.addEventListener("input", () => {
    draft.label = nameInput.value;
    onChange();
  });
  nameLabel.appendChild(nameInput);
  titleBlock.appendChild(nameLabel);

  const modeBlock = profileOptSection(box);
  const mode = profileSelectField("Mode", [
    { value: "world", label: "World" },
    { value: "countdown", label: "Countdown" },
    { value: "timer", label: "Timer" }
  ], draft.mode);
  profileOptHint(mode.label, "World is a chosen city. Countdown is until a date. Timer counts up from a start.", hintEl);
  modeBlock.appendChild(mode.label);
  const extras = document.createElement("div");
  extras.className = "profile-opt-mode-extras";
  modeBlock.appendChild(extras);

  function paintExtras() {
    extras.innerHTML = "";
    if (draft.mode === "world") {
      const cities = profileClockCityList();
      const options = cities.map(item => ({ value: item.zone, label: item.city }));
      if (draft.timezone && !cities.some(item => item.zone === draft.timezone)) {
        options.unshift({ value: draft.timezone, label: profileClockCityName(draft.timezone) });
      }
      if (!draft.timezone) draft.timezone = "UTC";
      const city = profileSelectField("City", options, draft.timezone);
      profileOptHint(city.label, "One city per region, not every country in that timezone.", hintEl);
      city.select.addEventListener("change", () => {
        draft.timezone = city.select.value;
        onChange();
      });
      extras.appendChild(city.label);

      const fmt = profileSelectField("Time Format", [
        { value: "12", label: "12H" },
        { value: "24", label: "24H" },
        { value: "system", label: "Computer" }
      ], draft.time_format);
      profileOptHint(fmt.label, "12-hour with AM/PM, 24-hour, or this computer’s setting.", hintEl);
      fmt.select.addEventListener("change", () => {
        draft.time_format = fmt.select.value;
        onChange();
      });
      extras.appendChild(fmt.label);

      const dateExtras = document.createElement("div");
      dateExtras.className = "profile-opt-border-extras" + (draft.show_date ? " is-open" : "");
      const dateRow = settingsOpt(
        "Date",
        "",
        settingsToggle(draft.show_date, false, (on) => {
          draft.show_date = on;
          dateExtras.classList.toggle("is-open", on);
          onChange();
        })
      );
      profileOptHint(dateRow, "Show the current date under the time.", hintEl);
      extras.appendChild(dateRow);
      const month = profileSelectField("Month", [
        { value: "num", label: "Numerical" },
        { value: "name", label: "Name" }
      ], draft.month_style);
      profileOptHint(month.label, "9 or Sept.", hintEl);
      month.select.addEventListener("change", () => {
        draft.month_style = month.select.value;
        onChange();
      });
      dateExtras.appendChild(month.label);
      const year = profileSelectField("Year", [
        { value: "2", label: "2-digit" },
        { value: "full", label: "Full year" }
      ], draft.year_style);
      profileOptHint(year.label, "26 or 2026.", hintEl);
      year.select.addEventListener("change", () => {
        draft.year_style = year.select.value;
        onChange();
      });
      dateExtras.appendChild(year.label);
      extras.appendChild(dateExtras);

      const zoneRow = settingsOpt(
        "Timezone",
        "",
        settingsToggle(draft.show_zone, false, (on) => {
          draft.show_zone = on;
          onChange();
        })
      );
      profileOptHint(zoneRow, "Show the city name under the clock.", hintEl);
      extras.appendChild(zoneRow);
      return;
    }
    const whenLabel = document.createElement("label");
    whenLabel.textContent = draft.mode === "countdown" ? "Ends" : "Started";
    const when = document.createElement("input");
    when.type = "datetime-local";
    when.value = profileIsoToLocalInput(draft.mode === "countdown" ? draft.target_at : draft.start_at);
    profileOptHint(whenLabel, draft.mode === "countdown"
      ? "Everyone sees time remaining until this moment."
      : "Everyone sees time elapsed since this moment.", hintEl);
    when.addEventListener("change", () => {
      const iso = profileLocalInputToIso(when.value);
      if (draft.mode === "countdown") draft.target_at = iso;
      else draft.start_at = iso;
      onChange();
    });
    whenLabel.appendChild(when);
    extras.appendChild(whenLabel);
    const secondsRow = settingsOpt(
      "Seconds",
      "",
      settingsToggle(draft.show_seconds, false, (on) => {
        draft.show_seconds = on;
        onChange();
      })
    );
    profileOptHint(secondsRow, "Off matches a normal clock. On shows ticking seconds.", hintEl);
    extras.appendChild(secondsRow);
  }

  mode.select.addEventListener("change", () => {
    draft.mode = mode.select.value;
    paintExtras();
    onChange();
  });
  paintExtras();
}

function fillButtonOptions(box, draft, onChange, hintEl) {
  if (draft.action !== "page" && draft.action !== "friend") draft.action = "link";
  draft.label = String(draft.label || "Button");
  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Label";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.maxLength = 48;
  nameInput.value = draft.label;
  nameInput.placeholder = "Button";
  profileOptHint(nameLabel, "Text shown on the button.", hintEl);
  nameInput.addEventListener("input", () => {
    draft.label = nameInput.value;
    onChange();
  });
  nameLabel.appendChild(nameInput);
  box.appendChild(nameLabel);

  const fn = profileSelectField("Function", [
    { value: "link", label: "External Link" },
    { value: "page", label: "Page Transfer" },
    { value: "friend", label: "Add Friend" }
  ], draft.action);
  profileOptHint(fn.label, "What happens when someone presses the button.", hintEl);
  box.appendChild(fn.label);
  const extras = document.createElement("div");
  box.appendChild(extras);

  function paintExtras() {
    extras.innerHTML = "";
    if (draft.action === "link") {
      const urlLabel = document.createElement("label");
      urlLabel.textContent = "Link";
      const urlInput = document.createElement("input");
      urlInput.type = "url";
      urlInput.placeholder = "https://";
      urlInput.value = draft.url || "";
      profileOptHint(urlLabel, "Opens this site in a new tab.", hintEl);
      urlInput.addEventListener("input", () => {
        draft.url = urlInput.value;
        onChange();
      });
      urlLabel.appendChild(urlInput);
      extras.appendChild(urlLabel);
      return;
    }
    if (draft.action === "page") {
      const pages = ((profileDraft && profileDraft.pages) || []).map(page => ({
        value: page.id,
        label: page.title + (page.visibility === "owner" ? " (only you)" : "")
      }));
      if (!pages.length) {
        const empty = document.createElement("div");
        empty.className = "profile-opt-empty";
        empty.textContent = "No pages to send people to yet.";
        extras.appendChild(empty);
        return;
      }
      if (!pages.some(page => page.value === draft.page_id)) draft.page_id = pages[0].value;
      const pageField = profileSelectField("Page", pages, draft.page_id);
      profileOptHint(pageField.label, "Switches to this page on the profile.", hintEl);
      pageField.select.addEventListener("change", () => {
        draft.page_id = pageField.select.value;
        onChange();
      });
      extras.appendChild(pageField.label);
    }
  }

  fn.select.addEventListener("change", () => {
    draft.action = fn.select.value;
    paintExtras();
    onChange();
  });
  paintExtras();
}

function fillFriendsOptions(box, draft, onChange, hintEl) {
  draft.friend_size = clampProfileEntrySize(draft.friend_size);
  const sizeLabel = document.createElement("div");
  sizeLabel.className = "profile-opt-field-label";
  sizeLabel.textContent = "Size";
  const sizeRow = document.createElement("div");
  sizeRow.className = "profile-opt-slider-row";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = "10";
  slider.step = "1";
  slider.className = "settings-slider";
  slider.value = String(draft.friend_size);
  const val = document.createElement("div");
  val.className = "profile-opt-slider-val";
  val.textContent = slider.value;
  profileOptHint(slider, "Scale the picture and name for every friend.", hintEl);
  slider.addEventListener("input", () => {
    draft.friend_size = Number(slider.value) || 5;
    val.textContent = String(draft.friend_size);
    onChange();
  });
  sizeRow.appendChild(slider);
  sizeRow.appendChild(val);
  box.appendChild(sizeLabel);
  box.appendChild(sizeRow);
}

function fillLinkTreeOptions(box, tile, hintEl) {
  let linkSize = clampProfileLinkSize(tile.props && tile.props.link_size);
  const sizeLabel = document.createElement("div");
  sizeLabel.className = "profile-opt-field-label";
  sizeLabel.textContent = "Size";
  const sizeRow = document.createElement("div");
  sizeRow.className = "profile-opt-slider-row";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = "10";
  slider.step = "1";
  slider.className = "settings-slider";
  slider.value = String(linkSize);
  const val = document.createElement("div");
  val.className = "profile-opt-slider-val";
  val.textContent = slider.value;
  slider.addEventListener("input", () => {
    linkSize = Number(slider.value) || 5;
    val.textContent = String(linkSize);
    box.dispatchEvent(new Event("change"));
  });
  sizeRow.appendChild(slider);
  sizeRow.appendChild(val);
  if (hintEl) profileOptHint(slider, "Scale the icon and name for every link.", hintEl);
  box.appendChild(sizeLabel);
  box.appendChild(sizeRow);

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
  return () => ({ links: links.slice(), link_size: linkSize });
}

function openProfileTileOptions(tile) {
  tile.props = tile.props || {};
  const draft = Object.assign({}, tile.props);
  if (Array.isArray(draft.links)) draft.links = draft.links.map(row => Object.assign({}, row));
  if (Array.isArray(draft.rows)) draft.rows = draft.rows.map(row => Object.assign({}, row));
  if (Array.isArray(draft.items)) draft.items = draft.items.slice();
  Object.assign(draft, defaultTextChrome(tile.type, draft));
  draft.z_index = clampProfileZIndex(tile.z_index != null ? tile.z_index : draft.z_index);
  let tab = profileHasWidgetSettings(tile.type) ? 'widget' : 'design';
  const overlay = document.createElement('div');
  overlay.className = 'settings-form-overlay';
  const box = document.createElement('div');
  box.className = 'profile-opt';

  const top = document.createElement('div');
  top.className = 'profile-opt-top';
  const name = document.createElement('div');
  name.className = 'profile-opt-name';
  name.textContent = (PROFILE_TILE_TYPES[tile.type] && PROFILE_TILE_TYPES[tile.type].label) || tile.type;
  const split = document.createElement('div');
  split.className = 'profile-opt-split';
  split.textContent = '|';
  const tabs = document.createElement('div');
  tabs.className = 'profile-opt-tabs';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'profile-opt-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '\u00d7';

  const main = document.createElement('div');
  main.className = 'profile-opt-main';
  const left = document.createElement('div');
  left.className = 'profile-opt-left';
  const preview = document.createElement('div');
  preview.className = 'profile-opt-preview';
  const stage = document.createElement('div');
  stage.className = 'profile-opt-preview-stage';
  const previewCard = document.createElement('div');
  stage.appendChild(previewCard);
  preview.appendChild(stage);
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
  addTab('widget', 'Widget', 'Basic settings unique to this widget.');
  addTab('design', 'Design', 'Background, border, stacking, thickness, and colors.');
  if (profileHasTextFormat(tile.type)) {
    addTab('text', 'Text', 'Size and alignment for the text in this widget.');
  }

  function paintPreview() {
    const nativeW = Math.max(80, tile.w * PROFILE_ROW_H);
    const nativeH = Math.max(PROFILE_ROW_H, tile.h * PROFILE_ROW_H);
    const leftW = 300;
    const pad = 80;
    const overlayW = overlay.clientWidth || window.innerWidth;
    const maxW = Math.max(360, overlayW - 48);
    const want = leftW + nativeW + pad;
    box.style.width = Math.round(Math.min(maxW, Math.max(want, Math.min(960, maxW)))) + "px";
    previewCard.className = 'profile-tile is-' + tile.type + ' is-opt-preview';
    previewCard.style.width = nativeW + 'px';
    previewCard.style.height = nativeH + 'px';
    previewCard.style.transform = 'none';
    const fake = { type: tile.type, props: draft, id: tile.id, w: tile.w, h: tile.h, x: 0, y: 0, z_index: clampProfileZIndex(draft.z_index) };
    const wasEditing = profileEditing;
    profileEditing = false;
    try {
      paintProfileTileContent(fake, previewCard);
    } finally {
      profileEditing = wasEditing;
    }
    applyProfileWidgetSurface(previewCard, fake);
    requestAnimationFrame(() => {
      const availW = Math.max(80, preview.clientWidth - pad);
      const availH = Math.max(80, preview.clientHeight - pad);
      const scale = Math.min(1, availW / nativeW, availH / nativeH);
      stage.style.width = Math.round(nativeW * scale) + 'px';
      stage.style.height = Math.round(nativeH * scale) + 'px';
      previewCard.style.transformOrigin = 'top left';
      previewCard.style.transform = 'scale(' + scale + ')';
    });
  }

  function paintLeft() {
    left.innerHTML = '';
    left.classList.remove('is-wide');
    if (tab === 'widget') {
      fillWidgetOptions(left, tile, draft, paintPreview, hintEl);
    } else if (tab === 'text' && profileHasTextFormat(tile.type)) {
      fillTextFormatOptions(left, draft, tile.type, paintPreview, hintEl);
    } else {
      fillDesignOptions(left, tile, draft, paintPreview, hintEl);
    }
  }

  cancel.addEventListener('click', () => {
    dropProfileImageDraft(draft);
    overlay.remove();
  });
  close.addEventListener('click', () => {
    dropProfileImageDraft(draft);
    overlay.remove();
  });
  profileOptHint(close, 'Close without saving.', hintEl);
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
    if (tile.type === 'image' && draft._file) {
      confirm.disabled = true;
      try {
        if (typeof uploadProfileImageFile !== 'function') throw new Error('Upload is not available.');
        const att = await uploadProfileImageFile(draft._file);
        draft.key = att.key;
        draft.url = att.url;
        draft.mime = att.mime;
        draft.size = att.size;
        draft.name = att.name || draft.name || '';
      } catch (e) {
        confirm.disabled = false;
        window.alert(e.message || 'Could not upload that image.');
        return;
      }
    }
    dropProfileImageDraft(draft);
    tile.z_index = clampProfileZIndex(draft.z_index);
    delete draft.z_index;
    if (draft.props) delete draft.props;
    Object.assign(tile.props, draft);
    if (tile.type === 'display_name') growNameClusterTile(tile);
    overlay.remove();
    markProfileDirty();
  });

  top.appendChild(name);
  top.appendChild(split);
  top.appendChild(tabs);
  top.appendChild(close);
  box.appendChild(top);
  box.appendChild(main);
  box.appendChild(bottom);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      dropProfileImageDraft(draft);
      overlay.remove();
    }
  });
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
  if (tile.type === "divider" || tile.type === "rail") {
    items.push({
      label: "Rotate",
      onSelect: () => {
        rotateProfileStrip(tile);
        markProfileDirty();
      }
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
