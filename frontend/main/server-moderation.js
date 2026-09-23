// ==================================================================
// server-moderation.js - Kick / Ban / Timeout confirm card.
// Audit log is written on confirm. Feed entries wait on Feed.
// ==================================================================

const MOD_TIMEOUT_OPTIONS = [
  { seconds: 60, label: "60 seconds" },
  { seconds: 300, label: "5 minutes" },
  { seconds: 600, label: "10 minutes" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 86400, label: "1 day" },
  { seconds: 604800, label: "1 week" }
];

const MOD_KICK_WAIT_OPTIONS = [
  { seconds: 0, label: "No wait" },
  { seconds: 3600, label: "1 hour" },
  { seconds: 86400, label: "1 day" },
  { seconds: 604800, label: "1 week" }
];

let moderationDraft = null;

function isServerTimedOut() {
  return !!(currentServerTimeoutUntil && Date.parse(currentServerTimeoutUntil) > Date.now());
}

function paintServerTimeoutLock() {
  const forumBtn = document.getElementById("forum-new-post-btn");
  if (forumBtn) forumBtn.disabled = isServerTimedOut();
  const composer = document.getElementById("channel-composer");
  if (composer && composer.style.display !== "none" && typeof enableChannelComposer === "function") {
    enableChannelComposer(currentChannelName || "");
  }
}

function memberTimeoutActive(member) {
  return !!(member && member.timeout_until && Date.parse(member.timeout_until) > Date.now());
}

function canActOnMember(member, perm) {
  if (memberListScope !== "server") return false;
  if (!member || member.id === myUserId || member.is_owner) return false;
  if (typeof canServerPerm === "function" && !canServerPerm(perm)) return false;
  if (currentServerOwnerId === myUserId) return true;
  if (!currentServerHighestRole) return false;
  const theirs = member.highest_role || { position: 10000, id: 0 };
  return typeof roleIsBelow === "function" && roleIsBelow(theirs, currentServerHighestRole);
}

function applyMemberTimeout(serverId, userId, until, reason) {
  if (memberListScope === "server" && String(memberListScopeId) === String(serverId)) {
    const member = memberList.find((row) => row.id === userId);
    if (member) {
      if (until) {
        member.timeout_until = until;
        member.timeout_reason = reason || "";
      } else {
        delete member.timeout_until;
        delete member.timeout_reason;
      }
    }
  }
  if (String(currentServerId) === String(serverId) && userId === myUserId) {
    currentServerTimeoutUntil = until || null;
    paintServerTimeoutLock();
  }
}

async function applyRemovedFromServer(data) {
  if (data && data.server_id === currentServerId && typeof goHome === "function") {
    await goHome();
  }
  if (typeof loadServers === "function") await loadServers();
}

function closeModerationModal() {
  const overlay = document.getElementById("moderation-overlay");
  if (overlay) overlay.style.display = "none";
  moderationDraft = null;
}

function paintModerationChips(host, options, selected, onPick) {
  host.innerHTML = "";
  host.className = "moderation-chips";
  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "moderation-chip" + (selected === opt.seconds ? " is-on" : "");
    btn.textContent = opt.label;
    btn.addEventListener("click", () => onPick(opt.seconds));
    host.appendChild(btn);
  });
}

function remainingTimeoutLabel(until) {
  const ms = Date.parse(until) - Date.now();
  if (!(ms > 0)) return "Expired";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return sec + " seconds left";
  if (sec < 3600) return Math.round(sec / 60) + " minutes left";
  if (sec < 86400) return Math.round(sec / 3600) + " hours left";
  return Math.round(sec / 86400) + " days left";
}

