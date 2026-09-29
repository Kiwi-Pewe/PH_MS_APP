let channelSettingsKind = null;
let channelSettingsTarget = null;
let channelSettingsSavedName = "";
let channelSettingsSavedPrivate = false;
let channelSettingsPermRoleId = "members";

const CHANNEL_SETTINGS_GENERAL_IDS = [
  "manage_channels",
  "manage_webhooks",
  "mention_everyone",
  "moderate_channels",
  "bypass_slowmode",
];

const CHANNEL_SETTINGS_PERM_COPY = {
  manage_channels: {
    title: "Manage Channel",
    desc: "Allows changing this channel's name and topic.",
  },
  manage_webhooks: {
    title: "Manage Webhooks",
    desc: "Allows creating, editing, or deleting webhooks for this channel.",
  },
  mention_everyone: {
    title: "Mention @everyone and @here",
    desc: "Allows using @everyone and @here in this channel.",
  },
  moderate_channels: {
    title: "Access moderator view",
    desc: "Allows seeing private replies in this channel.",
  },
  bypass_slowmode: {
    title: "Slowmode exception",
    desc: "Exempt from slowmode in this channel.",
  },
  read_messages: {
    title: "Read messages",
    desc: "Allows reading messages in this channel.",
  },
  send_messages: {
    title: "Send messages",
    desc: "Allows sending messages in this channel.",
  },
  upload_chat_media: {
    title: "Upload media",
    desc: "Allows uploading images and videos in this channel.",
  },
  create_chat_threads: {
    title: "Create threads",
    desc: "Allows creating threads in this channel.",
  },
  reply_chat_threads: {
    title: "Send messages in threads",
    desc: "Allows replying to threads in this channel.",
  },
  private_messages: {
    title: "Send private messages",
    desc: "Allows private replies in this channel.",
  },
  manage_messages: {
    title: "Manage messages",
    desc: "Allows deleting others' messages or pinning messages in this channel.",
  },
  manage_chat_threads: {
    title: "Manage threads",
    desc: "Allows archiving and restoring threads in this channel.",
  },
  view_announcements: {
    title: "View announcements",
    desc: "Allows viewing announcements in this channel.",
  },
  create_announcements: {
    title: "Create and remove announcements",
    desc: "Allows creating and removing announcements in this channel.",
  },
  manage_announcements: {
    title: "Manage announcements",
    desc: "Allows deleting others' announcements or pinning in this channel.",
  },
  read_forums: {
    title: "Read forums",
    desc: "Allows reading topics in this channel.",
  },
  create_topics: {
    title: "Create forum topics",
    desc: "Allows creating topics in this channel.",
  },
  create_topic_replies: {
    title: "Create topic replies",
    desc: "Allows replying to topics in this channel.",
  },
  manage_topics: {
    title: "Manage topics",
    desc: "Allows removing others' topics and replies in this channel.",
  },
  sticky_topics: {
    title: "Sticky topics",
    desc: "Allows stickying a topic in this channel.",
  },
  lock_topics: {
    title: "Lock topics",
    desc: "Allows locking a topic in this channel.",
  },
  view_docs: {
    title: "View docs",
    desc: "Allows viewing docs in this channel.",
  },
  create_docs: {
    title: "Create docs",
    desc: "Allows creating docs in this channel.",
  },
  manage_docs: {
    title: "Manage docs",
    desc: "Allows updating others' docs in this channel.",
  },
  remove_docs: {
    title: "Remove docs",
    desc: "Allows removing others' docs in this channel.",
  },
  see_media: {
    title: "See media",
    desc: "Allows seeing media in this channel.",
  },
  create_media: {
    title: "Create media",
    desc: "Allows adding media in this channel.",
  },
  manage_media: {
    title: "Manage media",
    desc: "Allows editing others' media in this channel.",
  },
  remove_media: {
    title: "Remove media",
    desc: "Allows removing others' media in this channel.",
  },
  hear_voice: {
    title: "Hear voice",
    desc: "Allows listening in this voice channel.",
  },
  talk_voice: {
    title: "Add voice",
    desc: "Allows talking in this voice channel.",
  },
  manage_voice_rooms: {
    title: "Manage Voice Rooms",
    desc: "Allows creating, renaming, and deleting rooms in this voice channel.",
  },
  move_voice: {
    title: "Move members",
    desc: "Allows moving members in this voice channel.",
  },
  broadcast_voice: {
    title: "Broadcast",
    desc: "Allows broadcasting voice in this channel.",
  },
  whisper_voice: {
    title: "Whisper",
    desc: "Allows directing voice to specific users in this channel.",
  },
  priority_speaker: {
    title: "Priority speaker",
    desc: "Allows prioritizing your voice in this channel.",
  },
  voice_activity: {
    title: "Use voice activity",
    desc: "Allows voice activity input in this channel.",
  },
  mute_members: {
    title: "Mute members",
    desc: "Allows muting members in this voice channel.",
  },
  deafen_members: {
    title: "Deafen members",
    desc: "Allows deafening members in this voice channel.",
  },
  voice_messages: {
    title: "Send messages",
    desc: "Allows sending chat messages in this voice channel.",
  },
  view_list: {
    title: "View list items",
    desc: "Allows viewing list items in this channel.",
  },
  create_list: {
    title: "Create list items",
    desc: "Allows creating list items in this channel.",
  },
  manage_list: {
    title: "Manage list item messages",
    desc: "Allows updating others' list items in this channel.",
  },
  remove_list: {
    title: "Remove list items",
    desc: "Allows removing others' list items in this channel.",
  },
  complete_list: {
    title: "Complete list items",
    desc: "Allows completing others' list items in this channel.",
  },
  reorder_list: {
    title: "Reorder list items",
    desc: "Allows reordering list items in this channel.",
  },
  view_events: {
    title: "View events",
    desc: "Allows viewing events in this channel.",
  },
  create_events: {
    title: "Create events",
    desc: "Allows creating events in this channel.",
  },
  manage_events: {
    title: "Manage events",
    desc: "Allows updating others' events in this channel.",
  },
  remove_events: {
    title: "Remove events",
    desc: "Allows removing others' events in this channel.",
  },
  edit_rsvps: {
    title: "Edit RSVPs",
    desc: "Allows editing RSVP status for events in this channel.",
  },
};

