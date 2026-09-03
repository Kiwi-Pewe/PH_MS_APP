// This page has to work for someone with NO account or session at all —
// unlike every script under main/, nothing here can assume a logged-in
// identity. See get_invite_info on the backend: it deliberately has no
// current_user dependency for exactly this reason.

let inviteCode = null;
let inviteData = null;

window.addEventListener("load", async () => {
  inviteCode = extractInviteCode();
  if (!inviteCode) {
    showInvalidCard();
    return;
  }

  try {
    const response = await fetch(`https://${API_HOST}/invite/${inviteCode}`, { credentials: "include" });
    inviteData = response.ok ? await response.json() : { valid: false };
  } catch (e) {
    inviteData = { valid: false };
  }

  if (inviteData.valid === false) {
    showInvalidCard();
    return;
  }

  // Separate from the invite lookup itself — this call determines which
  // button we show (Log In to Join vs. Join), not whether the invite is
  // real. A failed/401 whoami just means "no session," not an error.
  let loggedIn = false;
  try {
    const response = await fetch(`https://${API_HOST}/whoami`, { credentials: "include" });
    loggedIn = response.ok;
  } catch (e) { /* treat as logged out */ }

  showValidCard(loggedIn);
});

// Pretty URL form is /invite/{code} — Cloudflare Pages' _redirects file
// rewrites that path to serve this exact file while keeping the address
// bar showing /invite/{code}, so the code itself has to be read back out
// of the path rather than a query string in the normal case. Falls back
// to ?code= only for local testing where the rewrite isn't in play.
function extractInviteCode() {
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1] || "";
  if (lastPart && lastPart.toLowerCase() !== "invite.html") return lastPart;
  return new URLSearchParams(window.location.search).get("code");
}

function showInvalidCard() {
  document.getElementById("invite-card").classList.add("invalid");
  document.getElementById("invite-body").innerHTML = `
    <div class="invite-invalid-icon">!</div>
    <div>
      <div class="invite-invalid-title">Invalid Invite</div>
      <div class="invite-invalid-sub">Ask for a new invite.</div>
    </div>`;
}

function showValidCard(loggedIn) {
  const isParty = inviteData.type === "party";
  const name = isParty ? inviteData.party_name : inviteData.server_name;
  const subtitle = isParty
    ? (inviteData.full ? "This party is currently full." : "You've been invited to join.")
    : `<span class="dot">\u25CF</span> ${inviteData.active_users} Online \u00b7 ${inviteData.total_users} Members`;

  document.getElementById("invite-icon-badge").textContent = isParty
    ? (name || "?").charAt(0).toUpperCase()
    : serverInitials(name);

  const body = document.getElementById("invite-body");
  body.innerHTML = `
    <div class="invite-name"></div>
    <div class="invite-subtitle"></div>
    <button class="invite-action-btn" id="invite-action-btn"></button>`;
  body.querySelector(".invite-name").textContent = name;
  body.querySelector(".invite-subtitle").innerHTML = subtitle;

  const btn = document.getElementById("invite-action-btn");

  if (isParty && inviteData.full) {
    btn.textContent = "Party is Full";
    btn.disabled = true;
    return;
  }

  if (!loggedIn) {
    // Carries us back to this exact invite after logging in — see
    // login.js's redirect handling. window.location.pathname is already
    // the pretty /invite/{code} form, so no reconstruction needed.
    btn.textContent = "Log In to Join";
    btn.addEventListener("click", () => {
      window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
    });
    return;
  }

  // Being logged in and landing on this page with a real invite IS the
  // confirmation step per the design call — clicking this button is the
  // explicit confirmation, not a second dialog on top of it.
  btn.textContent = `Join ${isParty ? "Party" : "Server"}`;
  btn.addEventListener("click", () => joinInvite(btn));
}

function serverInitials(name) {
  const words = (name || "?").trim().split(/\s+/);
  if (words.length >= 2) return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  return (words[0] || "?").charAt(0).toUpperCase();
}

// Deep-links into main/app.html afterward, same destination
// joinInviteFromCard's in-app version lands on — see handleJoinDeepLink
// in app.js, which reads these exact query params back out on load.
async function joinInvite(btn) {
  btn.disabled = true;
  btn.textContent = "Joining...";

  try {
    const response = await fetch(`https://${API_HOST}/accept_invite?code=${inviteCode}`, {
      method: "POST",
      credentials: "include"
    });
    if (!response.ok) {
      btn.textContent = "Failed \u2014 try again";
      btn.disabled = false;
      return;
    }
    const data = await response.json();
    const name = data.party_name || data.server_name || "";
    window.location.href = `main/app.html?join_type=${data.type}&join_id=${data.id}&join_name=${encodeURIComponent(name)}`;
  } catch (e) {
    btn.textContent = "Failed \u2014 try again";
    btn.disabled = false;
  }
}
