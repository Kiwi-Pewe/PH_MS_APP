function hideAuthCards() {
  document.getElementById("login-card").style.display = "none";
  document.getElementById("mfa-card").style.display = "none";
  document.getElementById("recover-card").style.display = "none";
  document.getElementById("register-card").style.display = "none";
}

function showRegister() {
  hideAuthCards();
  document.getElementById("register-card").style.display = "block";
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
  const status = document.getElementById("register-status");
  if (!username || !password) { status.textContent = "Fill in all fields."; return; }
  status.textContent = "Registering...";
  try {
    const response = await fetch(`https://${API_HOST}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password })
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

window.addEventListener("load", async () => {
  if (await resumeSession()) return;
  showLogin();
});
