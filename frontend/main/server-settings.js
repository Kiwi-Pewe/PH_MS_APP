// ==================================================================
// server-settings.js - Server Settings overlay. This pass is shape
// only: Overview is drawn, other index rows are greyed, nothing saves.
// ==================================================================

function openServerSettings() {
  if (!currentServerId) return;
  if (typeof closeSettingsChrome === "function") closeSettingsChrome();
  if (typeof closeProfileChrome === "function" && !closeProfileChrome()) return;
  if (typeof closeContextMenu === "function") closeContextMenu();

  isServerSettingsOpen = true;
  const name = document.getElementById("server-sidebar-name").textContent
    || (serverList.find(s => s.id === currentServerId) || {}).name
    || "";
  const label = document.getElementById("server-settings-index-label");
  if (label) label.textContent = name;
  const nameInput = document.getElementById("server-settings-name");
  if (nameInput) nameInput.value = name;
  const letter = document.getElementById("server-settings-avatar-letter");
  if (letter) {
    letter.textContent = typeof serverAvatarLetters === "function"
      ? serverAvatarLetters(name)
      : (name || "?").slice(0, 1);
  }

  const overlay = document.getElementById("server-settings-overlay");
  if (overlay) overlay.hidden = false;
}

function closeServerSettingsChrome() {
  isServerSettingsOpen = false;
  const overlay = document.getElementById("server-settings-overlay");
  if (overlay) overlay.hidden = true;
}

document.getElementById("server-settings-close").addEventListener("click", () => {
  closeServerSettingsChrome();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!isServerSettingsOpen) return;
  if (typeof activeMenuEl !== "undefined" && activeMenuEl) return;
  closeServerSettingsChrome();
});
