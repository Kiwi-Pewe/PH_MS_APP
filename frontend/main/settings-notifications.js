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
    "Enable Desktop Notifications",
    "Shows a system alert when you get a notification while Oneira is in the background.",
    settingsToggle(true, true),
    settingsLaterNote("OS notifications")
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
  function appendSoundRow(title, key) {
    const toggle = settingsToggle(soundPrefs[key], false, async (on) => {
      const previous = soundPrefs[key];
      soundPrefs[key] = on;
      try { await saveSounds(); } catch (e) {
        soundPrefs[key] = previous;
        toggle.querySelector("input").checked = previous;
      }
    });
    const desc = document.createElement("div");
    const preview = document.createElement("span");
    preview.className = "settings-inline-link is-static";
    preview.textContent = "Preview Sound";
    desc.appendChild(preview);
    sounds.appendChild(settingsOpt(title, desc, toggle));
  }
  appendSoundRow("New Message", "message");
  appendSoundRow("Incoming Ring", "incoming_ring");
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
