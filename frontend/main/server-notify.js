// ==================================================================
// server-notify.js - Personal per-server notification prefs (Mute +
// Notification Settings flyout on server context menus).
// ==================================================================

const serverNotifyPrefsById = {};

const NOTIFY_LEVEL_LABELS = {
  all: "All Messages",
  mentions: "Only @mentions",
  nothing: "Nothing"
};

function notifyLevelLabel(level) {
  return NOTIFY_LEVEL_LABELS[level] || NOTIFY_LEVEL_LABELS.mentions;
}

function cachedServerNotifyPrefs(serverId) {
  return serverNotifyPrefsById[String(serverId)] || null;
}

function rememberServerNotifyPrefs(data) {
  if (!data || !data.server_id) return null;
  const prefs = {
    server_id: data.server_id,
    muted: !!data.muted,
    notify_level: data.notify_level === "all" || data.notify_level === "nothing" ? data.notify_level : "mentions",
    notify_level_label: data.notify_level_label || notifyLevelLabel(data.notify_level),
    suppress_everyone: !!data.suppress_everyone
  };
  serverNotifyPrefsById[String(prefs.server_id)] = prefs;
  return prefs;
}

async function loadServerNotifyPrefs(serverId) {
  if (!serverId) return null;
  try {
    const response = await fetch(
      `https://${serverAddress}/server_notify_prefs/${encodeURIComponent(serverId)}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not load notification settings.");
    return rememberServerNotifyPrefs(data);
  } catch (e) {
    return cachedServerNotifyPrefs(serverId) || {
      server_id: serverId,
      muted: false,
      notify_level: "mentions",
      notify_level_label: notifyLevelLabel("mentions"),
      suppress_everyone: false
    };
  }
}

async function saveServerNotifyPrefs(serverId, patch) {
  const response = await fetch(`https://${serverAddress}/update_server_notify_prefs`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ server_id: serverId }, patch || {}))
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save notification settings.");
  return rememberServerNotifyPrefs(data);
}

function serverIsNotifyMuted(serverId) {
  const prefs = cachedServerNotifyPrefs(serverId);
  return !!(prefs && prefs.muted);
}

function buildServerNotifySubmenu(serverId, prefs) {
  const level = (prefs && prefs.notify_level) || "mentions";
  const suppress = !!(prefs && prefs.suppress_everyone);
  return [
    {
      type: "radio",
      label: "All Messages",
      checked: level === "all",
      onSelect: () => {
        saveServerNotifyPrefs(serverId, { notify_level: "all" }).catch(() => {});
      }
    },
    {
      type: "radio",
      label: "Only @mentions",
      checked: level === "mentions",
      onSelect: () => {
        saveServerNotifyPrefs(serverId, { notify_level: "mentions" }).catch(() => {});
      }
    },
    {
      type: "radio",
      label: "Nothing",
      checked: level === "nothing",
      onSelect: () => {
        saveServerNotifyPrefs(serverId, { notify_level: "nothing" }).catch(() => {});
      }
    },
    { separator: true },
    {
      type: "check",
      label: "Suppress @everyone and @here",
      checked: suppress,
      onSelect: (row) => {
        saveServerNotifyPrefs(serverId, { suppress_everyone: !!row.checked }).catch(() => {});
      }
    },
    {
      type: "check",
      label: "Suppress All Role @mentions",
      checked: false,
      disabled: true
    },
    {
      type: "check",
      label: "Suppress Highlights",
      checked: false,
      disabled: true
    },
    {
      type: "check",
      label: "Mute New Events",
      checked: false,
      disabled: true
    },
    { separator: true },
    {
      type: "check",
      label: "Mobile Push Notifications",
      checked: true,
      disabled: true
    }
  ];
}
