// ==================================================================
// settings-privacy.js - Data & Privacy pages. Most rows are honest
// placeholders (no collection, or not built yet). Profile visibility
// is the one control that saves on the account today.
// ==================================================================

function privacySettingsUrl(path) {
  return `https://${serverAddress}${path}`;
}

function settingsToggle(checked, disabled, onChange) {
  const label = document.createElement("label");
  label.className = "toggle-switch settings-toggle" + (disabled ? " is-disabled" : "");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = !!checked;
  input.disabled = !!disabled;
  const track = document.createElement("span");
  track.className = "toggle-track";
  const thumb = document.createElement("span");
  thumb.className = "toggle-thumb";
  track.appendChild(thumb);
  label.appendChild(input);
  label.appendChild(track);
  if (onChange && !disabled) {
    input.addEventListener("change", () => onChange(input.checked));
  }
  return label;
}

function settingsNote(text, kind) {
  const note = document.createElement("div");
  note.className = "settings-note" + (kind === "later" ? " is-later" : "");
  note.textContent = text;
  return note;
}

function settingsOpt(title, desc, control, note) {
  const row = document.createElement("div");
  row.className = "settings-opt";
  const text = document.createElement("div");
  text.className = "settings-opt-text";
  const heading = document.createElement("div");
  heading.className = "settings-opt-title";
  heading.textContent = title;
  text.appendChild(heading);
  if (desc) {
    const body = document.createElement("div");
    body.className = "settings-opt-desc";
    if (typeof desc === "string") body.textContent = desc;
    else body.appendChild(desc);
    text.appendChild(body);
  }
  if (note) text.appendChild(note);
  row.appendChild(text);
  if (control) {
    const wrap = document.createElement("div");
    wrap.className = "settings-opt-control";
    wrap.appendChild(control);
    row.appendChild(wrap);
  }
  return row;
}

function settingsRelatedCard(title, desc, targetId) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "settings-related";
  const copy = document.createElement("div");
  copy.className = "settings-related-text";
  const name = document.createElement("div");
  name.className = "settings-related-title";
  name.textContent = title;
  const body = document.createElement("div");
  body.className = "settings-related-desc";
  body.textContent = desc;
  copy.appendChild(name);
  copy.appendChild(body);
  const chev = document.createElement("span");
  chev.className = "settings-row-chevron";
  chev.textContent = ">";
  btn.appendChild(copy);
  btn.appendChild(chev);
  btn.addEventListener("click", () => {
    if (typeof jumpToSettings === "function") jumpToSettings(targetId);
  });
  return btn;
}

function privacyRadio(value, selected, title, desc, onPick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "settings-radio" + (value === selected ? " is-on" : "");
  const dot = document.createElement("span");
  dot.className = "settings-radio-dot";
  const copy = document.createElement("div");
  const name = document.createElement("div");
  name.className = "settings-opt-title";
  name.textContent = title;
  const body = document.createElement("div");
  body.className = "settings-opt-desc";
  body.textContent = desc;
  copy.appendChild(name);
  copy.appendChild(body);
  btn.appendChild(dot);
  btn.appendChild(copy);
  btn.addEventListener("click", () => onPick(value));
  return btn;
}

