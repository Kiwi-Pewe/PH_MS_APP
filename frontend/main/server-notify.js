const serverNotifyPrefsById = {};
const channelNotifyByServer = {};

const NOTIFY_LEVEL_LABELS = {
  all: "All Messages",
  mentions: "Only @mentions",
  nothing: "Nothing"
};

const NOTIFY_RANK = { nothing: 0, mentions: 1, all: 2 };

function notifyLevelLabel(level) {
  return NOTIFY_LEVEL_LABELS[level] || NOTIFY_LEVEL_LABELS.mentions;
}

function cleanNotifyLevel(level) {
  return level === "all" || level === "mentions" || level === "nothing" ? level : "";
}

function cachedServerNotifyPrefs(serverId) {
  return serverNotifyPrefsById[String(serverId)] || null;
}

function channelNotifyReady(serverId) {
  return Object.prototype.hasOwnProperty.call(channelNotifyByServer, String(serverId));
}

function cachedChannelNotifyPrefs(serverId, channelId) {
  const map = channelNotifyByServer[String(serverId)];
  if (!map) return null;
  return map[String(channelId)] || null;
}

function rememberServerNotifyPrefs(data) {
  if (!data || !data.server_id) return null;
  const level = cleanNotifyLevel(data.notify_level) || "all";
  const prefs = {
    server_id: data.server_id,
    muted: !!data.muted,
    suppress_pings: !!data.suppress_pings,
    suppress_roles: !!data.suppress_roles,
    mute_events: !!data.mute_events,
    notify_level: level,
    notify_level_label: data.notify_level_label || notifyLevelLabel(level)
  };
  serverNotifyPrefsById[String(prefs.server_id)] = prefs;
  return prefs;
}

function rememberChannelNotifyList(serverId, rows) {
  const map = {};
  (rows || []).forEach((row) => {
    if (!row || row.channel_id == null) return;
    map[String(row.channel_id)] = {
      server_id: row.server_id || serverId,
      channel_id: row.channel_id,
      muted: !!row.muted,
      suppress_pings: !!row.suppress_pings,
      suppress_roles: !!row.suppress_roles,
      mute_events: !!row.mute_events,
      notify_level: cleanNotifyLevel(row.notify_level)
    };
  });
  channelNotifyByServer[String(serverId)] = map;
}

function rememberNotifyBundle(bundle, servers) {
  (bundle && bundle.servers || []).forEach((row) => rememberServerNotifyPrefs(row));
  const byServer = {};
  (bundle && bundle.channels || []).forEach((row) => {
    if (!row || row.server_id == null) return;
    const key = String(row.server_id);
    if (!byServer[key]) byServer[key] = [];
    byServer[key].push(row);
  });
  Object.keys(byServer).forEach((serverId) => rememberChannelNotifyList(serverId, byServer[serverId]));
  (servers || []).forEach((server) => {
    if (server && server.id && !channelNotifyReady(server.id)) rememberChannelNotifyList(server.id, []);
  });
}

function rememberChannelNotifyPrefs(serverId, data) {
  if (!data || data.channel_id == null) return null;
  const key = String(serverId);
  if (!channelNotifyByServer[key]) channelNotifyByServer[key] = {};
  const prefs = {
    server_id: data.server_id || serverId,
    channel_id: data.channel_id,
    muted: !!data.muted,
    suppress_pings: !!data.suppress_pings,
    suppress_roles: !!data.suppress_roles,
    mute_events: !!data.mute_events,
    notify_level: cleanNotifyLevel(data.notify_level)
  };
  channelNotifyByServer[key][String(data.channel_id)] = prefs;
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
      suppress_pings: false,
      notify_level: "all",
      notify_level_label: notifyLevelLabel("all")
    };
  }
}

