// ==================================================================
// server-roles.js - Server Settings Roles page. Guilded layout.
// Unsaved edits sit in the right-hand review until Confirm. Members
// is the default role every member gets. Grey rows keep a footnote.
// ==================================================================

const SERVER_ROLE_SWATCHES = [
  "#99aab5", "#43b581", "#faa61a", "#f04747", "#e91e63",
  "#9b59b6", "#3498db", "#1abc9c", "#e67e22", "#95a5a6"
];

const SERVER_ROLE_PERMS = [
  {
    title: "General permissions",
    rows: [
      { id: "update_server", title: "Update server", desc: "Allows you to update the server's settings." },
      { id: "manage_roles", title: "Manage roles", desc: "Allows you to update lower-ranked roles." },
      { id: "invite_members", title: "Invite members", desc: "Allows you to directly invite members to the server." },
      { id: "kick_members", title: "Kick members", desc: "Allows you to kick members from the server." },
      { id: "ban_members", title: "Ban members", desc: "Allows you to ban members from the server." },
      { id: "timeout_members", title: "Timeout members", desc: "Allows you to timeout members on the server." },
      { id: "manage_groups", title: "Manage groups", desc: "Allows you to create new groups and edit or delete existing ones.", later: "Groups" },
      { id: "manage_channels", title: "Manage channels", desc: "Allows you to create new channels and edit or delete existing ones." },
      { id: "manage_webhooks", title: "Manage webhooks", desc: "Allows you to create new webhooks and edit or delete existing ones.", later: "Webhooks" },
      { id: "mention_everyone", title: "Can mention @everyone and @here", desc: "Allows you to use @everyone and @here mentions." },
      { id: "moderate_channels", title: "Access moderator view", desc: "Allows you to access the moderator view to see all private replies.", later: "Private replies" },
      { id: "bypass_slowmode", title: "Slowmode exception", desc: "This role is exempt from any slowmode restrictions.", later: "Slowmode" }
    ]
  },
  {
    title: "Recruitment permissions",
    rows: [
      { id: "view_applications", title: "View applications", desc: "Allows you to view server and game applications.", later: "Communities" },
      { id: "approve_applications", title: "Approve applications", desc: "Allows you to approve server and game applications.", later: "Communities" },
      { id: "edit_applications", title: "Edit applications", desc: "Allows you to edit the server and game applications, and toggle accepting applications.", later: "Communities" },
      { id: "lfm_interest", title: "Indicate Find Players interest", desc: "Allows you to indicate interest in a player instead of an upvote.", later: "Communities" },
      { id: "lfm_status", title: "Modify Find Players status", desc: "Allows you to modify the Find Player status for the server listing card.", later: "Communities" }
    ]
  },
  {
    title: "Announcement permissions",
    rows: [
      { id: "view_announcements", title: "View announcements", desc: "Allows you to view announcements." },
      { id: "create_announcements", title: "Create and remove announcements", desc: "Allows you to create and remove announcements." },
      { id: "manage_announcements", title: "Manage announcements", desc: "Allows you to delete announcements by other members or pin any announcement." }
    ]
  },
  {
    title: "Chat permissions",
    rows: [
      { id: "read_messages", title: "Read messages", desc: "Allows you to read chat messages." },
      { id: "send_messages", title: "Send messages", desc: "Allows you to send chat messages." },
      { id: "upload_chat_media", title: "Upload media", desc: "Allows you to upload images and videos to chat messages." },
      { id: "create_chat_threads", title: "Create threads", desc: "Allows you to create threads in the channel.", later: "Threads" },
      { id: "reply_chat_threads", title: "Send messages in threads", desc: "Allows you to reply to threads in the channel.", later: "Threads" },
      { id: "private_messages", title: "Send private messages", desc: "Allows members to send private messages and privately reply to messages.", later: "Private replies" },
      { id: "manage_messages", title: "Manage messages", desc: "Allows you to delete chat messages by other members or pin any message." },
      { id: "manage_chat_threads", title: "Manage threads", desc: "Allow you to archive and restore threads.", later: "Threads" }
    ]
  },
  {
    title: "Calendar permissions",
    rows: [
      { id: "view_events", title: "View events", desc: "Allows you to view events.", later: "Events" },
      { id: "create_events", title: "Create events", desc: "Allows you to create events.", later: "Events" },
      { id: "manage_events", title: "Manage events", desc: "Allows you to update events created by others and move them to other channels.", later: "Events" },
      { id: "remove_events", title: "Remove events", desc: "Allows you to remove events created by others.", later: "Events" },
      { id: "edit_rsvps", title: "Edit RSVPs", desc: "Allows you to edit the RSVP status for members in an event.", later: "Events" }
    ]
  },
  {
    title: "Forum permissions",
    rows: [
      { id: "read_forums", title: "Read forums", desc: "Allows you to read forums." },
      { id: "create_topics", title: "Create forum topics", desc: "Allows you to create forum topics." },
      { id: "create_topic_replies", title: "Create topic replies", desc: "Allows you to create topic replies." },
      { id: "manage_topics", title: "Manage topics", desc: "Allows you to remove topics and replies created by others, or move them to other channels." },
      { id: "sticky_topics", title: "Sticky topics", desc: "Allows you to sticky a topic." },
      { id: "lock_topics", title: "Lock topics", desc: "Allows you to lock a topic." }
    ]
  },
  {
    title: "Docs permissions",
    rows: [
      { id: "view_docs", title: "View docs", desc: "Allows you to view docs." },
      { id: "create_docs", title: "Create docs", desc: "Allows you to create docs." },
      { id: "manage_docs", title: "Manage docs", desc: "Allows you to update docs created by others and move them to other channels." },
      { id: "remove_docs", title: "Remove docs", desc: "Allows you to remove docs created by others." }
    ]
  },
  {
    title: "Media permissions",
    rows: [
      { id: "see_media", title: "See media", desc: "Allows you to see media.", later: "Media channel" },
      { id: "create_media", title: "Create media", desc: "Allows you to create media.", later: "Media channel" },
      { id: "manage_media", title: "Manage media", desc: "Allows you to edit media created by others and move media items to other channels.", later: "Media channel" },
      { id: "remove_media", title: "Remove media", desc: "Allows you to remove media created by others.", later: "Media channel" }
    ]
  },
  {
    title: "Voice permissions",
    rows: [
      { id: "hear_voice", title: "Hear voice", desc: "Allows you to listen to voice chat.", later: "Voice" },
      { id: "talk_voice", title: "Add voice", desc: "Allows you to talk in voice chat.", later: "Voice" },
      { id: "manage_voice_rooms", title: "Manage Voice Rooms", desc: "Allows you to create, rename, and delete voice rooms.", later: "Voice" },
      { id: "move_voice", title: "Move members", desc: "Allows you to move members to other voice rooms.", later: "Voice" },
      { id: "broadcast_voice", title: "Broadcast", desc: "Allows you to broadcast your voice to voice rooms lower in the hierarchy when speaking in voice chat.", later: "Voice" },
      { id: "whisper_voice", title: "Whisper", desc: "Allows you to direct your voice to specific users.", later: "Voice" },
      { id: "priority_speaker", title: "Priority speaker", desc: "Allows you to prioritize your voice when speaking in voice chat.", later: "Voice" },
      { id: "voice_activity", title: "Use voice activity", desc: "Allows you to use voice activity input mode for voice chats.", later: "Voice" },
      { id: "mute_members", title: "Mute members", desc: "Allows you to mute members in voice chat.", later: "Voice" },
      { id: "deafen_members", title: "Deafen members", desc: "Allows you to deafen members in voice chat.", later: "Voice" },
      { id: "voice_messages", title: "Send messages", desc: "Allows you to send chat messages in the voice channel.", later: "Voice" }
    ]
  },
  {
    title: "Competitive permissions",
    rows: [
      { id: "create_scrims", title: "Create scrims", desc: "Allows you to create matchmaking scrims.", later: "Tournaments" },
      { id: "manage_tournaments", title: "Create tournaments", desc: "Allows you to use the server to create and manage tournaments.", later: "Tournaments" },
      { id: "register_tournaments", title: "Register for tournaments", desc: "Allows you to register the server for tournaments.", later: "Tournaments" }
    ]
  },
  {
    title: "Customization permissions",
    rows: [
      { id: "manage_emoji", title: "Manage emoji", desc: "Allows the creation and management of server emoji.", later: "Custom emoji" },
      { id: "change_nickname", title: "Change Nickname", desc: "Members with this permission can change their own nickname.", later: "User Server profile" },
      { id: "manage_nicknames", title: "Manage Nicknames", desc: "Members with this permission can change the nicknames of other members.", later: "User Server profile" }
    ]
  },
  {
    title: "Form permissions",
    rows: [
      { id: "form_responses", title: "Form responses", desc: "Allows you to view all form responses.", later: "Forms" },
      { id: "poll_results", title: "Poll results", desc: "Allows you to view all poll results.", later: "Forms" }
    ]
  },
  {
    title: "List permissions",
    rows: [
      { id: "view_list", title: "View list items", desc: "Allows you to view list items.", later: "Lists" },
      { id: "create_list", title: "Create list items", desc: "Allows you to create list items.", later: "Lists" },
      { id: "manage_list", title: "Manage list item messages", desc: "Allows you to update list item messages created by others and move list items to other channels.", later: "Lists" },
      { id: "remove_list", title: "Remove list items", desc: "Allows you to remove list items created by others.", later: "Lists" },
      { id: "complete_list", title: "Complete list items", desc: "Allows you to complete list items created by others.", later: "Lists" },
      { id: "reorder_list", title: "Reorder list items", desc: "Allows you to reorder list items.", later: "Lists" }
    ]
  },
  {
    title: "Bracket permissions",
    rows: [
      { id: "view_brackets", title: "View brackets", desc: "Allows you to view tournament brackets.", later: "Tournaments" },
      { id: "report_scores", title: "Report scores", desc: "Allows you to report match scores on behalf of your server.", later: "Tournaments" }
    ]
  },
  {
    title: "Scheduling permissions",
    rows: [
      { id: "view_schedules", title: "View schedules", desc: "Allows you to view server member's schedules.", later: "Schedules" },
      { id: "create_schedule", title: "Create schedule", desc: "Allows you to let your server know your available schedule.", later: "Schedules" },
      { id: "delete_schedule", title: "Delete schedule", desc: "Allows you to remove availabilities created by others.", later: "Schedules" }
    ]
  },
  {
    title: "Bot permissions",
    rows: [
      { id: "manage_bots", title: "Manage bots", desc: "Allows you to create and edit bots for automated workflows.", later: "Bots" }
    ]
  },
  {
    title: "XP permissions",
    rows: [
      { id: "manage_xp", title: "Manage server XP", desc: "Allows you to manage XP on server members.", later: "Server XP" }
    ]
  },
  {
    title: "Stream permissions",
    rows: [
      { id: "view_streams", title: "View streams", desc: "Allows you to view streams.", later: "Stream channels" },
      { id: "join_stream_voice", title: "Join voice", desc: "Allows you to listen to voice chat in the stream channel.", later: "Stream channels" },
      { id: "add_stream", title: "Add stream", desc: "Allows you to add a stream and also talk in the stream channel.", later: "Stream channels" },
      { id: "stream_messages", title: "Send messages", desc: "Allows you to send messages in the stream channel.", later: "Stream channels" },
      { id: "stream_voice", title: "Add voice", desc: "Allows you to talk in the stream channel.", later: "Stream channels" },
      { id: "stream_vad", title: "Use voice activity detection", desc: "Allows you to use voice activity input mode for talking in stream channels.", later: "Stream channels" }
    ]
  }
];