function openModerationModal(mode, member) {
  if (!currentServerId || !member) return;
  const overlay = document.getElementById("moderation-overlay");
  const title = document.getElementById("moderation-title");
  const body = document.getElementById("moderation-body");
  const confirm = document.getElementById("moderation-confirm");
  const err = document.getElementById("moderation-error");
  const serverName = currentServerSettingsName ? currentServerSettingsName() : "";
  if (!overlay || !title || !body || !confirm) return;

  moderationDraft = {
    mode,
    member,
    reason: "",
    seconds: mode === "kick" ? 0 : 60
  };
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }

  function paint() {
    body.innerHTML = "";
    const who = member.username || "this member";
    if (mode === "kick") {
      title.textContent = "Kick " + who;
      const copy = document.createElement("p");
      copy.className = "moderation-copy";
      copy.textContent = "Remove " + who + " from " + (serverName || "this server") + "? They can rejoin with a new invite unless you set a wait.";
      body.appendChild(copy);
    } else if (mode === "ban") {
      title.textContent = "Ban " + who;
      const copy = document.createElement("p");
      copy.className = "moderation-copy";
      copy.textContent = "Ban " + who + " from " + (serverName || "this server") + "? They cannot rejoin until the ban is lifted.";
      body.appendChild(copy);
    } else {
      title.textContent = (mode === "timeout-edit" ? "Timeout for " : "Timeout ") + who;
      const copy = document.createElement("p");
      copy.className = "moderation-copy";
      copy.textContent = mode === "timeout-edit"
        ? remainingTimeoutLabel(member.timeout_until) + ". Change the time left or remove the timeout."
        : who + " will not be able to send messages, post, or comment until this ends.";
      body.appendChild(copy);
    }

    if (mode === "kick") {
      const waitTitle = document.createElement("div");
      waitTitle.className = "server-modal-label";
      waitTitle.textContent = "Wait before they can rejoin";
      body.appendChild(waitTitle);
      const chips = document.createElement("div");
      body.appendChild(chips);
      paintModerationChips(chips, MOD_KICK_WAIT_OPTIONS, moderationDraft.seconds, (value) => {
        moderationDraft.seconds = value;
        paint();
      });
    }

    if (mode === "timeout" || mode === "timeout-edit") {
      const durTitle = document.createElement("div");
      durTitle.className = "server-modal-label";
      durTitle.textContent = "Duration";
      body.appendChild(durTitle);
      const chips = document.createElement("div");
      body.appendChild(chips);
      paintModerationChips(chips, MOD_TIMEOUT_OPTIONS, moderationDraft.seconds, (value) => {
        moderationDraft.seconds = value;
        paint();
      });
    }

    const reasonLabel = document.createElement("label");
    reasonLabel.className = "server-modal-label";
    reasonLabel.setAttribute("for", "moderation-reason");
    reasonLabel.textContent = "Reason";
    const reason = document.createElement("textarea");
    reason.id = "moderation-reason";
    reason.className = "moderation-reason";
    reason.maxLength = 200;
    reason.rows = 3;
    reason.placeholder = "Optional";
    reason.value = moderationDraft.reason;
    reason.addEventListener("input", () => { moderationDraft.reason = reason.value; });
    body.appendChild(reasonLabel);
    body.appendChild(reason);

    confirm.className = (mode === "kick" || mode === "ban") ? "deny-btn" : "pill-btn";
    confirm.textContent = mode === "kick" ? "Kick" : mode === "ban" ? "Ban" : "Timeout";
    const clearBtn = document.getElementById("moderation-clear");
    if (clearBtn) clearBtn.hidden = mode !== "timeout-edit";
  }

  paint();
  overlay.style.display = "flex";
  const reasonEl = document.getElementById("moderation-reason");
  if (reasonEl) reasonEl.focus();
}

async function confirmModeration() {
  if (!moderationDraft || !currentServerId) return;
  const confirm = document.getElementById("moderation-confirm");
  const err = document.getElementById("moderation-error");
  const mode = moderationDraft.mode;
  const path = mode === "kick" ? "kick_server_member" : mode === "ban" ? "ban_server_member" : "timeout_server_member";
  if (confirm) confirm.disabled = true;
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  try {
    const response = await fetch(`https://${serverAddress}/${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server_id: currentServerId,
        user_id: moderationDraft.member.id,
        reason: moderationDraft.reason || "",
        seconds: mode === "ban" ? 0 : moderationDraft.seconds
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not finish that action.");
    if (mode === "kick" || mode === "ban") {
      if (typeof applyMemberLeft === "function") applyMemberLeft("server", currentServerId, moderationDraft.member.id);
    } else {
      applyMemberTimeout(currentServerId, moderationDraft.member.id, data.timeout_until || null, data.timeout_reason || "");
    }
    closeModerationModal();
  } catch (e) {
    if (err) {
      err.hidden = false;
      err.textContent = e.message || "Could not finish that action.";
    }
  } finally {
    if (confirm) confirm.disabled = false;
  }
}

function clearTimeoutFromModal() {
  if (!moderationDraft) return;
  moderationDraft.seconds = 0;
  confirmModeration();
}

document.getElementById("moderation-close").addEventListener("click", closeModerationModal);
document.getElementById("moderation-cancel").addEventListener("click", closeModerationModal);
document.getElementById("moderation-overlay").addEventListener("click", (e) => {
  if (e.target.id === "moderation-overlay") closeModerationModal();
});
document.getElementById("moderation-confirm").addEventListener("click", confirmModeration);
document.getElementById("moderation-clear").addEventListener("click", clearTimeoutFromModal);
