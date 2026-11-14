function notificationSettingsUrl(path) {
  return `https://${serverAddress}${path}`;
}

let notifyReactionsPref = "all";

function reactionNotifySoundOn() {
  return notifyReactionsPref !== "off";
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

function applyLoadedNotificationPrefs(info) {
  if (!info) return;
  oneiraSoundMuteAll = !!info.sound_mute_all;
  notifyReactionsPref = info.notify_reactions || "all";
}

async function applyNotificationRuntimePrefs() {
  try {
    applyLoadedNotificationPrefs(await loadNotificationSettings());
  } catch (e) {}
}

async function renderNotificationSettings(pane, jumpChildId) {
  pane.innerHTML = "";
  let info;
  let feedPrefs = typeof defaultFeedAlertPrefs === "function" ? defaultFeedAlertPrefs() : {};
  try {
    info = await loadNotificationSettings();
  } catch (e) {
    const note = document.createElement("div");
    note.className = "placeholder-panel";
    note.textContent = e.message || "Could not load notification settings.";
    pane.appendChild(note);
    return;
  }
  applyLoadedNotificationPrefs(info);
  try {
    if (typeof loadFeedAlertPrefs === "function") feedPrefs = await loadFeedAlertPrefs();
  } catch (e) {}

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

  const mailOn = typeof mailToastsEnabled === "function" ? mailToastsEnabled() : true;
  const mailToggle = settingsToggle(mailOn, false, (on) => {
    if (typeof setMailToastsEnabled === "function") setMailToastsEnabled(on);
  });
  overview.appendChild(settingsOpt(
    "Enable Mail Notifications",
    "Shows a toast when you receive Mail.",
    mailToggle
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

  const reactionsOn = notifyReactionsPref !== "off";
  const reactionToggle = settingsToggle(reactionsOn, false, async (on) => {
    const previous = notifyReactionsPref;
    const value = on ? "all" : "off";
    notifyReactionsPref = value;
    try {
      await postNotification("/notification_reactions", { value: value });
    } catch (e) {
      notifyReactionsPref = previous;
      const input = reactionToggle.querySelector("input");
      if (input) input.checked = previous !== "off";
    }
  });
  overview.appendChild(settingsOpt(
    "Reaction notification",
    "Play a sound when someone reacts to your message.",
    reactionToggle
  ));

  const eventsOn = !!(feedPrefs.event_invite || feedPrefs.event_created);
  const eventsToggle = settingsToggle(eventsOn, false, async (on) => {
    const previousInvite = !!feedPrefs.event_invite;
    const previousCreated = !!feedPrefs.event_created;
    feedPrefs.event_invite = on;
    feedPrefs.event_created = on;
    try {
      if (typeof saveFeedAlertPrefs === "function") await saveFeedAlertPrefs(feedPrefs);
      if (typeof applyFeedAlertPrefsLocally === "function") applyFeedAlertPrefsLocally();
    } catch (e) {
      feedPrefs.event_invite = previousInvite;
      feedPrefs.event_created = previousCreated;
      const input = eventsToggle.querySelector("input");
      if (input) input.checked = previousInvite || previousCreated;
    }
  });
  overview.appendChild(settingsOpt(
    "Server Events",
    "Get notified when events are created or you are invited.",
    eventsToggle
  ));

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
  oneiraSoundMuteAll = !!soundPrefs.mute_all;
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
    oneiraSoundMuteAll = on;
    if (on && typeof stopOneiraRingtone === "function") stopOneiraRingtone();
    try { await saveSounds(); } catch (e) {
      soundPrefs.mute_all = previous;
      oneiraSoundMuteAll = previous;
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

  pane.appendChild(block);
  if (jumpChildId) {
    const target = document.getElementById(settingsTargetId(jumpChildId));
    if (target) pane.scrollTop = Math.max(0, target.offsetTop - 24);
    else pane.scrollTop = 0;
  } else {
    pane.scrollTop = 0;
  }
}

const NOTIFY_SOUND_FILES = {
  pings: ["Default.mp3"],
  calls: ["Default.mp3"]
};
const NOTIFY_SOUND_PREF_KEY = "oneira_notify_sounds";

let notifySoundTab = "pings";
let notifySoundDraft = null;
let notifySoundSaved = null;
let notifySoundBound = false;
let notifySoundPreview = null;

function notifySoundId(kind, file) {
  const stem = file.replace(/\.mp3$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return kind + "-" + stem;
}

function notifySoundSrc(kind, file) {
  const folder = kind === "calls" ? "ringtones" : "alerts";
  return "sounds/" + folder + "/" + encodeURIComponent(file);
}

function formatNotifySoundDuration(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins + ":" + String(secs).padStart(2, "0");
}

function stopNotifySoundPreview() {
  if (!notifySoundPreview) return;
  notifySoundPreview.pause();
  notifySoundPreview = null;
}

function playNotifySoundPreview(row) {
  stopNotifySoundPreview();
  if (!row || !row.src) return;
  const audio = new Audio(row.src);
  notifySoundPreview = audio;
  audio.play().catch(() => {});
}

let oneiraSoundMuteAll = false;
let oneiraRingAudio = null;

function notifySoundUsingSrc(kind) {
  const state = notifySoundSaved || blankNotifySoundState();
  const pack = state[kind] || state.pings;
  const row = (pack.items || []).find((item) => item.id === pack.using);
  if (row && row.src) return row.src;
  return notifySoundSrc(kind, "Default.mp3");
}

function playOneiraAlert() {
  if (oneiraSoundMuteAll) return;
  const audio = new Audio(notifySoundUsingSrc("pings"));
  audio.play().catch(() => {});
}

function startOneiraRingtone() {
  if (oneiraSoundMuteAll) {
    stopOneiraRingtone();
    return;
  }
  if (oneiraRingAudio) return;
  oneiraRingAudio = new Audio(notifySoundUsingSrc("calls"));
  oneiraRingAudio.loop = true;
  oneiraRingAudio.play().catch(() => {});
}

function stopOneiraRingtone() {
  if (!oneiraRingAudio) return;
  oneiraRingAudio.pause();
  oneiraRingAudio = null;
}

function packNotifySoundFiles(kind, files, preferred) {
  const items = files.map((file) => ({
    id: notifySoundId(kind, file),
    name: file.replace(/\.mp3$/i, ""),
    file: file,
    src: notifySoundSrc(kind, file),
    duration: "",
    stock: true
  }));
  items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  const preferredId = preferred ? notifySoundId(kind, preferred) : "";
  const using = items.some((row) => row.id === preferredId) ? preferredId : (items[0] ? items[0].id : "");
  return { using, items };
}

function copyNotifySoundPack(pack) {
  return {
    using: pack.using,
    items: pack.items.map((row) => ({
      id: row.id,
      name: row.name,
      file: row.file,
      src: row.src,
      duration: row.duration,
      stock: !!row.stock
    }))
  };
}

function blankNotifySoundState() {
  return {
    pings: packNotifySoundFiles("pings", NOTIFY_SOUND_FILES.pings, "Default.mp3"),
    calls: packNotifySoundFiles("calls", NOTIFY_SOUND_FILES.calls, "Default.mp3")
  };
}

function cloneNotifySoundState(state) {
  return {
    pings: copyNotifySoundPack(state.pings),
    calls: copyNotifySoundPack(state.calls)
  };
}

function persistNotifySoundSaved() {
  if (!notifySoundSaved) return;
  try {
    localStorage.setItem(NOTIFY_SOUND_PREF_KEY, JSON.stringify({
      pings: notifySoundSaved.pings.using,
      calls: notifySoundSaved.calls.using
    }));
  } catch (e) {}
}

function hydrateNotifySoundSaved() {
  const fresh = blankNotifySoundState();
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIFY_SOUND_PREF_KEY) || "null");
    if (raw && typeof raw === "object") {
      ["pings", "calls"].forEach((kind) => {
        const using = raw[kind];
        if (using && fresh[kind].items.some((row) => row.id === using)) {
          fresh[kind].using = using;
        }
      });
    }
  } catch (e) {}
  notifySoundSaved = fresh;
}

function applyNotifySoundSaved(fresh) {
  if (!notifySoundSaved) return fresh;
  ["pings", "calls"].forEach((kind) => {
    const ids = {};
    fresh[kind].items.forEach((row) => { ids[row.id] = row; });
    if (ids[notifySoundSaved[kind].using]) fresh[kind].using = notifySoundSaved[kind].using;
    (notifySoundSaved[kind].items || []).forEach((row) => {
      if (ids[row.id] && row.name) ids[row.id].name = row.name;
    });
  });
  return fresh;
}

function closeNotifySoundSubmenu(discard) {
  stopNotifySoundPreview();
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
    duration.textContent = row.duration || "0:00";
    copy.appendChild(name);
    copy.appendChild(duration);
    if (row.src && !row.duration) {
      const probe = new Audio();
      probe.preload = "metadata";
      probe.src = row.src;
      probe.addEventListener("loadedmetadata", () => {
        row.duration = formatNotifySoundDuration(probe.duration);
        duration.textContent = row.duration;
      });
    }
    const play = document.createElement("button");
    play.type = "button";
    play.className = "ghost-btn notify-sound-play";
    play.textContent = "Play";
    play.addEventListener("click", () => playNotifySoundPreview(row));
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
          disabled: row.file === "Default.mp3",
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
  stopNotifySoundPreview();
  notifySoundTab = tab === "calls" ? "calls" : "pings";
  document.querySelectorAll(".notify-sound-tab").forEach((btn) => {
    btn.classList.toggle("is-on", btn.getAttribute("data-sound-tab") === notifySoundTab);
  });
  paintNotifySoundList();
}

function openNotifySoundSubmenu() {
  const overlay = document.getElementById("notify-sound-overlay");
  if (!overlay) return;
  notifySoundDraft = applyNotifySoundSaved(blankNotifySoundState());
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
    if (notifySoundDraft) {
      notifySoundSaved = cloneNotifySoundState(notifySoundDraft);
      persistNotifySoundSaved();
    }
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

hydrateNotifySoundSaved();
bindNotifySoundSubmenu();