function channelSettingsPermGroupIds(kind, channelType) {
  if (kind === "category") {
    return ["general", "chat", "announcements", "forums", "docs", "media", "voice", "lists"];
  }
  const type = String(channelType || "text").toLowerCase();
  if (type === "announcements") return ["general", "announcements"];
  if (type === "forums") return ["general", "forums"];
  if (type === "doc") return ["general", "docs"];
  if (type === "voice") return ["general", "voice"];
  if (type === "media") return ["general", "media"];
  if (type === "lists") return ["general", "lists"];
  if (type === "events") return ["general", "calendar"];
  return ["general", "chat"];
}

function channelSettingsPermGroupKey(title) {
  const t = String(title || "").toLowerCase();
  if (t.startsWith("general")) return "general";
  if (t.startsWith("announcement")) return "announcements";
  if (t.startsWith("chat")) return "chat";
  if (t.startsWith("calendar")) return "calendar";
  if (t.startsWith("forum")) return "forums";
  if (t.startsWith("docs")) return "docs";
  if (t.startsWith("media")) return "media";
  if (t.startsWith("voice")) return "voice";
  if (t.startsWith("list")) return "lists";
  if (t.startsWith("recruitment")) return "recruitment";
  return t.split(" ")[0] || "";
}

function channelSettingsPermRow(row) {
  const copy = CHANNEL_SETTINGS_PERM_COPY[row.id] || {};
  return {
    id: row.id,
    title: copy.title || row.title,
    desc: copy.desc || row.desc,
    later: row.later,
  };
}

