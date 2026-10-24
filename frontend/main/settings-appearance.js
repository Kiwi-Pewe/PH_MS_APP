// ==================================================================
// settings-appearance.js - Theme presets, brightness, custom colors,
// message display toggles, send button, Search placeholder, Streamer
// Mode placeholder. App Icon is omitted on purpose.
// ==================================================================

function appearanceSettingsUrl(path) {
  return `https://${serverAddress}${path}`;
}

async function loadAppearanceSettings() {
  const response = await fetch(appearanceSettingsUrl("/appearance_settings"), { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not load appearance settings.");
  return data;
}

async function saveAppearanceSettings(next) {
  const response = await fetch(appearanceSettingsUrl("/appearance_settings"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(next)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not save appearance.");
  applyAppearance(data);
  return data;
}

function appearanceSeg(options, selected, onPick, disabled) {
  const wrap = document.createElement("div");
  wrap.className = "appearance-seg" + (disabled ? " is-disabled" : "");
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = opt.value === selected ? "is-on" : "";
    btn.textContent = opt.label;
    btn.disabled = !!disabled;
    if (!disabled) btn.addEventListener("click", () => onPick(opt.value));
    wrap.appendChild(btn);
  });
  return wrap;
}

function lockThemeMode(on) {
  const wrap = document.querySelector(".appearance-mode-seg");
  const warn = document.querySelector(".appearance-mode-warn");
  if (wrap) {
    wrap.classList.toggle("is-disabled", on);
    wrap.querySelectorAll("button").forEach((btn) => {
      btn.disabled = on;
    });
  }
  if (warn) warn.hidden = !on;
}

function themeTile(preset, selected, onPick, onRemove) {
  const wrap = document.createElement("div");
  wrap.className = "theme-tile-wrap";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "theme-tile" + (preset.id === selected ? " is-on" : "");
  const dots = document.createElement("div");
  dots.className = "theme-dots";
  preset.colors.forEach(hex => {
    const dot = document.createElement("span");
    dot.className = "theme-dot";
    dot.style.background = hex;
    dots.appendChild(dot);
  });
  const name = document.createElement("div");
  name.className = "theme-tile-name";
  name.textContent = preset.name;
  btn.appendChild(dots);
  btn.appendChild(name);
  btn.addEventListener("click", () => onPick(preset));
  wrap.appendChild(btn);
  if (onRemove) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "theme-tile-x";
    remove.textContent = "×";
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onRemove(preset);
    });
    wrap.appendChild(remove);
  }
  return wrap;
}

function appearanceColorRow(label, desc, value, onPick) {
  const row = document.createElement("label");
  row.className = "appearance-color-row";
  const text = document.createElement("div");
  text.className = "settings-opt-text";
  const title = document.createElement("div");
  title.className = "settings-opt-title";
  title.textContent = label;
  const body = document.createElement("div");
  body.className = "settings-opt-desc";
  body.textContent = desc;
  text.appendChild(title);
  text.appendChild(body);
  const control = document.createElement("div");
  control.className = "appearance-color-control";
  const picker = document.createElement("input");
  picker.type = "color";
  picker.value = appearanceHex(value) || "#8b5cf6";
  const hex = document.createElement("input");
  hex.type = "text";
  hex.className = "appearance-hex";
  hex.maxLength = 7;
  hex.value = (appearanceHex(value) || picker.value).toLowerCase();
  picker.addEventListener("input", () => {
    hex.value = picker.value.toLowerCase();
    onPick(picker.value.toLowerCase(), false);
  });
  picker.addEventListener("change", () => onPick(picker.value.toLowerCase(), true));
  hex.addEventListener("change", () => {
    const clean = appearanceHex(hex.value) || appearanceHex(picker.value);
    if (!clean) return;
    picker.value = clean;
    hex.value = clean;
    onPick(clean, true);
  });
  control.appendChild(picker);
  control.appendChild(hex);
  row.appendChild(text);
  row.appendChild(control);
  return row;
}

let appearanceThemePage = 0;

function themePageForId(info) {
  if (info.theme === "custom" && matchingCustomPreset(info)) return 1;
  return 0;
}

function closePaletteDeleteSubmenu() {
  const overlay = document.getElementById("palette-delete-overlay");
  if (overlay) overlay.hidden = true;
}

function openPaletteDeleteSubmenu(preset, onConfirm) {
  const overlay = document.getElementById("palette-delete-overlay");
  const copy = document.getElementById("palette-delete-copy");
  const cancel = document.getElementById("palette-delete-cancel");
  const confirm = document.getElementById("palette-delete-confirm");
  if (!overlay || !copy || !cancel || !confirm) return;
  copy.textContent = "Delete " + preset.name + " from your custom palettes?";
  overlay.hidden = false;
  const finish = (ok) => {
    cancel.onclick = null;
    confirm.onclick = null;
    overlay.onclick = null;
    closePaletteDeleteSubmenu();
    if (ok) onConfirm();
  };
  cancel.onclick = () => finish(false);
  confirm.onclick = () => finish(true);
  overlay.onclick = (event) => {
    if (event.target === overlay) finish(false);
  };
}

