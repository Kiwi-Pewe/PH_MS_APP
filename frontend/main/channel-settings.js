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

function channelSettingsPermGroups() {
  const groups = typeof SERVER_ROLE_PERMS !== "undefined" ? SERVER_ROLE_PERMS : [];
  const wanted = channelSettingsPermGroupIds(
    channelSettingsKind,
    channelSettingsTarget && channelSettingsTarget.channel_type
  );
  return groups.map((group) => {
    const key = channelSettingsPermGroupKey(group.title);
    if (!wanted.includes(key)) return null;
    if (key !== "general") return group;
    return {
      title: group.title,
      rows: (group.rows || []).filter((row) => CHANNEL_SETTINGS_GENERAL_IDS.includes(row.id)),
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
  if (rows.length === 1) {
    rows.push({ id: "sample-mod", name: "Moderator", color: "#3498db", sample: true });
  }
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