function channelSettingsPermGroups() {
  const groups = typeof SERVER_ROLE_PERMS !== "undefined" ? SERVER_ROLE_PERMS : [];
  const wanted = channelSettingsPermGroupIds(
    channelSettingsKind,
    channelSettingsTarget && channelSettingsTarget.channel_type
  );
  return groups.map((group) => {
    const key = channelSettingsPermGroupKey(group.title);
    if (!wanted.includes(key)) return null;
    const sourceRows = key === "general"
      ? (group.rows || []).filter((row) => CHANNEL_SETTINGS_GENERAL_IDS.includes(row.id))
      : (group.rows || []);
    return {
      title: group.title,
      rows: sourceRows.map(channelSettingsPermRow),
    };
  }).filter((group) => group && group.rows && group.rows.length);
}

function channelSettingsRoleChoices() {
  const rows = [{ id: "members", name: "Members", color: "#99aab5" }];
  const source = (typeof serverRolesDraft !== "undefined" && serverRolesDraft && serverRolesDraft.length)
    ? serverRolesDraft
    : ((typeof serverRolesSaved !== "undefined" && serverRolesSaved) || []);
  source.forEach((role) => {
    if (!role || role.id === "members" || role.is_members) return;
    rows.push({
      id: String(role.id),
      name: role.name || "Role",
      color: role.color || "#99aab5",
    });
  });
  return rows;
}

function paintChannelSettingsPermRoles() {
  const host = document.getElementById("channel-settings-perms-role-list");
  if (!host) return;
  const roles = channelSettingsRoleChoices();
  if (!roles.some((row) => String(row.id) === String(channelSettingsPermRoleId))) {
    channelSettingsPermRoleId = roles[0].id;
  }
  host.replaceChildren();
  roles.forEach((role) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "channel-perms-role-row"
      + (String(role.id) === String(channelSettingsPermRoleId) ? " is-active" : "")
      + (role.sample ? " is-sample" : "");
    const swatch = document.createElement("span");
    swatch.className = "channel-perms-role-swatch";
    swatch.style.background = role.color || "#99aab5";
    const name = document.createElement("span");
    name.className = "channel-perms-role-name";
    name.textContent = role.name;
    btn.appendChild(swatch);
    btn.appendChild(name);
    btn.addEventListener("click", () => {
      channelSettingsPermRoleId = role.id;
      paintChannelSettingsPermissions();
    });
    host.appendChild(btn);
  });
}

function paintChannelSettingsPermBody() {
  const host = document.getElementById("channel-settings-perms-body");
  const title = document.getElementById("channel-settings-perms-role-name");
  if (!host) return;
  const roles = channelSettingsRoleChoices();
  const selected = roles.find((row) => String(row.id) === String(channelSettingsPermRoleId)) || roles[0];
  if (title) title.textContent = selected ? selected.name : "Members";
  host.replaceChildren();
  const groups = channelSettingsPermGroups();
  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "placeholder-panel";
    empty.textContent = "No channel permissions to show for this type yet.";
    host.appendChild(empty);
    return;
  }
  groups.forEach((group) => {
    const section = document.createElement("div");
    section.className = "channel-perms-section";
    const heading = document.createElement("div");
    heading.className = "channel-perms-section-title";
    heading.textContent = group.title;
    section.appendChild(heading);
    (group.rows || []).forEach((row) => {
      const line = document.createElement("div");
      line.className = "channel-perms-row" + (row.later ? " is-later" : "");
      const text = document.createElement("div");
      text.className = "channel-perms-row-text";
      const name = document.createElement("div");
      name.className = "channel-perms-row-title";
      name.textContent = row.title;
      const desc = document.createElement("div");
      desc.className = "channel-perms-row-desc";
      desc.textContent = row.later
        ? (row.desc || "") + " Waiting on " + row.later + "."
        : (row.desc || "");
      text.appendChild(name);
      text.appendChild(desc);
      line.appendChild(text);
      if (typeof settingsToggle === "function") {
        line.appendChild(settingsToggle(false, true));
      }
      section.appendChild(line);
    });
    host.appendChild(section);
  });
}

