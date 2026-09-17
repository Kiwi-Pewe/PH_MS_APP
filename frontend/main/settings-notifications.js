// ==================================================================
// settings-notifications.js - Notifications. Sound toggles and the
// reaction-sound preference save. Desktop toasts, email, OS badges,
// and Advanced wait. In-app unread pills are not this page.
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
  block.className = "settings-block";
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
    "If you're looking for per-channel or per-server notifications, that will live on the server icon later.",
    settingsToggle(true, true),
    settingsNote("This feature isn't built yet.", "later")
  ));
  overview.appendChild(settingsOpt(
    "Enable Taskbar Flashing",
    "Flashes the app in your taskbar when you have new notifications.",
    settingsToggle(true, true),
    settingsNote("This feature isn't built yet. It waits on a desktop app.", "later")
  ));
  const notifyHeading = document.createElement("div");
  notifyHeading.className = "settings-opt-title";
  notifyHeading.textContent = "Notify me when...";
  notifyHeading.style.margin = "16px 0 8px";
  overview.appendChild(notifyHeading);
  [
    ["People I know start streaming in small servers", "Streaming isn't built yet."],
    ["A friend and I reach a friendship anniversary", "Friendship anniversaries aren't built yet."],
    ["Friends come online", "Online pings aren't built yet."],
    ["A server has an upcoming event", "Server events aren't built yet."],
    ["Friends update their profile", "Profile update pings aren't built yet."]
  ].forEach(row => {
    overview.appendChild(settingsOpt(row[0], "", settingsToggle(true, true), settingsNote(row[1], "later")));
  });
  const reactionSelect = settingsSelect(
    [
      { value: "all", label: "All Messages" },
      { value: "dms", label: "Direct Messages" },
      { value: "off", label: "Never" }
    ],
    info.notify_reactions || "all",
    false
  );
  reactionSelect.addEventListener("change", async () => {
    const previous = info.notify_reactions || "all";
    try {
      const data = await postNotification("/notification_reactions", { value: reactionSelect.value });
      info.notify_reactions = data.notify_reactions;
    } catch (e) {
      reactionSelect.value = previous;
    }
  });
  overview.appendChild(settingsOpt(
    "Someone reacts to my messages",
    "Reactions never add a red unread number. When sounds exist, this is what plays a notification sound.",
    reactionSelect,
    settingsNote("Preference is saved. The sound isn't built yet.", "later")
  ));
  block.appendChild(overview);

  const sounds = document.createElement("div");
  sounds.className = "settings-subblock";
  sounds.id = settingsTargetId("notifications-sounds");
  const soundsTitle = document.createElement("h3");
  soundsTitle.className = "settings-subblock-title";
  soundsTitle.textContent = "Sounds";
  sounds.appendChild(soundsTitle);
  sounds.appendChild(settingsNote("Preferences are saved. Oneira does not play notification sounds yet.", "later"));
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
  appendSoundRow("New Message in the channel I'm currently reading", "current_channel");
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
  const relatedSoundsLabel = document.createElement("h3");
  relatedSoundsLabel.className = "settings-subblock-title";
  relatedSoundsLabel.textContent = "Related Settings";
  relatedSounds.appendChild(relatedSoundsLabel);
  relatedSounds.appendChild(settingsRelatedCard("Voice & Video", "Enable/disable sounds that play when you're in a call, like Mute, Unmute, Deafen, and more.", "voice-video"));
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
    "Shows a red badge on the app icon when you have unread messages. This is not the Home/server rail unread pills.",
    settingsToggle(true, true),
    settingsNote("This feature isn't built yet. In-app unread on Home and servers is unchanged.", "later")
  ));
  block.appendChild(badges);

  const email = document.createElement("div");
  email.className = "settings-subblock";
  email.id = settingsTargetId("notifications-email");
  const emailTitle = document.createElement("h3");
  emailTitle.className = "settings-subblock-title";
  emailTitle.textContent = "Email";
  email.appendChild(emailTitle);
  email.appendChild(settingsNote("Oneira does not send emails yet.", "later"));
  email.appendChild(settingsOpt("Communication Emails", "Receive emails for missed calls, messages, and message digests.", settingsToggle(true, true)));
  email.appendChild(settingsOpt("Social Emails", "Receive emails for friend requests, new friend suggestions, and events in your server.", settingsToggle(true, true)));
  email.appendChild(settingsOpt("Announcements and Update Emails", "Receive emails about product updates, new features, improvements and bug fixes.", settingsToggle(false, true)));
  email.appendChild(settingsOpt("Tip Emails", "Receive emails with helpful advice on how to use Oneira.", settingsToggle(false, true)));
  email.appendChild(settingsOpt("Recommendations Emails", "Receive emails with recommended servers and suggested events.", settingsToggle(false, true)));
  const unsub = document.createElement("button");
  unsub.type = "button";
  unsub.className = "settings-row-btn";
  unsub.textContent = "Unsubscribe";
  unsub.disabled = true;
  email.appendChild(settingsOpt(
    "Unsubscribe from all marketing emails",
    "This includes any emails about product updates, new features, tips, and recommendations.",
    unsub
  ));
  block.appendChild(email);

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
    "Oneira won't send push notifications to your mobile device while you're active on your computer. Use this setting to choose how long you need to be inactive on desktop before mobile notifications start again.",
    delay,
    settingsNote("This feature isn't built yet. It waits on a mobile app.", "later")
  ));
  advanced.appendChild(settingsOpt(
    "Allow playback and usage of /tts command",
    "Using the /tts command speaks your message out loud. Turn this off if you prefer to see /tts messages as text only. Playback speed will live on Accessibility.",
    settingsToggle(true, true),
    settingsNote("This feature isn't built yet.", "later")
  ));
  const ttsList = document.createElement("div");
  ttsList.className = "settings-radio-list is-disabled";
  [
    ["all", "For all channels"],
    ["selected", "Only for currently selected channel"],
    ["never", "Never"]
  ].forEach(row => {
    const radio = privacyRadio(row[0], "never", row[1], "", () => {});
    radio.disabled = true;
    ttsList.appendChild(radio);
  });
  const ttsWrap = document.createElement("div");
  ttsWrap.className = "settings-opt";
  const ttsText = document.createElement("div");
  ttsText.className = "settings-opt-text";
  const ttsTitle = document.createElement("div");
  ttsTitle.className = "settings-opt-title";
  ttsTitle.textContent = "Speak all messages out loud";
  const ttsDesc = document.createElement("div");
  ttsDesc.className = "settings-opt-desc";
  ttsDesc.textContent = "Speaks messages out loud, even if they weren't using the /tts command.";
  ttsText.appendChild(ttsTitle);
  ttsText.appendChild(ttsDesc);
  ttsText.appendChild(settingsNote("This feature isn't built yet.", "later"));
  ttsWrap.appendChild(ttsText);
  advanced.appendChild(ttsWrap);
  advanced.appendChild(ttsList);
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
