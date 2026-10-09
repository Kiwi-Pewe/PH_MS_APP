// ==================================================================
// account-delete.js - Delete own account submenu (type username +
// password). Unique centered card — same job pattern as Delete Server
// / admin Delete Account. Disable stays a separate later pass.
// ==================================================================

function closeDeleteAccountSubmenu() {
  const overlay = document.getElementById("delete-account-overlay");
  if (overlay) overlay.hidden = true;
  const err = document.getElementById("delete-account-error");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  const name = document.getElementById("delete-account-username");
  const password = document.getElementById("delete-account-password");
  if (name) name.value = "";
  if (password) password.value = "";
  const confirm = document.getElementById("delete-account-confirm");
  const cancel = document.getElementById("delete-account-cancel");
  if (confirm) confirm.disabled = false;
  if (cancel) cancel.disabled = false;
}

function openDeleteAccountSubmenu() {
  const handle = (typeof myUsername !== "undefined" && myUsername) ? String(myUsername) : "";
  const overlay = document.getElementById("delete-account-overlay");
  const copy = document.getElementById("delete-account-copy");
  const name = document.getElementById("delete-account-username");
  const password = document.getElementById("delete-account-password");
  const err = document.getElementById("delete-account-error");
  if (copy) {
    copy.textContent = handle
      ? ("This permanently deletes \"" + handle + "\" from Oneira. Owned servers are wiped. Messages you sent become system notices. This cannot be undone.")
      : "This permanently deletes your account from Oneira. Owned servers are wiped. Messages you sent become system notices. This cannot be undone.";
  }
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  if (name) {
    name.value = "";
    name.placeholder = handle ? ("Type " + handle + " to confirm") : "Account username";
  }
  if (password) password.value = "";
  if (overlay) overlay.hidden = false;
  if (name) name.focus();
}

async function confirmDeleteAccountSubmenu() {
  const err = document.getElementById("delete-account-error");
  const confirm = document.getElementById("delete-account-confirm");
  const cancel = document.getElementById("delete-account-cancel");
  const name = document.getElementById("delete-account-username");
  const password = document.getElementById("delete-account-password");
  const typed = name ? String(name.value || "").trim().replace(/^@+/, "") : "";
  const pass = password ? String(password.value || "") : "";
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  if (!typed) {
    if (err) {
      err.hidden = false;
      err.textContent = "Type your account username to confirm.";
    }
    if (name) name.focus();
    return;
  }
  if (!pass) {
    if (err) {
      err.hidden = false;
      err.textContent = "Enter your current password.";
    }
    if (password) password.focus();
    return;
  }
  if (confirm) confirm.disabled = true;
  if (cancel) cancel.disabled = true;
  try {
    const response = await fetch(`https://${serverAddress}/delete_own_account`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirm_username: typed,
        password: pass
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof data.detail === "string" ? data.detail : "Could not delete account.");
    }
    closeDeleteAccountSubmenu();
    if (typeof ws !== "undefined" && ws) {
      try { ws.close(); } catch (e) { /* ignore */ }
      ws = null;
    }
    window.location.href = "/sign-in";
  } catch (e) {
    if (err) {
      err.hidden = false;
      err.textContent = e.message || "Could not delete account.";
    }
    if (confirm) confirm.disabled = false;
    if (cancel) cancel.disabled = false;
  }
}

(function bindDeleteAccountChrome() {
  const cancel = document.getElementById("delete-account-cancel");
  const close = document.getElementById("delete-account-close");
  const confirm = document.getElementById("delete-account-confirm");
  const overlay = document.getElementById("delete-account-overlay");
  if (cancel) cancel.addEventListener("click", closeDeleteAccountSubmenu);
  if (close) close.addEventListener("click", closeDeleteAccountSubmenu);
  if (confirm) confirm.addEventListener("click", confirmDeleteAccountSubmenu);
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeDeleteAccountSubmenu();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const el = document.getElementById("delete-account-overlay");
    if (el && !el.hidden) closeDeleteAccountSubmenu();
  });
})();
