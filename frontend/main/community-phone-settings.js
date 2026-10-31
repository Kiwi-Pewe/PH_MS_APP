let communityPhonePrefsStatus = "";

async function loadCommunityPhonePrefs() {
  try {
    const response = await fetch(`https://${serverAddress}/community_phone_settings`, { credentials: "include" });
    if (!response.ok) return;
    applyCommunityPhonePrefs(await response.json());
  } catch (e) {
    return;
  }
  if (communitySettingsSection === "phone" && communitySettingsOpen()) paintCommunityPhoneSettings();
}

async function saveCommunityPhonePrefs(method, path, payload) {
  communityPhonePrefsStatus = "";
  try {
    const response = await fetch(`https://${serverAddress}/community_phone_settings${path}`, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof communityErrorText === "function" ? communityErrorText(data, "Could not save.") : "Could not save.");
    applyCommunityPhonePrefs(data);
  } catch (e) {
    communityPhonePrefsStatus = e.message || "Could not save.";
  }
  paintCommunityPhoneSettings();
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

function paintCommunityPhoneSettings() {
  const page = document.getElementById("community-settings-page");
  if (!page || communitySettingsSection !== "phone") return;
  page.replaceChildren();
  const section = document.createElement("section");
  section.className = "settings-block has-sections";
  const black = communityPhoneSubblock("Blacklist");
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "Messages from the person you are paired with that match your blacklist are covered on your screen until you click them.";
  black.appendChild(blurb);
  black.appendChild(paintCommunityFilterList("word", "Words", "Covers any message from your match that contains one of these words.", "Add a word", communityPhonePrefs.words, saveCommunityPhonePrefs));
  black.appendChild(communityPhonePrefToggle("cover_media", "Cover media from matches", "Covers images and videos your match sends until you click them."));
  if (communityPhonePrefsStatus) {
    const status = document.createElement("div");
    status.className = "settings-form-status";
    status.textContent = communityPhonePrefsStatus;
    black.appendChild(status);
  }
  section.appendChild(black);
  const privacy = communityPhoneSubblock("Privacy");
  privacy.appendChild(settingsOpt(
    "Hide my profile from matches",
    "When on, your match sees you as \"Caller\" with a default picture. Your name, username, profile picture, and profile stay hidden until you both accept each other as friends.",
    settingsToggle(!communityPhonePrefs.show_profile, false, (on) => saveCommunityPhonePrefs("PATCH", "", { show_profile: !on }))
  ));
  privacy.appendChild(communityPhonePrefToggle("allow_friend", "Allow friend requests from matches", "Lets the person you are paired with send you a friend request."));
  section.appendChild(privacy);
  const chat = communityPhoneSubblock("Chat");
  chat.appendChild(communityPhonePrefToggle("match_sound", "Match sound", "Plays a sound when Find someone pairs you with someone."));
  const sound = settingsSelect([
    { value: "all", label: "All messages" },
    { value: "off", label: "Off" }
  ], communityPhonePrefs.message_sound === "off" ? "off" : "all", false);
  sound.addEventListener("change", () => saveCommunityPhonePrefs("PATCH", "", { message_sound: sound.value }));
  chat.appendChild(settingsOpt("Message sound", "Plays a sound when your match sends a message while Phone a User is not open.", sound));
  chat.appendChild(communityPhonePrefToggle("unread_count", "Show unread count", "Shows a red count on Communities and Phone a User when your match sends messages you have not seen."));
  chat.appendChild(communityPhonePrefToggle("confirm_end", "Confirm before ending a chat", "Asks you to confirm before End Chat ends the chat."));
  chat.appendChild(communityPhonePrefToggle("auto_find", "Find someone again after a chat ends", "Starts a new search when a chat ends, unless you ended it yourself."));
  section.appendChild(chat);
  page.appendChild(section);
}
