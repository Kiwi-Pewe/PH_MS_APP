// ==================================================================
// settings-system.js - System page. Catalog + layout only. Startup,
// tray, GPU, global keybinds, and traces wait on a desktop wrapper.
// Default Keybinds is a stub — not Discord's built-in shortcut list.
// ==================================================================

function systemLaterNote(subject) {
  return settingsLaterNote(subject || "desktop app");
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
    "Minimize Oneira to System Tray",
    "Clicking X minimizes Oneira instead of closing it completely.",
    settingsToggle(true, true),
    systemLaterNote()
  ));
}

function paintSystemDefaultKeybinds(host) {
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "Built-in shortcuts that let you move around Oneira from the keyboard.";
  host.appendChild(blurb);
  host.appendChild(systemLaterNote("default keybinds"));
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
    ["default-keybinds", "Default Keybinds", paintSystemDefaultKeybinds]
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