function paintAppearanceTheme(host, info, persist, themeTab, setTab) {
  const customOn = info.theme === "custom";
  const brightness = appearanceSeg(
    [
      { value: "dark", label: "Dark" },
      { value: "light", label: "Light" }
    ],
    info.brightness === "light" ? "light" : "dark",
    (value) => persist({ brightness: value }),
    customOn
  );
  brightness.classList.add("appearance-mode-seg");
  const modeWarn = settingsNote("This option doesnt suppose custom pallets.");
  modeWarn.classList.add("appearance-mode-warn");
  modeWarn.hidden = !customOn;
  host.appendChild(settingsOpt(
    "Theme Mode",
    "Switch the theme between dark and light mode.",
    brightness,
    modeWarn
  ));

  const tabs = appearanceSeg(
    [
      { value: "themes", label: "Themes" },
      { value: "customize", label: "Customize" }
    ],
    themeTab,
    (value) => setTab(value)
  );
  tabs.classList.add("appearance-tabs");
  host.appendChild(tabs);

  if (themeTab === "customize") {
    const working = workingThemeColors(info).slice();
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "appearance-customize-bar";
    nameInput.maxLength = 32;
    nameInput.placeholder = "Palette name";
    nameInput.value = appearancePaletteName(info);
    nameInput.addEventListener("input", () => {
      info.palette_name = nameInput.value;
    });
    host.appendChild(nameInput);
    const slots = [
      ["Background", "Window, chat, and the darkest layer.", "color_bg"],
      ["Surface", "Panels, cards, and composer.", "color_surface"],
      ["Accent", "Buttons, links, and selected rows.", "color_accent"],
      ["Highlight", "Pop-up menus and layered chrome.", "color_highlight"],
      ["Text", "Names, messages, and labels.", "color_text"]
    ];
    slots.forEach((slot, index) => {
      host.appendChild(appearanceColorRow(slot[0], slot[1], working[index], (hex, save) => {
        working[index] = hex;
        persist({
          theme: "custom",
          color_bg: working[0],
          color_surface: working[1],
          color_accent: working[2],
          color_highlight: working[3],
          color_text: working[4],
          palette_name: nameInput.value
        }, { save: save !== false, rebuild: false });
        lockThemeMode(true);
      }));
    });
    const savedCount = appearancePresets(info).length;
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "appearance-customize-bar appearance-save-palette";
    saveBtn.textContent = "Save Palette";
    saveBtn.disabled = savedCount >= APPEARANCE_PRESET_MAX;
    saveBtn.addEventListener("click", () => {
      if (appearancePresets(info).length >= APPEARANCE_PRESET_MAX) return;
      const colors = workingThemeColors(Object.assign({}, info, {
        theme: "custom",
        color_bg: working[0],
        color_surface: working[1],
        color_accent: working[2],
        color_highlight: working[3],
        color_text: working[4]
      }));
      const name = String(nameInput.value || "").trim() || appearancePaletteName(info);
      const nextPresets = appearancePresets(info).concat([{
        id: newPaletteId(),
        name: name.slice(0, 32),
        colors: colors
      }]);
      appearanceThemePage = 1;
      persist({
        theme: "custom",
        color_bg: colors[0],
        color_surface: colors[1],
        color_accent: colors[2],
        color_highlight: colors[3],
        color_text: colors[4],
        palette_name: name,
        presets: nextPresets
      });
    });
    host.appendChild(saveBtn);
    return;
  }

  const customPresets = appearancePresets(info);
  const pages = [THEME_PRESETS, customPresets];
  const headings = ["Preset Themes", "Saved Themes"];
  if (appearanceThemePage < 0 || appearanceThemePage >= pages.length) appearanceThemePage = 0;
  const heading = document.createElement("div");
  heading.className = "settings-opt-title";
  heading.textContent = headings[appearanceThemePage];
  heading.style.margin = "16px 0 10px";
  host.appendChild(heading);
  const grid = document.createElement("div");
  grid.className = "theme-grid";
  if (appearanceThemePage === 0) {
    THEME_PRESETS.forEach(preset => {
      grid.appendChild(themeTile(preset, info.theme, (row) => persist({
        theme: row.id,
        palette_name: row.name
      })));
    });
  } else {
    const selectedId = (matchingCustomPreset(info) || {}).id || "";
    customPresets.forEach(preset => {
      grid.appendChild(themeTile(preset, selectedId, (row) => persist({
        theme: "custom",
        color_bg: row.colors[0],
        color_surface: row.colors[1],
        color_accent: row.colors[2],
        color_highlight: row.colors[3],
        color_text: row.colors[4],
        palette_name: row.name
      }), (row) => {
        openPaletteDeleteSubmenu(row, () => {
          persist({
            presets: appearancePresets(info).filter(item => item.id !== row.id)
          });
        });
      }));
    });
  }
  host.appendChild(grid);
  if (appearanceThemePage === 1 && !customPresets.length) {
    const empty = settingsNote("You have no saved pallets. create some within the \"Customize\" tab.");
    empty.classList.add("appearance-empty-note");
    host.appendChild(empty);
  }
  const pager = appearanceSeg(
    [
      { value: 0, label: "Preset Themes" },
      { value: 1, label: "Saved Themes" }
    ],
    appearanceThemePage,
    (value) => {
      appearanceThemePage = value;
      setTab("themes");
    }
  );
  pager.classList.add("theme-pager");
  host.appendChild(pager);
}

