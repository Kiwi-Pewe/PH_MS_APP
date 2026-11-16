let registerTos = "";

function hideAuthCards() {
  document.getElementById("login-card").style.display = "none";
  document.getElementById("mfa-card").style.display = "none";
  document.getElementById("recover-card").style.display = "none";
  document.getElementById("register-card").style.display = "none";
  closeLoginTos();
}

function registerHasTos() {
  return !!String(registerTos || "").trim();
}

function syncRegisterSubmit() {
  const btn = document.getElementById("register-submit");
  if (!btn) return;
  const username = (document.getElementById("register-username").value || "").trim();
  const password = (document.getElementById("register-password").value || "").trim();
  const over18 = !!(document.getElementById("register-over-18") && document.getElementById("register-over-18").checked);
  const readTos = !!(document.getElementById("register-read-tos") && document.getElementById("register-read-tos").checked);
  btn.disabled = !(username && password && over18 && (!registerHasTos() || readTos));
}

function fillLoginTosCopy(text) {
  const copy = document.getElementById("login-tos-copy");
  if (!copy) return;
  copy.replaceChildren();
  const source = String(text || "");
  if (!source) return;
  if (typeof mdAppend === "function") mdAppend(copy, source);
  else copy.textContent = source;
}

function applyRegisterTos() {
  const row = document.getElementById("register-tos-row");
  const read = document.getElementById("register-read-tos");
  if (row) row.hidden = !registerHasTos();
  if (!registerHasTos() && read) read.checked = false;
  fillLoginTosCopy(registerTos);
  syncRegisterSubmit();
}

async function loadRegisterTos() {
  try {
    const response = await fetch(`https://${API_HOST}/site_rules`, { credentials: "include" });
    if (!response.ok) {
      registerTos = "";
      applyRegisterTos();
      return;
    }
    const data = await response.json();
    registerTos = data && data.tos ? String(data.tos) : "";
  } catch (e) {
    registerTos = "";
  }
  applyRegisterTos();
}

function openLoginTos() {
  if (!registerHasTos()) return;
  const overlay = document.getElementById("login-tos-overlay");
  fillLoginTosCopy(registerTos);
  if (overlay) overlay.hidden = false;
}

function closeLoginTos() {
  const overlay = document.getElementById("login-tos-overlay");
  if (overlay) overlay.hidden = true;
}

function showRegister() {
  hideAuthCards();
  document.getElementById("register-card").style.display = "block";
  loadRegisterTos();
}

function showLogin() {
  hideAuthCards();
  document.getElementById("login-card").style.display = "block";
}

function showRecover() {
  hideAuthCards();
  const fromLogin = document.getElementById("login-username").value;
  const field = document.getElementById("recover-username");
  if (fromLogin && !field.value) field.value = fromLogin;
  document.getElementById("recover-card").style.display = "block";
  document.getElementById("recover-status").textContent = "";
}

function rememberRecoveryCode(code) {
  const raw = String(code || "").trim();
  if (!raw) return;
  try { sessionStorage.setItem("oneira_recovery_code", raw); } catch (e) {}
}

async function resumeSession() {
  try {
    const response = await fetch(`https://${API_HOST}/whoami`, { credentials: "include" });
    if (!response.ok) return false;
    const user = await response.json();
    if (!user || !user.username) return false;
    finishLogin(user);
    return true;
  } catch (e) {
    return false;
  }
}

function ownRedirect(value) {
  if (!value || value.charAt(0) !== "/" || value.charAt(1) === "/" || value.indexOf("://") !== -1) return "";
  return value;
}

function finishLogin(user) {
  if (user && user.recovery_code) rememberRecoveryCode(user.recovery_code);
  const params = new URLSearchParams(window.location.search);
  const redirectTarget = ownRedirect(params.get("redirect"));
  window.location.href = redirectTarget || `main/app.html?user=${encodeURIComponent(user.username)}`;
}

function openMfa(user) {
  hideAuthCards();
  document.getElementById("mfa-card").style.display = "block";
  document.getElementById("mfa-username").textContent = user.username;
  document.getElementById("mfa-code").value = "";
  document.getElementById("mfa-status").textContent = "";
  document.getElementById("mfa-code").focus();
}

