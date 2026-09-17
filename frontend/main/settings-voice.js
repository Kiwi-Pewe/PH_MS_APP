// ==================================================================
// settings-voice.js - Voice & Video. Catalog + layout only. Nothing
// here talks to a mic, camera, or stream until Voice is built.
// ==================================================================

const VOICE_LATER = "This feature isn't built yet. Voice is parked.";

function voiceLaterNote() {
  return settingsNote(VOICE_LATER, "later");
}

function voiceDisabledSelect(label, selected) {
  return settingsSelect([{ value: selected, label }], selected, true);
}

function voiceSlider() {
  const input = document.createElement("input");
  input.type = "range";
  input.className = "settings-slider";
  input.min = "0";
  input.max = "100";
  input.value = "80";
  input.disabled = true;
  return input;
}

function voiceBgTile(label, on) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "video-bg-tile" + (on ? " is-on" : "");
  btn.disabled = true;
  btn.textContent = label;
  return btn;
}

function paintVoiceSection(host) {
  host.appendChild(settingsOpt(
    "Microphone",
    "Which mic Oneira should use in a call.",
    voiceDisabledSelect("Unavailable until Voice", "none"),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Speaker",
    "Which output Oneira should use in a call.",
    voiceDisabledSelect("Unavailable until Voice", "none"),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Microphone Volume",
    "How loud you sound to other people.",
    voiceSlider(),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Speaker Volume",
    "How loud other people sound to you.",
    voiceSlider(),
    voiceLaterNote()
  ));
  const test = document.createElement("button");
  test.type = "button";
  test.className = "settings-row-btn";
  test.textContent = "Mic Test";
  test.disabled = true;
  host.appendChild(settingsOpt(
    "Mic Test",
    "Hear yourself to check the mic. Nothing plays until Voice exists.",
    test,
    voiceLaterNote()
  ));

  const profiles = document.createElement("div");
  profiles.className = "settings-radio-list is-disabled";
  [
    ["isolation", "Voice Isolation", "Cut background noise around your voice."],
    ["studio", "Studio", "Open mic with no processing."],
    ["custom", "Custom", "Manual sensitivity and processing."]
  ].forEach((row, index) => {
    const radio = privacyRadio(row[0], index === 2 ? "custom" : "", row[1], row[2], () => {});
    radio.disabled = true;
    profiles.appendChild(radio);
  });
  const profileWrap = document.createElement("div");
  profileWrap.className = "settings-opt";
  const profileText = document.createElement("div");
  profileText.className = "settings-opt-text";
  const profileTitle = document.createElement("div");
  profileTitle.className = "settings-opt-title";
  profileTitle.textContent = "Input Profile";
  profileText.appendChild(profileTitle);
  profileText.appendChild(voiceLaterNote());
  profileWrap.appendChild(profileText);
  host.appendChild(profileWrap);
  host.appendChild(profiles);

  host.appendChild(settingsOpt(
    "Automatically Adjust Input Sensitivity",
    "Controls how loud you need to be before the mic opens.",
    settingsToggle(true, true),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Input Sensitivity",
    "Manual mic gate. Only used if auto-adjust is off.",
    voiceSlider(),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Noise Suppression",
    "Reduce background noise from your mic.",
    voiceDisabledSelect("Off", "off"),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Echo Cancellation",
    "Stop your speakers from feeding back into the mic.",
    settingsToggle(true, true),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Push to Talk",
    "Hold a key to open the mic. The key itself will live under System → Custom Keybinds.",
    settingsToggle(false, true),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Automatic Gain Control",
    "Keep your volume even if you move closer or farther from the mic.",
    settingsToggle(true, true),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Advanced Voice Activity",
    "Finer control over when the mic opens and closes.",
    settingsToggle(false, true),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Bypass System Audio Input Processing",
    "Use the raw mic instead of the OS processing chain.",
    settingsToggle(false, true),
    voiceLaterNote()
  ));
}

function paintCameraSection(host) {
  const test = document.createElement("button");
  test.type = "button";
  test.className = "settings-row-btn";
  test.textContent = "Test Camera";
  test.disabled = true;
  host.appendChild(settingsOpt(
    "Test Camera",
    "Preview the webcam feed. Nothing opens until Voice exists.",
    test,
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Always preview camera",
    "Show a preview whenever you turn the camera on.",
    settingsToggle(false, true),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Camera",
    "Which camera Oneira should use.",
    voiceDisabledSelect("Unavailable until Voice", "none"),
    voiceLaterNote()
  ));
}