const SERVER_ROLE_SETTING_ROWS = [
  { id: "selfAssign", title: "Self-assignable", desc: "Allows members to assign this role to themselves.", later: "Mini Profile +" },
  { id: "mentionable", title: "Mentionable", desc: "Allow members to notify others by mentioning this role." },
  { id: "hoist", title: "Display Separately", desc: "If enabled, members with this role will display separately from other online members." },
  { id: "nameColor", title: "Name color", desc: "This role’s color is used on members’ display names in this server. If they have more than one, the highest role on the list wins." }
];

let serverRolesDraft = [];
let serverRolesOrigin = {};
let serverRolesSaved = [];
let serverRolesSelectedId = "members";
let serverRolesNextId = 1;
let serverRolesLoadedFor = null;
let serverRolesReviewOpen = {};
let serverRolesSaving = false;
let serverRolesSaveError = "";

function emptyServerRolePerms() {
  const perms = {};
  SERVER_ROLE_PERMS.forEach((group) => {
    group.rows.forEach((row) => { perms[row.id] = false; });
  });
  return perms;
}

function defaultMembersPerms() {
  const perms = emptyServerRolePerms();
  ["invite_members", "mention_everyone", "read_messages", "send_messages", "upload_chat_media", "view_announcements", "read_forums", "create_topics", "create_topic_replies", "view_docs"].forEach((id) => {
    perms[id] = true;
  });
  return perms;
}