async function renderDataPrivacySettings(pane, jumpChildId) {
  pane.innerHTML = "";
  let visibility = "friends_all";
  try {
    const response = await fetch(privacySettingsUrl("/privacy_settings"), { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.profile_visibility) visibility = data.profile_visibility;
  } catch (e) { /* default stays friends_all */ }

  const block = document.createElement("section");
  block.className = "settings-block";
  block.id = settingsTargetId("data-privacy");

  const title = document.createElement("h2");
  title.className = "settings-block-title";
  title.textContent = "Data & Privacy";
  block.appendChild(title);

  const how = document.createElement("div");
  how.className = "settings-subblock";
  how.id = settingsTargetId("how-data-used");
  const howTitle = document.createElement("h3");
  howTitle.className = "settings-subblock-title";
  howTitle.textContent = "How Oneira Uses My Data";
  how.appendChild(howTitle);

  const requiredDesc = document.createElement("div");
  requiredDesc.appendChild(document.createTextNode("Oneira needs to store and process some data to provide the service, such as your messages, the servers you're in, and your Direct Messages. Using Oneira means you allow that. You can stop this later by "));
  const disable = document.createElement("span");
  disable.className = "settings-inline-link is-static";
  disable.textContent = "Disabling";
  const or = document.createTextNode(" or ");
  const del = document.createElement("span");
  del.className = "settings-inline-link is-static";
  del.textContent = "Deleting";
  requiredDesc.appendChild(disable);
  requiredDesc.appendChild(or);
  requiredDesc.appendChild(del);
  requiredDesc.appendChild(document.createTextNode(" your account."));
  how.appendChild(settingsOpt(
    "Use data to make Oneira work",
    requiredDesc,
    null,
    settingsNote("Disabling and deleting an account aren't built yet.", "later")
  ));
  how.appendChild(settingsOpt(
    "Use data to improve Oneira",
    "Allow Oneira to use and process my information to understand and improve the service.",
    settingsToggle(false, true),
    settingsNote("Oneira does not collect extra analytics data.")
  ));
  how.appendChild(settingsOpt(
    "Use data to personalize my Oneira experience",
    "Allow Oneira to use information such as who you talk to and what you play, to personalize Oneira for you.",
    settingsToggle(false, true),
    settingsNote("Oneira does not collect personalization data.")
  ));
  how.appendChild(settingsOpt(
    "Allow my voice to be recorded in Clips",
    "Allows your voice to be included when someone in the same voice channel uses Clips.",
    settingsToggle(false, true),
    settingsNote("This feature isn't built yet.", "later")
  ));
  const requestBtn = document.createElement("button");
  requestBtn.type = "button";
  requestBtn.className = "settings-row-btn";
  requestBtn.textContent = "Request Data";
  requestBtn.disabled = true;
  how.appendChild(settingsOpt(
    "Request my data",
    "If you need a copy of your personal data from your account's entire history, you can get it here.",
    requestBtn,
    settingsNote("This feature isn't built yet.", "later")
  ));
  const relatedHow = document.createElement("div");
  relatedHow.className = "settings-related-wrap";
  const relatedHowLabel = document.createElement("h3");
  relatedHowLabel.className = "settings-subblock-title";
  relatedHowLabel.textContent = "Related Settings";
  relatedHow.appendChild(relatedHowLabel);
  relatedHow.appendChild(settingsRelatedCard(
    "Registered Games",
    "Link accounts like Steam or Roblox so what you're playing can show on your profile. Restrict sharing on a game-by-game basis.",
    "registered-games"
  ));
  how.appendChild(relatedHow);
  block.appendChild(how);

  const ads = document.createElement("div");
  ads.className = "settings-subblock";
  ads.id = settingsTargetId("sponsored-content");
  const adsTitle = document.createElement("h3");
  adsTitle.className = "settings-subblock-title";
  adsTitle.textContent = "Sponsored Content";
  ads.appendChild(adsTitle);
  ads.appendChild(settingsOpt(
    "Use my Oneira activity to personalize Sponsored Content",
    "Allows us to personalize Sponsored Content using your Oneira activity, such as the games you play. If you opt out you may still see that content, but it won't be personalized.",
    settingsToggle(false, true),
    settingsNote("Oneira does not have sponsored content, and does not collect this data.")
  ));
  ads.appendChild(settingsOpt(
    "Use third-party data to personalize Sponsored Content",
    "Allows us to personalize Sponsored Content using data we receive from advertisers and third-party data providers.",
    settingsToggle(false, true),
    settingsNote("Oneira does not collect third-party advertising data.")
  ));
  const topicSearch = document.createElement("input");
  topicSearch.type = "search";
  topicSearch.className = "settings-disabled-search";
  topicSearch.placeholder = "Search...";
  topicSearch.disabled = true;
  ads.appendChild(settingsOpt(
    "Manage Sponsored Content",
    "Control seeing Sponsored Content associated with certain topics. If you hide a topic, you will see no Sponsored Content from that topic.",
    null,
    settingsNote("This feature isn't built yet.", "later")
  ));
  ads.appendChild(topicSearch);
  block.appendChild(ads);

  const profile = document.createElement("div");
  profile.className = "settings-subblock";
  profile.id = settingsTargetId("profile-privacy");
  const profileTitle = document.createElement("h3");
  profileTitle.className = "settings-subblock-title";
  profileTitle.textContent = "Profile Privacy";
  profile.appendChild(profileTitle);
  const profileBlurb = document.createElement("p");
  profileBlurb.className = "settings-blurb";
  profileBlurb.textContent = "Control who can see your profile info — like your bio and connected accounts.";
  profile.appendChild(profileBlurb);
  profile.appendChild(settingsNote("This is saved on your account. Profile cards will respect it once profiles are built.", "later"));
  const shareLabel = document.createElement("div");
  shareLabel.className = "settings-opt-title";
  shareLabel.textContent = "Share my full profile with";
  shareLabel.style.marginTop = "12px";
  profile.appendChild(shareLabel);
  const radios = document.createElement("div");
  radios.className = "settings-radio-list";

  async function pickVisibility(value) {
    const previous = visibility;
    visibility = value;
    Array.from(radios.children).forEach(child => {
      child.classList.toggle("is-on", child.getAttribute("data-value") === value);
    });
    try {
      const response = await fetch(privacySettingsUrl("/privacy_visibility"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value: value })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data.detail && data.detail) || "Could not save.");
    } catch (e) {
      visibility = previous;
      Array.from(radios.children).forEach(child => {
        child.classList.toggle("is-on", child.getAttribute("data-value") === previous);
      });
    }
  }

  const choices = [
    ["friends_all", "Friends & All Servers", "Your full profile is visible to friends and any server you join."],
    ["friends_small", "Friends & Small Servers Only", "Your full profile is visible to friends and any server you join with 200 or fewer members. Everyone else sees a limited version."],
    ["friends_only", "Friends Only", "Your full profile is visible to friends. Everyone else sees a limited version."]
  ];
  choices.forEach(row => {
    const radio = privacyRadio(row[0], visibility, row[1], row[2], pickVisibility);
    radio.setAttribute("data-value", row[0]);
    radios.appendChild(radio);
  });
  profile.appendChild(radios);
  profile.appendChild(settingsOpt(
    "Share when I update my profile",
    "Allow friends to receive a notification when you update your profile.",
    settingsToggle(true, true),
    settingsNote("This feature isn't built yet.", "later")
  ));
  const relatedProfile = document.createElement("div");
  relatedProfile.className = "settings-related-wrap";
  const relatedProfileLabel = document.createElement("h3");
  relatedProfileLabel.className = "settings-subblock-title";
  relatedProfileLabel.textContent = "Related Settings";
  relatedProfile.appendChild(relatedProfileLabel);
  relatedProfile.appendChild(settingsRelatedCard(
    "Activity Privacy",
    "Control how your game and app activity is shared — what's visible and who sees it. Linking Steam, Roblox, and similar accounts lives here too.",
    "activity-privacy"
  ));
  profile.appendChild(relatedProfile);
  block.appendChild(profile);

  const voice = document.createElement("div");
  voice.className = "settings-subblock";
  voice.id = settingsTargetId("voice-e2ee");
  const voiceTitle = document.createElement("h3");
  voiceTitle.className = "settings-subblock-title";
  voiceTitle.textContent = "Voice End-to-end Encryption";
  voice.appendChild(voiceTitle);
  voice.appendChild(settingsOpt(
    "Enable persistent verification codes",
    "Gives your current device persistent verification codes. If this setting is on, your friends only have to verify your device once, instead of every time you enter a voice call.",
    settingsToggle(false, true),
    settingsNote("This feature isn't built yet. Voice is parked.", "later")
  ));
  block.appendChild(voice);

  pane.appendChild(block);
  if (jumpChildId) {
    const target = document.getElementById(settingsTargetId(jumpChildId));
    if (target) pane.scrollTop = Math.max(0, target.offsetTop - 24);
    else pane.scrollTop = 0;
  } else {
    pane.scrollTop = 0;
  }
}
