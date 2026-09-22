// ==================================================================
// server-settings.js - Server Settings overlay. Overview Avatar,
// Banner, Name, and About are live. Parked Overview fields and every
// other index row stay grey. Gradient banner is later.
// ==================================================================

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
  if (currentServerOwnerId !== myUserId) return;
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
  if (currentServerOwnerId !== myUserId) return;
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
  if (currentServerOwnerId !== myUserId) return;
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
  if (currentServerOwnerId !== myUserId) return;
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
  if (currentServerOwnerId !== myUserId) return;
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
  if (!currentServerId || currentServerOwnerId !== myUserId) return;
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
  if (!currentServerId || currentServerOwnerId !== myUserId) return;
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

function openServerSettings() {
  if (!currentServerId) return;
  if (typeof closeSettingsChrome === "function") closeSettingsChrome();
  if (typeof closeProfileChrome === "function" && !closeProfileChrome()) return;
  if (typeof closeContextMenu === "function") closeContextMenu();

  isServerSettingsOpen = true;
  const name = currentServerSettingsName();
  const label = document.getElementById("server-settings-index-label");
  if (label) label.textContent = name;
  syncServerSettingsName(name);
  syncServerSettingsAbout(savedServerSettingsAbout());
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
}

document.getElementById("server-settings-close").addEventListener("click", () => {
  closeServerSettingsChrome();
});

document.getElementById("server-settings-avatar-upload").addEventListener("click", () => {
  if (currentServerOwnerId !== myUserId) return;
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
  if (currentServerOwnerId !== myUserId) return;
  const input = document.getElementById("server-settings-banner-file");
  if (input) input.click();
});

document.getElementById("server-settings-banner-file").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) uploadServerSettingsBanner(file);
});

document.getElementById("server-settings-banner-color-btn").addEventListener("click", () => {
  if (currentServerOwnerId !== myUserId) return;
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

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!isServerSettingsOpen) return;
  if (typeof activeMenuEl !== "undefined" && activeMenuEl) return;
  closeServerSettingsChrome();
});