function cloneServerRole(role) {
  return {
    id: role.id,
    name: role.name || "",
    builtin: !!role.builtin,
    color: role.color || "#99aab5",
    colorMode: role.colorMode || "solid",
    selfAssign: !!role.selfAssign,
    mentionable: !!role.mentionable,
    hoist: !!role.hoist,
    nameColor: !!role.nameColor,
    perms: Object.assign({}, role.perms || emptyServerRolePerms()),
    created: !!role.created
  };
}

function normRoleColor(value) {
  const text = (value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(text) ? text : "#99aab5";
}

function isCreatedServerRole(role) {
  return !!(role && (role.created || String(role.id).indexOf("draft-") === 0));
}

function permTitle(id) {
  for (let i = 0; i < SERVER_ROLE_PERMS.length; i += 1) {
    const row = SERVER_ROLE_PERMS[i].rows.find((item) => item.id === id);
    if (row) return row.title;
  }
  return id;
}

function settingTitle(id) {
  const row = SERVER_ROLE_SETTING_ROWS.find((item) => item.id === id);
  return (row && row.title) || id;
}

function onOffLabel(value) {
  return value ? "On" : "Off";
}

function roleChanges(role) {
  const origin = serverRolesOrigin[role.id];
  const changes = [];
  if (isCreatedServerRole(role)) {
    changes.push({ key: "created", kind: "created", label: "Created" });
  }
  if (!origin) return changes;
  if ((role.name || "") !== (origin.name || "")) {
    changes.push({ key: "name", kind: "text", label: "Role name", from: origin.name || "", to: role.name || "" });
  }
  if (normRoleColor(role.color) !== normRoleColor(origin.color)) {
    changes.push({ key: "color", kind: "color", label: "Role color", from: origin.color, to: role.color });
  }
  ["mentionable", "hoist", "nameColor"].forEach((field) => {
    if (!!role[field] !== !!origin[field]) {
      changes.push({ key: field, kind: "toggle", label: settingTitle(field), from: !!origin[field], to: !!role[field] });
    }
  });
  livePermIds().forEach((id) => {
    if (!!role.perms[id] !== !!origin.perms[id]) {
      changes.push({ key: "perm:" + id, kind: "toggle", label: permTitle(id), from: !!origin.perms[id], to: !!role.perms[id] });
    }
  });
  return changes;
}

function isDirtyServerRole(role) {
  return roleChanges(role).length > 0;
}

function dirtyServerRoles() {
  return serverRolesDraft.filter(isDirtyServerRole);
}

function applyServerRolesFromApi(rows) {
  const list = Array.isArray(rows) ? rows : [];
  serverRolesSaved = list;
  serverRolesDraft = list.map((row) => {
    const perms = emptyServerRolePerms();
    const incoming = row.permissions || {};
    Object.keys(perms).forEach((id) => { perms[id] = !!incoming[id]; });
    return {
      id: String(row.id),
      name: row.name || (row.is_members ? "Members" : "New Role"),
      builtin: !!row.is_members,
      color: normRoleColor(row.color),
      colorMode: "solid",
      selfAssign: false,
      mentionable: !!row.mentionable,
      hoist: !!row.hoist,
      nameColor: !!row.name_color,
      perms,
      created: false
    };
  });
  serverRolesOrigin = {};
  serverRolesDraft.forEach((role) => {
    serverRolesOrigin[role.id] = cloneServerRole(role);
  });
  if (!serverRolesDraft.some((role) => role.id === serverRolesSelectedId)) {
    const members = serverRolesDraft.find((role) => role.builtin);
    serverRolesSelectedId = members ? members.id : (serverRolesDraft[0] && serverRolesDraft[0].id) || "";
  }
  serverRolesReviewOpen = {};
  serverRolesSaveError = "";
  if (typeof applyMentionRolesFromApi === "function") applyMentionRolesFromApi(list);
}

function resetServerRolesDraft() {
  serverRolesLoadedFor = null;
  serverRolesSaved = [];
  serverRolesOrigin = {};
  serverRolesReviewOpen = {};
  serverRolesSaveError = "";
  serverRolesDraft = [{
    id: "members",
    name: "Members",
    builtin: true,
    color: "#99aab5",
    colorMode: "solid",
    selfAssign: false,
    mentionable: false,
    hoist: false,
    nameColor: false,
    perms: defaultMembersPerms(),
    created: false
  }];
  serverRolesOrigin.members = cloneServerRole(serverRolesDraft[0]);
  serverRolesSelectedId = "members";
  serverRolesNextId = 1;
}

function selectedServerRole() {
  return serverRolesDraft.find((role) => role.id === serverRolesSelectedId) || serverRolesDraft[0];
}

function roleToggle(checked, disabled, onChange) {
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

function roleLaterNote(feature) {
  const note = document.createElement("div");
  note.className = "settings-note is-later";
  note.textContent = "Waits on " + feature + ".";
  return note;
}

function roleOptRow(title, desc, control, later) {
  const row = document.createElement("div");
  row.className = "settings-opt" + (later ? " is-later" : "");
  const text = document.createElement("div");
  text.className = "settings-opt-text";
  const heading = document.createElement("div");
  heading.className = "settings-opt-title";
  heading.textContent = title;
  text.appendChild(heading);
  if (desc) {
    const body = document.createElement("div");
    body.className = "settings-opt-desc";
    body.textContent = desc;
    text.appendChild(body);
  }
  if (later) text.appendChild(roleLaterNote(later));
  row.appendChild(text);
  if (control) {
    const wrap = document.createElement("div");
    wrap.className = "settings-opt-control";
    wrap.appendChild(control);
    row.appendChild(wrap);
  }
  return row;
}

function livePermIds() {
  const ids = [];
  SERVER_ROLE_PERMS.forEach((group) => {
    group.rows.forEach((row) => {
      if (!row.later) ids.push(row.id);
    });
  });
  return ids;
}

function paintServerRolesList() {
  const host = document.getElementById("server-roles-list");
  if (!host) return;
  host.innerHTML = "";
  serverRolesDraft.forEach((role) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "server-role-item" + (role.id === serverRolesSelectedId ? " is-on" : "");
    const name = document.createElement("span");
    name.className = "server-role-item-name";
    name.textContent = role.name || "New Role";
    name.style.color = role.color || "";
    btn.appendChild(name);
    if (isDirtyServerRole(role)) {
      const dot = document.createElement("span");
      dot.className = "server-role-dirty";
      btn.appendChild(dot);
    }
    btn.addEventListener("click", () => {
      serverRolesSelectedId = role.id;
      paintServerRolesPage();
    });
    host.appendChild(btn);
  });
}

function paintServerRolesEditor() {
  const host = document.getElementById("server-roles-editor");
  if (!host) return;
  const role = selectedServerRole();
  if (!role) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = "";

  const nameField = document.createElement("div");
  nameField.className = "server-settings-field";
  const nameLabel = document.createElement("label");
  nameLabel.className = "server-settings-field-title";
  nameLabel.setAttribute("for", "server-roles-name");
  nameLabel.textContent = "Role name";
  const nameInput = document.createElement("input");
  nameInput.id = "server-roles-name";
  nameInput.className = "server-settings-input";
  nameInput.type = "text";
  nameInput.maxLength = 25;
  nameInput.autocomplete = "off";
  nameInput.value = role.name || "";
  nameInput.addEventListener("input", () => {
    role.name = nameInput.value;
    afterRoleChange(false);
  });
  nameField.appendChild(nameLabel);
  nameField.appendChild(nameInput);
  host.appendChild(nameField);

  const colorField = document.createElement("div");
  colorField.className = "server-settings-field";
  const colorTitle = document.createElement("div");
  colorTitle.className = "server-settings-field-title";
  colorTitle.textContent = "Role color";
  colorField.appendChild(colorTitle);

  const seg = document.createElement("div");
  seg.className = "appearance-seg server-roles-seg";
  const solidBtn = document.createElement("button");
  solidBtn.type = "button";
  solidBtn.textContent = "Solid";
  solidBtn.className = role.colorMode !== "gradient" ? "is-on" : "";
  solidBtn.addEventListener("click", () => {
    role.colorMode = "solid";
    paintServerRolesEditor();
  });
  const gradBtn = document.createElement("button");
  gradBtn.type = "button";
  gradBtn.textContent = "Gradient";
  gradBtn.className = role.colorMode === "gradient" ? "is-on" : "";
  gradBtn.addEventListener("click", () => {
    role.colorMode = "gradient";
    paintServerRolesEditor();
  });
  seg.appendChild(solidBtn);
  seg.appendChild(gradBtn);
  colorField.appendChild(seg);

  if (role.colorMode === "gradient") {
    const swatches = document.createElement("div");
    swatches.className = "server-roles-swatches";
    swatches.style.opacity = "0.55";
    swatches.style.pointerEvents = "none";
    ["#43b581", "#3498db"].forEach((hex) => {
      const dot = document.createElement("span");
      dot.className = "server-role-swatch";
      dot.style.background = hex;
      swatches.appendChild(dot);
    });
    colorField.appendChild(swatches);
    colorField.appendChild(roleLaterNote("Gradient role colors"));
  } else {
    const swatches = document.createElement("div");
    swatches.className = "server-roles-swatches";
    SERVER_ROLE_SWATCHES.forEach((hex) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "server-role-swatch" + ((role.color || "").toLowerCase() === hex.toLowerCase() ? " is-on" : "");
      dot.style.background = hex;
      dot.title = hex;
      dot.addEventListener("click", () => {
        role.color = hex;
        afterRoleChange(true);
      });
      swatches.appendChild(dot);
    });
    const custom = document.createElement("button");
    custom.type = "button";
    const inPalette = SERVER_ROLE_SWATCHES.some((hex) => hex.toLowerCase() === (role.color || "").toLowerCase());
    custom.className = "server-role-swatch-custom" + (!inPalette && role.color ? " is-on" : "");
    custom.textContent = "+";
    custom.title = "Custom color";
    if (!inPalette && role.color) custom.style.background = role.color;
    const native = document.createElement("input");
    native.type = "color";
    native.value = role.color || "#99aab5";
    native.hidden = true;
    custom.addEventListener("click", () => native.click());
    native.addEventListener("input", () => {
      role.color = native.value;
      custom.className = "server-role-swatch-custom is-on";
      custom.style.background = role.color;
      afterRoleChange(false);
    });
    swatches.appendChild(custom);
    swatches.appendChild(native);
    colorField.appendChild(swatches);
  }
  host.appendChild(colorField);

  const settingsField = document.createElement("div");
  settingsField.className = "server-settings-field";
  const settingsTitle = document.createElement("div");
  settingsTitle.className = "server-settings-field-title";
  settingsTitle.textContent = "Role settings";
  settingsField.appendChild(settingsTitle);
  SERVER_ROLE_SETTING_ROWS.forEach((row) => {
    const later = row.later;
    settingsField.appendChild(roleOptRow(
      row.title,
      row.desc,
      roleToggle(!!role[row.id], !!later, (on) => { role[row.id] = on; afterRoleChange(false); }),
      later
    ));
  });
  host.appendChild(settingsField);

  const bulkField = document.createElement("div");
  bulkField.className = "server-settings-field";
  const bulkTitle = document.createElement("div");
  bulkTitle.className = "server-settings-field-title";
  bulkTitle.textContent = "Bulk permission actions";
  const bulkRow = document.createElement("div");
  bulkRow.className = "server-roles-bulk";
  const disableAll = document.createElement("button");
  disableAll.type = "button";
  disableAll.className = "settings-row-btn";
  disableAll.textContent = "Disable all";
  disableAll.addEventListener("click", () => {
    livePermIds().forEach((id) => { role.perms[id] = false; });
    afterRoleChange(true);
  });
  const enableAll = document.createElement("button");
  enableAll.type = "button";
  enableAll.className = "settings-row-btn";
  enableAll.textContent = "Enable all";
  enableAll.addEventListener("click", () => {
    livePermIds().forEach((id) => { role.perms[id] = true; });
    afterRoleChange(true);
  });
  bulkRow.appendChild(disableAll);
  bulkRow.appendChild(enableAll);
  bulkField.appendChild(bulkTitle);
  bulkField.appendChild(bulkRow);
  host.appendChild(bulkField);

  SERVER_ROLE_PERMS.forEach((group) => {
    const block = document.createElement("div");
    block.className = "server-roles-group";
    const heading = document.createElement("div");
    heading.className = "server-roles-group-title";
    heading.textContent = group.title;
    block.appendChild(heading);
    group.rows.forEach((row) => {
      block.appendChild(roleOptRow(
        row.title,
        row.desc,
        roleToggle(!!role.perms[row.id], !!row.later, (on) => { role.perms[row.id] = on; afterRoleChange(false); }),
        row.later
      ));
    });
    host.appendChild(block);
  });
}

