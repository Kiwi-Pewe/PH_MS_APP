// ==================================================================
// settings-voice.js - Voice & Video. Mic, output, levels, and input
// processing are live. Camera, streaming, sounds, and logs stay grey.
// ==================================================================

function voiceLaterNote(subject) {
  return settingsLaterNote(subject || "Voice");
}

function voiceDisabledSelect(label, selected) {
  return settingsSelect([{ value: selected, label }], selected, true);
}

function voiceLiveSlider(value, onInput) {
  const input = document.createElement("input");
  input.type = "range";
  input.className = "settings-slider";
  input.min = "0";
  input.max = "100";
  input.value = String(value);
  input.addEventListener("input", () => onInput(Number(input.value)));
  return input;
}

function voiceProcessToggle(key) {
  const on = typeof voiceProcess === "function" ? voiceProcess(key) : true;
  const label = settingsToggle(on, false);
  const input = label.querySelector("input");
  input.addEventListener("change", () => {
    localStorage.setItem(key, input.checked ? "1" : "0");
    if (typeof retargetVoiceMic === "function") retargetVoiceMic();
  });
  return label;
}

function paintVoiceSection(host) {
  const mic = settingsSelect([{ value: "", label: "Default" }], localStorage.getItem("oneira-voice-mic") || "", false);
  mic.id = "voice-mic-select";
  mic.addEventListener("change", () => {
    localStorage.setItem("oneira-voice-mic", mic.value);
    if (typeof retargetVoiceMic === "function") retargetVoiceMic();
  });
  host.appendChild(settingsOpt(
    "Microphone",
    "Which mic Oneira should use in a call.",
    mic
  ));
  const speaker = settingsSelect([{ value: "", label: "Default" }], localStorage.getItem("oneira-voice-speaker") || "", false);
  speaker.id = "voice-speaker-select";
  speaker.addEventListener("change", () => {
    localStorage.setItem("oneira-voice-speaker", speaker.value);
    if (typeof retargetVoiceSpeaker === "function") retargetVoiceSpeaker();
  });
  host.appendChild(settingsOpt(
    "Speaker",
    "Which output Oneira should use in a call.",
    speaker
  ));
  if (typeof refreshVoiceDevices === "function") refreshVoiceDevices();
  const micVolume = typeof voicePercent === "function" ? voicePercent("oneira-voice-mic-volume", 100) : 100;
  host.appendChild(settingsOpt(
    "Microphone Volume",
    "How loud you sound to other people.",
    voiceLiveSlider(micVolume, (value) => {
      localStorage.setItem("oneira-voice-mic-volume", String(value));
      if (typeof applyVoiceMicGain === "function") applyVoiceMicGain();
    })
  ));
  const speakerVolume = typeof voicePercent === "function" ? voicePercent("oneira-voice-speaker-volume", 100) : 100;
  host.appendChild(settingsOpt(
    "Speaker Volume",
    "How loud other people sound to you.",
    voiceLiveSlider(speakerVolume, (value) => {
      localStorage.setItem("oneira-voice-speaker-volume", String(value));
      if (typeof applyVoicePlayback === "function") applyVoicePlayback();
    })
  ));
  const test = document.createElement("button");
  test.type = "button";
  test.className = "settings-row-btn";
  test.id = "voice-mic-test";
  test.textContent = "Mic Test";
  test.addEventListener("click", () => {
    if (typeof toggleVoiceMicTest === "function") toggleVoiceMicTest();
  });
  host.appendChild(settingsOpt(
    "Mic Test",
    "Play your microphone through the selected output.",
    test
  ));

  const autoSensitivity = typeof voiceSensitivityAuto === "function" ? voiceSensitivityAuto() : true;
  const sensitivity = voiceLiveSlider(typeof voicePercent === "function" ? voicePercent("oneira-voice-sensitivity", 73) : 73, (value) => {
    localStorage.setItem("oneira-voice-sensitivity", String(value));
  });
  sensitivity.disabled = autoSensitivity;
  host.appendChild(settingsOpt(
    "Automatically Adjust Input Sensitivity",
    "Decides how loud you need to be before you show as talking.",
    settingsToggle(autoSensitivity, false, (on) => {
      localStorage.setItem("oneira-voice-sensitivity-auto", on ? "1" : "0");
      sensitivity.disabled = on;
    })
  ));
  host.appendChild(settingsOpt(
    "Input Sensitivity",
    "How loud you need to be before you show as talking. Higher picks up quieter speech.",
    sensitivity
  ));
  host.appendChild(settingsOpt(
    "Echo Cancellation",
    "Stop your speakers from feeding back into the mic.",
    voiceProcessToggle("oneira-voice-echo")
  ));
  host.appendChild(settingsOpt(
    "Noise Suppression",
    "Reduce background noise from your mic.",
    voiceProcessToggle("oneira-voice-noise")
  ));
  host.appendChild(settingsOpt(
    "Push to Talk",
    "Hold a key to open the mic. The key itself lives under System → Custom Keybinds.",
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
    "Preview the webcam feed.",
    test,
    voiceLaterNote()
  ));
  host.appendChild(settingsOpt(
    "Camera",
    "Which camera Oneira should use.",
    voiceDisabledSelect("Default", "none"),
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
}

function paintStreamingSection(host) {
  host.appendChild(settingsOpt(
    "Show Stream Previews",
    "Lets others see a preview of your stream before they join.",
    settingsToggle(true, true),
    voiceLaterNote()
  ));
}

function paintVoiceAdvancedSection(host) {
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "settings-danger-btn";
  reset.textContent = "Reset";
  reset.addEventListener("click", () => {
    if (typeof resetVoiceSettings === "function") resetVoiceSettings();
    const pane = host.closest("#settings-general-pane, #settings-user-pane");
    if (pane && typeof renderVoiceSettings === "function") {
      const top = pane.scrollTop;
      renderVoiceSettings(pane);
      pane.scrollTop = top;
    }
  });
  host.appendChild(settingsOpt(
    "Reset Voice settings",
    "Return the microphone, output, and input processing to defaults.",
    reset
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
