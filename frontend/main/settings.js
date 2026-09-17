// ==================================================================
// settings.js - General + User settings shell. Account + Profile
// bodies are painted by settings-account.js; other sections stay
// placeholders until we fill them one pass at a time.
// ==================================================================

const SETTINGS_GENERAL_CATALOG = [
  {
    items: [
      {
        id: "account",
        label: "Account",
        children: [
          { id: "account-info", label: "Account Info" },
          { id: "password-security", label: "Password & Security" }
        ]
      },
      {
        id: "data-privacy",
        label: "Data & Privacy",
        placeholder: true,
        children: [
          { id: "how-data-used", label: "How Oneira Uses My Data" },
          { id: "sponsored-content", label: "Sponsored Content" },
          { id: "profile-privacy", label: "Profile Privacy" },
          { id: "voice-e2ee", label: "Voice end-to-end encryption" }
        ]
      },
      {
        id: "messaging-permissions",
        label: "Messaging Permissions",
        placeholder: true,
        children: [
          { id: "content-filters", label: "Content Filters" },
          { id: "spam-filters", label: "Spam Filters" },
          { id: "direct-messages", label: "Direct Messages" },
          { id: "friend-requests", label: "Friend Requests" },
          { id: "ignore-block", label: "Ignore & Block" }
        ]
      },
      {
        id: "notifications",
        label: "Notifications",
        placeholder: true,
        children: [
          { id: "notifications-overview", label: "Overview" },
          { id: "notifications-sounds", label: "Sounds" },
          { id: "notifications-badges", label: "Badges" },
          { id: "notifications-email", label: "Email" }
        ]
      }
    ]
  },
  {
    label: "Experience",
    items: [
      {
        id: "appearance",
        label: "Appearance",
        children: [
          { id: "theme", label: "Theme" },
          { id: "messages-look", label: "Messages" },
          { id: "chat-box", label: "Chat Box" },
          { id: "appearance-search", label: "Search" }
        ]
      },
      {
        id: "voice-video",
        label: "Voice & Video",
        placeholder: true,
        parked: "voice",
        children: [
          { id: "voice", label: "Voice" },
          { id: "camera", label: "Camera" },
          { id: "streaming", label: "Streaming" }
        ]
      },
      {
        id: "accessibility",
        label: "Accessibility",
        placeholder: true,
        children: [
          { id: "text-readability", label: "Text Readability" },
          { id: "visual-density", label: "Visual Density" },
          { id: "color-contrast", label: "Color & Contrast" },
          { id: "reduced-motion", label: "Reduced Motion" }
        ]
      },
      {
        id: "system",
        label: "System",
        placeholder: true,
        children: [
          { id: "system-general", label: "General" },
          { id: "custom-keybinds", label: "Custom Keybinds" },
          { id: "default-keybinds", label: "Default Keybinds" }
        ]
      },
      {
        id: "language-time",
        label: "Language & Time",
        placeholder: true
      }
    ]
  },
  {
    label: "Games & Apps",
    stage: 3,
    items: [
      { id: "registered-games", label: "Registered Games", placeholder: true, stage: 3 },
      { id: "activity-privacy", label: "Activity Privacy", placeholder: true, stage: 3 },
      { id: "game-overlay", label: "Game Overlay", placeholder: true, stage: 3 },
      { id: "connected-apps", label: "Connected Apps", placeholder: true, stage: 3 }
    ]
  },
  {
    items: [
      { id: "developer", label: "Developer", placeholder: true }
    ]
  }
];

const SETTINGS_USER_CATALOG = [
  {
    items: [
      {
        id: "profile",
        label: "Profile",
        children: [
          { id: "display-name", label: "Display Name" },
          { id: "avatar", label: "Avatar" }
        ]
      }
    ]
  }
];

function settingsTargetId(id) {
  return "settings-block-" + id;
}

