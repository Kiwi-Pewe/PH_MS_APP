function showRegister() {
  document.getElementById("login-card").style.display = "none";
  document.getElementById("mfa-card").style.display = "none";
  document.getElementById("register-card").style.display = "block";
}
function showLogin() {
  document.getElementById("register-card").style.display = "none";
  document.getElementById("mfa-card").style.display = "none";
  document.getElementById("login-card").style.display = "block";
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
  const params = new URLSearchParams(window.location.search);
  const redirectTarget = ownRedirect(params.get("redirect"));
  window.location.href = redirectTarget || `/main/app?user=${encodeURIComponent(user.username)}`;
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
      body: JSON.stringify({ username, password })
    });
    if (!response.ok) {
      const err = await response.json();
      status.textContent = err.detail || "Registration failed.";
      return;
    }
    status.textContent = "Account created. You can log in now.";
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
      document.getElementById("login-card").style.display = "none";
      document.getElementById("mfa-card").style.display = "block";
      document.getElementById("mfa-username").textContent = user.username;
      document.getElementById("mfa-code").value = "";
      document.getElementById("mfa-status").textContent = "";
      document.getElementById("mfa-code").focus();
      status.textContent = "";
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

window.addEventListener("load", async () => {
  if (await resumeSession()) return;
  showLogin();
});
