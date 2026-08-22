function showRegister() {
  document.getElementById("login-card").style.display = "none";
  document.getElementById("register-card").style.display = "block";
}
function showLogin() {
  document.getElementById("register-card").style.display = "none";
  document.getElementById("login-card").style.display = "block";
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
    window.location.href = `main/app.html?user=${encodeURIComponent(user.username)}`;
  } catch (e) {
    status.textContent = "Could not reach server.";
  }
}