async function loadChannelNotifyPrefs(serverId) {
  if (!serverId) return [];
  try {
    const response = await fetch(
      `https://${serverAddress}/channel_notify_prefs/${encodeURIComponent(serverId)}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not load notification settings.");
    rememberChannelNotifyList(serverId, data.channels || []);
    return data.channels || [];
  } catch (e) {
    if (!channelNotifyReady(serverId)) rememberChannelNotifyList(serverId, []);
    return [];
  }
}

async function refreshNotifyNotices(serverId) {
  if (!serverId || typeof serverAddress === "undefined" || !serverAddress) return;
  const openHere = typeof currentServerId !== "undefined" && String(currentServerId) === String(serverId) && typeof currentServerData !== "undefined" && currentServerData;
  if (openHere) {
    try {
      const response = await fetch(`https://${serverAddress}/get_server_contents/${encodeURIComponent(serverId)}`, { credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const byId = {};
        (data.categories || []).forEach((category) => {
          (category.channels || []).forEach((channel) => {
            byId[String(channel.id)] = channel;
          });
        });
        (currentServerData.categories || []).forEach((category) => {
          (category.channels || []).forEach((channel) => {
            const next = byId[String(channel.id)];
            if (!next) return;
            channel.unread = !!next.unread;
            channel.mention_count = next.mention_count || 0;
          });
        });
        if (typeof recountServerNotices === "function") recountServerNotices(serverId);
      }
    } catch (e) {}
  } else {
    try {
      const response = await fetch(`https://${serverAddress}/get_servers`, { credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && typeof serverList !== "undefined") {
        const next = (data.servers || []).find((row) => row && String(row.id) === String(serverId));
        const current = (serverList || []).find((row) => row && String(row.id) === String(serverId));
        if (current && next) {
          current.unread = !!next.unread;
          current.mention_count = next.mention_count || 0;
        }
      }
    } catch (e) {}
  }
  if (typeof paintServerNotices === "function") paintServerNotices();
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
  const prefs = rememberServerNotifyPrefs(data);
  refreshNotifyNotices(serverId).catch(() => {});
  return prefs;
}

function categoryNotifyChannels(category) {
  return (category && Array.isArray(category.channels)) ? category.channels.filter((channel) => channel && channel.id != null) : [];
}

async function saveCategoryNotifyPrefs(serverId, category, patch) {
  const channels = categoryNotifyChannels(category);
  let last = null;
  for (let i = 0; i < channels.length; i += 1) {
    last = await saveChannelNotifyPrefs(serverId, channels[i].id, patch);
  }
  return last;
}

async function saveChannelNotifyPrefs(serverId, channelId, patch) {
  const response = await fetch(`https://${serverAddress}/update_channel_notify_prefs`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ channel_id: channelId }, patch || {}))
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save notification settings.");
  const prefs = rememberChannelNotifyPrefs(serverId, data);
  refreshNotifyNotices(serverId).catch(() => {});
  return prefs;
}

function serverIsNotifyMuted(serverId) {
  const prefs = cachedServerNotifyPrefs(serverId);
  return !!(prefs && prefs.muted);
}

function notifyDecision(serverId, channelId, mentioned) {
  const server = cachedServerNotifyPrefs(serverId);
  const channel = channelNotifyReady(serverId) ? cachedChannelNotifyPrefs(serverId, channelId) : null;
  let level = cleanNotifyLevel(server && server.notify_level) || "all";
  const channelLevel = channel ? cleanNotifyLevel(channel.notify_level) : "";
  if (channelLevel && NOTIFY_RANK[channelLevel] < NOTIFY_RANK[level]) level = channelLevel;
  const muted = !!(server && server.muted) || !!(channel && channel.muted);
  if (muted && level === "all") level = "mentions";
  if (mentioned) {
    if (level === "nothing") return { unread: false, mention: false };
    return { unread: true, mention: true };
  }
  if (level === "all") return { unread: true, mention: false };
  return { unread: false, mention: false };
}

function buildNotifyLevelRows(level, onPick, loudest) {
  const cap = cleanNotifyLevel(loudest) || "all";
  return ["all", "mentions", "nothing"].map((kind) => ({
    type: "radio",
    label: NOTIFY_LEVEL_LABELS[kind],
    checked: level === kind,
    disabled: NOTIFY_RANK[kind] > NOTIFY_RANK[cap],
    onSelect: () => {
      onPick(kind).catch(() => {});
    }
  }));
}