function paintChannelSettingsPermissions() {
  const blurb = document.getElementById("channel-settings-perms-blurb");
  if (blurb) {
    blurb.textContent = channelSettingsKind === "category"
      ? "Choose a role, then set what that role can do across channels in this category. Layout only — overrides are not saved yet."
      : "Choose a role, then set what that role can do in this channel. Layout only — overrides are not saved yet.";
  }
  const sync = document.getElementById("channel-settings-perms-sync");
  if (sync) sync.hidden = channelSettingsKind === "category";
  paintChannelSettingsPermRoles();
  paintChannelSettingsPermBody();
}

function channelSettingsIsOpen() {
  return !!(typeof isChannelSettingsOpen !== "undefined" && isChannelSettingsOpen);
}

function channelSettingsLabel(target, kind) {
  if (!target) return "";
  if (kind === "category") return target.name || "Category";
  if (typeof channelDeleteLabel === "function") return channelDeleteLabel(target);
  return target.name || "Channel";
}

function findChannelSettingsChannel(channelId) {
  if (!currentServerData) return null;
  for (const category of currentServerData.categories || []) {
    const channel = (category.channels || []).find((row) => Number(row.id) === Number(channelId));
    if (channel) return channel;
  }
  return null;
}

function findChannelSettingsCategory(categoryId) {
  if (!currentServerData) return null;
  return (currentServerData.categories || []).find((row) => Number(row.id) === Number(categoryId)) || null;
}

function showChannelSettingsTab(tab) {
  const isCategory = channelSettingsKind === "category";
  if (isCategory && (tab === "invites" || tab === "integrations")) tab = "overview";
  const pages = {
    overview: document.getElementById("channel-settings-overview"),
    permissions: document.getElementById("channel-settings-permissions"),
    invites: document.getElementById("channel-settings-invites"),
    integrations: document.getElementById("channel-settings-integrations"),
  };
  Object.keys(pages).forEach((key) => {
    if (!pages[key]) return;
    pages[key].hidden = key !== tab;
  });
  document.querySelectorAll("#channel-settings-nav .server-settings-nav-item[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
  });
  if (tab === "permissions") paintChannelSettingsPermissions();
}

function paintChannelSettingsShell() {
  const isCategory = channelSettingsKind === "category";
  const label = document.getElementById("channel-settings-index-label");
  if (label) label.textContent = channelSettingsLabel(channelSettingsTarget, channelSettingsKind);
  const nameLabel = document.getElementById("channel-settings-name-label");
  if (nameLabel) nameLabel.textContent = isCategory ? "Category Name" : "Channel Name";
  const deleteBtn = document.getElementById("channel-settings-delete");
  if (deleteBtn) deleteBtn.textContent = isCategory ? "Delete Category" : "Delete Channel";
  const privateHelp = document.getElementById("channel-settings-private-help");
  if (privateHelp) {
    privateHelp.textContent = isCategory
      ? "Only people with Manage Channels can see this category and its channels when it is private."
      : "Only people with Manage Channels can see this channel when it is private.";
  }
  document.querySelectorAll("#channel-settings-nav .is-channel-only").forEach((btn) => {
    btn.hidden = isCategory;
  });
  document.querySelectorAll("#channel-settings-overview .is-channel-only").forEach((el) => {
    el.hidden = isCategory;
  });
}

