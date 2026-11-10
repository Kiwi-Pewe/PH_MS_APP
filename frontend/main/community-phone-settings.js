let communityPhonePrefsStatus = "";

async function communityPhonePrefsRequest(method, path, payload) {
  const options = { method, credentials: "include" };
  if (payload) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(payload);
  }
  const response = await fetch(`https://${serverAddress}/community_phone_settings${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof communityErrorText === "function" ? communityErrorText(data, "Could not save.") : "Could not save.");
  return data;
}

async function loadCommunityPhonePrefs() {
  try {
    applyCommunityPhonePrefs(await communityPhonePrefsRequest("GET", ""));
  } catch (e) {
    return;
  }
  if (typeof paintOpenCommunitySettings === "function") paintOpenCommunitySettings();
}

async function saveCommunityPhonePrefs(method, path, payload) {
  communityPhonePrefsStatus = "";
  try {
    applyCommunityPhonePrefs(await communityPhonePrefsRequest(method, path, payload));
  } catch (e) {
    communityPhonePrefsStatus = e.message || "Could not save.";
  }
  if (typeof paintOpenCommunitySettings === "function") paintOpenCommunitySettings();
  if (typeof paintCommunityPhoneBadge === "function") paintCommunityPhoneBadge();
  if (communityPhoneCall && typeof loadCommunityPhone === "function") loadCommunityPhone();
}

function communityPhonePrefToggle(key, title, desc) {
  return settingsOpt(title, desc, settingsToggle(communityPhonePrefs[key], false, (on) => {
    const payload = {};
    payload[key] = on;
    saveCommunityPhonePrefs("PATCH", "", payload);
  }));
}

function communityPhoneSubblock(title) {
  const block = document.createElement("div");
  block.className = "settings-subblock";
  const head = document.createElement("div");
  head.className = "settings-subblock-title";
  head.textContent = title;
  block.appendChild(head);
  return block;
}

function appendCommunityPhoneGeneral(section) {
  if (!section) return;
  const privacy = communityPhoneSubblock("Privacy");
  privacy.appendChild(settingsOpt(
    "Hide my profile from matches",
    "Hide your profile from matches.",
    settingsToggle(!communityPhonePrefs.show_profile, false, (on) => saveCommunityPhonePrefs("PATCH", "", { show_profile: !on }))
  ));
  privacy.appendChild(communityPhonePrefToggle("allow_friend", "Allow friend requests from matches", "Let matches send you a friend request."));
  section.appendChild(privacy);
  const chat = communityPhoneSubblock("Phone chat");
  chat.appendChild(communityPhonePrefToggle("match_sound", "Match sound", "Sound when you get a match."));
  const sound = settingsSelect([
    { value: "all", label: "All messages" },
    { value: "off", label: "Off" }
  ], communityPhonePrefs.message_sound === "off" ? "off" : "all", false);
  sound.addEventListener("change", () => saveCommunityPhonePrefs("PATCH", "", { message_sound: sound.value }));
  chat.appendChild(settingsOpt("Message sound", "Sound for new messages.", sound));
  chat.appendChild(communityPhonePrefToggle("unread_count", "Show unread count", "Show unread messages."));
  chat.appendChild(communityPhonePrefToggle("confirm_end", "Confirm before ending a chat", "Ask before ending a chat."));
  chat.appendChild(communityPhonePrefToggle("auto_find", "Find someone again after a chat ends", "Search again when a chat ends."));
  if (communityPhonePrefsStatus) {
    const status = document.createElement("div");
    status.className = "settings-form-status";
    status.textContent = communityPhonePrefsStatus;
    chat.appendChild(status);
  }
  section.appendChild(chat);
}

function paintCommunityPhoneSettings() {
  if (typeof paintOpenCommunitySettings === "function") paintOpenCommunitySettings();
}
