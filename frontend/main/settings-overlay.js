// ==================================================================
// settings-overlay.js - Game Overlay. Desktop HUD over a game.
// Layout only until a desktop wrapper can draw over other apps.
// Voice Widget also waits on Voice. No Discord branding in the preview.
// ==================================================================

const OVERLAY_LATER = "This feature isn't built yet. It waits on a desktop app.";

function overlayLaterNote(text) {
  return settingsNote(text || OVERLAY_LATER, "later");
}

function overlayChevronToggle(title, desc, on) {
  const controls = document.createElement("div");
  controls.className = "overlay-row-controls";
  controls.appendChild(settingsToggle(on, true));
  const chev = document.createElement("span");
  chev.className = "settings-row-chevron";
  chev.textContent = ">";
  controls.appendChild(chev);
  return settingsOpt(title, desc, controls);
}

function overlaySelect(label, selected) {
  return settingsSelect([{ value: selected, label }], selected, true);
}

function paintOverlayMain(host) {
  const playing = document.createElement("div");
  playing.className = "overlay-playing";
  const tag = document.createElement("div");
  tag.className = "overlay-playing-tag";
  tag.textContent = "Currently Playing";
  playing.appendChild(tag);
  playing.appendChild(settingsGameRow({
    name: "Not playing",
    detail: "When a supported game is open, Overlay can sit on top of it.",
    current: false,
    empty: true,
    on: false
  }));
  host.appendChild(playing);
  host.appendChild(overlayChevronToggle(
    "Enable Overlay",
    "Lighter, faster, and more customizable. Requires Borderless display setting.",
    true
  ));
  host.appendChild(overlayChevronToggle(
    "Enable Legacy Overlay",
    "Legacy Overlay available for all supported games.",
    true
  ));
  const report = document.createElement("button");
  report.type = "button";
  report.className = "settings-row-btn";
  report.textContent = "Report";
  report.disabled = true;
  host.appendChild(settingsOpt(
    "Report a Problem",
    "If Overlay isn't working as expected, let us know so we can fix it.",
    report
  ));
  host.appendChild(overlayLaterNote("Game Overlay waits on a desktop app that can draw over other programs."));
}

function paintOverlayLock(host) {
  const combo = document.createElement("div");
  combo.className = "settings-keybind-combo";
  const keys = document.createElement("span");
  keys.textContent = "SHIFT + `";
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "settings-row-btn";
  edit.textContent = "Edit Keybind";
  edit.disabled = true;
  combo.appendChild(keys);
  combo.appendChild(edit);
  host.appendChild(settingsOpt("Toggle Overlay Lock", "", combo));
  host.appendChild(settingsOpt(
    "Use Compatibility Mode",
    "Fixes issues with the overlay taking or losing focus during use. (Warning! This will reduce some functionality)",
    settingsToggle(false, true)
  ));
  host.appendChild(settingsOpt(
    "Enable overlay clickable regions",
    "Allows areas of the overlay (ie notifications) to be clickable while the overlay is locked.",
    settingsToggle(true, true)
  ));
  host.appendChild(overlayLaterNote("Lock, keybind, and click-through wait on Overlay."));
}

function paintVoiceWidget(host) {
  const preview = document.createElement("div");
  preview.className = "overlay-widget-preview";
  const stack = document.createElement("div");
  stack.className = "overlay-widget-stack";
  ["#3ba55d", "#8b5cf6", "#faa61a"].forEach(color => {
    const dot = document.createElement("div");
    dot.className = "overlay-widget-avatar";
    dot.style.background = color;
    stack.appendChild(dot);
  });
  const chip = document.createElement("div");
  chip.className = "overlay-widget-chip";
  chip.textContent = "Voice Channel";
  preview.appendChild(stack);
  preview.appendChild(chip);
  host.appendChild(preview);

  host.appendChild(settingsOpt("Avatar Size", "", overlaySelect("Large", "large")));
  host.appendChild(settingsOpt("Display Names", "", overlaySelect("Never", "never")));
  host.appendChild(settingsOpt("Display Users", "", overlaySelect("Always", "always")));

  host.appendChild(settingsOpt("Max Users Displayed", "", null));
  const ticks = document.createElement("div");
  ticks.className = "a11y-ticks";
  ["Off", "5", "10", "15", "20", "25"].forEach(label => {
    const tick = document.createElement("span");
    tick.textContent = label;
    ticks.appendChild(tick);
  });
  host.appendChild(ticks);
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "settings-slider a11y-slider";
  slider.min = "0";
  slider.max = "25";
  slider.value = "8";
  slider.disabled = true;
  host.appendChild(slider);
  host.appendChild(overlayLaterNote("The in-game voice widget waits on Overlay and Voice."));
}

function paintOverlayNotifications(host) {
  [
    ["Messages", "For each text message notification, shows a notice that you can reply to."],
    ["Welcome", "Shows a notice every time the overlay opens to let you know that the overlay is now active."],
    ["Go Live", "Lets you know when you are able to stream a game when the overlay first opens."],
    ["Game Activity", "Shows friends who are currently playing, or have recently played the game you're currently playing."],
    ["Now Playing", "Notifies you when a friend starts playing the game you are currently playing."]
  ].forEach(row => {
    host.appendChild(settingsOpt(row[0], row[1], settingsToggle(true, true)));
  });
  host.appendChild(overlayLaterNote("Overlay toasts wait on Overlay, and on notification sounds/toasts."));
}

function renderGameOverlaySettings(pane, jumpChildId) {
  pane.innerHTML = "";
  const block = document.createElement("section");
  block.className = "settings-block has-sections";
  block.id = settingsTargetId("game-overlay");
  const heading = document.createElement("h2");
  heading.className = "settings-block-title";
  heading.textContent = "Game Overlay";
  block.appendChild(heading);

  const sections = [
    ["overlay", "Overlay", paintOverlayMain],
    ["overlay-lock", "Overlay Lock", paintOverlayLock],
    ["voice-widget", "Voice Widget", paintVoiceWidget],
    ["overlay-notifications", "Notifications", paintOverlayNotifications]
  ];
  sections.forEach(row => {
    const sub = document.createElement("div");
    sub.className = "settings-subblock";
    sub.id = settingsTargetId(row[0]);
    const subTitle = document.createElement("h3");
    subTitle.className = "settings-subblock-title";
    subTitle.textContent = row[1];
    sub.appendChild(subTitle);
    row[2](sub);
    block.appendChild(sub);
  });

  pane.appendChild(block);
  if (jumpChildId) {
    const target = document.getElementById(settingsTargetId(jumpChildId));
    if (target) pane.scrollTop = Math.max(0, target.offsetTop - 24);
    else pane.scrollTop = 0;
  } else {
    pane.scrollTop = 0;
  }
}