function currentSettingsCatalog() {
  return settingsPane === "user" ? SETTINGS_USER_CATALOG : SETTINGS_GENERAL_CATALOG;
}

function settingsParentOf(id) {
  let found = null;
  currentSettingsCatalog().forEach(group => {
    (group.items || []).forEach(item => {
      if (item.id === id || (item.children || []).some(child => child.id === id)) found = item;
    });
  });
  return found;
}

function settingsPlaceholderNote(item) {
  if (item.parked === "voice") return "Voice & Video waits until Voice is built.";
  if (item.stage === 3) return "Games & Apps wait on Stage 3.";
  if (item.id === "developer") return "Developer options aren't designed yet.";
  if (item.id === "avatar") {
    return "Avatar upload isn't built yet.";
  }
  if (item.id === "appearance" || item.id === "theme") {
    return "Theme and custom colors aren't built yet.";
  }
  return "This section isn't built yet.";
}

function paintSettingsSection(item, jumpChildId) {
  const pane = settingsPaneEl();
  if (!pane || !item) return;
  if (item.id === "account" && typeof renderAccountSettings === "function") {
    renderAccountSettings(pane, jumpChildId);
    return;
  }
  if (item.id === "profile" && typeof renderProfileSettings === "function") {
    renderProfileSettings(pane, jumpChildId);
    return;
  }
  pane.innerHTML = "";

  const block = document.createElement("section");
  block.className = "settings-block";
  block.id = settingsTargetId(item.id);

  const title = document.createElement("h2");
  title.className = "settings-block-title";
  title.textContent = item.label;
  block.appendChild(title);

  if (item.children && item.children.length) {
    item.children.forEach(child => {
      const sub = document.createElement("div");
      sub.className = "settings-subblock";
      sub.id = settingsTargetId(child.id);
      const subTitle = document.createElement("h3");
      subTitle.className = "settings-subblock-title";
      subTitle.textContent = child.label;
      sub.appendChild(subTitle);
      const note = document.createElement("div");
      note.className = "placeholder-panel";
      note.textContent = settingsPlaceholderNote(Object.assign({}, item, child));
      sub.appendChild(note);
      block.appendChild(sub);
    });
  } else {
    const note = document.createElement("div");
    note.className = "placeholder-panel";
    note.textContent = settingsPlaceholderNote(item);
    block.appendChild(note);
  }
  pane.appendChild(block);

  if (jumpChildId) {
    const target = document.getElementById(settingsTargetId(jumpChildId));
    if (target) pane.scrollTop = Math.max(0, target.offsetTop - 24);
    else pane.scrollTop = 0;
  } else {
    pane.scrollTop = 0;
  }
}

function settingsItemMatches(item, query) {
  if (!query) return true;
  const blob = [item.label].concat((item.children || []).map(c => c.label)).join(" ").toLowerCase();
  return blob.indexOf(query) !== -1;
}