function afterRoleChange(repaintEditor) {
  if (repaintEditor) paintServerRolesEditor();
  paintServerRolesList();
  paintServerRolesReview();
}

function paintServerRolesPage() {
  paintServerRolesList();
  paintServerRolesEditor();
  paintServerRolesReview();
}

function revertRoleChange(role, change) {
  const origin = serverRolesOrigin[role.id];
  if (change.key === "created") {
    serverRolesDraft = serverRolesDraft.filter((row) => row.id !== role.id);
    delete serverRolesOrigin[role.id];
    if (serverRolesSelectedId === role.id) {
      const members = serverRolesDraft.find((row) => row.builtin);
      serverRolesSelectedId = members ? members.id : (serverRolesDraft[0] && serverRolesDraft[0].id) || "";
    }
    paintServerRolesPage();
    return;
  }
  if (!origin) return;
  if (change.key === "name") role.name = origin.name;
  else if (change.key === "color") role.color = origin.color;
  else if (change.key === "mentionable" || change.key === "hoist" || change.key === "nameColor") role[change.key] = origin[change.key];
  else if (change.key.indexOf("perm:") === 0) {
    const id = change.key.slice(5);
    role.perms[id] = !!origin.perms[id];
  }
  afterRoleChange(true);
}

function paintChangeValue(kind, value) {
  if (kind === "color") {
    const swatch = document.createElement("span");
    swatch.className = "server-role-change-swatch";
    swatch.style.background = normRoleColor(value);
    swatch.title = normRoleColor(value);
    return swatch;
  }
  const text = document.createElement("span");
  text.textContent = kind === "toggle" ? onOffLabel(value) : (value || "—");
  return text;
}