function paintAppearanceMessages(host, info, persist) {
  host.appendChild(settingsOpt(
    "Chat bubbles",
    "Enable/Disable chat bubbles around messages.",
    settingsToggle(info.show_bubbles !== false, false, (on) => persist({ show_bubbles: on }))
  ));
  host.appendChild(settingsOpt(
    "Message Display",
    "Choose which side you want your messages to appear on.",
    appearanceSeg(
      [
        { value: "left", label: "Left" },
        { value: "right", label: "Right" }
      ],
      info.self_side === "left" ? "left" : "right",
      (value) => persist({ self_side: value })
    )
  ));
  host.appendChild(settingsOpt(
    "Show images from links",
    "When a message includes a direct image URL, show the image in chat.",
    settingsToggle(!!info.show_link_media, false, (on) => persist({ show_link_media: on }))
  ));
  host.appendChild(settingsOpt(
    "Show uploaded images and videos",
    "Show photos and videos people attach to a message.",
    settingsToggle(!!info.show_uploads, false, (on) => persist({ show_uploads: on }))
  ));
  host.appendChild(settingsOpt(
    "Show embeds and website previews",
    "Show the preview card under links.",
    settingsToggle(!!info.show_embeds, false, (on) => persist({ show_embeds: on }))
  ));
  host.appendChild(settingsOpt(
    "Show reactions",
    "Show emoji reactions on messages",
    settingsToggle(!!info.show_reactions, false, (on) => persist({ show_reactions: on }))
  ));
}

function paintAppearanceChatBox(host, info, persist) {
  host.appendChild(settingsOpt(
    "Always show send button",
    "Show a Send button on the message box.",
    settingsToggle(!!info.show_send, false, (on) => persist({ show_send: on }))
  ));
}

function paintAppearanceSearch(host, info, persist) {
  const list = document.createElement("div");
  list.className = "settings-radio-list";
  [
    ["auto", "Auto", "Use compact or full screen based on the window."],
    ["compact", "Compact", "Keep search in a small panel."],
    ["fullscreen", "Full Screen", "Open search across the main pane."]
  ].forEach(row => {
    list.appendChild(privacyRadio(row[0], info.search_style || "auto", row[1], row[2], (value) => persist({ search_style: value })));
  });
  host.appendChild(list);
}

function paintAppearanceStreamer(host) {
  [
    ["Hide Identifiable information", "Hides all identifiable information."],
    ["Hide invite links", "Stop showing invite URLs while the mode is on."],
    ["Disable sounds", "Mute notification sounds while streaming."],
    ["Disable notifications", "Pause desktop toasts while streaming."]
  ].forEach(row => {
    host.appendChild(settingsOpt(row[0], row[1], settingsToggle(false, true), settingsLaterNote("Streamer Mode")));
  });
}

