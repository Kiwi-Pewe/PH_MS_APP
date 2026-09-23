// ==================================================================
// server-settings.js - Server Settings overlay. Overview is live.
// Update server or Manage roles opens this overlay. Roles is Manage
// roles only, and only roles below yours. Every other index row stays grey.
// ==================================================================

function canServerPerm(perm) {
  if (currentServerOwnerId === myUserId) return true;
  return !!(currentServerPerms && currentServerPerms[perm]);
}

function canUpdateServer() {
  return canServerPerm("update_server");
}

function canManageRoles() {
  return canServerPerm("manage_roles");
}

function canInviteMembers() {
  return canServerPerm("invite_members");
}

function canManageChannels() {
  return canServerPerm("manage_channels");
}

function canMentionEveryone() {
  return canServerPerm("mention_everyone");
}

function canViewAnnouncements() {
  return canServerPerm("view_announcements");
}

function canCreateAnnouncements() {
  return canServerPerm("create_announcements");
}

function canManageAnnouncements() {
  return canServerPerm("manage_announcements");
}

function canReadForums() {
  return canServerPerm("read_forums");
}

function canCreateTopics() {
  return canServerPerm("create_topics");
}

function canCreateTopicReplies() {
  return canServerPerm("create_topic_replies");
}

function canReadMessages() {
  return canServerPerm("read_messages");
}

function canSendMessages() {
  return canServerPerm("send_messages");
}

function canUploadChatMedia() {
  return canServerPerm("upload_chat_media");
}

function canManageMessages() {
  return canServerPerm("manage_messages");
}

function canOpenServerSettings() {
  return canUpdateServer() || canManageRoles();
}

function applyServerPerms(perms, highestRole, timeoutUntil) {
  currentServerPerms = perms && typeof perms === "object" ? perms : {};
  if (arguments.length > 1) currentServerHighestRole = highestRole || null;
  if (arguments.length > 2) {
    currentServerTimeoutUntil = timeoutUntil || null;
    if (typeof paintServerTimeoutLock === "function") paintServerTimeoutLock();
  }
  paintServerSettingsAccess();
  if (typeof currentServerData !== "undefined" && currentServerData && typeof renderServerSidebar === "function") {
    renderServerSidebar(currentServerData);
  }
  if (typeof paintAnnouncementAccess === "function") paintAnnouncementAccess();
  if (typeof paintForumAccess === "function") paintForumAccess();
  if (typeof paintChatAccess === "function") paintChatAccess();
  if (typeof isServerSettingsOpen !== "undefined" && isServerSettingsOpen && !canOpenServerSettings()) {
    closeServerSettingsChrome();
  }
}