async function register() {
  const username = document.getElementById("register-username").value;
  const password = document.getElementById("register-password").value;
  const over18 = !!(document.getElementById("register-over-18") && document.getElementById("register-over-18").checked);
  const readTos = !!(document.getElementById("register-read-tos") && document.getElementById("register-read-tos").checked);
  const status = document.getElementById("register-status");
  if (!username || !password) { status.textContent = "Fill in all fields."; return; }
  if (!over18) { status.textContent = "Confirm you are over 18."; return; }
  if (registerHasTos() && !readTos) { status.textContent = "Confirm you have read the Site Rules."; return; }
  status.textContent = "Registering...";
  try {
    const response = await fetch(`https://${API_HOST}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password, over_18: over18, read_tos: readTos })
    });
    if (!response.ok) {
      const err = await response.json();
      status.textContent = err.detail || "Registration failed.";
      return;
    }
    const user = await response.json();
    finishLogin(user);
  } catch (e) {
    status.textContent = "Could not reach server.";
  }
}

async function login() {
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;
  const status = document.getElementById("status");
  if (!username || !password) { status.textContent = "Fill in all fields."; return; }
  status.textContent = "Logging in...";
  try {
    const response = await fetch(`https://${API_HOST}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password })
    });
    if (!response.ok) {
      const err = await response.json();
      status.textContent = err.detail || "Login failed.";
      return;
    }
    const user = await response.json();
    if (user.mfa_required) {
      status.textContent = "";
      openMfa(user);
      return;
    }
    finishLogin(user);
  } catch (e) {
    status.textContent = "Could not reach server.";
  }
}

async function recoverLogin() {
  const username = document.getElementById("recover-username").value;
  const recovery_code = document.getElementById("recover-code").value;
  const status = document.getElementById("recover-status");
  if (!username || !recovery_code) { status.textContent = "Fill in all fields."; return; }
  status.textContent = "Logging in...";
  try {
    const response = await fetch(`https://${API_HOST}/recover_login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, recovery_code })
    });
    if (!response.ok) {
      const err = await response.json();
      status.textContent = err.detail || "Login failed.";
      return;
    }
    const user = await response.json();
    if (user.mfa_required) {
      status.textContent = "";
      openMfa(user);
      return;
    }
    finishLogin(user);
  } catch (e) {
    status.textContent = "Could not reach server.";
  }
}

async function loginMfa() {
  const username = document.getElementById("mfa-username").textContent;
  const code = document.getElementById("mfa-code").value;
  const status = document.getElementById("mfa-status");
  if (!code) { status.textContent = "Enter your authenticator code."; return; }
  status.textContent = "Verifying...";
  try {
    const response = await fetch(`https://${API_HOST}/login_mfa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, code })
    });
    if (!response.ok) {
      const err = await response.json();
      status.textContent = err.detail || "Authenticator login failed.";
      return;
    }
    const user = await response.json();
    finishLogin(user);
  } catch (e) {
    status.textContent = "Could not reach server.";
  }
}

document.getElementById("mfa-code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginMfa();
});
document.getElementById("login-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
document.getElementById("recover-code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") recoverLogin();
});
document.getElementById("register-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") register();
});
["register-username", "register-password"].forEach((id) => {
  const field = document.getElementById(id);
  if (field) field.addEventListener("input", syncRegisterSubmit);
});
["register-over-18", "register-read-tos"].forEach((id) => {
  const field = document.getElementById(id);
  if (field) field.addEventListener("change", syncRegisterSubmit);
});
const registerTosOpen = document.getElementById("register-tos-open");
if (registerTosOpen) registerTosOpen.addEventListener("click", openLoginTos);
const loginTosClose = document.getElementById("login-tos-close");
if (loginTosClose) loginTosClose.addEventListener("click", closeLoginTos);
const loginTosOverlay = document.getElementById("login-tos-overlay");
if (loginTosOverlay) loginTosOverlay.addEventListener("mousedown", (e) => {
  if (e.target && e.target.id === "login-tos-overlay") closeLoginTos();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const overlay = document.getElementById("login-tos-overlay");
  if (overlay && !overlay.hidden) closeLoginTos();
});

window.addEventListener("load", async () => {
  if (await resumeSession()) return;
  showLogin();
});
