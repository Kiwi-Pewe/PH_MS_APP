// ==================================================================
// settings-language.js - Language & Time. English, US is the only
// language until translations exist. Time format saves and applies
// to chat, posts, and comments via formatClusterTime.
// ==================================================================

function languageTimeSettingsUrl(path) {
  return `https://${serverAddress}${path}`;
}

async function loadLanguageTimeSettings() {
  const response = await fetch(languageTimeSettingsUrl("/language_time_settings"), { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not load language settings.");
  return data;
}

async function saveLanguageTimeSettings(next) {
  const response = await fetch(languageTimeSettingsUrl("/language_time_settings"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(next)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not save language settings.");
  applyLanguageTime(data);
  return data;
}

function paintLanguageSection(host, info, persist) {
  host.appendChild(settingsOpt(
    "Select a Language",
    "Choose the language you want Oneira to display.",
    null
  ));
  const pick = document.createElement("div");
  pick.className = "settings-language-pick";
  const flag = document.createElement("span");
  flag.className = "settings-language-flag";
  flag.textContent = "\u{1F1FA}\u{1F1F8}";
  const select = settingsSelect(
    [{ value: "en-US", label: "English, US" }],
    info.language || "en-US",
    false
  );
  select.classList.add("settings-language-select");
  select.addEventListener("change", () => persist({ language: select.value }));
  pick.appendChild(flag);
  pick.appendChild(select);
  host.appendChild(pick);
  host.appendChild(settingsNote("More languages wait on translations.", "later"));
}

function paintTimeFormatSection(host, info, persist) {
  const title = document.createElement("div");
  title.className = "settings-opt-title";
  title.textContent = "Time format";
  host.appendChild(title);
  const list = document.createElement("div");
  list.className = "settings-radio-list";
  [
    ["auto", "Auto"],
    ["12", "12-hour"],
    ["24", "24-hour"]
  ].forEach(row => {
    list.appendChild(privacyRadio(row[0], info.time_format || "auto", row[1], "", (value) => persist({ time_format: value })));
  });
  host.appendChild(list);
}

async function renderLanguageTimeSettings(pane, jumpChildId) {
  pane.innerHTML = "";
  let info;
  try {
    info = await loadLanguageTimeSettings();
  } catch (e) {
    const note = document.createElement("div");
    note.className = "placeholder-panel";
    note.textContent = e.message || "Could not load language settings.";
    pane.appendChild(note);
    return;
  }
  applyLanguageTime(info);

  const block = document.createElement("section");
  block.className = "settings-block has-sections";
  block.id = settingsTargetId("language-time");
  const heading = document.createElement("h2");
  heading.className = "settings-block-title";
  heading.textContent = "Language & Time";
  block.appendChild(heading);

  const persist = async (patch) => {
    const next = Object.assign({}, info, patch);
    applyLanguageTime(next);
    try { info = await saveLanguageTimeSettings(next); }
    catch (e) { applyLanguageTime(info); }
  };

  const sections = [
    ["language", "Language", paintLanguageSection],
    ["time-format", "Time Format", paintTimeFormatSection]
  ];
  sections.forEach(row => {
    const sub = document.createElement("div");
    sub.className = "settings-subblock";
    sub.id = settingsTargetId(row[0]);
    row[2](sub, info, persist);
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
