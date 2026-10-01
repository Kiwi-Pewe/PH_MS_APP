let channelSettingsKind = null;
let channelSettingsTarget = null;
let channelSettingsSavedName = "";
let channelSettingsSavedTopic = "";
let channelSettingsSavedPrivate = false;
let channelSettingsSavedSlowmode = 0;
let channelSettingsForumSettings = { guidelines: "", require_tags: false, default_reaction: "", tags: [] };
let channelSettingsSavedGuidelines = "";
let channelSettingsForumReactionPick = null;
let channelSettingsPermRoleId = "members";
let channelSettingsPermDisplay = {};
let channelSettingsPermLive = [
  "manage_channels", "mention_everyone", "bypass_slowmode",
  "read_messages", "send_messages", "upload_chat_media", "manage_messages", "pin_messages",
  "view_announcements", "create_announcements", "manage_announcements",
  "read_forums", "create_topics", "create_topic_replies", "manage_topics",
  "sticky_topics", "lock_topics",
  "view_docs", "create_docs", "manage_docs", "remove_docs",
  "view_events", "create_events", "manage_events", "remove_events",
];
let channelSettingsPermLoading = false;
let channelSettingsPermSaving = {};

const CHANNEL_SETTINGS_GENERAL_IDS = [
  "manage_channels",
  "manage_webhooks",
  "mention_everyone",
  "moderate_channels",
  "bypass_slowmode",
];

const CHANNEL_SETTINGS_LIVE_DEFAULTS = {
  mention_everyone: true,
  read_messages: true,
  send_messages: true,
  upload_chat_media: true,
  pin_messages: true,
  view_announcements: true,
  read_forums: true,
  create_topics: true,
  create_topic_replies: true,
  view_docs: true,
};
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
    desc: "Allows deleting others' messages in this channel.",
  },
  pin_messages: {
    title: "Pin messages",
    desc: "Allows pinning and unpinning messages in this channel.",
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
    title: "View wallpaper",
    desc: "Allows viewing this wallpaper channel.",
  },
  create_docs: {
    title: "Create wallpaper",
    desc: "Allows creating wallpaper pages in this channel.",
  },
  manage_docs: {
    title: "Manage wallpaper",
    desc: "Allows updating others' wallpaper pages in this channel.",
  },
  remove_docs: {
    title: "Remove wallpaper",
    desc: "Allows removing others' wallpaper pages in this channel.",
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
  if (t.startsWith("docs") || t.startsWith("wallpaper")) return "docs";
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
  const type = String(channelSettingsTarget && channelSettingsTarget.channel_type || "text").toLowerCase();
  const needPinInject = type === "announcements" || type === "forums";
  return groups.map((group) => {
    const key = channelSettingsPermGroupKey(group.title);
    if (!wanted.includes(key)) return null;
    const sourceRows = key === "general"
      ? (group.rows || []).filter((row) => CHANNEL_SETTINGS_GENERAL_IDS.includes(row.id))
      : (group.rows || []).slice();
    if (needPinInject && (key === "announcements" || key === "forums")) {
      if (!sourceRows.some((row) => row.id === "pin_messages")) {
        sourceRows.push({
          id: "pin_messages",
          title: "Pin messages",
          desc: "Allows pinning and unpinning messages in this channel.",
        });
      }
    }
    return {
      title: group.title,
      rows: sourceRows.map(channelSettingsPermRow),
    };
  }).filter((group) => group && group.rows && group.rows.length);
}

function channelSettingsRoleChoices() {
  const source = (typeof serverRolesDraft !== "undefined" && serverRolesDraft && serverRolesDraft.length)
    ? serverRolesDraft
    : ((typeof serverRolesSaved !== "undefined" && serverRolesSaved) || []);
  const rows = [];
  let members = null;
  source.forEach((role) => {
    if (!role) return;
    const row = {
      id: String(role.id),
      name: role.name || (role.builtin ? "Members" : "Role"),
      color: role.color || "#99aab5",
      builtin: !!role.builtin,
      perms: role.perms || {},
    };
    if (role.builtin || role.id === "members" || role.is_members) {
      members = row;
      return;
    }
    rows.push(row);
  });
  if (members) rows.unshift(members);
  else {
    rows.unshift({
      id: "members",
      name: "Members",
      color: "#99aab5",
      builtin: true,
      perms: Object.assign({}, CHANNEL_SETTINGS_LIVE_DEFAULTS),
    });
  }
  return rows;
}

