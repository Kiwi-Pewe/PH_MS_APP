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

function appearanceSeg(options, selected, onPick) {
  const wrap = document.createElement("div");
  wrap.className = "appearance-seg";
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = opt.value === selected ? "is-on" : "";
    btn.textContent = opt.label;
    btn.addEventListener("click", () => onPick(opt.value));
    wrap.appendChild(btn);
  });
  return wrap;
}

function themeTile(preset, selected, onPick) {
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
  btn.addEventListener("click", () => onPick(preset.id));
  return btn;
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

function paintAppearanceTheme(host, info, persist, themeTab, setTab) {
  const brightness = appearanceSeg(
    [
      { value: "dark", label: "Dark" },
      { value: "light", label: "Light" }
    ],
    info.brightness === "light" ? "light" : "dark",
    (value) => persist({ brightness: value })
  );
  host.appendChild(settingsOpt(
    "Brightness",
    "Dark and Light shift the same palette darker or brighter. Accents stay put so the theme still reads as itself.",
    brightness
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
    const colors = nativeThemeColors(info);
    const slots = [
      ["Background", "Window, chat, and the darkest layer.", "color_bg"],
      ["Surface", "Panels, cards, and composer.", "color_surface"],
      ["Accent", "Buttons, links, and selected rows.", "color_accent"],
      ["Highlight", "Pop-up menus and layered chrome.", "color_highlight"]
    ];
    slots.forEach((slot, index) => {
      host.appendChild(appearanceColorRow(slot[0], slot[1], colors[index], (hex, save) => {
        const current = nativeThemeColors(info);
        persist({
          theme: "custom",
          color_bg: current[0],
          color_surface: current[1],
          color_accent: current[2],
          color_highlight: current[3],
          [slot[2]]: hex
        }, { save: save !== false, rebuild: false });
      }));
    });
    host.appendChild(settingsNote("Status colors stay locked: green Active, orange Away, red DND, grey offline.", "later"));
    return;
  }

  const heading = document.createElement("div");
  heading.className = "settings-opt-title";
  heading.textContent = "Default Themes";
  heading.style.margin = "16px 0 10px";
  host.appendChild(heading);
  const grid = document.createElement("div");
  grid.className = "theme-grid";
  THEME_PRESETS.forEach(preset => {
    grid.appendChild(themeTile(preset, info.theme, (id) => persist({ theme: id })));
  });
  host.appendChild(grid);
}

function paintAppearanceMessages(host, info, persist) {
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
    "Show emoji reactions on messages. Turning this off also hides Add Reaction.",
    settingsToggle(!!info.show_reactions, false, (on) => persist({ show_reactions: on }))
  ));
}

function paintAppearanceChatBox(host, info, persist) {
  host.appendChild(settingsOpt(
    "Always show send button",
    "Show a Send button on the message box. Enter still sends either way.",
    settingsToggle(!!info.show_send, false, (on) => persist({ show_send: on }))
  ));
}

function paintAppearanceSearch(host, info, persist) {
  const list = document.createElement("div");
  list.className = "settings-radio-list";
  [
    ["auto", "Auto", "Use compact or full screen based on the window later."],
    ["compact", "Compact", "Keep search in a small panel."],
    ["fullscreen", "Full Screen", "Open search across the main pane."]
  ].forEach(row => {
    list.appendChild(privacyRadio(row[0], info.search_style || "auto", row[1], row[2], (value) => persist({ search_style: value })));
  });
  host.appendChild(list);
  host.appendChild(settingsNote("Search isn't built yet. This choice is saved for when DM and channel search exist.", "later"));
}

function paintAppearanceStreamer(host) {
  host.appendChild(settingsOpt(
    "Enable Streamer Mode",
    "A one-click hide for personal details while you're live.",
    settingsToggle(false, true),
    settingsNote("Streamer Mode isn't built yet. We'll use this later with OBS and live streams.", "later")
  ));
  [
    ["Hide personal information", "Hide email, phone, and similar details in the client."],
    ["Hide invite links", "Stop showing invite URLs while the mode is on."],
    ["Disable sounds", "Mute notification sounds while streaming."],
    ["Disable notifications", "Pause desktop toasts while streaming."]
  ].forEach(row => {
    host.appendChild(settingsOpt(row[0], row[1], settingsToggle(false, true), settingsNote("This waits on Streamer Mode.", "later")));
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

  const block = document.createElement("section");
  block.className = "settings-block";
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
    const shouldSave = !opts || opts.save !== false;
    const shouldRebuild = !opts || opts.rebuild !== false;
    const shouldRerender = patch.show_link_media !== undefined || patch.show_uploads !== undefined || patch.show_embeds !== undefined || patch.show_reactions !== undefined;
    if (shouldRerender) rerenderOpenChats();
    if (!shouldSave) {
      info = next;
      return;
    }
    try {
      info = await saveAppearanceSettings(next);
      if (patch.theme && patch.theme !== "custom") themeTab = "themes";
      if (patch.theme === "custom") themeTab = "customize";
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
