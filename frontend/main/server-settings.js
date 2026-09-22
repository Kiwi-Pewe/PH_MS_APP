// ==================================================================
// server-settings.js - Server Settings overlay. Overview Avatar is
// live this pass (owner upload / remove). Other Overview fields and
// every other index row stay parked.
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

function openServerSettings() {
  if (!currentServerId) return;
  if (typeof closeSettingsChrome === "function") closeSettingsChrome();
  if (typeof closeProfileChrome === "function" && !closeProfileChrome()) return;
  if (typeof closeContextMenu === "function") closeContextMenu();

  isServerSettingsOpen = true;
  const name = currentServerSettingsName();
  const label = document.getElementById("server-settings-index-label");
  if (label) label.textContent = name;
  const nameInput = document.getElementById("server-settings-name");
  if (nameInput) nameInput.value = name;
  setServerSettingsAvatarStatus("");
  paintServerSettingsAvatar();

  const overlay = document.getElementById("server-settings-overlay");
  if (overlay) overlay.hidden = false;
}

function closeServerSettingsChrome() {
  isServerSettingsOpen = false;
  const overlay = document.getElementById("server-settings-overlay");
  if (overlay) overlay.hidden = true;
  const input = document.getElementById("server-settings-avatar-file");
  if (input) input.value = "";
  setServerSettingsAvatarStatus("");
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

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!isServerSettingsOpen) return;
  if (typeof activeMenuEl !== "undefined" && activeMenuEl) return;
  closeServerSettingsChrome();
});