function setChannelSettingsNameStatus(message) {
  const el = document.getElementById("channel-settings-name-status");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function syncChannelSettingsName(name) {
  channelSettingsSavedName = name || "";
  const input = document.getElementById("channel-settings-name");
  if (input) input.value = channelSettingsSavedName;
  const actions = document.getElementById("channel-settings-name-actions");
  if (actions) actions.hidden = true;
  setChannelSettingsNameStatus("");
}

function paintChannelSettingsPrivate() {
  const host = document.getElementById("channel-settings-private-host");
  if (!host) return;
  host.replaceChildren();
  if (typeof settingsOpt !== "function" || typeof settingsToggle !== "function") {
    const fallback = document.createElement("div");
    fallback.className = "placeholder-panel";
    fallback.textContent = "Private toggle unavailable.";
    host.appendChild(fallback);
    return;
  }
  const toggle = settingsToggle(!!channelSettingsSavedPrivate, false, async (on) => {
    const previous = channelSettingsSavedPrivate;
    channelSettingsSavedPrivate = !!on;
    try {
      await saveChannelSettingsPrivate(!!on);
    } catch (err) {
      channelSettingsSavedPrivate = previous;
      paintChannelSettingsPrivate();
      setChannelSettingsNameStatus(err.message || "Could not save.");
    }
  });
  host.appendChild(settingsOpt(
    "Private " + (channelSettingsKind === "category" ? "Category" : "Channel"),
    "",
    toggle
  ));
}

async function saveChannelSettingsPrivate(isPrivate) {
  if (!channelSettingsTarget) return;
  if (channelSettingsKind === "category") {
    const data = await postChannelSettings("/update_category", {
      category_id: channelSettingsTarget.id,
      is_private: isPrivate,
    });
    applyCategoryUpdated(data.category || { id: channelSettingsTarget.id, is_private: isPrivate, name: channelSettingsTarget.name });
    return;
  }
  const data = await postChannelSettings("/update_channel", {
    channel_id: channelSettingsTarget.id,
    is_private: isPrivate,
  });
  applyChannelUpdated(data.channel || {
    id: channelSettingsTarget.id,
    is_private: isPrivate,
    name: channelSettingsTarget.name,
    category_id: channelSettingsTarget.category_id,
    channel_type: channelSettingsTarget.channel_type,
  });
}

async function postChannelSettings(path, body) {
  const response = await fetch(`https://${serverAddress}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not save.");
  return data;
}

async function saveChannelSettingsName() {
  const input = document.getElementById("channel-settings-name");
  const name = ((input && input.value) || "").trim();
  if (!name) {
    setChannelSettingsNameStatus("Name is required.");
    return;
  }
  if (name === channelSettingsSavedName) {
    syncChannelSettingsName(name);
    return;
  }
  try {
    if (channelSettingsKind === "category") {
      const data = await postChannelSettings("/update_category", {
        category_id: channelSettingsTarget.id,
        name,
      });
      applyCategoryUpdated(data.category || { id: channelSettingsTarget.id, name, is_private: channelSettingsSavedPrivate });
    } else {
      const data = await postChannelSettings("/update_channel", {
        channel_id: channelSettingsTarget.id,
        name,
      });
      applyChannelUpdated(data.channel || {
        id: channelSettingsTarget.id,
        name,
        is_private: channelSettingsSavedPrivate,
        category_id: channelSettingsTarget.category_id,
        channel_type: channelSettingsTarget.channel_type,
      });
    }
    syncChannelSettingsName(name);
    paintChannelSettingsShell();
  } catch (err) {
    setChannelSettingsNameStatus(err.message || "Could not save.");
  }
}

function cancelChannelSettingsName() {
  syncChannelSettingsName(channelSettingsSavedName);
}

function applyChannelUpdated(channel) {
  if (!channel || !currentServerData) return;
  const live = findChannelSettingsChannel(channel.id);
  if (live) {
    if (channel.name != null) live.name = channel.name;
    if (channel.is_private != null) live.is_private = !!channel.is_private;
    if (channel.position != null) live.position = channel.position;
    if (channel.category_id != null) live.category_id = channel.category_id;
  }
  if (channelSettingsKind === "channel" && channelSettingsTarget && Number(channelSettingsTarget.id) === Number(channel.id)) {
    channelSettingsTarget = live || Object.assign({}, channelSettingsTarget, channel);
    channelSettingsSavedName = channelSettingsTarget.name || "";
    channelSettingsSavedPrivate = !!channelSettingsTarget.is_private;
    paintChannelSettingsShell();
    syncChannelSettingsName(channelSettingsSavedName);
  }
  if (currentChannelId && Number(currentChannelId) === Number(channel.id)) {
    currentChannelName = channel.name || currentChannelName;
    const title = document.getElementById("channel-header-title");
    if (title && channel.name) {
      const isVoice = channel.channel_type === "voice";
      const isDoc = channel.channel_type === "doc";
      title.textContent = (isVoice || isDoc) ? channel.name : `#${channel.name}`;
    }
  }
  renderServerSidebar(currentServerData);
}

