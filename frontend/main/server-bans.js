// ==================================================================
// server-bans.js - Server Settings → Bans list (Discord-like search +
// rows filled from server_bans). Revoke Ban is a later submenu pass.
// ==================================================================

let serverBansList = [];
let serverBansLoadedFor = null;
let serverBansQuery = "";

function setServerBansStatus(text) {
  const status = document.getElementById("server-bans-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function formatBanStamp(ts) {
  if (!ts) return "—";
  const date = typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(ts) : new Date(ts);
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatBanExpires(ban) {
  if (!ban || !ban.expires_at) return "∞";
  const date = typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(ban.expires_at) : new Date(ban.expires_at);
  if (!date || Number.isNaN(date.getTime())) return "∞";
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const sec = Math.round(ms / 1000);
  if (sec < 3600) return "in " + Math.max(1, Math.round(sec / 60)) + "m";
  if (sec < 86400) return "in " + Math.round(sec / 3600) + "h";
  return "in " + Math.round(sec / 86400) + "d";
}

function filteredServerBans() {
  const needle = serverBansQuery.trim().toLowerCase();
  if (!needle) return serverBansList.slice();
  return serverBansList.filter((ban) => {
    const user = ban.user || {};
    const name = String(user.display_name || "").toLowerCase();
    const username = String(user.username || "").toLowerCase();
    const id = String(user.id || ban.user_id || "");
    return name.includes(needle) || username.includes(needle) || id.includes(needle);
  });
}

function paintServerBansList() {
  const host = document.getElementById("server-bans-list");
  const empty = document.getElementById("server-bans-empty");
  if (!host) return;
  host.innerHTML = "";
  const rows = filteredServerBans();
  if (empty) empty.hidden = rows.length > 0;

  rows.forEach((ban) => {
    const user = ban.user || {};
    const actor = ban.actor || {};
    const card = document.createElement("div");
    card.className = "server-bans-row";

    const who = document.createElement("div");
    who.className = "server-bans-who";
    const face = document.createElement("div");
    face.className = "avatar-dot server-bans-avatar";
    who.appendChild(face);
    const labels = document.createElement("div");
    labels.className = "server-bans-who-labels";
    const display = document.createElement("div");
    display.className = "server-bans-display";
    display.textContent = user.display_name || user.username || ("User " + (ban.user_id || ""));
    const account = document.createElement("div");
    account.className = "server-bans-username";
    account.textContent = user.username || String(ban.user_id || "");
    labels.appendChild(display);
    labels.appendChild(account);
    who.appendChild(labels);
    card.appendChild(who);

    const meta = document.createElement("div");
    meta.className = "server-bans-meta";
    const reason = document.createElement("div");
    reason.className = "server-bans-meta-block";
    reason.innerHTML = "<span class=\"server-bans-meta-label\">Reason</span>";
    const reasonVal = document.createElement("span");
    reasonVal.className = "server-bans-meta-value";
    reasonVal.textContent = ban.reason ? ban.reason : "—";
    reason.appendChild(reasonVal);
    meta.appendChild(reason);

    const by = document.createElement("div");
    by.className = "server-bans-meta-block";
    by.innerHTML = "<span class=\"server-bans-meta-label\">Banned by</span>";
    const byVal = document.createElement("span");
    byVal.className = "server-bans-meta-value";
    byVal.textContent = actor.display_name || actor.username || "—";
    by.appendChild(byVal);
    meta.appendChild(by);

    const when = document.createElement("div");
    when.className = "server-bans-meta-block";
    when.innerHTML = "<span class=\"server-bans-meta-label\">Banned</span>";
    const whenVal = document.createElement("span");
    whenVal.className = "server-bans-meta-value";
    whenVal.textContent = formatBanStamp(ban.created_at);
    when.appendChild(whenVal);
    meta.appendChild(when);

    const expires = document.createElement("div");
    expires.className = "server-bans-meta-block";
    expires.innerHTML = "<span class=\"server-bans-meta-label\">Expires</span>";
    const expiresVal = document.createElement("span");
    expiresVal.className = "server-bans-meta-value";
    expiresVal.textContent = formatBanExpires(ban);
    expires.appendChild(expiresVal);
    meta.appendChild(expires);

    card.appendChild(meta);
    host.appendChild(card);

    if (typeof paintUserFace === "function" && user.id) {
      paintUserFace(face, user, { name: user.username, userId: user.id });
    }
  });
}

async function loadServerBansPage(force) {
  if (!currentServerId || typeof canOpenServerBans === "function" && !canOpenServerBans()) return;
  if (!force && serverBansLoadedFor === currentServerId) {
    paintServerBansList();
    return;
  }
  setServerBansStatus("");
  try {
    const response = await fetch(
      `https://${serverAddress}/server_settings_bans/${encodeURIComponent(currentServerId)}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not load bans.");
    serverBansList = data.bans || [];
    serverBansLoadedFor = currentServerId;
    serverBansList.forEach((ban) => {
      if (ban.user && typeof rememberIdentityFace === "function") {
        rememberIdentityFace(ban.user.id, ban.user.avatar);
      }
    });
    paintServerBansList();
  } catch (e) {
    setServerBansStatus(e.message || "Could not load bans.");
    serverBansList = [];
    paintServerBansList();
  }
}

function runServerBansSearch() {
  const input = document.getElementById("server-bans-search");
  serverBansQuery = input ? (input.value || "") : "";
  paintServerBansList();
}

(function bindServerBansChrome() {
  const input = document.getElementById("server-bans-search");
  const btn = document.getElementById("server-bans-search-btn");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runServerBansSearch();
      }
    });
  }
  if (btn) btn.addEventListener("click", runServerBansSearch);
})();