function renderSettingsNav() {
  const host = document.getElementById("settings-nav-scroll");
  if (!host) return;
  host.innerHTML = "";
  const catalog = currentSettingsCatalog();
  const query = ((document.getElementById("settings-search") && document.getElementById("settings-search").value) || "").trim().toLowerCase();
  const openParent = settingsParentOf(settingsActiveId);

  catalog.forEach(group => {
    const visibleItems = (group.items || []).filter(item => settingsItemMatches(item, query));
    if (!visibleItems.length) return;

    if (group.label) {
      const heading = document.createElement("div");
      heading.className = "settings-nav-group";
      heading.textContent = group.label;
      host.appendChild(heading);
    }

    visibleItems.forEach(item => {
      const isOpen = !!(openParent && openParent.id === item.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "settings-nav-item" + (item.stage === 3 ? " is-later" : "") + (isOpen ? " is-open" : "");
      const label = document.createElement("span");
      label.textContent = item.label;
      btn.appendChild(label);
      if (item.children && item.children.length) {
        const caret = document.createElement("span");
        caret.className = "settings-nav-caret";
        caret.textContent = "▾";
        btn.appendChild(caret);
      }
      btn.addEventListener("click", () => jumpToSettings(item.id));
      host.appendChild(btn);

      if (isOpen && item.children) {
        item.children.forEach(child => {
          const childBtn = document.createElement("button");
          childBtn.type = "button";
          childBtn.className = "settings-nav-child" + (settingsActiveId === child.id ? " active" : "");
          childBtn.textContent = child.label;
          childBtn.addEventListener("click", () => jumpToSettings(child.id));
          host.appendChild(childBtn);
        });
      }
    });
  });

  if (settingsPane === "general" && !query) {
    const logoutBtn = document.createElement("button");
    logoutBtn.type = "button";
    logoutBtn.className = "settings-nav-logout";
    logoutBtn.textContent = "Log Out";
    logoutBtn.addEventListener("click", () => {
      if (typeof logout === "function") logout();
    });
    host.appendChild(logoutBtn);
  }
}

function settingsPaneEl() {
  return settingsPane === "user"
    ? document.getElementById("settings-user-pane")
    : document.getElementById("settings-general-pane");
}

function jumpToSettings(id) {
  const item = settingsParentOf(id);
  if (!item) return;
  settingsActiveId = id;
  renderSettingsNav();
  const child = (item.children || []).find(row => row.id === id);
  paintSettingsSection(item, child ? child.id : null);
}

function paintSettingsUserCard() {
  const letter = document.getElementById("settings-card-letter");
  const name = document.getElementById("settings-card-name");
  const action = document.getElementById("settings-card-action");
  const shown = myDisplayName || myUsername || "";
  if (letter) letter.textContent = typeof avatarLetter === "function" ? avatarLetter(shown) : (shown || "?").slice(0, 1);
  if (name) name.textContent = shown || "—";
  if (action) action.textContent = settingsPane === "user" ? "Back to General" : "Edit Profiles";
}

function showSettingsPane(pane) {
  settingsPane = pane === "user" ? "user" : "general";
  const general = document.getElementById("settings-general-pane");
  const user = document.getElementById("settings-user-pane");
  if (general) general.hidden = settingsPane !== "general";
  if (user) user.hidden = settingsPane !== "user";
  const search = document.getElementById("settings-search");
  if (search) search.value = "";
  settingsActiveId = settingsPane === "user" ? "profile" : "account";
  paintSettingsUserCard();
  jumpToSettings(settingsActiveId);
}

function closeSettingsChrome() {
  if (!isSettingsOpen) {
    const settingsSide = document.getElementById("settings-sidebar-view");
    if (settingsSide) settingsSide.style.display = "none";
    return;
  }
  isSettingsOpen = false;
  settingsPane = "general";
  document.getElementById("settings-sidebar-view").style.display = "none";
  document.getElementById("account-footer").style.display = "flex";
  setTopbarTab("messages");
}

function setTopbarTab(tab) {
  document.querySelectorAll("#topbar .tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
}

async function openSettings() {
  if (isSettingsOpen) {
    setTopbarTab("settings");
    return;
  }
  if (typeof leaveDocIfNeeded === "function" && !(await leaveDocIfNeeded())) return;
  if (typeof hideMemberList === "function") hideMemberList();
  if (typeof resetTypingOnLeave === "function") resetTypingOnLeave();
  isSettingsOpen = true;
  document.getElementById("dm-sidebar-view").style.display = "none";
  document.getElementById("server-sidebar-view").style.display = "none";
  document.getElementById("account-footer").style.display = "none";
  document.getElementById("settings-sidebar-view").style.display = "flex";
  setTopbarTab("settings");
  switchMainView("settings");
  showSettingsPane("general");
}

document.getElementById("settings-user-card").addEventListener("click", () => {
  showSettingsPane(settingsPane === "user" ? "general" : "user");
});
document.getElementById("settings-search").addEventListener("input", () => {
  renderSettingsNav();
});
