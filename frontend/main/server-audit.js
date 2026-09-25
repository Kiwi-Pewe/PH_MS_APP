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
    body.appendChild(tr);
  });
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
})();