async function refreshServerPerms() {
  if (!currentServerId) return;
  try {
    const response = await fetch(`https://${serverAddress}/get_server_perms/${currentServerId}`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    applyServerPerms(data.permissions || {}, data.highest_role, data.timeout_until);
  } catch (e) { /* keep the last known set */ }
}

function paintServerSettingsAccess() {
  const rolesBtn = document.querySelector('#server-settings-nav [data-tab="roles"]');
  if (!rolesBtn) return;
  const allowRoles = canManageRoles();
  rolesBtn.disabled = !allowRoles;
  rolesBtn.classList.toggle("is-later", !allowRoles);
  if (!allowRoles && typeof isServerSettingsOpen !== "undefined" && isServerSettingsOpen) {
    const roles = document.getElementById("server-settings-roles");
    if (roles && !roles.hidden && typeof showServerSettingsTab === "function") {
      showServerSettingsTab("overview");
    }
  }
}

function currentServerIconUrl() {
  if (currentServerData && currentServerId && currentServerData.icon_url) {
    return currentServerData.icon_url;
  }
  const meta = serverList.find(s => s.id === currentServerId);
  return (meta && meta.icon_url) || "";
}

function currentServerSettingsName() {
  return document.getElementById("server-sidebar-name").textContent
    || (serverList.find(s => s.id === currentServerId) || {}).name
    || "";
}

function setServerSettingsAvatarStatus(text) {
  const status = document.getElementById("server-settings-avatar-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function setServerSettingsAvatarBusy(busy) {
  const upload = document.getElementById("server-settings-avatar-upload");
  const remove = document.getElementById("server-settings-avatar-remove");
  if (upload) upload.disabled = !!busy;
  if (remove) remove.disabled = !!busy;
}

function paintServerSettingsAvatar() {
  const face = document.getElementById("server-settings-avatar");
  const letter = document.getElementById("server-settings-avatar-letter");
  const remove = document.getElementById("server-settings-avatar-remove");
  if (!face) return;
  const name = currentServerSettingsName();
  if (letter) {
    letter.textContent = typeof serverAvatarLetters === "function"
      ? serverAvatarLetters(name)
      : (name || "?").slice(0, 1);
  }
  const url = currentServerIconUrl();
  let img = face.querySelector(".server-settings-avatar-img");
  if (url) {
    face.classList.add("has-icon");
    if (!img) {
      img = document.createElement("img");
      img.className = "server-settings-avatar-img";
      img.alt = "";
      face.appendChild(img);
    }
    img.src = url;
  } else {
    face.classList.remove("has-icon");
    if (img) img.remove();
  }
  if (remove) remove.hidden = !url;
}

async function saveServerIcon(payload) {
  const response = await fetch(`https://${serverAddress}/update_server_icon`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Could not save the server icon.");
  return data;
}

async function uploadServerSettingsAvatar(file) {
  if (!currentServerId) return;
  if (!canUpdateServer()) return;
  setServerSettingsAvatarBusy(true);
  setServerSettingsAvatarStatus("Uploading…");
  try {
    if (typeof uploadServerIconFile !== "function") throw new Error("Upload is not available.");
    const att = await uploadServerIconFile(file);
    const saved = await saveServerIcon({
      server_id: currentServerId,
      key: att.key,
      mime: att.mime,
      size: att.size,
      name: att.name
    });
    if (typeof applyServerIcon === "function") applyServerIcon(currentServerId, saved.icon_url || att.url || "");
    setServerSettingsAvatarStatus("");
  } catch (err) {
    setServerSettingsAvatarStatus(err.message || "Could not upload that image.");
  } finally {
    setServerSettingsAvatarBusy(false);
    const input = document.getElementById("server-settings-avatar-file");
    if (input) input.value = "";
  }
}

function currentServerBanner() {
  const fromOpen = currentServerData && currentServerId ? currentServerData : null;
  const meta = serverList.find(s => s.id === currentServerId) || {};
  return {
    banner_url: (fromOpen && fromOpen.banner_url) || meta.banner_url || "",
    banner_color: (fromOpen && fromOpen.banner_color) || meta.banner_color || ""
  };
}

function defaultServerBannerColor() {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  if (typeof appearanceHex === "function" && appearanceHex(accent)) return appearanceHex(accent);
  return "#8b5cf6";
}

function setServerSettingsBannerStatus(text) {
  const status = document.getElementById("server-settings-banner-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function setServerSettingsBannerBusy(busy) {
  ["server-settings-banner-upload", "server-settings-banner-color-btn", "server-settings-banner-remove", "server-settings-banner-color", "server-settings-banner-hex"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !!busy;
  });
}

function syncServerSettingsBannerColorInputs(color) {
  const hex = (typeof appearanceHex === "function" && appearanceHex(color)) || defaultServerBannerColor();
  const native = document.getElementById("server-settings-banner-native");
  const picker = document.getElementById("server-settings-banner-color");
  const text = document.getElementById("server-settings-banner-hex");
  if (native) native.value = hex;
  if (picker) picker.value = hex;
  if (text) text.value = hex;
}

function paintServerSettingsBanner() {
  const preview = document.getElementById("server-settings-banner");
  const remove = document.getElementById("server-settings-banner-remove");
  const colorRow = document.getElementById("server-settings-banner-color-row");
  if (!preview) return;
  const current = currentServerBanner();
  const url = current.banner_url;
  const color = current.banner_color;
  preview.style.backgroundImage = url ? "url(" + JSON.stringify(url) + ")" : "";
  preview.style.backgroundColor = (!url && color) ? color : "";
  preview.classList.toggle("has-image", !!url);
  preview.classList.toggle("has-color", !url && !!color);
  if (remove) remove.hidden = !(url || color);
  if (colorRow) colorRow.hidden = !(color && !url);
  if (color && !url) syncServerSettingsBannerColorInputs(color);
}

async function saveServerBanner(payload) {
  const response = await fetch(`https://${serverAddress}/update_server_banner`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save the server banner.");
  return data;
}

function applySavedBanner(saved) {
  if (typeof applyServerBanner === "function") {
    applyServerBanner(currentServerId, {
      banner_url: saved.banner_url || "",
      banner_color: saved.banner_color || ""
    });
  } else {
    paintServerSettingsBanner();
  }
}

async function uploadServerSettingsBanner(file) {
  if (!currentServerId) return;
  if (!canUpdateServer()) return;
  setServerSettingsBannerBusy(true);
  setServerSettingsBannerStatus("Uploading…");
  try {
    if (typeof uploadServerIconFile !== "function") throw new Error("Upload is not available.");
    const att = await uploadServerIconFile(file);
    const saved = await saveServerBanner({
      server_id: currentServerId,
      key: att.key,
      mime: att.mime,
      size: att.size,
      name: att.name
    });
    applySavedBanner(saved);
    setServerSettingsBannerStatus("");
  } catch (err) {
    setServerSettingsBannerStatus(err.message || "Could not upload that image.");
  } finally {
    setServerSettingsBannerBusy(false);
    const input = document.getElementById("server-settings-banner-file");
    if (input) input.value = "";
  }
}

async function saveServerSettingsBannerColor(color) {
  if (!currentServerId) return;
  if (!canUpdateServer()) return;
  const hex = (typeof appearanceHex === "function" && appearanceHex(color)) || "";
  if (!hex) {
    setServerSettingsBannerStatus("Use a hex color like #8b5cf6.");
    return;
  }
  setServerSettingsBannerBusy(true);
  setServerSettingsBannerStatus("");
  try {
    const saved = await saveServerBanner({ server_id: currentServerId, color: hex });
    applySavedBanner(saved);
  } catch (err) {
    setServerSettingsBannerStatus(err.message || "Could not save that color.");
  } finally {
    setServerSettingsBannerBusy(false);
  }
}

async function removeServerSettingsBanner() {
  if (!currentServerId) return;
  if (!canUpdateServer()) return;
  setServerSettingsBannerBusy(true);
  setServerSettingsBannerStatus("");
  try {
    const saved = await saveServerBanner({ server_id: currentServerId });
    applySavedBanner(saved);
  } catch (err) {
    setServerSettingsBannerStatus(err.message || "Could not remove the banner.");
  } finally {
    setServerSettingsBannerBusy(false);
  }
}

async function removeServerSettingsAvatar() {
  if (!currentServerId) return;
  if (!canUpdateServer()) return;
  setServerSettingsAvatarBusy(true);
  setServerSettingsAvatarStatus("");
  try {
    await saveServerIcon({ server_id: currentServerId, key: null });
    if (typeof applyServerIcon === "function") applyServerIcon(currentServerId, "");
  } catch (err) {
    setServerSettingsAvatarStatus(err.message || "Could not remove the icon.");
  } finally {
    setServerSettingsAvatarBusy(false);
  }
}

function savedServerSettingsName() {
  return (serverList.find(s => s.id === currentServerId) || {}).name
    || document.getElementById("server-sidebar-name").textContent
    || "";
}

function typedServerSettingsName() {
  const input = document.getElementById("server-settings-name");
  return input ? input.value : "";
}

function setServerSettingsNameStatus(text) {
  const status = document.getElementById("server-settings-name-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function setServerSettingsNameBusy(busy) {
  const input = document.getElementById("server-settings-name");
  const confirm = document.getElementById("server-settings-name-confirm");
  const cancel = document.getElementById("server-settings-name-cancel");
  if (input) input.disabled = !!busy;
  if (confirm) confirm.disabled = !!busy;
  if (cancel) cancel.disabled = !!busy;
}

function paintServerSettingsNameActions() {
  const actions = document.getElementById("server-settings-name-actions");
  const confirm = document.getElementById("server-settings-name-confirm");
  const typed = typedServerSettingsName().trim();
  const dirty = typed !== savedServerSettingsName().trim();
  if (actions) actions.hidden = !dirty;
  if (confirm) confirm.disabled = !typed;
}

function syncServerSettingsName(name) {
  const input = document.getElementById("server-settings-name");
  if (input) input.value = name || "";
  setServerSettingsNameStatus("");
  paintServerSettingsNameActions();
}

async function confirmServerSettingsName() {
  if (!currentServerId || !canUpdateServer()) return;
  const name = typedServerSettingsName().trim();
  if (!name) {
    setServerSettingsNameStatus("Server name cannot be empty.");
    paintServerSettingsNameActions();
    return;
  }
  if (name === savedServerSettingsName().trim()) {
    paintServerSettingsNameActions();
    return;
  }
  setServerSettingsNameBusy(true);
  setServerSettingsNameStatus("");
  try {
    const response = await fetch(`https://${serverAddress}/update_server_name`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: currentServerId, name })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save the server name.");
    if (typeof applyServerName === "function") applyServerName(currentServerId, data.name || name);
  } catch (err) {
    setServerSettingsNameStatus(err.message || "Could not save the server name.");
  } finally {
    setServerSettingsNameBusy(false);
    paintServerSettingsNameActions();
  }
}

function cancelServerSettingsName() {
  syncServerSettingsName(savedServerSettingsName());
}

function savedServerSettingsAbout() {
  if (currentServerData && currentServerId && typeof currentServerData.about === "string") {
    return currentServerData.about;
  }
  return (serverList.find(s => s.id === currentServerId) || {}).about || "";
}

function typedServerSettingsAbout() {
  const area = document.getElementById("server-settings-about");
  return area ? area.value : "";
}

function setServerSettingsAboutStatus(text) {
  const status = document.getElementById("server-settings-about-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function setServerSettingsAboutBusy(busy) {
  const area = document.getElementById("server-settings-about");
  const confirm = document.getElementById("server-settings-about-confirm");
  const cancel = document.getElementById("server-settings-about-cancel");
  if (area) area.disabled = !!busy;
  if (confirm) confirm.disabled = !!busy;
  if (cancel) cancel.disabled = !!busy;
}

function autosizeServerSettingsAbout() {
  const area = document.getElementById("server-settings-about");
  if (!area) return;
  area.style.height = "auto";
  area.style.height = Math.max(area.scrollHeight, 96) + "px";
}

function paintServerSettingsAboutActions() {
  const actions = document.getElementById("server-settings-about-actions");
  if (actions) actions.hidden = typedServerSettingsAbout() === savedServerSettingsAbout();
}

function syncServerSettingsAbout(about) {
  const area = document.getElementById("server-settings-about");
  if (area) area.value = about || "";
  setServerSettingsAboutStatus("");
  paintServerSettingsAboutActions();
  autosizeServerSettingsAbout();
}

async function confirmServerSettingsAbout() {
  if (!currentServerId || !canUpdateServer()) return;
  const about = typedServerSettingsAbout();
  if (about === savedServerSettingsAbout()) {
    paintServerSettingsAboutActions();
    return;
  }
  if (about.length > 2000) {
    setServerSettingsAboutStatus("About text is too long.");
    return;
  }
  setServerSettingsAboutBusy(true);
  setServerSettingsAboutStatus("");
  try {
    const response = await fetch(`https://${serverAddress}/update_server_about`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: currentServerId, about })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save the about text.");
    if (typeof applyServerAbout === "function") applyServerAbout(currentServerId, data.about || about);
  } catch (err) {
    setServerSettingsAboutStatus(err.message || "Could not save the about text.");
  } finally {
    setServerSettingsAboutBusy(false);
    paintServerSettingsAboutActions();
    autosizeServerSettingsAbout();
  }
}

function cancelServerSettingsAbout() {
  syncServerSettingsAbout(savedServerSettingsAbout());
}

const SERVER_NAME_MAX = 25;
const SERVER_SLUG_RE = new RegExp("^[A-Za-z](?:[A-Za-z0-9-]{0," + Math.max(0, SERVER_NAME_MAX - 2) + "}[A-Za-z0-9])$");
const RESERVED_SERVER_SLUGS = {
  main: true, app: true, login: true, invite: true, admin: true, shared: true,
  accessibility: true, index: true, api: true, cdn: true, settings: true,
  profile: true, communities: true, games: true, announcements: true,
  feedback: true, messages: true, home: true, server: true, servers: true,
  about: true, help: true, support: true, legal: true, terms: true,
  privacy: true, status: true, blog: true, docs: true, static: true,
  assets: true, oneira: true, www: true, mail: true
};

function cleanServerSettingsSlug(value) {
  let text = String(value || "").trim();
  text = text.replace(/^https?:\/\//i, "");
  text = text.replace(/^(www\.)?oneira\.cc\//i, "");
  return text.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9-]/g, "");
}

function savedServerSettingsUrl() {
  if (currentServerData && currentServerId && typeof currentServerData.url_slug === "string") {
    return currentServerData.url_slug;
  }
  return (serverList.find(s => s.id === currentServerId) || {}).url_slug || "";
}

function typedServerSettingsUrl() {
  const input = document.getElementById("server-settings-url");
  return input ? cleanServerSettingsSlug(input.value) : "";
}

function setServerSettingsUrlStatus(text) {
  const status = document.getElementById("server-settings-url-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function setServerSettingsUrlBusy(busy) {
  const input = document.getElementById("server-settings-url");
  const confirm = document.getElementById("server-settings-url-confirm");
  const cancel = document.getElementById("server-settings-url-cancel");
  if (input) input.disabled = !!busy;
  if (confirm) confirm.disabled = !!busy;
  if (cancel) cancel.disabled = !!busy;
}

function paintServerSettingsUrlActions() {
  const actions = document.getElementById("server-settings-url-actions");
  if (actions) actions.hidden = typedServerSettingsUrl() === savedServerSettingsUrl();
}

function syncServerSettingsUrl(slug) {
  const input = document.getElementById("server-settings-url");
  if (input) input.value = slug || "";
  setServerSettingsUrlStatus("");
  paintServerSettingsUrlActions();
}

function serverSettingsUrlError(slug) {
  if (!slug) return "";
  if (!SERVER_SLUG_RE.test(slug)) return "Use 2–" + SERVER_NAME_MAX + " letters, numbers, or hyphens, starting with a letter.";
  if (RESERVED_SERVER_SLUGS[slug.toLowerCase()]) return "That URL is reserved.";
  return "";
}

async function confirmServerSettingsUrl() {
  if (!currentServerId || !canUpdateServer()) return;
  const slug = typedServerSettingsUrl();
  if (slug === savedServerSettingsUrl()) {
    paintServerSettingsUrlActions();
    return;
  }
  const reason = serverSettingsUrlError(slug);
  if (reason) {
    setServerSettingsUrlStatus(reason);
    return;
  }
  setServerSettingsUrlBusy(true);
  setServerSettingsUrlStatus("");
  try {
    const response = await fetch(`https://${serverAddress}/update_server_url`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: currentServerId, slug })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save that URL.");
    if (typeof applyServerUrl === "function") applyServerUrl(currentServerId, data.url_slug || slug);
  } catch (err) {
    setServerSettingsUrlStatus(err.message || "Could not save that URL.");
  } finally {
    setServerSettingsUrlBusy(false);
    paintServerSettingsUrlActions();
  }
}

function cancelServerSettingsUrl() {
  syncServerSettingsUrl(savedServerSettingsUrl());
}

const SERVER_TYPES = {
  community: true,
  team: true,
  organization: true,
  clan: true,
  guild: true,
  friends: true,
  streaming: true,
  other: true
};

function savedServerSettingsType() {
  if (currentServerData && currentServerId && typeof currentServerData.server_type === "string") {
    return currentServerData.server_type;
  }
  return (serverList.find(s => s.id === currentServerId) || {}).server_type || "";
}

function setServerSettingsTypeStatus(text) {
  const status = document.getElementById("server-settings-type-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function syncServerSettingsType(kind) {
  const select = document.getElementById("server-settings-type");
  if (select) select.value = kind || "";
  setServerSettingsTypeStatus("");
}

function fillServerSettingsTimezones() {
  const select = document.getElementById("server-settings-timezone");
  if (!select || select.dataset.filled === "1") return;
  let zones = [];
  try {
    if (typeof Intl.supportedValuesOf === "function") zones = Intl.supportedValuesOf("timeZone") || [];
  } catch (e) {
    zones = [];
  }
  if (!zones.length) {
    zones = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo"];
  }
  const groups = {};
  zones.forEach((zone) => {
    const cut = zone.indexOf("/");
    const region = cut === -1 ? "Other" : zone.slice(0, cut);
    const name = (cut === -1 ? zone : zone.slice(cut + 1)).replace(/_/g, " ");
    if (!groups[region]) groups[region] = [];
    groups[region].push({ zone, name });
  });
  select.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Select…";
  select.appendChild(blank);
  Object.keys(groups).sort().forEach((region) => {
    const group = document.createElement("optgroup");
    group.label = region;
    groups[region].sort((a, b) => a.name.localeCompare(b.name)).forEach((item) => {
      const option = document.createElement("option");
      option.value = item.zone;
      option.textContent = item.name;
      group.appendChild(option);
    });
    select.appendChild(group);
  });
  select.dataset.filled = "1";
}

function savedServerSettingsTimezone() {
  if (currentServerData && currentServerId && typeof currentServerData.timezone === "string") {
    return currentServerData.timezone;
  }
  return (serverList.find(s => s.id === currentServerId) || {}).timezone || "";
}

function setServerSettingsTimezoneStatus(text) {
  const status = document.getElementById("server-settings-timezone-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function syncServerSettingsTimezone(zone) {
  fillServerSettingsTimezones();
  const select = document.getElementById("server-settings-timezone");
  if (!select) return;
  const next = zone || "";
  if (next && !Array.from(select.options).some((option) => option.value === next)) {
    const extra = document.createElement("option");
    extra.value = next;
    extra.textContent = next.replace(/_/g, " ");
    select.appendChild(extra);
  }
  select.value = next;
  setServerSettingsTimezoneStatus("");
}

async function saveServerSettingsTimezone(zone) {
  if (!currentServerId || !canUpdateServer()) return;
  const next = (zone || "").trim();
  if (next === savedServerSettingsTimezone()) return;
  const select = document.getElementById("server-settings-timezone");
  if (select) select.disabled = true;
  setServerSettingsTimezoneStatus("");
  try {
    const response = await fetch(`https://${serverAddress}/update_server_timezone`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: currentServerId, timezone: next })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save the timezone.");
    if (typeof applyServerTimezone === "function") applyServerTimezone(currentServerId, data.timezone || next);
  } catch (err) {
    setServerSettingsTimezoneStatus(err.message || "Could not save the timezone.");
    syncServerSettingsTimezone(savedServerSettingsTimezone());
  } finally {
    if (select) select.disabled = false;
  }
}

const SERVER_NOTIFICATIONS = { all: true, mentions: true };
const SERVER_NOTIFICATIONS_DEFAULT = "mentions";

function savedServerSettingsNotifications() {
  if (currentServerData && currentServerId && typeof currentServerData.default_notifications === "string") {
    const kind = currentServerData.default_notifications;
    if (SERVER_NOTIFICATIONS[kind]) return kind;
  }
  const meta = serverList.find(s => s.id === currentServerId) || {};
  if (SERVER_NOTIFICATIONS[meta.default_notifications]) return meta.default_notifications;
  return SERVER_NOTIFICATIONS_DEFAULT;
}

function setServerSettingsNotifyStatus(text) {
  const status = document.getElementById("server-settings-notify-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function syncServerSettingsNotifications(kind) {
  const next = SERVER_NOTIFICATIONS[kind] ? kind : SERVER_NOTIFICATIONS_DEFAULT;
  const list = document.getElementById("server-settings-notify");
  if (!list) return;
  list.querySelectorAll("[data-notify]").forEach((row) => {
    const on = row.getAttribute("data-notify") === next;
    row.classList.toggle("is-on", on);
    row.setAttribute("aria-checked", on ? "true" : "false");
    row.setAttribute("role", "radio");
  });
  setServerSettingsNotifyStatus("");
}

async function saveServerSettingsNotifications(kind) {
  if (!currentServerId || !canUpdateServer()) return;
  const next = (kind || "").trim().toLowerCase();
  if (!SERVER_NOTIFICATIONS[next]) {
    setServerSettingsNotifyStatus("Pick All Messages or Only @mentions.");
    syncServerSettingsNotifications(savedServerSettingsNotifications());
    return;
  }
  if (next === savedServerSettingsNotifications()) return;
  const list = document.getElementById("server-settings-notify");
  if (list) list.querySelectorAll("[data-notify]").forEach((row) => { row.disabled = true; });
  setServerSettingsNotifyStatus("");
  try {
    const response = await fetch(`https://${serverAddress}/update_server_notifications`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: currentServerId, default_notifications: next })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save the default notifications.");
    if (typeof applyServerNotifications === "function") {
      applyServerNotifications(currentServerId, data.default_notifications || next);
    }
  } catch (err) {
    setServerSettingsNotifyStatus(err.message || "Could not save the default notifications.");
    syncServerSettingsNotifications(savedServerSettingsNotifications());
  } finally {
    if (list) list.querySelectorAll("[data-notify]").forEach((row) => { row.disabled = false; });
  }
}

async function saveServerSettingsType(kind) {
  if (!currentServerId || !canUpdateServer()) return;
  const next = (kind || "").trim().toLowerCase();
  if (next && !SERVER_TYPES[next]) {
    setServerSettingsTypeStatus("That is not a server type.");
    syncServerSettingsType(savedServerSettingsType());
    return;
  }
  if (next === savedServerSettingsType()) return;
  const select = document.getElementById("server-settings-type");
  if (select) select.disabled = true;
  setServerSettingsTypeStatus("");
  try {
    const response = await fetch(`https://${serverAddress}/update_server_type`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server_id: currentServerId, server_type: next })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save the server type.");
    if (typeof applyServerType === "function") applyServerType(currentServerId, data.server_type || next);
  } catch (err) {
    setServerSettingsTypeStatus(err.message || "Could not save the server type.");
    syncServerSettingsType(savedServerSettingsType());
  } finally {
    if (select) select.disabled = false;
  }
}

function openServerSettings() {
  if (!currentServerId || !canOpenServerSettings()) return;
  if (typeof closeSettingsChrome === "function") closeSettingsChrome();
  if (typeof closeProfileChrome === "function" && !closeProfileChrome()) return;
  if (typeof closeContextMenu === "function") closeContextMenu();

  isServerSettingsOpen = true;
  paintServerSettingsAccess();
  if (typeof resetServerRolesDraft === "function") resetServerRolesDraft();
  if (typeof showServerSettingsTab === "function") {
    showServerSettingsTab(canUpdateServer() ? "overview" : "roles");
  }
  const name = currentServerSettingsName();
  const label = document.getElementById("server-settings-index-label");
  if (label) label.textContent = name;
  syncServerSettingsName(name);
  syncServerSettingsAbout(savedServerSettingsAbout());
  syncServerSettingsUrl(savedServerSettingsUrl());
  syncServerSettingsType(savedServerSettingsType());
  syncServerSettingsTimezone(savedServerSettingsTimezone());
  syncServerSettingsNotifications(savedServerSettingsNotifications());
  setServerSettingsAvatarStatus("");
  setServerSettingsBannerStatus("");
  paintServerSettingsAvatar();
  paintServerSettingsBanner();

  const overlay = document.getElementById("server-settings-overlay");
  if (overlay) overlay.hidden = false;
  autosizeServerSettingsAbout();
}

function closeServerSettingsChrome() {
  isServerSettingsOpen = false;
  const overlay = document.getElementById("server-settings-overlay");
  if (overlay) overlay.hidden = true;
  const input = document.getElementById("server-settings-avatar-file");
  if (input) input.value = "";
  const bannerFile = document.getElementById("server-settings-banner-file");
  if (bannerFile) bannerFile.value = "";
  setServerSettingsAvatarStatus("");
  setServerSettingsBannerStatus("");
  cancelServerSettingsName();
  cancelServerSettingsAbout();
  cancelServerSettingsUrl();
}

document.getElementById("server-settings-close").addEventListener("click", () => {
  closeServerSettingsChrome();
});

document.getElementById("server-settings-avatar-upload").addEventListener("click", () => {
  if (!canUpdateServer()) return;
  const input = document.getElementById("server-settings-avatar-file");
  if (input) input.click();
});

document.getElementById("server-settings-avatar-file").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) uploadServerSettingsAvatar(file);
});

document.getElementById("server-settings-avatar-remove").addEventListener("click", () => {
  removeServerSettingsAvatar();
});

document.getElementById("server-settings-banner-upload").addEventListener("click", () => {
  if (!canUpdateServer()) return;
  const input = document.getElementById("server-settings-banner-file");
  if (input) input.click();
});

document.getElementById("server-settings-banner-file").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) uploadServerSettingsBanner(file);
});