function applyCategoryUpdated(category) {
  if (!category || !currentServerData) return;
  const live = findChannelSettingsCategory(category.id);
  if (live) {
    if (category.name != null) live.name = category.name;
    if (category.is_private != null) live.is_private = !!category.is_private;
    if (category.position != null) live.position = category.position;
  }
  if (channelSettingsKind === "category" && channelSettingsTarget && Number(channelSettingsTarget.id) === Number(category.id)) {
    channelSettingsTarget = live || Object.assign({}, channelSettingsTarget, category);
    channelSettingsSavedName = channelSettingsTarget.name || "";
    channelSettingsSavedPrivate = !!channelSettingsTarget.is_private;
    paintChannelSettingsShell();
    syncChannelSettingsName(channelSettingsSavedName);
  }
  renderServerSidebar(currentServerData);
}

function openChannelSettings(kind, target) {
  if (typeof canManageChannels === "function" && !canManageChannels()) return;
  if (!target) return;
  if (typeof closeServerSettingsChrome === "function") closeServerSettingsChrome();
  if (typeof closeSettingsChrome === "function") closeSettingsChrome();
  if (typeof closeProfileChrome === "function" && !closeProfileChrome()) return;
  if (typeof closeContextMenu === "function") closeContextMenu();

  channelSettingsKind = kind === "category" ? "category" : "channel";
  channelSettingsTarget = target;
  isChannelSettingsOpen = true;
  paintChannelSettingsShell();
  showChannelSettingsTab("overview");
  syncChannelSettingsName(target.name || "");
  channelSettingsSavedPrivate = !!target.is_private;
  channelSettingsPermRoleId = "members";
  paintChannelSettingsPrivate();
  paintChannelSettingsPermissions();
  const topic = document.getElementById("channel-settings-topic");
  if (topic) topic.value = "";
  const overlay = document.getElementById("channel-settings-overlay");
  if (overlay) overlay.hidden = false;
}

function openChannelSettingsForChannel(channel) {
  openChannelSettings("channel", channel);
}

function openCategorySettings(category) {
  openChannelSettings("category", category);
}

function closeChannelSettingsChrome() {
  isChannelSettingsOpen = false;
  channelSettingsKind = null;
  channelSettingsTarget = null;
  const overlay = document.getElementById("channel-settings-overlay");
  if (overlay) overlay.hidden = true;
  cancelChannelSettingsName();
  setChannelSettingsNameStatus("");
}

document.getElementById("channel-settings-close").addEventListener("click", () => {
  closeChannelSettingsChrome();
});

document.querySelectorAll("#channel-settings-nav .server-settings-nav-item[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.getAttribute("data-tab");
    if (!tab) return;
    showChannelSettingsTab(tab);
  });
});

document.getElementById("channel-settings-name").addEventListener("input", () => {
  const input = document.getElementById("channel-settings-name");
  const actions = document.getElementById("channel-settings-name-actions");
  if (!input || !actions) return;
  actions.hidden = input.value.trim() === channelSettingsSavedName;
  setChannelSettingsNameStatus("");
});

document.getElementById("channel-settings-name-confirm").addEventListener("click", () => {
  saveChannelSettingsName();
});

document.getElementById("channel-settings-name-cancel").addEventListener("click", () => {
  cancelChannelSettingsName();
});

document.getElementById("channel-settings-delete").addEventListener("click", () => {
  if (!channelSettingsTarget) return;
  const kind = channelSettingsKind;
  const target = channelSettingsTarget;
  closeChannelSettingsChrome();
  if (typeof openDeleteConfirm === "function") openDeleteConfirm(kind, target);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!isChannelSettingsOpen) return;
  if (typeof activeMenuEl !== "undefined" && activeMenuEl) return;
  if (document.getElementById("confirm-delete-overlay") && document.getElementById("confirm-delete-overlay").style.display === "flex") return;
  closeChannelSettingsChrome();
});