function paintServerRolesReview() {
  const host = document.getElementById("server-roles-review");
  if (!host) return;
  const dirty = dirtyServerRoles();
  host.hidden = dirty.length === 0;
  host.innerHTML = "";
  if (!dirty.length) return;

  const card = document.createElement("div");
  card.className = "server-roles-review-card";

  const title = document.createElement("div");
  title.className = "server-settings-field-title";
  title.textContent = "Unsaved changes";
  card.appendChild(title);

  const body = document.createElement("div");
  body.className = "server-roles-review-body";

  dirty.forEach((role) => {
    const wrap = document.createElement("div");
    wrap.className = "server-roles-review-role";
    const header = document.createElement("button");
    header.type = "button";
    header.className = "server-roles-review-head";
    const open = serverRolesReviewOpen[role.id] !== false;
    header.classList.toggle("is-open", open);
    header.setAttribute("aria-expanded", open ? "true" : "false");
    const name = document.createElement("span");
    name.className = "server-roles-review-head-name";
    name.style.color = role.color || "";
    name.textContent = role.name || "New Role";
    const caret = document.createElement("span");
    caret.className = "server-roles-review-caret";
    caret.textContent = open ? "▾" : "▸";
    header.appendChild(name);
    header.appendChild(caret);
    header.addEventListener("click", () => {
      serverRolesReviewOpen[role.id] = !open;
      paintServerRolesReview();
    });
    wrap.appendChild(header);
    if (open) {
      const list = document.createElement("div");
      list.className = "server-roles-review-list";
      roleChanges(role).forEach((change) => {
        const row = document.createElement("div");
        row.className = "server-roles-review-row";
        const copy = document.createElement("div");
        copy.className = "server-roles-review-copy";
        const label = document.createElement("div");
        label.className = "server-roles-review-label";
        label.textContent = change.label;
        copy.appendChild(label);
        if (change.kind !== "created") {
          const diff = document.createElement("div");
          diff.className = "server-roles-review-diff";
          diff.appendChild(paintChangeValue(change.kind, change.from));
          const arrow = document.createElement("span");
          arrow.textContent = "→";
          diff.appendChild(arrow);
          diff.appendChild(paintChangeValue(change.kind, change.to));
          copy.appendChild(diff);
        }
        row.appendChild(copy);
        const revert = document.createElement("button");
        revert.type = "button";
        revert.className = "ghost-btn";
        revert.textContent = "Revert";
        revert.addEventListener("click", () => revertRoleChange(role, change));
        row.appendChild(revert);
        list.appendChild(row);
      });
      wrap.appendChild(list);
    }
    body.appendChild(wrap);
  });
  card.appendChild(body);

  if (serverRolesSaveError) {
    const err = document.createElement("p");
    err.className = "server-settings-help";
    err.style.color = "var(--danger)";
    err.textContent = serverRolesSaveError;
    card.appendChild(err);
  }

  const actions = document.createElement("div");
  actions.className = "server-roles-review-actions";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "settings-row-btn";
  confirm.textContent = "Confirm";
  confirm.disabled = serverRolesSaving;
  confirm.addEventListener("click", () => confirmServerRoles());
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ghost-btn";
  cancel.textContent = "Cancel";
  cancel.disabled = serverRolesSaving;
  cancel.addEventListener("click", () => cancelServerRoles());
  actions.appendChild(confirm);
  actions.appendChild(cancel);
  card.appendChild(actions);
  host.appendChild(card);
}