function channelSettingsRoleDisplayId(role) {
  return String(role && role.id != null ? role.id : channelSettingsPermRoleId);
}

function channelSettingsPermValue(roleId, permId) {
  const key = String(roleId);
  const display = channelSettingsPermDisplay[key];
  if (display && Object.prototype.hasOwnProperty.call(display, permId)) {
    return !!display[permId];
  }
  const roles = channelSettingsRoleChoices();
  const role = roles.find((row) => String(row.id) === key);
  if (role && role.perms && Object.prototype.hasOwnProperty.call(role.perms, permId)) {
    return !!role.perms[permId];
  }
  if (Object.prototype.hasOwnProperty.call(CHANNEL_SETTINGS_LIVE_DEFAULTS, permId)) {
    return !!CHANNEL_SETTINGS_LIVE_DEFAULTS[permId];
  }
  return false;
}

function channelSettingsPermIsLive(permId) {
  return channelSettingsKind === "channel" && channelSettingsPermLive.indexOf(permId) !== -1;
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
      + (String(role.id) === String(channelSettingsPermRoleId) ? " is-active" : "");
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
  if (channelSettingsPermLoading) {
    const loading = document.createElement("div");
    loading.className = "placeholder-panel";
    loading.textContent = "Loading permissions…";
    host.appendChild(loading);
    return;
  }
  const groups = channelSettingsPermGroups();
  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "placeholder-panel";
    empty.textContent = "No channel permissions to show for this type yet.";
    host.appendChild(empty);
    return;
  }
  const roleId = channelSettingsRoleDisplayId(selected);
  groups.forEach((group) => {
    const section = document.createElement("div");
    section.className = "channel-perms-section";
    const heading = document.createElement("div");
    heading.className = "channel-perms-section-title";
    heading.textContent = group.title;
    section.appendChild(heading);
    (group.rows || []).forEach((row) => {
      const live = channelSettingsPermIsLive(row.id) && !row.later;
      const line = document.createElement("div");
      line.className = "channel-perms-row" + (!live ? " is-later" : "");
      const text = document.createElement("div");
      text.className = "channel-perms-row-text";
      const name = document.createElement("div");
      name.className = "channel-perms-row-title";
      name.textContent = row.title;
      const desc = document.createElement("div");
      desc.className = "channel-perms-row-desc";
      desc.textContent = row.desc || "";
      text.appendChild(name);
      text.appendChild(desc);
      line.appendChild(text);
      if (typeof settingsToggle === "function") {
        const checked = live ? channelSettingsPermValue(roleId, row.id) : false;
        const disabled = !live || !!channelSettingsPermSaving[roleId + ":" + row.id];
        line.appendChild(settingsToggle(checked, disabled, live ? (on) => {
          saveChannelSettingsRolePerm(roleId, row.id, !!on);
        } : null));
      }
      section.appendChild(line);
    });
    host.appendChild(section);
  });
}

async function loadChannelSettingsRolePerms() {
  if (channelSettingsKind !== "channel" || !channelSettingsTarget) {
    channelSettingsPermDisplay = {};
    return;
  }
  channelSettingsPermLoading = true;
  paintChannelSettingsPermBody();
  try {
    if (typeof loadServerRoles === "function" && serverRolesLoadedFor !== currentServerId) {
      await loadServerRoles();
    }
    const response = await fetch(
      `https://${serverAddress}/get_channel_role_perms/${channelSettingsTarget.id}`,
      { credentials: "include" }
    );
    if (!response.ok) throw new Error("Could not load channel permissions.");
    const data = await response.json();
    channelSettingsPermDisplay = data.display || {};
    if (Array.isArray(data.live) && data.live.length) {
      channelSettingsPermLive = data.live.slice();
    }
    const roles = channelSettingsRoleChoices();
    if (!roles.some((row) => String(row.id) === String(channelSettingsPermRoleId))) {
      channelSettingsPermRoleId = roles[0] ? roles[0].id : "members";
    }
  } catch (err) {
    channelSettingsPermDisplay = {};
  } finally {
    channelSettingsPermLoading = false;
    paintChannelSettingsPermRoles();
    paintChannelSettingsPermBody();
  }
}

