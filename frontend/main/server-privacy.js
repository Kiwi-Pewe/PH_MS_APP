// ==================================================================
// server-privacy.js - Server Settings → Privacy (Guilded-style access
// mode + Discoverable). Choices save now; Communities / Applications
// / open Join enforce them later. Join stays invite-only for now.
// ==================================================================

const SERVER_PRIVACY_MODES = ["private", "default", "open"];

function savedServerPrivacy() {
  const data = typeof currentServerData !== "undefined" && currentServerData ? currentServerData : {};
  let mode = String(data.privacy_mode || "private").toLowerCase();
  if (SERVER_PRIVACY_MODES.indexOf(mode) < 0) mode = "private";
  let discoverable = !!data.discoverable;
  if (mode === "private") discoverable = false;
  return { privacy_mode: mode, discoverable: discoverable };
}

function applyServerPrivacy(serverId, fields) {
  if (!fields) return;
  if (typeof currentServerData !== "undefined" && currentServerData && String(currentServerId) === String(serverId)) {
    currentServerData.privacy_mode = fields.privacy_mode || "private";
    currentServerData.discoverable = !!fields.discoverable && fields.privacy_mode !== "private";
  }
}

function setServerPrivacyStatus(text) {
  const status = document.getElementById("server-privacy-status");
  if (!status) return;
  status.hidden = !text;
  status.textContent = text || "";
}

function paintServerPrivacyPage() {
  const saved = savedServerPrivacy();
  const list = document.getElementById("server-privacy-mode");
  if (list) {
    list.querySelectorAll(".server-privacy-option").forEach((btn) => {
      btn.classList.toggle("is-on", btn.getAttribute("data-privacy") === saved.privacy_mode);
    });
  }
  const toggle = document.getElementById("server-privacy-discoverable");
  const wrap = document.getElementById("server-privacy-discover-switch");
  const privateMode = saved.privacy_mode === "private";
  if (toggle) {
    toggle.checked = !privateMode && saved.discoverable;
    toggle.disabled = privateMode || !canOpenServerPrivacy();
  }
  if (wrap) wrap.classList.toggle("is-disabled", privateMode || !canOpenServerPrivacy());
  const modeList = document.getElementById("server-privacy-mode");
  if (modeList) modeList.classList.toggle("is-disabled", !canOpenServerPrivacy());
}

async function loadServerPrivacyPage() {
  setServerPrivacyStatus("");
  paintServerPrivacyPage();
}

async function saveServerPrivacy(nextMode, nextDiscoverable) {
  if (!currentServerId || !canOpenServerPrivacy()) return;
  const previous = savedServerPrivacy();
  const mode = SERVER_PRIVACY_MODES.indexOf(nextMode) >= 0 ? nextMode : previous.privacy_mode;
  let discoverable = !!nextDiscoverable;
  if (mode === "private") discoverable = false;
  applyServerPrivacy(currentServerId, { privacy_mode: mode, discoverable: discoverable });
  paintServerPrivacyPage();
  setServerPrivacyStatus("");
  try {
    const response = await fetch(`https://${serverAddress}/update_server_privacy`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        privacy_mode: mode,
        discoverable: discoverable
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save privacy.");
    applyServerPrivacy(currentServerId, data);
    paintServerPrivacyPage();
  } catch (e) {
    applyServerPrivacy(currentServerId, previous);
    paintServerPrivacyPage();
    setServerPrivacyStatus(e.message || "Could not save privacy.");
  }
}

(function bindServerPrivacyChrome() {
  const list = document.getElementById("server-privacy-mode");
  if (list) {
    list.addEventListener("click", (e) => {
      const btn = e.target.closest(".server-privacy-option");
      if (!btn || !list.contains(btn)) return;
      if (!canOpenServerPrivacy()) return;
      const mode = btn.getAttribute("data-privacy");
      const saved = savedServerPrivacy();
      saveServerPrivacy(mode, mode === "private" ? false : saved.discoverable);
    });
  }
  const toggle = document.getElementById("server-privacy-discoverable");
  if (toggle) {
    toggle.addEventListener("change", () => {
      if (!canOpenServerPrivacy()) {
        paintServerPrivacyPage();
        return;
      }
      const saved = savedServerPrivacy();
      if (saved.privacy_mode === "private") {
        paintServerPrivacyPage();
        return;
      }
      saveServerPrivacy(saved.privacy_mode, toggle.checked);
    });
  }
})();