function paintVideoSection(host) {
  const test = document.createElement("button");
  test.type = "button";
  test.className = "settings-row-btn";
  test.textContent = "Test Video";
  test.disabled = true;
  host.appendChild(settingsOpt(
    "Test Video",
    "Preview how you look to other people, separate from the camera device list.",
    test,
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Video Quality",
    "How sharp your outgoing video is.",
    voiceDisabledSelect("Auto", "auto"),
    voiceLaterNote()
  ));
  const heading = document.createElement("div");
  heading.className = "settings-opt-title";
  heading.textContent = "Video Background";
  heading.style.margin = "12px 0 8px";
  host.appendChild(heading);
  host.appendChild(settingsNote("Backgrounds aren't built yet. These are layout only.", "later"));
  const grid = document.createElement("div");
  grid.className = "video-bg-grid";
  ["None", "Blur", "Custom"].forEach((label, index) => {
    grid.appendChild(voiceBgTile(label, index === 0));
  });
  host.appendChild(grid);
}

function paintStreamingSection(host) {
  host.appendChild(settingsOpt(
    "Show Stream Previews",
    "Lets others see a preview of your stream before they join.",
    settingsToggle(true, true),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Stream Attenuation",
    "Lower other sounds while someone is streaming.",
    settingsToggle(true, true),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Stream Attenuation Strength",
    "How much to duck other audio during a stream.",
    voiceSlider(),
    voiceLaterNote()
  ));
}

function paintVoiceSoundsSection(host) {
  [
    ["Deafen", "Played when you deafen."],
    ["Undeafen", "Played when you undeafen."],
    ["Mute", "Played when you mute."],
    ["Unmute", "Played when you unmute."],
    ["Camera On", "Played when you turn the camera on."],
    ["Camera Off", "Played when you turn the camera off."],
    ["Voice Disconnected", "Played when you leave a call."]
  ].forEach(row => {
    const desc = document.createElement("div");
    const preview = document.createElement("span");
    preview.className = "settings-inline-link is-static";
    preview.textContent = "Preview Sound";
    desc.appendChild(preview);
    host.appendChild(settingsOpt(row[0], desc, settingsToggle(true, true), settingsNote(row[1] + " " + VOICE_LATER, "later")));
  });
  const related = document.createElement("div");
  related.className = "settings-related-wrap";
  const relatedTitle = document.createElement("h3");
  relatedTitle.className = "settings-subblock-title";
  relatedTitle.textContent = "Related Settings";
  related.appendChild(relatedTitle);
  related.appendChild(settingsRelatedCard(
    "Notifications",
    "Enable/disable sounds for new messages and incoming calls.",
    "notifications-sounds"
  ));
  host.appendChild(related);
}

function paintSoundboardSection(host) {
  host.appendChild(settingsOpt(
    "Soundboard Volume",
    "How loud soundboard clips are for you.",
    voiceSlider(),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Entrance Sounds",
    "A clip that would play when you join a voice channel. We do not have a soundboard yet.",
    voiceDisabledSelect("None", "none"),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Choose a Server",
    "Entrance sounds would be per-server once Voice and soundboard exist.",
    voiceDisabledSelect("All Servers", "all"),
    voiceLaterNote()
  ));
}

function paintVoiceAdvancedSection(host) {
  host.appendChild(settingsOpt(
    "Diagnostic Audio Recording",
    "Would save a short clip of call audio for debugging. Nothing is recorded today.",
    settingsToggle(false, true),
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Debug Logging",
    "Would write voice logs you could send for support.",
    settingsToggle(false, true),
    voiceLaterNote()
  ));
  const upload = document.createElement("button");
  upload.type = "button";
  upload.className = "settings-row-btn";
  upload.textContent = "Upload Logs";
  upload.disabled = true;
  const folder = document.createElement("button");
  folder.type = "button";
  folder.className = "settings-row-btn";
  folder.textContent = "Show Folder";
  folder.disabled = true;
  const logBtns = document.createElement("div");
  logBtns.className = "voice-advanced-actions";
  logBtns.appendChild(upload);
  logBtns.appendChild(folder);
  host.appendChild(settingsOpt(
    "Voice logs",
    "Upload or open diagnostic files once Voice can write them.",
    logBtns,
    voiceLaterNote()
  ));
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "settings-danger-btn";
  reset.textContent = "Reset";
  reset.disabled = true;
  host.appendChild(settingsOpt(
    "Reset all Voice & Video settings",
    "Would return this page to defaults. There is nothing to reset yet.",
    reset,
    voiceLaterNote()
  ));
}

function renderVoiceSettings(pane, jumpChildId) {
  pane.innerHTML = "";
  const block = document.createElement("section");
  block.className = "settings-block has-sections";
  block.id = settingsTargetId("voice-video");
  const title = document.createElement("h2");
  title.className = "settings-block-title";
  title.textContent = "Voice & Video";
  block.appendChild(title);

  const sections = [
    ["voice", "Voice", paintVoiceSection],
    ["camera", "Camera", paintCameraSection],
    ["video", "Video", paintVideoSection],
    ["streaming", "Streaming", paintStreamingSection],
    ["voice-sounds", "Sounds", paintVoiceSoundsSection],
    ["soundboard", "Soundboard", paintSoundboardSection],
    ["voice-advanced", "Advanced", paintVoiceAdvancedSection]
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
