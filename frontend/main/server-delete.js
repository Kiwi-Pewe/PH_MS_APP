// ==================================================================
// server-delete.js - Delete Server submenu (type full name to confirm).
// Unique centered card — same job pattern as admin Delete Account.
// ==================================================================

let deleteServerDraft = null;

function closeDeleteServerSubmenu() {
  deleteServerDraft = null;
  const overlay = document.getElementById("delete-server-overlay");
  if (overlay) overlay.hidden = true;
  const err = document.getElementById("delete-server-error");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  const input = document.getElementById("delete-server-name");
  if (input) input.value = "";
  const confirm = document.getElementById("delete-server-confirm");
  const cancel = document.getElementById("delete-server-cancel");
  if (confirm) confirm.disabled = false;
  if (cancel) cancel.disabled = false;
}

function openDeleteServerSubmenu() {
  if (!currentServerId || currentServerOwnerId !== myUserId) return;
  const name = (typeof currentServerSettingsName === "function" && currentServerSettingsName())
    || (document.getElementById("server-sidebar-name") || {}).textContent
    || "";
  deleteServerDraft = { serverId: currentServerId, name: name };
  const overlay = document.getElementById("delete-server-overlay");
  const copy = document.getElementById("delete-server-copy");
  const input = document.getElementById("delete-server-name");
  const err = document.getElementById("delete-server-error");
  if (copy) {
    copy.textContent = name
      ? `This permanently deletes "${name}" and all of its channels, messages, roles, and members. This cannot be undone.`
      : "This permanently deletes the server and all of its channels, messages, roles, and members. This cannot be undone.";
  }
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  if (input) {
    input.value = "";
    input.placeholder = name ? ("Type " + name + " to confirm") : "Server name";
  }
  if (overlay) overlay.hidden = false;
  if (input) input.focus();
}

async function confirmDeleteServerSubmenu() {
  if (!deleteServerDraft || !deleteServerDraft.serverId) return;
  const err = document.getElementById("delete-server-error");
  const confirm = document.getElementById("delete-server-confirm");
  const cancel = document.getElementById("delete-server-cancel");
  const input = document.getElementById("delete-server-name");
  const typed = input ? String(input.value || "") : "";
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  if (!typed.trim()) {
    if (err) {
      err.hidden = false;
      err.textContent = "Type the server name to confirm.";
    }
    if (input) input.focus();
    return;
  }
  if (confirm) confirm.disabled = true;
  if (cancel) cancel.disabled = true;
  try {
    const response = await fetch(`https://${serverAddress}/delete_server`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: deleteServerDraft.serverId,
        confirm_name: typed,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not delete server.");
    const sid = deleteServerDraft.serverId;
    closeDeleteServerSubmenu();
    if (typeof closeServerSettingsChrome === "function") closeServerSettingsChrome();
    if (typeof applyServerDeleted === "function") {
      applyServerDeleted(sid);
    } else if (typeof goHome === "function") {
      await goHome();
      if (typeof loadServers === "function") await loadServers();
    }
  } catch (e) {
    if (err) {
      err.hidden = false;
      err.textContent = e.message || "Could not delete server.";
    }
    if (confirm) confirm.disabled = false;
    if (cancel) cancel.disabled = false;
  }
}

function applyServerDeleted(serverId) {
  if (!serverId) return;
  if (typeof serverList !== "undefined" && Array.isArray(serverList)) {
    serverList = serverList.filter((s) => s.id !== serverId);
  }
  if (currentServerId === serverId) {
    currentServerId = null;
    currentServerData = null;
    currentServerOwnerId = null;
    if (typeof goHome === "function") goHome();
  }
  if (typeof renderServerList === "function") renderServerList();
}

(function bindDeleteServerChrome() {
  const btn = document.getElementById("server-settings-delete");
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openDeleteServerSubmenu();
    });
  }
  const close = document.getElementById("delete-server-close");
  const cancel = document.getElementById("delete-server-cancel");
  const confirm = document.getElementById("delete-server-confirm");
  const overlay = document.getElementById("delete-server-overlay");
  const input = document.getElementById("delete-server-name");
  if (close) close.addEventListener("click", closeDeleteServerSubmenu);
  if (cancel) cancel.addEventListener("click", closeDeleteServerSubmenu);
  if (confirm) confirm.addEventListener("click", confirmDeleteServerSubmenu);
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target.id === "delete-server-overlay") closeDeleteServerSubmenu();
    });
  }
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmDeleteServerSubmenu();
      }
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const ov = document.getElementById("delete-server-overlay");
    if (ov && !ov.hidden) {
      e.preventDefault();
      closeDeleteServerSubmenu();
    }
  });
})();