async function saveChannelSettingsRolePerm(roleId, permId, on) {
  if (channelSettingsKind !== "channel" || !channelSettingsTarget) return;
  if (String(roleId) === "members" || !/^\d+$/.test(String(roleId))) {
    setChannelSettingsNameStatus("Load roles before editing permissions.");
    return;
  }
  const key = String(roleId);
  const saveKey = key + ":" + permId;
  const previous = Object.assign({}, channelSettingsPermDisplay[key] || {});
  const next = Object.assign({}, previous);
  channelSettingsPermLive.forEach((id) => {
    if (!Object.prototype.hasOwnProperty.call(next, id)) {
      next[id] = channelSettingsPermValue(key, id);
    }
  });
  next[permId] = !!on;
  channelSettingsPermDisplay[key] = next;
  channelSettingsPermSaving[saveKey] = true;
  paintChannelSettingsPermBody();
  try {
    const data = await postChannelSettings("/save_channel_role_perms", {
      channel_id: channelSettingsTarget.id,
      role_id: Number(roleId),
      permissions: next,
    });
    channelSettingsPermDisplay[key] = data.display || data.permissions || next;
    if (typeof refreshServerContentsSoft === "function") {
      await refreshServerContentsSoft();
    }
  } catch (err) {
    channelSettingsPermDisplay[key] = previous;
    setChannelSettingsNameStatus(err.message || "Could not save permission.");
  } finally {
    delete channelSettingsPermSaving[saveKey];
    paintChannelSettingsPermBody();
  }
}