function buildServerNotifySubmenu(serverId, prefs) {
  const level = cleanNotifyLevel(prefs && prefs.notify_level) || "all";
  const suppress = !!(prefs && prefs.suppress_pings);
  return buildNotifyLevelRows(level, (kind) => saveServerNotifyPrefs(serverId, { notify_level: kind }), "all").concat([
    { separator: true },
    {
      type: "check",
      label: "Suppress @everyone and @here",
      checked: suppress,
      onSelect: (row) => {
        saveServerNotifyPrefs(serverId, { suppress_pings: !!row.checked }).catch(() => {});
      }
    },
    {
      type: "check",
      label: "Suppress All Role @mentions",
      checked: !!(prefs && prefs.suppress_roles),
      onSelect: (row) => {
        saveServerNotifyPrefs(serverId, { suppress_roles: !!row.checked }).catch(() => {});
      }
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
      checked: !!(prefs && prefs.mute_events),
      onSelect: (row) => {
        saveServerNotifyPrefs(serverId, { mute_events: !!row.checked }).catch(() => {});
      }
    },
    { separator: true },
    {
      type: "check",
      label: "Mobile Push Notifications",
      checked: true,
      disabled: true
    }
  ]);
}

const NOTIFY_FLAG_ROWS = [
  ["suppress_pings", "Suppress @everyone and @here"],
  ["suppress_roles", "Suppress All Role @mentions"],
  ["mute_events", "Mute New Events"]
];

function notifyFlagRows(serverPrefs, flagState, onSave) {
  const rows = [];
  NOTIFY_FLAG_ROWS.forEach(([key, label]) => {
    const serverOn = !!(serverPrefs && serverPrefs[key]);
    rows.push({
      type: "check",
      label,
      checked: serverOn || !!flagState[key],
      disabled: serverOn,
      onSelect: (row) => {
        const patch = {};
        patch[key] = !!row.checked;
        onSave(patch).catch(() => {});
      }
    });
    if (key === "suppress_roles") {
      rows.push({ type: "check", label: "Suppress Highlights", checked: false, disabled: true });
    }
  });
  return rows;
}

function categorySharedNotify(serverId, category, serverPrefs) {
  const serverLevel = cleanNotifyLevel(serverPrefs && serverPrefs.notify_level) || "all";
  const channels = categoryNotifyChannels(category);
  const flags = {};
  NOTIFY_FLAG_ROWS.forEach(([key]) => {
    flags[key] = channels.length > 0 && channels.every((channel) => {
      const prefs = cachedChannelNotifyPrefs(serverId, channel.id);
      return !!(prefs && prefs[key]);
    });
  });
  if (!channels.length) return { serverLevel, level: serverLevel, flags };
  const levels = channels.map((channel) => {
    const prefs = cachedChannelNotifyPrefs(serverId, channel.id);
    return (prefs && cleanNotifyLevel(prefs.notify_level)) || serverLevel;
  });
  const level = levels.every((row) => row === levels[0]) ? levels[0] : "";
  return { serverLevel, level, flags };
}

function buildCategoryNotifySubmenu(serverId, category, serverPrefs) {
  const shared = categorySharedNotify(serverId, category, serverPrefs);
  return buildNotifyLevelRows(shared.level, (kind) => saveCategoryNotifyPrefs(serverId, category, { notify_level: kind }), shared.serverLevel).concat(
    [{ separator: true }],
    notifyFlagRows(serverPrefs, shared.flags, (patch) => saveCategoryNotifyPrefs(serverId, category, patch)),
    [
      { separator: true },
      {
        type: "check",
        label: "Mobile Push Notifications",
        checked: true,
        disabled: true
      }
    ]
  );
}

function buildChannelNotifySubmenu(serverId, channelId, channelPrefs, serverPrefs) {
  const serverLevel = cleanNotifyLevel(serverPrefs && serverPrefs.notify_level) || "all";
  const ownLevel = channelPrefs ? cleanNotifyLevel(channelPrefs.notify_level) : "";
  const level = ownLevel || serverLevel;
  return buildNotifyLevelRows(level, (kind) => saveChannelNotifyPrefs(serverId, channelId, { notify_level: kind }), serverLevel).concat(
    [{ separator: true }],
    notifyFlagRows(serverPrefs, channelPrefs || {}, (patch) => saveChannelNotifyPrefs(serverId, channelId, patch)),
    [
      { separator: true },
      {
        type: "check",
        label: "Mobile Push Notifications",
        checked: true,
        disabled: true
      }
    ]
  );
}
