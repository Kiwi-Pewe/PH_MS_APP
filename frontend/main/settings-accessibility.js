// ==================================================================
// settings-accessibility.js - Accessibility page. Sticky live preview
// at the top of the pane. Controls save on the account. Text size,
// group spacing, links, contrast, reduced motion, and toggle icons
// also hit the real app. Density / compact / zoom / saturation still
// show mainly in the preview until those layouts are swept.
// ==================================================================

function accessibilitySettingsUrl(path) {
  return `https://${serverAddress}${path}`;
}

async function loadAccessibilitySettings() {
  const response = await fetch(accessibilitySettingsUrl("/accessibility_settings"), { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not load accessibility settings.");
  return data;
}

async function saveAccessibilitySettings(next) {
  const response = await fetch(accessibilitySettingsUrl("/accessibility_settings"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(next)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not save accessibility.");
  applyAccessibility(data);
  return data;
}

function a11ySlider(min, max, step, value, onInput, onChange) {
  const input = document.createElement("input");
  input.type = "range";
  input.className = "settings-slider a11y-slider";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("input", () => onInput(Number(input.value)));
  input.addEventListener("change", () => onChange(Number(input.value)));
  return input;
}

function a11yTicks(labels) {
  const row = document.createElement("div");
  row.className = "a11y-ticks";
  labels.forEach(label => {
    const tick = document.createElement("span");
    tick.textContent = label;
    row.appendChild(tick);
  });
  return row;
}

function buildAccessibilityPreview() {
  const wrap = document.createElement("div");
  wrap.className = "a11y-preview";
  wrap.id = "a11y-preview";
  const label = document.createElement("div");
  label.className = "a11y-preview-label";
  label.textContent = "Preview";
  const windowEl = document.createElement("div");
  windowEl.className = "a11y-preview-window";
  windowEl.id = "a11y-preview-window";

  const chat = document.createElement("div");
  chat.className = "a11y-preview-chat";

  function cluster(text, extra) {
    const row = document.createElement("div");
    row.className = "a11y-preview-cluster";
    const avatar = document.createElement("div");
    avatar.className = "a11y-preview-avatar";
    avatar.textContent = "K";
    const body = document.createElement("div");
    body.className = "a11y-preview-body";
    const header = document.createElement("div");
    header.className = "a11y-preview-header";
    const name = document.createElement("span");
    name.className = "a11y-preview-name";
    name.textContent = "Kiwi";
    const time = document.createElement("span");
    time.className = "a11y-preview-time";
    time.textContent = "7:03 PM";
    header.appendChild(name);
    header.appendChild(time);
    const bubble = document.createElement("div");
    bubble.className = "a11y-preview-bubble";
    extra(bubble, text);
    body.appendChild(header);
    body.appendChild(bubble);
    row.appendChild(avatar);
    row.appendChild(body);
    return row;
  }

  chat.appendChild(cluster("what happened to all the beans", (bubble, text) => {
    const line = document.createElement("div");
    line.className = "a11y-preview-line";
    line.textContent = text;
    bubble.appendChild(line);
    const reacts = document.createElement("div");
    reacts.className = "a11y-preview-reacts";
    [["\u{1F44D}", "3"], ["\u{1F3E0}", "1"]].forEach(pair => {
      const pill = document.createElement("span");
      pill.className = "a11y-preview-react";
      pill.textContent = pair[0] + " " + pair[1];
      reacts.appendChild(pill);
    });
    bubble.appendChild(reacts);
  }));

  chat.appendChild(cluster("here's a link ", (bubble, text) => {
    const line = document.createElement("div");
    line.className = "a11y-preview-line";
    line.appendChild(document.createTextNode(text));
    const link = document.createElement("a");
    link.className = "msg-link a11y-preview-link";
    link.href = "#";
    link.textContent = "https://oneira.cc/accessibility";
    link.addEventListener("click", (e) => e.preventDefault());
    line.appendChild(link);
    const emoji = document.createElement("span");
    emoji.className = "a11y-preview-emoji";
    emoji.textContent = "\u{2728}";
    line.appendChild(document.createTextNode(" "));
    line.appendChild(emoji);
    bubble.appendChild(line);
    const gif = document.createElement("div");
    gif.className = "a11y-preview-gif";
    gif.textContent = "GIF";
    bubble.appendChild(gif);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "a11y-preview-btn";
    btn.textContent = "Example Button";
    bubble.appendChild(btn);
  }));

  const members = document.createElement("div");
  members.className = "a11y-preview-members";
  ["#3ba55d", "#faa61a", "#ed4245"].forEach(color => {
    const dot = document.createElement("div");
    dot.className = "a11y-preview-member";
    dot.style.background = color;
    members.appendChild(dot);
  });

  const fakeToggle = document.createElement("label");
  fakeToggle.className = "toggle-switch settings-toggle a11y-preview-toggle";
  const fakeInput = document.createElement("input");
  fakeInput.type = "checkbox";
  fakeInput.checked = true;
  fakeInput.disabled = true;
  const track = document.createElement("span");
  track.className = "toggle-track";
  const thumb = document.createElement("span");
  thumb.className = "toggle-thumb";
  track.appendChild(thumb);
  fakeToggle.appendChild(fakeInput);
  fakeToggle.appendChild(track);

  windowEl.appendChild(chat);
  windowEl.appendChild(members);
  windowEl.appendChild(fakeToggle);
  wrap.appendChild(label);
  wrap.appendChild(windowEl);
  return wrap;
}

function refreshAccessibilityPreview() {
  const windowEl = document.getElementById("a11y-preview-window");
  if (!windowEl || !accessibilityPrefs) return;
  const prefs = accessibilityPrefs;
  const scale = (Number(prefs.zoom) || 100) / 100;
  windowEl.style.setProperty("--preview-zoom", String(scale));
  windowEl.style.filter = "saturate(" + ((Number(prefs.saturation) || 0) / 100) + ")";
  windowEl.classList.toggle("is-compact", prefs.chat_display === "compact");
  windowEl.classList.toggle("density-compact", prefs.ui_density === "compact");
  windowEl.classList.toggle("density-spacious", prefs.ui_density === "spacious");
  windowEl.classList.toggle("name-styles", !!prefs.display_name_styles);
  windowEl.classList.toggle("role-off", prefs.role_colors === "off");
  windowEl.classList.toggle("still-gif", !prefs.gifs_when_focused || effectiveReducedMotion(prefs));
  windowEl.classList.toggle("still-emoji", !prefs.animated_emoji || effectiveReducedMotion(prefs) || prefs.sticker_anim === "never");
  windowEl.style.setProperty("--preview-gap", (Number(prefs.group_spacing) || 0) + "px");
}

function paintTextReadability(host, info, persist) {
  host.appendChild(settingsOpt(
    "Text size in chat",
    "Adjust the size of message text. Avatars and timestamps scale with it.",
    null
  ));
  host.appendChild(a11yTicks(["12px", "14px", "15px", "16px", "18px", "20px", "24px"]));
  host.appendChild(a11ySlider(12, 24, 1, info.text_size, (value) => persist({ text_size: value }, { save: false }), (value) => persist({ text_size: value })));
  host.appendChild(settingsOpt(
    "Always underline links",
    "Make links stand out more in chat.",
    settingsToggle(!!info.underline_links, false, (on) => persist({ underline_links: on }))
  ));
  host.appendChild(settingsOpt(
    "Display Name Styles",
    "Name fonts and effects aren't built yet. The preview tints the sample name so you can see the idea.",
    settingsToggle(!!info.display_name_styles, false, (on) => persist({ display_name_styles: on })),
    settingsNote("This waits on profile name effects.", "later")
  ));
}

function paintVisualDensity(host, info, persist) {
  const density = document.createElement("div");
  density.className = "settings-radio-list";
  [
    ["compact", "Compact", "Tighter server, channel, and member lists."],
    ["default", "Default", "Current spacing."],
    ["spacious", "Spacious", "More space between lists."]
  ].forEach(row => {
    density.appendChild(privacyRadio(row[0], info.ui_density || "default", row[1], row[2], (value) => persist({ ui_density: value })));
  });
  const densityTitle = document.createElement("div");
  densityTitle.className = "settings-opt-title";
  densityTitle.textContent = "UI Density";
  host.appendChild(densityTitle);
  const densityDesc = document.createElement("div");
  densityDesc.className = "settings-opt-desc";
  densityDesc.textContent = "The preview rail spacing updates now. The real rails wait on a layout sweep.";
  host.appendChild(densityDesc);
  host.appendChild(density);

  const chat = document.createElement("div");
  chat.className = "settings-radio-list";
  [
    ["default", "Default", "Avatar, name, then the message."],
    ["compact", "Compact", "Name and message on one line."]
  ].forEach(row => {
    chat.appendChild(privacyRadio(row[0], info.chat_display || "default", row[1], row[2], (value) => persist({ chat_display: value })));
  });
  const chatTitle = document.createElement("div");
  chatTitle.className = "settings-opt-title";
  chatTitle.style.marginTop = "12px";
  chatTitle.textContent = "Chat Message Display";
  host.appendChild(chatTitle);
  host.appendChild(settingsNote("Compact is live in the preview. Real chat still uses the current cluster layout.", "later"));
  host.appendChild(chat);

  host.appendChild(settingsOpt("Space Between Message Groups", "Gap between different people's message clusters.", null));
  host.appendChild(a11yTicks(["0px", "4px", "8px", "16px", "24px"]));
  host.appendChild(a11ySlider(0, 24, 1, info.group_spacing, (value) => persist({ group_spacing: value }, { save: false }), (value) => persist({ group_spacing: value })));

  host.appendChild(settingsOpt("Zoom level", "Scales the preview. Real-app zoom waits on a desktop wrapper; the browser zoom still works.", null));
  host.appendChild(a11yTicks(["50", "75", "100", "125", "150", "200"]));
  host.appendChild(a11ySlider(50, 200, 1, info.zoom, (value) => persist({ zoom: value }, { save: false }), (value) => persist({ zoom: value })));
}

function paintColorContrast(host, info, persist) {
  host.appendChild(settingsOpt("Saturation", "How strong colors are in the preview. Images in real chat stay untouched until we can exclude them from a global filter.", null));
  host.appendChild(a11yTicks(["0%", "50%", "100%"]));
  host.appendChild(a11ySlider(0, 100, 1, info.saturation, (value) => persist({ saturation: value }, { save: false }), (value) => persist({ saturation: value })));
  host.appendChild(settingsOpt(
    "Apply saturation setting to custom colors",
    "Would also mute role colors and custom theme accents. Roles aren't built yet.",
    settingsToggle(!!info.saturation_custom, false, (on) => persist({ saturation_custom: on })),
    settingsNote("Saved for when roles exist.", "later")
  ));
  host.appendChild(settingsOpt(
    "Enable High Contrast Mode",
    "Stronger borders and text in the app and the preview.",
    settingsToggle(!!info.high_contrast, false, (on) => persist({ high_contrast: on }))
  ));
  host.appendChild(settingsOpt(
    "Sync contrast settings",
    "Follow the computer's contrast preference when it asks for more contrast.",
    settingsToggle(info.sync_contrast !== false, false, (on) => persist({ sync_contrast: on }))
  ));
  host.appendChild(settingsOpt(
    "Role Colors",
    "How role colors would show on names.",
    settingsSelect(
      [
        { value: "names", label: "In names" },
        { value: "next", label: "Next to names" },
        { value: "off", label: "Don't show" }
      ],
      info.role_colors || "names",
      false
    ),
    settingsNote("Roles aren't built yet. The preview tints the sample name.", "later")
  ));
  const roleSelect = host.querySelectorAll("select.settings-select");
  const lastSelect = roleSelect[roleSelect.length - 1];
  if (lastSelect) lastSelect.addEventListener("change", () => persist({ role_colors: lastSelect.value }));
  host.appendChild(settingsOpt(
    "Official Messages",
    "How staff/system messages would look. We don't have that flag yet.",
    settingsSelect(
      [
        { value: "default", label: "Default" },
        { value: "role", label: "Match role color" },
        { value: "off", label: "Plain" }
      ],
      info.official_messages || "default",
      true
    ),
    settingsNote("This feature isn't built yet.", "later")
  ));
  host.appendChild(settingsOpt(
    "Show on/off indicators",
    "Toggles show a mark so on and off are not color-only.",
    settingsToggle(!!info.toggle_indicators, false, (on) => persist({ toggle_indicators: on }))
  ));
  const related = document.createElement("div");
  related.className = "settings-related-wrap";
  const relatedTitle = document.createElement("h3");
  relatedTitle.className = "settings-subblock-title";
  relatedTitle.textContent = "Related Settings";
  related.appendChild(relatedTitle);
  related.appendChild(settingsRelatedCard("Appearance", "Change your app theme.", "theme"));
  host.appendChild(related);
}

function paintReducedMotion(host, info, persist) {
  host.appendChild(settingsOpt(
    "Enable Reduced Motion",
    "Cut back animations, hover motion, and other movement.",
    settingsToggle(!!info.reduced_motion, false, (on) => persist({ reduced_motion: on }))
  ));
  host.appendChild(settingsOpt(
    "Sync with computer setting",
    "Follow the OS reduced-motion preference.",
    settingsToggle(info.sync_motion !== false, false, (on) => persist({ sync_motion: on }))
  ));
  host.appendChild(settingsOpt(
    "Play GIFs when Oneira is focused",
    "The preview GIF pauses when this is off. Real GIF autoplay waits on a media sweep.",
    settingsToggle(info.gifs_when_focused !== false, false, (on) => persist({ gifs_when_focused: on })),
    settingsNote("Saved. Chat GIF freeze isn't wired through every embed yet.", "later")
  ));
  host.appendChild(settingsOpt(
    "Play animated emoji",
    "The sparkle in the preview stops when this is off.",
    settingsToggle(info.animated_emoji !== false, false, (on) => persist({ animated_emoji: on }))
  ));
  const stickers = document.createElement("div");
  stickers.className = "settings-radio-list";
  [
    ["always", "Always animate", "Stickers would always play."],
    ["interaction", "Animate on interaction", "Play on hover or press."],
    ["never", "Never animate", "Keep stickers still."]
  ].forEach(row => {
    stickers.appendChild(privacyRadio(row[0], info.sticker_anim || "always", row[1], row[2], (value) => persist({ sticker_anim: value })));
  });
  const stickerTitle = document.createElement("div");
  stickerTitle.className = "settings-opt-title";
  stickerTitle.style.marginTop = "8px";
  stickerTitle.textContent = "Play sticker animations";
  host.appendChild(stickerTitle);
  host.appendChild(settingsNote("Stickers aren't built yet. This choice is saved.", "later"));
  host.appendChild(stickers);
}

function paintAudioReader(host, info, persist) {
  host.appendChild(settingsOpt("Text-to-Speech rate", "Speed for Speak Message and other TTS. Preview uses the browser voice.", null));
  host.appendChild(a11yTicks(["Slower", "x" + Number(info.tts_rate || 1).toFixed(1), "Faster"]));
  host.appendChild(a11ySlider(0.5, 2, 0.1, info.tts_rate || 1, (value) => persist({ tts_rate: value }, { save: false }), (value) => persist({ tts_rate: value })));
  const preview = document.createElement("button");
  preview.type = "button";
  preview.className = "settings-row-btn";
  preview.textContent = "Preview";
  preview.addEventListener("click", () => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance("This is a preview of text to speech in Oneira.");
    utter.rate = Number(accessibilityPrefs.tts_rate) || 1;
    window.speechSynthesis.speak(utter);
  });
  host.appendChild(settingsOpt("Preview voice", "Reads a short sample at the current rate.", preview));
  host.appendChild(settingsOpt(
    "Show image descriptions",
    "Screen readers would hear image descriptions when we have them.",
    settingsToggle(!!info.image_descriptions, false, (on) => persist({ image_descriptions: on })),
    settingsNote("Saved. Image descriptions aren't written yet.", "later")
  ));
  host.appendChild(settingsOpt(
    "Use the legacy chat input",
    "A simpler composer for some screen readers. Our composer stays as-is until that pass.",
    settingsToggle(!!info.legacy_input, false, (on) => persist({ legacy_input: on })),
    settingsNote("This feature isn't built yet.", "later")
  ));
}

async function renderAccessibilitySettings(pane, jumpChildId) {
  pane.innerHTML = "";
  let info;
  try {
    info = await loadAccessibilitySettings();
  } catch (e) {
    const note = document.createElement("div");
    note.className = "placeholder-panel";
    note.textContent = e.message || "Could not load accessibility settings.";
    pane.appendChild(note);
    return;
  }
  applyAccessibility(info);

  const block = document.createElement("section");
  block.className = "settings-block has-sections a11y-block";
  block.id = settingsTargetId("accessibility");
  const title = document.createElement("h2");
  title.className = "settings-block-title";
  title.textContent = "Accessibility";
  block.appendChild(title);
  block.appendChild(buildAccessibilityPreview());

  const persist = async (patch, opts) => {
    const next = Object.assign({}, info, patch);
    applyAccessibility(next);
    if (!opts || opts.save !== false) {
      try { info = await saveAccessibilitySettings(next); }
      catch (e) { applyAccessibility(info); }
    } else {
      info = next;
    }
  };

  const sections = [
    ["text-readability", "Text Readability", paintTextReadability],
    ["visual-density", "Visual Density", paintVisualDensity],
    ["color-contrast", "Color & Contrast", paintColorContrast],
    ["reduced-motion", "Reduced Motion", paintReducedMotion],
    ["audio-screen-reader", "Audio & Screen Reader", paintAudioReader]
  ];
  sections.forEach(row => {
    const sub = document.createElement("div");
    sub.className = "settings-subblock";
    sub.id = settingsTargetId(row[0]);
    const heading = document.createElement("h3");
    heading.className = "settings-subblock-title";
    heading.textContent = row[1];
    sub.appendChild(heading);
    row[2](sub, info, persist);
    block.appendChild(sub);
  });

  pane.appendChild(block);
  refreshAccessibilityPreview();
  if (jumpChildId) {
    const target = document.getElementById(settingsTargetId(jumpChildId));
    if (target) pane.scrollTop = Math.max(0, target.offsetTop - 24);
    else pane.scrollTop = 0;
  } else {
    pane.scrollTop = 0;
  }
}
