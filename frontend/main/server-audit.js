// ==================================================================
// server-audit.js - Server Settings → Audit Log (existing audit_logs).
// ==================================================================

let serverAuditEntries = [];
let serverAuditQuery = "";

function setServerAuditStatus(text) {
  const el = document.getElementById("server-audit-status");
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
}

function formatAuditWhen(raw) {
  if (!raw) return "";
  const d = new Date(String(raw).includes("T") ? raw : String(raw).replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString();
}

function paintServerAuditList() {
  const body = document.getElementById("server-audit-body");
  const empty = document.getElementById("server-audit-empty");
  if (!body) return;
  body.innerHTML = "";
  const q = (serverAuditQuery || "").trim().toLowerCase();
  const rows = !q
    ? serverAuditEntries
    : serverAuditEntries.filter((row) => {
      const hay = [
        row.actor_username,
        row.action_label,
        row.action,
        row.summary,
        row.target_type,
        String(row.actor_id || ""),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  if (empty) empty.hidden = rows.length > 0;
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = "server-audit-row";

    const userTd = document.createElement("td");
    userTd.className = "server-audit-col-user";
    const who = document.createElement("div");
    who.className = "server-audit-user";
    const face = document.createElement("div");
    face.className = "avatar-dot server-audit-avatar";
    if (typeof paintUserFace === "function") {
      paintUserFace(face, {
        id: row.actor_id,
        username: row.actor_username,
        avatar: row.actor_avatar,
      }, { name: row.actor_username, userId: row.actor_id });
    } else {
      face.textContent = (row.actor_username || "?").slice(0, 1);
    }
    const name = document.createElement("span");
    name.className = "server-audit-username";
    name.textContent = row.actor_username || "Unknown";
    who.appendChild(face);
    who.appendChild(name);
    userTd.appendChild(who);

    const actionTd = document.createElement("td");
    actionTd.className = "server-audit-col-action";
    actionTd.textContent = row.action_label || row.action || "";

    const detailsTd = document.createElement("td");
    detailsTd.className = "server-audit-col-details";
    detailsTd.textContent = row.summary || "";

    const whenTd = document.createElement("td");
    whenTd.className = "server-audit-col-when";
    whenTd.textContent = formatAuditWhen(row.created_at);

    tr.appendChild(userTd);
    tr.appendChild(actionTd);
    tr.appendChild(detailsTd);
    tr.appendChild(whenTd);
    tr.addEventListener("click", () => openAuditEntry(row));
    body.appendChild(tr);
  });
}

const AUDIT_INVITE_AGE = {
  0: "Never",
  1800: "30 minutes",
  3600: "1 hour",
  21600: "6 hours",
  43200: "12 hours",
  86400: "1 day",
  604800: "7 days",
  2592000: "30 days",
};

function formatAuditSpan(seconds) {
  const n = Number(seconds);
  if (!n) return "";
  if (n % 86400 === 0) {
    const days = n / 86400;
    return days === 1 ? "1 day" : days + " days";
  }
  if (n % 3600 === 0) {
    const hours = n / 3600;
    return hours === 1 ? "1 hour" : hours + " hours";
  }
  if (n % 60 === 0) {
    const mins = n / 60;
    return mins === 1 ? "1 minute" : mins + " minutes";
  }
  return n + " seconds";
}

function auditEntryUsesRoleReview(row) {
  if (!row || (row.action !== "roles_modified" && row.action !== "role_deleted")) return false;
  const detail = row.detail || {};
  return !!(detail.order_changed || (Array.isArray(detail.roles) && detail.roles.length));
}

function auditRoleChangeLabel(change) {
  if (!change) return "";
  if (change.key === "created" || change.kind === "created") return "Created";
  if (change.key === "deleted" || change.kind === "deleted") return "Deleted";
  if (change.key === "name") return "Role name";
  if (change.key === "color") return "Role color";
  if (String(change.key || "").indexOf("perm:") === 0 && typeof permTitle === "function") {
    return permTitle(String(change.key).slice(5));
  }
  if (typeof settingTitle === "function") return settingTitle(change.key);
  return change.key || "";
}

function appendAuditField(host, label, value) {
  const field = document.createElement("div");
  field.className = "audit-entry-field";
  const title = document.createElement("div");
  title.className = "audit-entry-label";
  title.textContent = label;
  const body = document.createElement("div");
  body.className = "audit-entry-value";
  body.textContent = value;
  field.appendChild(title);
  field.appendChild(body);
  host.appendChild(field);
}

function auditEntryFields(row) {
  const detail = row.detail || {};
  const action = row.action || "";
  const fields = [];
  const push = (label, value) => {
    if (value === undefined || value === null || value === "") return;
    fields.push({ label, value: String(value) });
  };
  const memberActions = {
    member_joined: true,
    member_left: true,
    kick_member: true,
    ban_member: true,
    unban_member: true,
    timeout_member: true,
    timeout_clear: true,
    role_member_updated: true,
  };
  if (memberActions[action]) push("Member", detail.username);
  if (action === "role_member_updated") {
    push("Role", detail.role_name);
    push("Change", detail.assigned ? "Assigned" : "Removed");
  }
  if (detail.reason) push("Reason", detail.reason);
  if (detail.duration_seconds) push("Length", formatAuditSpan(detail.duration_seconds));
  if (detail.invite_code) push("Invite", detail.invite_code);
  if (action === "create_invite" || action === "pause_invite" || action === "unpause_invite" || action === "revoke_invite") {
    push("Code", detail.code);
  }
  if (action === "create_invite") {
    if (detail.max_age !== undefined && detail.max_age !== null) {
      push("Expire after", AUDIT_INVITE_AGE[detail.max_age] || formatAuditSpan(detail.max_age) || "Never");
    }
    if (detail.max_uses !== undefined && detail.max_uses !== null) {
      push("Max uses", Number(detail.max_uses) === 0 ? "No limit" : String(detail.max_uses));
    }
    if (detail.temporary !== undefined) push("Temporary membership", detail.temporary ? "Yes" : "No");
  }
  if (action === "delete_message" || action === "delete_post" || action === "delete_comment") {
    push("Author", detail.author_username);
    push("Content", detail.content || detail.title);
  }
  if (action === "delete_channel" || action === "delete_category") push("Name", detail.name);
  if (action === "delete_channel" && detail.channel_type) push("Type", detail.channel_type);
  if (!fields.length && row.summary) push("Details", row.summary);
  return fields;
}

function closeAuditEntry() {
  const overlay = document.getElementById("audit-entry-overlay");
  if (overlay) overlay.style.display = "none";
  const card = document.getElementById("audit-entry-modal");
  if (card) card.classList.remove("is-roles");
}

function openAuditEntry(row) {
  const overlay = document.getElementById("audit-entry-overlay");
  const card = document.getElementById("audit-entry-modal");
  const display = document.getElementById("audit-entry-display");
  const account = document.getElementById("audit-entry-account");
  const main = document.getElementById("audit-entry-main");
  const face = document.getElementById("audit-entry-face");
  if (!overlay || !display || !main) return;
  const username = row.actor_username || "";
  display.textContent = row.actor_display_name || username || "Unknown";
  if (account) {
    account.textContent = username;
    account.hidden = !username;
  }
  if (face) {
    face.innerHTML = "";
    if (row.actor_id && typeof paintUserFace === "function") {
      paintUserFace(face, {
        id: row.actor_id,
        username: row.actor_username,
        avatar: row.actor_avatar,
      }, { name: row.actor_username, userId: row.actor_id });
    }
  }
  main.innerHTML = "";
  const review = auditEntryUsesRoleReview(row) && typeof paintRoleReviewCard === "function";
  if (card) card.classList.toggle("is-roles", review);
  if (review) {
    const host = document.createElement("div");
    host.className = "audit-entry-role-review";
    const detail = row.detail || {};
    paintRoleReviewCard(host, {
      orderChanged: !!detail.order_changed,
      roles: (detail.roles || []).map((role) => ({
        id: role.id,
        name: role.name,
        color: role.color,
        changes: (role.changes || []).map((change) => Object.assign({}, change, {
          label: auditRoleChangeLabel(change),
        })),
      })),
      onClose: () => closeAuditEntry(),
    });
    main.appendChild(host);
  } else {
    appendAuditField(main, "Action", row.action_label || row.action || "Event");
    appendAuditField(main, "When", formatAuditWhen(row.created_at) || "—");
    auditEntryFields(row).forEach((field) => appendAuditField(main, field.label, field.value));
  }
  overlay.style.display = "flex";
}

async function loadServerAuditPage() {
  setServerAuditStatus("");
  if (!currentServerId) return;
  try {
    const response = await fetch(
      `https://${serverAddress}/server_audit_log/${encodeURIComponent(currentServerId)}`,
      { credentials: "include" }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not load audit log.");
    serverAuditEntries = data.entries || [];
    paintServerAuditList();
  } catch (e) {
    serverAuditEntries = [];
    paintServerAuditList();
    setServerAuditStatus(e.message || "Could not load audit log.");
  }
}

function runServerAuditSearch() {
  const input = document.getElementById("server-audit-search");
  serverAuditQuery = input ? (input.value || "") : "";
  paintServerAuditList();
}

(function bindServerAuditChrome() {
  const input = document.getElementById("server-audit-search");
  const btn = document.getElementById("server-audit-search-btn");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runServerAuditSearch();
      }
    });
  }
  if (btn) btn.addEventListener("click", runServerAuditSearch);
  const close = document.getElementById("audit-entry-close");
  const overlay = document.getElementById("audit-entry-overlay");
  if (close) close.addEventListener("click", closeAuditEntry);
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target.id === "audit-entry-overlay") closeAuditEntry();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const card = document.getElementById("audit-entry-overlay");
    if (!card || card.style.display !== "flex") return;
    e.stopPropagation();
    closeAuditEntry();
  }, true);
})();