async function renderAppearanceSettings(pane, jumpChildId) {
  pane.innerHTML = "";
  let info;
  try {
    info = await loadAppearanceSettings();
  } catch (e) {
    const note = document.createElement("div");
    note.className = "placeholder-panel";
    note.textContent = e.message || "Could not load appearance settings.";
    pane.appendChild(note);
    return;
  }
  applyAppearance(info);
  appearanceThemePage = themePageForId(info);

  const block = document.createElement("section");
  block.className = "settings-block has-sections";
  block.id = settingsTargetId("appearance");
  const title = document.createElement("h2");
  title.className = "settings-block-title";
  title.textContent = "Appearance";
  block.appendChild(title);

  let themeTab = info.theme === "custom" ? "customize" : "themes";
  const setTab = (value) => {
    themeTab = value === "customize" ? "customize" : "themes";
    paintAppearanceSection(block, info, persist, themeTab, setTab);
  };

  const persist = async (patch, opts) => {
    const next = Object.assign({}, info, patch);
    applyAppearance(next);
    info = next;
    const shouldSave = !opts || opts.save !== false;
    const shouldRebuild = !opts || opts.rebuild !== false;
    const shouldRerender = patch.show_link_media !== undefined || patch.show_uploads !== undefined || patch.show_embeds !== undefined || patch.show_reactions !== undefined;
    if (shouldRerender) rerenderOpenChats();
    if (!shouldSave) return;
    try {
      const saved = await saveAppearanceSettings(next);
      // Keep any theme-color edits that landed while this save was in flight.
      const localNewer = info.color_bg !== next.color_bg
        || info.color_surface !== next.color_surface
        || info.color_accent !== next.color_accent
        || info.color_highlight !== next.color_highlight
        || info.color_text !== next.color_text
        || info.theme !== next.theme
        || info.brightness !== next.brightness;
      if (localNewer) {
        info = Object.assign({}, saved, {
          theme: info.theme,
          brightness: info.brightness,
          color_bg: info.color_bg,
          color_surface: info.color_surface,
          color_accent: info.color_accent,
          color_highlight: info.color_highlight,
          color_text: info.color_text,
          presets: info.presets,
          palette_name: info.palette_name
        });
        applyAppearance(info);
      } else {
        info = Object.assign({}, saved, { palette_name: info.palette_name });
      }
      if (patch.theme && patch.theme !== "custom") themeTab = "themes";
      if (shouldRebuild) {
        paintAppearanceSection(block, info, persist, themeTab, setTab);
        if (jumpChildId) {
          const target = document.getElementById(settingsTargetId(jumpChildId));
          if (target) pane.scrollTop = Math.max(0, target.offsetTop - 24);
        }
      }
    } catch (e) {
      applyAppearance(info);
    }
  };

  paintAppearanceSection(block, info, persist, themeTab, setTab);
  pane.appendChild(block);
  if (jumpChildId) {
    const target = document.getElementById(settingsTargetId(jumpChildId));
    if (target) pane.scrollTop = Math.max(0, target.offsetTop - 24);
    else pane.scrollTop = 0;
  } else {
    pane.scrollTop = 0;
  }
}

function paintAppearanceSection(block, info, persist, themeTab, setTab) {
  const title = block.querySelector(".settings-block-title");
  block.innerHTML = "";
  if (title) block.appendChild(title);
  else {
    const heading = document.createElement("h2");
    heading.className = "settings-block-title";
    heading.textContent = "Appearance";
    block.appendChild(heading);
  }

  const theme = document.createElement("div");
  theme.className = "settings-subblock";
  theme.id = settingsTargetId("theme");
  const themeTitle = document.createElement("h3");
  themeTitle.className = "settings-subblock-title";
  themeTitle.textContent = "Theme";
  theme.appendChild(themeTitle);
  paintAppearanceTheme(theme, info, persist, themeTab, setTab);
  block.appendChild(theme);

  const messages = document.createElement("div");
  messages.className = "settings-subblock";
  messages.id = settingsTargetId("messages-look");
  const messagesTitle = document.createElement("h3");
  messagesTitle.className = "settings-subblock-title";
  messagesTitle.textContent = "Messages";
  messages.appendChild(messagesTitle);
  paintAppearanceMessages(messages, info, persist);
  block.appendChild(messages);

  const chatBox = document.createElement("div");
  chatBox.className = "settings-subblock";
  chatBox.id = settingsTargetId("chat-box");
  const chatTitle = document.createElement("h3");
  chatTitle.className = "settings-subblock-title";
  chatTitle.textContent = "Chat Box";
  chatBox.appendChild(chatTitle);
  paintAppearanceChatBox(chatBox, info, persist);
  block.appendChild(chatBox);

  const search = document.createElement("div");
  search.className = "settings-subblock";
  search.id = settingsTargetId("appearance-search");
  const searchTitle = document.createElement("h3");
  searchTitle.className = "settings-subblock-title";
  searchTitle.textContent = "Search";
  search.appendChild(searchTitle);
  paintAppearanceSearch(search, info, persist);
  block.appendChild(search);

  const streamer = document.createElement("div");
  streamer.className = "settings-subblock";
  streamer.id = settingsTargetId("streamer-mode");
  const streamerTitle = document.createElement("h3");
  streamerTitle.className = "settings-subblock-title";
  streamerTitle.textContent = "Streamer Mode";
  streamer.appendChild(streamerTitle);
  paintAppearanceStreamer(streamer);
  block.appendChild(streamer);
}