function addServerRoleLocal() {
  const id = "draft-" + serverRolesNextId;
  serverRolesNextId += 1;
  const role = {
    id,
    name: "New Role",
    builtin: false,
    color: SERVER_ROLE_SWATCHES[serverRolesDraft.length % SERVER_ROLE_SWATCHES.length],
    colorMode: "solid",
    selfAssign: false,
    mentionable: false,
    hoist: false,
    nameColor: false,
    perms: emptyServerRolePerms(),
    created: true
  };
  serverRolesOrigin[id] = cloneServerRole(role);
  const membersAt = serverRolesDraft.findIndex((row) => row.builtin);
  if (membersAt === -1) serverRolesDraft.push(role);
  else serverRolesDraft.splice(membersAt, 0, role);
  serverRolesSelectedId = id;
  serverRolesReviewOpen[id] = true;
  paintServerRolesPage();
}

async function loadServerRoles() {
  if (!currentServerId) {
    resetServerRolesDraft();
    paintServerRolesPage();
    return;
  }
  try {
    const response = await fetch(`https://${serverAddress}/get_server_roles/${currentServerId}`, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not load roles.");
    applyServerRolesFromApi(data.roles || []);
    serverRolesLoadedFor = currentServerId;
  } catch (err) {
    resetServerRolesDraft();
    serverRolesSaveError = err.message || "Could not load roles.";
  }
  paintServerRolesPage();
}

function cancelServerRoles() {
  applyServerRolesFromApi(serverRolesSaved);
  serverRolesLoadedFor = currentServerId;
  paintServerRolesPage();
}

async function confirmServerRoles() {
  if (!currentServerId) return;
  if (currentServerOwnerId !== myUserId) {
    serverRolesSaveError = "Only the server owner can change roles.";
    paintServerRolesReview();
    return;
  }
  const dirty = dirtyServerRoles();
  if (!dirty.length) return;
  serverRolesSaving = true;
  serverRolesSaveError = "";
  paintServerRolesReview();
  try {
    const response = await fetch(`https://${serverAddress}/save_server_roles`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        roles: dirty.map((role) => ({
          id: isCreatedServerRole(role) ? null : parseInt(role.id, 10),
          client_id: role.id,
          name: role.name,
          color: role.color,
          position: serverRolesDraft.indexOf(role),
          mentionable: !!role.mentionable,
          hoist: !!role.hoist,
          name_color: !!role.nameColor,
          permissions: role.perms
        }))
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save roles.");
    applyServerRolesFromApi(data.roles || []);
    serverRolesLoadedFor = currentServerId;
    if (typeof refreshServerMemberList === "function") refreshServerMemberList(currentServerId);
  } catch (err) {
    serverRolesSaveError = err.message || "Could not save roles.";
  } finally {
    serverRolesSaving = false;
    paintServerRolesPage();
  }
}

async function showServerSettingsTab(tab) {
  const overview = document.getElementById("server-settings-overview");
  const roles = document.getElementById("server-settings-roles");
  if (overview) overview.hidden = tab !== "overview";
  if (roles) roles.hidden = tab !== "roles";
  document.querySelectorAll("#server-settings-nav .server-settings-nav-item[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
  });
  if (tab !== "roles") return;
  if (serverRolesLoadedFor !== currentServerId) await loadServerRoles();
  else paintServerRolesPage();
}

resetServerRolesDraft();

document.getElementById("server-roles-add").addEventListener("click", () => {
  addServerRoleLocal();
});

document.querySelectorAll("#server-settings-nav .server-settings-nav-item[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    showServerSettingsTab(btn.getAttribute("data-tab"));
  });
});
