// ==================================================================
// settings-system.js - System page. Catalog + layout only. Startup,
// tray, GPU, global keybinds, and traces wait on a desktop wrapper.
// Default Keybinds is a stub — not Discord's built-in shortcut list.
// ==================================================================

const SYSTEM_DESKTOP = "This feature isn't built yet. It waits on a desktop app.";

function systemLaterNote(text) {
  return settingsNote(text || SYSTEM_DESKTOP, "later");
}

function systemCallout(kind, title, body, actionLabel) {
  const wrap = document.createElement("div");
  wrap.className = "settings-callout" + (kind === "warn" ? " is-warn" : "");
  const icon = document.createElement("span");
  icon.className = "settings-callout-icon";
  icon.textContent = kind === "warn" ? "!" : "i";
  const copy = document.createElement("div");
  copy.className = "settings-callout-copy";
  const heading = document.createElement("div");
  heading.className = "settings-opt-title";
  heading.textContent = title;
  copy.appendChild(heading);
  if (body) {
    const desc = document.createElement("div");
    desc.className = "settings-opt-desc";
    desc.textContent = body;
    copy.appendChild(desc);
  }
  wrap.appendChild(icon);
  wrap.appendChild(copy);
  if (actionLabel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "settings-row-btn";
    btn.textContent = actionLabel;
    btn.disabled = true;
    wrap.appendChild(btn);
  }
  return wrap;
}

function paintSystemGeneral(host) {
  host.appendChild(settingsOpt(
    "Automatically open Oneira when your computer starts up",
    "",
    settingsToggle(false, true),
    systemLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Start Oneira minimized",
    "Start Oneira in the background, out of your way.",
    settingsToggle(false, true),
    systemLaterNote("This waits on a desktop app, and stays off until auto-start is on.")
  ));
  host.appendChild(settingsOpt(
    "Minimize Oneira to System Tray",
    "Clicking X minimizes Oneira instead of closing it completely.",
    settingsToggle(true, true),
    systemLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Enable Hardware Acceleration",
    "Uses your GPU to make Oneira run more smoothly. Turn this off if you're experiencing visual glitches like frame drops in games or performance problems.",
    settingsToggle(true, true),
    systemLaterNote()
  ));
}

function paintSystemCustomKeybinds(host) {
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "Keybinds are custom keyboard shortcuts that let you perform specific actions in Oneira without needing to click through menus.";
  host.appendChild(blurb);
  const addRow = document.createElement("div");
  addRow.className = "system-toolbar";
  const add = document.createElement("button");
  add.type = "button";
  add.className = "settings-row-btn";
  add.textContent = "+ Add a Keybind";
  add.disabled = true;
  addRow.appendChild(add);
  host.appendChild(addRow);
  host.appendChild(systemLaterNote("Custom keybinds aren't built yet. In-app shortcuts can land before a desktop helper; global shortcuts in games wait on both."));

  host.appendChild(systemCallout(
    "info",
    "Keybinds are disabled while this page is visible.",
    ""
  ));
  host.appendChild(systemCallout(
    "warn",
    "Due to system permissions, keybinds won't work in certain games.",
    "To enable, install Oneira System Helper.",
    "Install"
  ));

  const labels = document.createElement("div");
  labels.className = "settings-keybind-labels";
  const actionLabel = document.createElement("div");
  actionLabel.className = "settings-opt-title";
  actionLabel.textContent = "Keybind Action";
  const bindLabel = document.createElement("div");
  bindLabel.className = "settings-opt-title";
  bindLabel.textContent = "Keybind";
  labels.appendChild(actionLabel);
  labels.appendChild(bindLabel);
  host.appendChild(labels);

  const row = document.createElement("div");
  row.className = "settings-keybind-row";
  row.appendChild(settingsSelect(
    [{ value: "none", label: "Select an action" }],
    "none",
    true
  ));
  const combo = document.createElement("div");
  combo.className = "settings-keybind-combo";
  const unset = document.createElement("span");
  unset.textContent = "No Keybind Set";
  const record = document.createElement("button");
  record.type = "button";
  record.className = "settings-row-btn";
  record.textContent = "Record Keybind";
  record.disabled = true;
  combo.appendChild(unset);
  combo.appendChild(record);
  row.appendChild(combo);
  row.appendChild(settingsToggle(true, true));
  host.appendChild(row);
}

function paintSystemDefaultKeybinds(host) {
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "Built-in shortcuts that let you move around Oneira from the keyboard. Oneira will ship its own list later — this is not Discord's default keybind table.";
  host.appendChild(blurb);
  host.appendChild(systemLaterNote("Default keybinds aren't built yet. Full-keyboard control of the app can come after custom keybinds have a real action list."));
}

function paintSystemHelper(host) {
  const learn = document.createElement("div");
  const desc = document.createElement("span");
  desc.textContent = "Improves Oneira's functionality across games and apps. Helps ensure things like keybinds and other features work reliably. ";
  const link = document.createElement("span");
  link.className = "settings-inline-link is-static";
  link.textContent = "Learn more";
  learn.appendChild(desc);
  learn.appendChild(link);
  const install = document.createElement("button");
  install.type = "button";
  install.className = "settings-row-btn";
  install.textContent = "Install";
  install.disabled = true;
  host.appendChild(settingsOpt(
    "Oneira System Helper",
    learn,
    install,
    systemLaterNote("This waits on a desktop app. Game Overlay is a later product on top of that.")
  ));
}

function paintSystemAdvanced(host) {
  const capture = document.createElement("button");
  capture.type = "button";
  capture.className = "settings-row-btn";
  capture.textContent = "Capture";
  capture.disabled = true;
  host.appendChild(settingsOpt(
    "Capture Performance Trace",
    "Record 30 seconds of performance data and save it to a file you can attach to a support ticket.",
    capture,
    systemLaterNote("This waits on support diagnostics. A browser Performance trace can land later without a desktop app.")
  ));
}

function renderSystemSettings(pane, jumpChildId) {
  pane.innerHTML = "";
  const block = document.createElement("section");
  block.className = "settings-block has-sections";
  block.id = settingsTargetId("system");
  const title = document.createElement("h2");
  title.className = "settings-block-title";
  title.textContent = "System";
  block.appendChild(title);

  const sections = [
    ["system-general", "General", paintSystemGeneral],
    ["custom-keybinds", "Custom Keybinds", paintSystemCustomKeybinds],
    ["default-keybinds", "Default Keybinds", paintSystemDefaultKeybinds],
    ["system-helper", "System Helper", paintSystemHelper],
    ["system-advanced", "Advanced", paintSystemAdvanced]
  ];
  sections.forEach(row => {
    const sub = document.createElement("div");
    sub.className = "settings-subblock";
    sub.id = settingsTargetId(row[0]);
    const heading = document.createElement("h3");
    heading.className = "settings-subblock-title";
    heading.textContent = row[1];
    sub.appendChild(heading);
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
