// ==================================================================
// settings-notifications.js - Notifications. Reaction + sound prefs
// save. Friends-online toasts are live (localStorage pref). Desktop
// toasts, OS badge, email, mobile delay, and TTS wait. Sound files
// are not in the app yet — prefs still save; Preview stays grey.
// ==================================================================

function notificationSettingsUrl(path) {
  return `https://${serverAddress}${path}`;
}

async function loadNotificationSettings() {
  const response = await fetch(notificationSettingsUrl("/notification_settings"), { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not load notification settings.");
  return data;
}

async function postNotification(path, body) {
  const response = await fetch(notificationSettingsUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not save.");
  return data;
}

async function renderNotificationSettings(pane, jumpChildId) {
  pane.innerHTML = "";
  let info;
  try {
    info = await loadNotificationSettings();
  } catch (e) {
    const note = document.createElement("div");
    note.className = "placeholder-panel";
    note.textContent = e.message || "Could not load notification settings.";
    pane.appendChild(note);
    return;
  }

  const block = document.createElement("section");
  block.className = "settings-block has-sections";
  block.id = settingsTargetId("notifications");
  const title = document.createElement("h2");
  title.className = "settings-block-title";
  title.textContent = "Notifications";
  block.appendChild(title);

  const overview = document.createElement("div");
  overview.className = "settings-subblock";
  overview.id = settingsTargetId("notifications-overview");
  const overviewTitle = document.createElement("h3");
  overviewTitle.className = "settings-subblock-title";
  overviewTitle.textContent = "Overview";
  overview.appendChild(overviewTitle);
  overview.appendChild(settingsOpt(
    "Enable Mail Notifications",
    "Shows a toast when you receive Mail.",
    settingsToggle(true, true),
    settingsLaterNote("the app")
  ));
  overview.appendChild(settingsOpt(
    "Enable Taskbar Flashing",
    "Flashes the app in your taskbar when you have new notifications.",
    settingsToggle(true, true),
    settingsLaterNote("desktop app")
  ));

  const notifySplit = document.createElement("div");
  notifySplit.className = "settings-opt-divider";
  overview.appendChild(notifySplit);
  const notifyHeading = document.createElement("h3");
  notifyHeading.className = "settings-subblock-title settings-notify-heading";
  notifyHeading.textContent = "Notify me when...";
  overview.appendChild(notifyHeading);

  const friendsOnlineOn = typeof friendsOnlineToastsEnabled === "function"
    ? friendsOnlineToastsEnabled()
    : true;
  const friendsOnlineToggle = settingsToggle(friendsOnlineOn, false, (on) => {
    if (typeof setFriendsOnlineToastsEnabled === "function") setFriendsOnlineToastsEnabled(on);
  });
  overview.appendChild(settingsOpt(
    "Friends come online",
    "Shows a short toast in the corner when a friend comes online.",
    friendsOnlineToggle
  ));

  [
    ["Friendship Anniversary", "friendship anniversaries"],
    ["Server Events", "server events"]
  ].forEach(row => {
    overview.appendChild(settingsOpt(row[0], "", settingsToggle(true, true), settingsLaterNote(row[1])));
  });

  const feedBtn = document.createElement("button");
  feedBtn.type = "button";
  feedBtn.className = "ghost-btn settings-feed-prefs-btn";
  feedBtn.textContent = "Manage Feed & Mail";
  feedBtn.addEventListener("click", () => {
    if (typeof openFeedAlertPrefsSubmenu === "function") openFeedAlertPrefsSubmenu();
  });
  overview.appendChild(settingsOpt(
    "Feed & Mail",
    "Choose which personal alert types appear in your Feed and Mail.",
    feedBtn
  ));
  block.appendChild(overview);

  const sounds = document.createElement("div");
  sounds.className = "settings-subblock";
  sounds.id = settingsTargetId("notifications-sounds");
  const soundsTitle = document.createElement("h3");
  soundsTitle.className = "settings-subblock-title";
  soundsTitle.textContent = "Sounds";
  sounds.appendChild(soundsTitle);
  const soundPrefs = {
    message: !!info.sound_message,
    current_channel: !!info.sound_current_channel,
    incoming_ring: !!info.sound_incoming_ring,
    mute_all: !!info.sound_mute_all
  };
  async function saveSounds() {
    await postNotification("/notification_sounds", soundPrefs);
  }
  const soundEditBtn = document.createElement("button");
  soundEditBtn.type = "button";
  soundEditBtn.className = "ghost-btn settings-feed-prefs-btn";
  soundEditBtn.textContent = "Edit";
  soundEditBtn.addEventListener("click", () => {
    if (typeof openNotifySoundSubmenu === "function") openNotifySoundSubmenu();
  });
  sounds.appendChild(settingsOpt(
    "Edit Notification sounds",
    "Change your ringtones and notification sounds to better fit your profile.",
    soundEditBtn
  ));
  const muteToggle = settingsToggle(soundPrefs.mute_all, false, async (on) => {
    const previous = soundPrefs.mute_all;
    soundPrefs.mute_all = on;
    try { await saveSounds(); } catch (e) {
      soundPrefs.mute_all = previous;
      muteToggle.querySelector("input").checked = previous;
    }
  });
  sounds.appendChild(settingsOpt(
    "Disable All Notification Sounds",
    "Disables all notification sounds, including voice & video sound effects. Your individual sound preferences will be saved and restored if you turn this on.",
    muteToggle
  ));
  const relatedSounds = document.createElement("div");
  relatedSounds.className = "settings-related-wrap";
  const relatedSoundsLabel = document.createElement("div");
  relatedSoundsLabel.className = "settings-related-heading";
  relatedSoundsLabel.textContent = "Related Settings";
  relatedSounds.appendChild(relatedSoundsLabel);
  relatedSounds.appendChild(settingsRelatedCard(
    "Voice & Video",
    "Enable/disable sounds that play when you're in a call, like Mute, Unmute, Deafen, and more.",
    "voice-video"
  ));
  sounds.appendChild(relatedSounds);
  block.appendChild(sounds);

  const badges = document.createElement("div");
  badges.className = "settings-subblock";
  badges.id = settingsTargetId("notifications-badges");
  const badgesTitle = document.createElement("h3");
  badgesTitle.className = "settings-subblock-title";
  badgesTitle.textContent = "Badges";
  badges.appendChild(badgesTitle);
  badges.appendChild(settingsOpt(
    "Enable Unread Message Badge",
    "Shows a red badge on the Oneira app icon when you have unread messages.",
    settingsToggle(true, true),
    settingsLaterNote("OS app badge")
  ));
  block.appendChild(badges);

  const advanced = document.createElement("div");
  advanced.className = "settings-subblock";
  advanced.id = settingsTargetId("notifications-advanced");
  const advancedTitle = document.createElement("h3");
  advancedTitle.className = "settings-subblock-title";
  advancedTitle.textContent = "Advanced";
  advanced.appendChild(advancedTitle);
  const delay = settingsSelect(
    [
      { value: "1", label: "1 minute" },
      { value: "2", label: "2 minutes" },
      { value: "10", label: "10 minutes" },
      { value: "15", label: "15 minutes" },
      { value: "30", label: "30 minutes" }
    ],
    "10",
    true
  );
  advanced.appendChild(settingsOpt(
    "Mobile Notification Delay",
    "Sets how long you need to be away from desktop before push notifications go to your phone.",
    delay,
    settingsLaterNote("mobile app")
  ));
  block.appendChild(advanced);

  pane.appendChild(block);
  if (jumpChildId) {
    const target = document.getElementById(settingsTargetId(jumpChildId));
    if (target) pane.scrollTop = Math.max(0, target.offsetTop - 24);
    else pane.scrollTop = 0;
  } else {
    pane.scrollTop = 0;
  }
}

const NOTIFY_SOUND_STOCK = {
  pings: [
    { id: "ping-default", name: "Default", duration: "0:01", stock: true },
    { id: "ping-chime", name: "Chime", duration: "0:02", stock: true },
    { id: "ping-knock", name: "Knock", duration: "0:01", stock: true },
    { id: "ping-pop", name: "Pop", duration: "0:01", stock: true },
    { id: "ping-soft", name: "Soft", duration: "0:03", stock: true }
  ],
  calls: [
    { id: "call-default", name: "Default", duration: "0:03", stock: true },
    { id: "call-classic", name: "Classic", duration: "0:04", stock: true },
    { id: "call-soft", name: "Soft", duration: "0:03", stock: true },
    { id: "call-pulse", name: "Pulse", duration: "0:05", stock: true },
    { id: "call-echo", name: "Echo", duration: "0:04", stock: true }
  ]
};

let notifySoundTab = "pings";
let notifySoundDraft = null;
let notifySoundSaved = null;
let notifySoundBound = false;

function copyNotifySoundPack(pack) {
  return {
    using: pack.using,
    items: pack.items.map((row) => ({
      id: row.id,
      name: row.name,
      duration: row.duration,
      stock: !!row.stock
    }))
  };
}

function blankNotifySoundState() {
  return {
    pings: { using: "ping-default", items: NOTIFY_SOUND_STOCK.pings.map((row) => ({ ...row })) },
    calls: { using: "call-default", items: NOTIFY_SOUND_STOCK.calls.map((row) => ({ ...row })) }
  };
}

function cloneNotifySoundState(state) {
  return {
    pings: copyNotifySoundPack(state.pings),
    calls: copyNotifySoundPack(state.calls)
  };
}

function closeNotifySoundSubmenu(discard) {
  const overlay = document.getElementById("notify-sound-overlay");
  if (overlay) overlay.hidden = true;
  if (discard) notifySoundDraft = null;
  if (typeof closeContextMenu === "function") closeContextMenu();
}

function paintNotifySoundList() {
  const host = document.getElementById("notify-sound-list");
  if (!host || !notifySoundDraft) return;
  const pack = notifySoundDraft[notifySoundTab] || notifySoundDraft.pings;
  host.replaceChildren();
  pack.items.forEach((row) => {
    const item = document.createElement("div");
    item.className = "notify-sound-row" + (pack.using === row.id ? " is-on" : "");
    const copy = document.createElement("div");
    copy.className = "notify-sound-copy";
    const name = document.createElement("div");
    name.className = "notify-sound-name";
    name.textContent = row.name;
    const duration = document.createElement("div");
    duration.className = "notify-sound-duration";
    duration.textContent = row.duration;
    copy.appendChild(name);
    copy.appendChild(duration);
    const play = document.createElement("button");
    play.type = "button";
    play.className = "ghost-btn notify-sound-play";
    play.textContent = "Play";
    play.disabled = true;
    const use = document.createElement("button");
    use.type = "button";
    use.className = "settings-row-btn";
    use.textContent = pack.using === row.id ? "Using" : "Use";
    use.disabled = pack.using === row.id;
    use.addEventListener("click", () => {
      pack.using = row.id;
      paintNotifySoundList();
    });
    const more = document.createElement("button");
    more.type = "button";
    more.className = "icon-btn notify-sound-more";
    more.textContent = "···";
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof openContextMenu !== "function") return;
      const rect = more.getBoundingClientRect();
      openContextMenu(rect.left, rect.bottom + 4, null, [
        {
          label: "Rename",
          disabled: row.id === "ping-default" || row.id === "call-default",
          onSelect: () => startNotifySoundRename(row, name)
        },
        {
          label: "Remove",
          danger: true,
          disabled: !!row.stock,
          onSelect: () => {
            pack.items = pack.items.filter((entry) => entry.id !== row.id);
            if (pack.using === row.id && pack.items[0]) pack.using = pack.items[0].id;
            paintNotifySoundList();
          }
        }
      ]);
    });
    item.appendChild(copy);
    item.appendChild(play);
    item.appendChild(use);
    item.appendChild(more);
    host.appendChild(item);
  });
}

