const FEED_PREF_GROUPS = [
  {
    family: "activity",
    label: "Activity",
    kinds: [
      { type: "reaction", label: "Reactions" },
      { type: "reply", label: "Replies" },
      { type: "post_comment", label: "Post comments" },
    ],
  },
  {
    family: "profile",
    label: "Profile",
    kinds: [
      { type: "widget_comment", label: "Profile comments" },
      { type: "friend_accept", label: "Friend request accepted" },
      { type: "friend_deny", label: "Friend request declined" },
    ],
  },
  {
    family: "moderation",
    label: "Moderation",
    kinds: [
      { type: "kick", label: "Removed from server" },
      { type: "ban", label: "Banned from server" },
      { type: "timeout", label: "Timed out" },
    ],
  },
  {
    family: "feedback",
    label: "Feedback",
    kinds: [
      { type: "feedback_status", label: "Feedback updates" },
      { type: "report_status", label: "Report updates" },
    ],
  },
];

let feedAlertPrefsCache = null;
let feedPrefsSaving = false;

function feedAlertPrefsUrl(path) {
  return `https://${serverAddress}${path}`;
}

function defaultFeedAlertPrefs() {
  const prefs = {};
  FEED_PREF_GROUPS.forEach((group) => {
    group.kinds.forEach((kind) => { prefs[kind.type] = true; });
  });
  return prefs;
}

function normalizeFeedAlertPrefs(raw) {
  const prefs = defaultFeedAlertPrefs();
  const data = raw && typeof raw === "object" ? raw : {};
  Object.keys(prefs).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(data, key)) prefs[key] = !!data[key];
  });
  return prefs;
}

function feedAlertTypeEnabled(alertType) {
  const kind = String(alertType || "").toLowerCase();
  const prefs = feedAlertPrefsCache || defaultFeedAlertPrefs();
  if (!Object.prototype.hasOwnProperty.call(prefs, kind)) return true;
  return !!prefs[kind];
}

async function loadFeedAlertPrefs() {
  const response = await fetch(feedAlertPrefsUrl("/feed_alert_prefs"), { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not load Feed settings.");
  feedAlertPrefsCache = normalizeFeedAlertPrefs(data.prefs);
  return feedAlertPrefsCache;
}

async function saveFeedAlertPrefs(prefs) {
  const response = await fetch(feedAlertPrefsUrl("/feed_alert_prefs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ prefs: normalizeFeedAlertPrefs(prefs) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not save Feed settings.");
  feedAlertPrefsCache = normalizeFeedAlertPrefs(data.prefs);
  return feedAlertPrefsCache;
}

function closeFeedAlertPrefsSubmenu() {
  const overlay = document.getElementById("feed-alert-prefs-overlay");
  if (overlay) overlay.hidden = true;
  const err = document.getElementById("feed-alert-prefs-error");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
}

function paintFeedAlertPrefsBody(prefs) {
  const body = document.getElementById("feed-alert-prefs-body");
  if (!body) return;
  body.replaceChildren();
  FEED_PREF_GROUPS.forEach((group) => {
    const section = document.createElement("div");
    section.className = "feed-prefs-section";
    const heading = document.createElement("div");
    heading.className = "feed-prefs-section-title";
    heading.textContent = group.label;
    section.appendChild(heading);
    group.kinds.forEach((kind) => {
      const row = document.createElement("div");
      row.className = "feed-prefs-row";
      const label = document.createElement("div");
      label.className = "feed-prefs-row-title";
      label.textContent = kind.label;
      const toggle = typeof settingsToggle === "function"
        ? settingsToggle(!!prefs[kind.type], false, async (on) => {
          const previous = !!prefs[kind.type];
          prefs[kind.type] = on;
          const err = document.getElementById("feed-alert-prefs-error");
          if (err) {
            err.hidden = true;
            err.textContent = "";
          }
          if (feedPrefsSaving) return;
          feedPrefsSaving = true;
          try {
            await saveFeedAlertPrefs(prefs);
            if (typeof applyFeedAlertPrefsLocally === "function") applyFeedAlertPrefsLocally();
          } catch (e) {
            prefs[kind.type] = previous;
            const input = toggle.querySelector("input");
            if (input) input.checked = previous;
            if (err) {
              err.hidden = false;
              err.textContent = e.message || "Could not save.";
            }
          } finally {
            feedPrefsSaving = false;
          }
        })
        : document.createElement("div");
      row.appendChild(label);
      row.appendChild(toggle);
      section.appendChild(row);
    });
    body.appendChild(section);
  });
}

async function openFeedAlertPrefsSubmenu() {
  const overlay = document.getElementById("feed-alert-prefs-overlay");
  const err = document.getElementById("feed-alert-prefs-error");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  let prefs = defaultFeedAlertPrefs();
  try {
    prefs = await loadFeedAlertPrefs();
  } catch (e) {
    if (err) {
      err.hidden = false;
      err.textContent = e.message || "Could not load Feed settings.";
    }
  }
  paintFeedAlertPrefsBody(prefs);
  if (overlay) overlay.hidden = false;
}

function wireFeedAlertPrefsSubmenu() {
  const closeBtn = document.getElementById("feed-alert-prefs-close");
  const doneBtn = document.getElementById("feed-alert-prefs-done");
  const overlay = document.getElementById("feed-alert-prefs-overlay");
  if (closeBtn) closeBtn.addEventListener("click", () => closeFeedAlertPrefsSubmenu());
  if (doneBtn) doneBtn.addEventListener("click", () => closeFeedAlertPrefsSubmenu());
  if (overlay) {
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) closeFeedAlertPrefsSubmenu();
    });
  }
}

wireFeedAlertPrefsSubmenu();