document.getElementById("server-settings-banner-color-btn").addEventListener("click", () => {
  if (!canUpdateServer()) return;
  const current = currentServerBanner();
  syncServerSettingsBannerColorInputs(current.banner_color || defaultServerBannerColor());
  const native = document.getElementById("server-settings-banner-native");
  if (native) native.click();
});

document.getElementById("server-settings-banner-native").addEventListener("change", (e) => {
  saveServerSettingsBannerColor(e.target.value);
});

document.getElementById("server-settings-banner-color").addEventListener("input", (e) => {
  const preview = document.getElementById("server-settings-banner");
  if (preview) {
    preview.style.backgroundImage = "";
    preview.style.backgroundColor = e.target.value;
  }
  const hex = document.getElementById("server-settings-banner-hex");
  if (hex) hex.value = e.target.value.toLowerCase();
  const native = document.getElementById("server-settings-banner-native");
  if (native) native.value = e.target.value;
});

document.getElementById("server-settings-banner-color").addEventListener("change", (e) => {
  saveServerSettingsBannerColor(e.target.value);
});

document.getElementById("server-settings-banner-hex").addEventListener("change", (e) => {
  const clean = (typeof appearanceHex === "function" && appearanceHex(e.target.value)) || "";
  if (!clean) {
    setServerSettingsBannerStatus("Use a hex color like #8b5cf6.");
    syncServerSettingsBannerColorInputs(currentServerBanner().banner_color || defaultServerBannerColor());
    return;
  }
  syncServerSettingsBannerColorInputs(clean);
  saveServerSettingsBannerColor(clean);
});

