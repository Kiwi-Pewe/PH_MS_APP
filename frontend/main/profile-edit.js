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

function profileHasWidgetSettings(type) {
  return type === "divider" || type === "display_name" || type === "link_tree" || type === "friends";
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
  const empty = document.createElement("div");
  empty.className = "profile-opt-empty";
  empty.textContent = "No extra settings for this widget yet.";
  box.appendChild(empty);
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
  addTab('design', 'Design', 'Background, border, thickness, and colors.');
  if (profileHasTextFormat(tile.type)) {
    addTab('text', 'Text', 'Size and alignment for the text in this widget.');
  }

  function profilePreviewCellWidth() {
    const board = document.getElementById('profile-board');
    if (!board) return 24;
    const styles = window.getComputedStyle(board);
    const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    const inner = Math.max(1, board.clientWidth - padX);
    return inner / PROFILE_COLS;
  }

  function paintPreview() {
    const cellW = profilePreviewCellWidth();
    const nativeW = Math.max(80, tile.w * cellW);
    const nativeH = Math.max(36, tile.h * PROFILE_ROW_H);
    const leftW = 300;
    const pad = 80;
    const maxW = Math.max(360, window.innerWidth - 48);
    const want = leftW + nativeW + pad;
    box.style.width = Math.round(Math.min(maxW, Math.max(Math.min(960, maxW), want))) + 'px';
    previewCard.className = 'profile-tile is-' + tile.type + ' is-opt-preview';
    previewCard.style.width = nativeW + 'px';
    previewCard.style.height = nativeH + 'px';
    previewCard.style.transform = 'none';
    const fake = { type: tile.type, props: draft, id: tile.id, w: tile.w, h: tile.h, x: 0, y: 0 };
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

  cancel.addEventListener('click', () => overlay.remove());
  close.addEventListener('click', () => overlay.remove());
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