function startNotifySoundRename(row, nameEl) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "notify-sound-rename";
  input.value = row.name;
  input.maxLength = 32;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  function finish(save) {
    if (done) return;
    done = true;
    const next = input.value.trim();
    if (save && next) row.name = next;
    paintNotifySoundList();
  }
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
}

function setNotifySoundTab(tab) {
  notifySoundTab = tab === "calls" ? "calls" : "pings";
  document.querySelectorAll(".notify-sound-tab").forEach((btn) => {
    btn.classList.toggle("is-on", btn.getAttribute("data-sound-tab") === notifySoundTab);
  });
  paintNotifySoundList();
}

function openNotifySoundSubmenu() {
  const overlay = document.getElementById("notify-sound-overlay");
  if (!overlay) return;
  notifySoundDraft = cloneNotifySoundState(notifySoundSaved || blankNotifySoundState());
  setNotifySoundTab(notifySoundTab);
  overlay.hidden = false;
}

function bindNotifySoundSubmenu() {
  if (notifySoundBound) return;
  notifySoundBound = true;
  const overlay = document.getElementById("notify-sound-overlay");
  const cancel = document.getElementById("notify-sound-cancel");
  const confirm = document.getElementById("notify-sound-confirm");
  if (cancel) cancel.addEventListener("click", () => closeNotifySoundSubmenu(true));
  if (confirm) confirm.addEventListener("click", () => {
    if (notifySoundDraft) notifySoundSaved = cloneNotifySoundState(notifySoundDraft);
    closeNotifySoundSubmenu(false);
  });
  document.querySelectorAll(".notify-sound-tab").forEach((btn) => {
    btn.addEventListener("click", () => setNotifySoundTab(btn.getAttribute("data-sound-tab")));
  });
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeNotifySoundSubmenu(true);
    });
  }
}

bindNotifySoundSubmenu();