document.getElementById("server-settings-banner-remove").addEventListener("click", () => {
  removeServerSettingsBanner();
});

document.getElementById("server-settings-name").addEventListener("input", () => {
  setServerSettingsNameStatus("");
  paintServerSettingsNameActions();
});

document.getElementById("server-settings-name").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  confirmServerSettingsName();
});

document.getElementById("server-settings-name-confirm").addEventListener("click", () => {
  confirmServerSettingsName();
});

document.getElementById("server-settings-name-cancel").addEventListener("click", () => {
  cancelServerSettingsName();
});

document.getElementById("server-settings-about").addEventListener("input", () => {
  setServerSettingsAboutStatus("");
  paintServerSettingsAboutActions();
  autosizeServerSettingsAbout();
});

document.getElementById("server-settings-about-confirm").addEventListener("click", () => {
  confirmServerSettingsAbout();
});

document.getElementById("server-settings-about-cancel").addEventListener("click", () => {
  cancelServerSettingsAbout();
});

document.getElementById("server-settings-url").addEventListener("input", (e) => {
  const input = e.target;
  const cleaned = cleanServerSettingsSlug(input.value).slice(0, SERVER_NAME_MAX);
  if (input.value !== cleaned) input.value = cleaned;
  setServerSettingsUrlStatus("");
  paintServerSettingsUrlActions();
});

document.getElementById("server-settings-url").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  confirmServerSettingsUrl();
});

document.getElementById("server-settings-url-confirm").addEventListener("click", () => {
  confirmServerSettingsUrl();
});

document.getElementById("server-settings-url-cancel").addEventListener("click", () => {
  cancelServerSettingsUrl();
});

document.getElementById("server-settings-type").addEventListener("change", (e) => {
  saveServerSettingsType(e.target.value);
});

document.getElementById("server-settings-timezone").addEventListener("change", (e) => {
  saveServerSettingsTimezone(e.target.value);
});

document.getElementById("server-settings-notify").addEventListener("click", (e) => {
  const row = e.target.closest("[data-notify]");
  if (!row || !document.getElementById("server-settings-notify").contains(row)) return;
  syncServerSettingsNotifications(row.getAttribute("data-notify"));
  saveServerSettingsNotifications(row.getAttribute("data-notify"));
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!isServerSettingsOpen) return;
  if (typeof activeMenuEl !== "undefined" && activeMenuEl) return;
  closeServerSettingsChrome();
});