function paintChannelSettingsPermissions() {
  const blurb = document.getElementById("channel-settings-perms-blurb");
  if (blurb) {
    blurb.textContent = channelSettingsKind === "category"
      ? "Permissions set here apply to every channel in this category unless a channel sets its own."
      : "Choose a role, then set what that role can do in this channel.";
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
  if (tab === "permissions") {
    paintChannelSettingsPermissions();
    if (channelSettingsKind === "channel") loadChannelSettingsRolePerms();
  }
  if (tab === "integrations") paintChannelFollows();
}

function channelSettingsIsForums() {
  return channelSettingsKind === "channel"
    && channelSettingsTarget
    && channelSettingsTarget.channel_type === "forums";
}

function channelSettingsIsAnnouncements() {
  return channelSettingsKind === "channel"
    && channelSettingsTarget
    && channelSettingsTarget.channel_type === "announcements";
}

function blogPrivacyOk() {
  const mode = (currentServerData && currentServerData.privacy_mode) || "private";
  return mode === "default" || mode === "open";
}

async function saveAnnouncementBlog(partial) {
  const channel = channelSettingsTarget;
  if (!channel || !channelSettingsIsAnnouncements()) return;
  const announcePublic = partial.announce_public != null ? !!partial.announce_public : !!channel.announce_public;
  const blogEnabled = announcePublic && (partial.blog_enabled != null ? !!partial.blog_enabled : !!channel.blog_enabled);
  try {
    const response = await fetch(`https://${serverAddress}/announcement_channel_settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        channel_id: channel.id,
        announce_public: announcePublic,
        blog_enabled: blogEnabled,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      window.alert((typeof data.detail === "string" && data.detail) || "Could not save blog settings.");
      paintChannelSettingsBlog();
      return;
    }
    channel.announce_public = !!data.announce_public;
    channel.blog_enabled = !!data.blog_enabled;
    const live = findChannelSettingsChannel(channel.id);
    if (live) {
      live.announce_public = channel.announce_public;
      live.blog_enabled = channel.blog_enabled;
    }
  } catch (err) {
    window.alert("Could not save blog settings.");
  }
  paintChannelSettingsBlog();
}

function paintChannelSettingsBlog() {
  const host = document.getElementById("channel-settings-blog-host");
  if (!host) return;
  host.replaceChildren();
  if (!channelSettingsIsAnnouncements() || typeof settingsOpt !== "function" || typeof settingsToggle !== "function") return;
  const channel = channelSettingsTarget;
  const allowed = blogPrivacyOk();
  const isPublic = !!(channel && channel.announce_public);
  const blogOn = !!(channel && channel.blog_enabled);
  if (!allowed && typeof settingsNote === "function") {
    host.appendChild(settingsNote("Blogs are available on Default and Open entry servers."));
  }
  host.appendChild(settingsOpt(
    "Make channel public",
    "Posts published while the blog is on can be opened without joining.",
    settingsToggle(isPublic, !allowed, (on) => saveAnnouncementBlog({ announce_public: on }))
  ));
  host.appendChild(settingsOpt(
    "Enable blog",
    "New posts get a public link. Turning this off leaves older public posts up.",
    settingsToggle(blogOn, !allowed || !isPublic, (on) => saveAnnouncementBlog({ blog_enabled: on }))
  ));
}

async function paintChannelFollows() {
  const host = document.getElementById("channel-settings-follows");
  if (!host) return;
  host.replaceChildren();
  const idle = document.createElement("p");
  idle.className = "server-settings-help";
  idle.textContent = "This channel isn’t receiving followed announcement channels.";
  if (!channelSettingsIsAnnouncements() || !channelSettingsTarget) {
    host.appendChild(idle);
    return;
  }
  const loading = document.createElement("p");
  loading.className = "server-settings-help";
  loading.textContent = "Loading followed channels…";
  host.appendChild(loading);
  try {
    const response = await fetch(`https://${serverAddress}/channel_follows/${channelSettingsTarget.id}`, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      loading.textContent = (typeof data.detail === "string" && data.detail) || "Could not load followed channels.";
      return;
    }
    host.replaceChildren();
    const follows = data.follows || [];
    if (!follows.length) host.appendChild(idle);
    follows.forEach((row) => {
      const line = document.createElement("div");
      line.className = "channel-follow-row";
      const label = document.createElement("div");
      label.textContent = (row.server_name || "Server") + " / #" + (row.channel_name || "announcements");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ghost-btn";
      remove.textContent = "Unfollow";
      remove.addEventListener("click", () => removeChannelFollow(row.source_channel_id));
      line.appendChild(label);
      line.appendChild(remove);
      host.appendChild(line);
    });
    const sources = data.sources || [];
    if (sources.length) {
      const add = document.createElement("div");
      add.className = "channel-follow-add";
      const select = document.createElement("select");
      select.className = "settings-select server-settings-select";
      sources.forEach((row) => {
        const option = document.createElement("option");
        option.value = String(row.channel_id);
        option.textContent = (row.server_name || "Server") + " / #" + (row.channel_name || "announcements");
        select.appendChild(option);
      });
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pill-btn";
      button.textContent = "Follow";
      button.addEventListener("click", () => addChannelFollow(Number(select.value)));
      add.appendChild(select);
      add.appendChild(button);
      host.appendChild(add);
    }
  } catch (err) {
    loading.textContent = "Could not load followed channels.";
  }
}

async function addChannelFollow(sourceId) {
  if (!channelSettingsTarget || !sourceId) return;
  const response = await fetch(`https://${serverAddress}/channel_follows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ dest_channel_id: channelSettingsTarget.id, source_channel_id: sourceId }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    window.alert((typeof data.detail === "string" && data.detail) || "Could not follow that channel.");
    return;
  }
  paintChannelFollows();
}

async function removeChannelFollow(sourceId) {
  if (!channelSettingsTarget || !sourceId) return;
  await fetch(`https://${serverAddress}/channel_follows/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ dest_channel_id: channelSettingsTarget.id, source_channel_id: sourceId }),
  });
  paintChannelFollows();
}

function paintChannelSettingsShell() {
  const isCategory = channelSettingsKind === "category";
  const isForums = channelSettingsIsForums();
  const label = document.getElementById("channel-settings-index-label");
  if (label) label.textContent = channelSettingsLabel(channelSettingsTarget, channelSettingsKind);
  const nameLabel = document.getElementById("channel-settings-name-label");
  if (nameLabel) nameLabel.textContent = isCategory ? "Category Name" : "Channel Name";
  const deleteBtn = document.getElementById("channel-settings-delete");
  if (deleteBtn) deleteBtn.textContent = isCategory ? "Delete Category" : "Delete Channel";
  document.querySelectorAll("#channel-settings-nav .is-channel-only").forEach((btn) => {
    btn.hidden = isCategory;
  });
  document.querySelectorAll("#channel-settings-overview .is-channel-only").forEach((el) => {
    if (el.classList.contains("is-forums-only")) {
      el.hidden = !isForums;
      return;
    }
    if (el.classList.contains("is-announce-only")) {
      el.hidden = !channelSettingsIsAnnouncements();
      return;
    }
    el.hidden = isCategory;
  });
  paintChannelSettingsBlog();
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

function setChannelSettingsTopicStatus(message) {
  const el = document.getElementById("channel-settings-topic-status");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function syncChannelSettingsTopic(topic) {
  channelSettingsSavedTopic = topic || "";
  const input = document.getElementById("channel-settings-topic");
  if (input) input.value = channelSettingsSavedTopic;
  const actions = document.getElementById("channel-settings-topic-actions");
  if (actions) actions.hidden = true;
  setChannelSettingsTopicStatus("");
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
    channelSettingsKind === "category"
      ? "Only people with access can see this category and its channels when it is private."
      : "Only people with access can see this channel when it is private.",
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

async function saveChannelSettingsTopic() {
  if (channelSettingsKind !== "channel" || !channelSettingsTarget) return;
  const input = document.getElementById("channel-settings-topic");
  const topic = ((input && input.value) || "").trim();
  if (topic === channelSettingsSavedTopic) {
    syncChannelSettingsTopic(topic);
    return;
  }
  try {
    const data = await postChannelSettings("/update_channel", {
      channel_id: channelSettingsTarget.id,
      topic,
    });
    applyChannelUpdated(data.channel || {
      id: channelSettingsTarget.id,
      topic,
      name: channelSettingsTarget.name,
      is_private: channelSettingsSavedPrivate,
      category_id: channelSettingsTarget.category_id,
      channel_type: channelSettingsTarget.channel_type,
    });
    syncChannelSettingsTopic(topic);
  } catch (err) {
    setChannelSettingsTopicStatus(err.message || "Could not save.");
  }
}

function cancelChannelSettingsTopic() {
  syncChannelSettingsTopic(channelSettingsSavedTopic);
}

function channelSlowmodeApplies() {
  const type = channelSettingsTarget && channelSettingsTarget.channel_type;
  return type === "text" || type === "announcements" || type === "forums";
}

function syncChannelSettingsSlowmode(seconds) {
  channelSettingsSavedSlowmode = Number(seconds) || 0;
  const input = document.getElementById("channel-settings-slowmode");
  const help = document.getElementById("channel-settings-slowmode-help");
  if (input) {
    input.disabled = !channelSlowmodeApplies();
    input.value = channelSettingsSavedSlowmode ? String(channelSettingsSavedSlowmode) : "off";
  }
  if (help) {
    help.textContent = channelSettingsTarget && channelSettingsTarget.channel_type === "forums"
      ? "Members will be restricted to one new post or reply per this interval, unless they have a slowmode exception."
      : "Members will be restricted to sending one message per this interval, unless they have a slowmode exception.";
  }
}

async function saveChannelSettingsSlowmode() {
  if (!channelSlowmodeApplies() || !channelSettingsTarget) return;
  const input = document.getElementById("channel-settings-slowmode");
  const seconds = !input || input.value === "off" ? 0 : Number(input.value) || 0;
  if (seconds === channelSettingsSavedSlowmode) return;
  try {
    const data = await postChannelSettings("/update_channel", {
      channel_id: channelSettingsTarget.id,
      slowmode: seconds,
    });
    if (data.channel) applyChannelUpdated(data.channel);
    else syncChannelSettingsSlowmode(seconds);
  } catch (err) {
    syncChannelSettingsSlowmode(channelSettingsSavedSlowmode);
    setChannelSettingsNameStatus(err.message || "Could not save.");
  }
}

function setChannelSettingsForumGuidelinesStatus(message) {
  const el = document.getElementById("channel-settings-forum-guidelines-status");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function syncChannelSettingsForumGuidelines(text) {
  channelSettingsSavedGuidelines = text || "";
  const input = document.getElementById("channel-settings-forum-guidelines");
  if (input) input.value = channelSettingsSavedGuidelines;
  const actions = document.getElementById("channel-settings-forum-guidelines-actions");
  if (actions) actions.hidden = true;
  setChannelSettingsForumGuidelinesStatus("");
}

function applyChannelSettingsForumSettings(settings) {
  channelSettingsForumSettings = {
    guidelines: (settings && settings.guidelines) || "",
    require_tags: !!(settings && settings.require_tags),
    default_reaction: (settings && settings.default_reaction) || "",
    tags: Array.isArray(settings && settings.tags) ? settings.tags.slice() : [],
  };
  syncChannelSettingsForumGuidelines(channelSettingsForumSettings.guidelines);
  paintChannelSettingsForumTags();
  paintChannelSettingsForumRequireTags();
  paintChannelSettingsForumReaction();
  if (
    typeof applyForumChannelSettings === "function"
    && currentChannelId
    && Number(currentChannelId) === Number(channelSettingsTarget && channelSettingsTarget.id)
  ) {
    applyForumChannelSettings(channelSettingsForumSettings);
  }
}

async function loadChannelSettingsForumSettings() {
  if (!channelSettingsIsForums() || !channelSettingsTarget) return;
  try {
    const response = await fetch(
      `https://${serverAddress}/get_forum_settings/${channelSettingsTarget.id}`,
      { credentials: "include" }
    );
    if (!response.ok) return;
    const data = await response.json();
    applyChannelSettingsForumSettings(data);
  } catch (e) { /* leave defaults */ }
}

async function saveChannelSettingsForumSettings(partial) {
  if (!channelSettingsIsForums() || !channelSettingsTarget) return null;
  const data = await postChannelSettings("/save_forum_settings", Object.assign({
    channel_id: channelSettingsTarget.id,
  }, partial || {}));
  applyChannelSettingsForumSettings(data);
  return data;
}

async function saveChannelSettingsForumGuidelines() {
  if (!channelSettingsIsForums() || !channelSettingsTarget) return;
  const input = document.getElementById("channel-settings-forum-guidelines");
  const text = ((input && input.value) || "").trim();
  if (text === channelSettingsSavedGuidelines) {
    syncChannelSettingsForumGuidelines(text);
    return;
  }
  try {
    await saveChannelSettingsForumSettings({ guidelines: text });
  } catch (err) {
    setChannelSettingsForumGuidelinesStatus(err.message || "Could not save.");
  }
}

function cancelChannelSettingsForumGuidelines() {
  syncChannelSettingsForumGuidelines(channelSettingsSavedGuidelines);
}

function paintChannelSettingsForumTags() {
  const host = document.getElementById("channel-settings-forum-tags-list");
  if (!host) return;
  host.replaceChildren();
  const tags = channelSettingsForumSettings.tags || [];
  tags.forEach((tag) => {
    const pill = document.createElement("div");
    pill.className = "forum-settings-tag-pill";
    const label = document.createElement("span");
    label.className = "forum-settings-tag-label";
    label.textContent = ((tag.emoji || "") + " " + (tag.name || "")).trim();
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "forum-settings-tag-remove";
    remove.title = "Remove tag";
    remove.setAttribute("aria-label", "Remove tag");
    remove.textContent = "\u00d7";
    remove.addEventListener("click", async () => {
      try {
        const data = await postChannelSettings("/delete_forum_tag", { tag_id: tag.id });
        if (data && data.settings) applyChannelSettingsForumSettings(data.settings);
      } catch (err) {
        setChannelSettingsForumGuidelinesStatus(err.message || "Could not remove tag.");
      }
    });
    pill.appendChild(label);
    pill.appendChild(remove);
    host.appendChild(pill);
  });
}

function paintChannelSettingsForumRequireTags() {
  const host = document.getElementById("channel-settings-forum-require-tags-host");
  if (!host) return;
  host.replaceChildren();
  if (typeof settingsOpt !== "function" || typeof settingsToggle !== "function") return;
  const toggle = settingsToggle(!!channelSettingsForumSettings.require_tags, false, async (on) => {
    const previous = !!channelSettingsForumSettings.require_tags;
    channelSettingsForumSettings.require_tags = !!on;
    try {
      await saveChannelSettingsForumSettings({ require_tags: !!on });
    } catch (err) {
      channelSettingsForumSettings.require_tags = previous;
      paintChannelSettingsForumRequireTags();
      setChannelSettingsForumGuidelinesStatus(err.message || "Could not save.");
    }
  });
  host.appendChild(settingsOpt(
    "Require tags",
    "People must pick at least one tag when creating a post.",
    toggle
  ));
}

function paintChannelSettingsForumReaction() {
  const preview = document.getElementById("channel-settings-forum-reaction-preview");
  const clearBtn = document.getElementById("channel-settings-forum-reaction-clear");
  const emoji = (channelSettingsForumSettings.default_reaction || "").trim();
  if (preview) preview.textContent = emoji;
  if (clearBtn) clearBtn.hidden = !emoji;
}

function ensureChannelSettingsForumReactionPick() {
  if (channelSettingsForumReactionPick) return channelSettingsForumReactionPick;
  const input = document.createElement("input");
  input.type = "text";
  input.id = "channel-settings-forum-reaction-pick";
  input.setAttribute("data-emoji-replace", "1");
  input.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;opacity:0;";
  input.tabIndex = -1;
  document.body.appendChild(input);
  input.addEventListener("input", async () => {
    const emoji = (input.value || "").trim();
    if (!emoji || !channelSettingsIsForums()) return;
    try {
      await saveChannelSettingsForumSettings({ default_reaction: emoji });
    } catch (err) {
      setChannelSettingsForumGuidelinesStatus(err.message || "Could not save.");
    }
  });
  channelSettingsForumReactionPick = input;
  return input;
}

async function addChannelSettingsForumTag() {
  if (!channelSettingsIsForums() || !channelSettingsTarget) return;
  const input = document.getElementById("channel-settings-forum-tag-name");
  const name = ((input && input.value) || "").trim();
  if (!name) return;
  try {
    const data = await postChannelSettings("/create_forum_tag", {
      channel_id: channelSettingsTarget.id,
      name,
    });
    if (input) input.value = "";
    if (data && data.settings) applyChannelSettingsForumSettings(data.settings);
  } catch (err) {
    setChannelSettingsForumGuidelinesStatus(err.message || "Could not add tag.");
  }
}

function applyChannelUpdated(channel) {
  if (!channel || !currentServerData) return;
  const live = findChannelSettingsChannel(channel.id);
  if (live) {
    if (channel.name != null) live.name = channel.name;
    if (channel.is_private != null) live.is_private = !!channel.is_private;
    if (channel.position != null) live.position = channel.position;
    if (channel.category_id != null) live.category_id = channel.category_id;
    if (channel.topic != null) live.topic = channel.topic || "";
    if (channel.slowmode != null) live.slowmode = Number(channel.slowmode) || 0;
  }
  if (channelSettingsKind === "channel" && channelSettingsTarget && Number(channelSettingsTarget.id) === Number(channel.id)) {
    channelSettingsTarget = live || Object.assign({}, channelSettingsTarget, channel);
    channelSettingsSavedName = channelSettingsTarget.name || "";
    channelSettingsSavedPrivate = !!channelSettingsTarget.is_private;
    channelSettingsSavedTopic = channelSettingsTarget.topic || "";
    paintChannelSettingsShell();
    syncChannelSettingsName(channelSettingsSavedName);
    syncChannelSettingsTopic(channelSettingsSavedTopic);
    syncChannelSettingsSlowmode(channelSettingsTarget.slowmode || 0);
  }
  if (currentChannelId && Number(currentChannelId) === Number(channel.id)) {
    currentChannelName = channel.name || currentChannelName;
    const title = document.getElementById("channel-header-title");
    if (title && channel.name && !openForumPostId) {
      const isVoice = channel.channel_type === "voice";
      const isDoc = channel.channel_type === "doc";
      title.textContent = (isVoice || isDoc) ? channel.name : `#${channel.name}`;
    }
    if (channel.topic != null && typeof setHeaderDescription === "function") {
      setHeaderDescription("channel-header-desc", channel.topic || "");
    }
    if (typeof paintSlowmodeIndicator === "function") paintSlowmodeIndicator();
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
  const membersRole = channelSettingsRoleChoices().find((row) => row.builtin) || channelSettingsRoleChoices()[0];
  channelSettingsPermRoleId = membersRole ? membersRole.id : "members";
  channelSettingsPermDisplay = {};
  paintChannelSettingsPrivate();
  paintChannelSettingsPermissions();
  if (channelSettingsKind === "channel") loadChannelSettingsRolePerms();
  syncChannelSettingsTopic(channelSettingsKind === "channel" ? (target.topic || "") : "");
  syncChannelSettingsSlowmode(channelSettingsKind === "channel" ? (target.slowmode || 0) : 0);
  channelSettingsForumSettings = { guidelines: "", require_tags: false, default_reaction: "", tags: [] };
  syncChannelSettingsForumGuidelines("");
  paintChannelSettingsForumTags();
  paintChannelSettingsForumRequireTags();
  paintChannelSettingsForumReaction();
  if (channelSettingsIsForums()) loadChannelSettingsForumSettings();
  paintChannelSettingsBlog();
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
  cancelChannelSettingsTopic();
  cancelChannelSettingsForumGuidelines();
  setChannelSettingsNameStatus("");
  setChannelSettingsTopicStatus("");
  setChannelSettingsForumGuidelinesStatus("");
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

document.getElementById("channel-settings-topic").addEventListener("input", () => {
  const input = document.getElementById("channel-settings-topic");
  const actions = document.getElementById("channel-settings-topic-actions");
  if (!input || !actions) return;
  actions.hidden = input.value.trim() === channelSettingsSavedTopic;
  setChannelSettingsTopicStatus("");
});

document.getElementById("channel-settings-topic-confirm").addEventListener("click", () => {
  saveChannelSettingsTopic();
});

document.getElementById("channel-settings-topic-cancel").addEventListener("click", () => {
  cancelChannelSettingsTopic();
});

const channelSlowmodeSelect = document.getElementById("channel-settings-slowmode");
if (channelSlowmodeSelect) {
  channelSlowmodeSelect.addEventListener("change", () => {
    saveChannelSettingsSlowmode();
  });
}

const forumGuidelinesInput = document.getElementById("channel-settings-forum-guidelines");
if (forumGuidelinesInput) {
  forumGuidelinesInput.addEventListener("input", () => {
    const actions = document.getElementById("channel-settings-forum-guidelines-actions");
    if (!actions) return;
    actions.hidden = forumGuidelinesInput.value.trim() === channelSettingsSavedGuidelines;
    setChannelSettingsForumGuidelinesStatus("");
  });
}
const forumGuidelinesConfirm = document.getElementById("channel-settings-forum-guidelines-confirm");
if (forumGuidelinesConfirm) {
  forumGuidelinesConfirm.addEventListener("click", () => {
    saveChannelSettingsForumGuidelines();
  });
}
const forumGuidelinesCancel = document.getElementById("channel-settings-forum-guidelines-cancel");
if (forumGuidelinesCancel) {
  forumGuidelinesCancel.addEventListener("click", () => {
    cancelChannelSettingsForumGuidelines();
  });
}
const forumTagAdd = document.getElementById("channel-settings-forum-tag-add");
if (forumTagAdd) {
  forumTagAdd.addEventListener("click", () => {
    addChannelSettingsForumTag();
  });
}
const forumTagName = document.getElementById("channel-settings-forum-tag-name");
if (forumTagName) {
  forumTagName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addChannelSettingsForumTag();
    }
  });
}
const forumReactionBtn = document.getElementById("channel-settings-forum-reaction-btn");
if (forumReactionBtn) {
  forumReactionBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (typeof openEmojiPicker !== "function") return;
    const pick = ensureChannelSettingsForumReactionPick();
    pick.value = "";
    openEmojiPicker(forumReactionBtn, pick, e.clientX, e.clientY);
  });
}
const forumReactionClear = document.getElementById("channel-settings-forum-reaction-clear");
if (forumReactionClear) {
  forumReactionClear.addEventListener("click", async () => {
    try {
      await saveChannelSettingsForumSettings({ default_reaction: "" });
    } catch (err) {
      setChannelSettingsForumGuidelinesStatus(err.message || "Could not save.");
    }
  });
}

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
