// ==================================================================
// util.js - Small pure helpers. No state of their own.
// ==================================================================

function avatarLetter(username) {
  return (username || "?").charAt(0).toUpperCase();
}

// Server icons use initials (two letters) since the default name shape
// ("{username}'s server") is always two words — falls back to one
// letter for a one-word name.
function serverAvatarLetters(name) {
  const words = (name || "?").trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  }
  return (words[0] || "?").charAt(0).toUpperCase();
}

function formatClockTime(date) {
  const mode = (typeof languageTimePrefs !== "undefined" && languageTimePrefs && languageTimePrefs.time_format) || "auto";
  const opts = { minute: "2-digit" };
  if (mode === "24") {
    opts.hour = "2-digit";
    opts.hour12 = false;
  } else if (mode === "12") {
    opts.hour = "numeric";
    opts.hour12 = true;
  } else {
    opts.hour = "numeric";
  }
  return date.toLocaleTimeString([], opts);
}

// "24 hours old" is relative to render time, not calendar date — a
// message from 11 PM last night is 2 hours old at 1 AM, not "yesterday."
function formatClusterTime(date) {
  const ageMs = Date.now() - date.getTime();
  const timeStr = formatClockTime(date);
  if (ageMs < 24 * 60 * 60 * 1000) return timeStr;
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateStr} \u00b7 ${timeStr}`;
}

function sameCalendarDay(a, b) {
  if (!a || !b) return false;
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function formatChatDateSeparator(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - that) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const opts = { weekday: "long", month: "long", day: "numeric" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString([], opts);
}

function parseUtcTimestamp(ts) {
  if (ts instanceof Date) return Number.isNaN(ts.getTime()) ? new Date() : ts;
  if (ts == null || ts === "") return new Date();
  if (typeof ts === "number") {
    const numbered = new Date(ts);
    return Number.isNaN(numbered.getTime()) ? new Date() : numbered;
  }
  const raw = String(ts).trim();
  if (!raw) return new Date();
  if (/[zZ]$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw)) {
    const marked = new Date(raw);
    return Number.isNaN(marked.getTime()) ? new Date() : marked;
  }
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const utc = new Date(iso + "Z");
  return Number.isNaN(utc.getTime()) ? new Date() : utc;
}

function nextMessageTempId() {
  return "tmp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

function applyDeletionFields(out, src) {
  out.deletionState = src.deletion_state || null;
  out.deletionRequestedAt = src.deletion_requested_at
    ? parseUtcTimestamp(src.deletion_requested_at)
    : null;
  out.edited = !!src.edited;
  out.reactions = applyReactionMe(src.reactions || []);
  return out;
}

function applyReactionMe(reactions) {
  return (reactions || []).map(r => ({
    emoji: r.emoji,
    count: r.count,
    user_ids: r.user_ids || [],
    me: typeof r.me === "boolean" ? r.me : (r.user_ids || []).includes(myUserId)
  }));
}

function attachmentKey(att) {
  if (!att) return null;
  if (att.mode === "existing" && att.attachment) return att.attachment.key || null;
  if (att.mode === "new") return "__new__";
  return att.key || null;
}

function pendingIsExpired(msg) {
  if (!msg || msg.deletionState !== "pending" || !msg.deletionRequestedAt) return false;
  return Date.now() - msg.deletionRequestedAt.getTime() >= 24 * 60 * 60 * 1000;
}

function isUserBlocked(userId) {
  return !!(userId && typeof myBlockedUserIds !== "undefined" && myBlockedUserIds && myBlockedUserIds[userId]);
}

function rememberBlockedUser(userId) {
  if (!userId) return;
  if (typeof myBlockedUserIds === "undefined" || !myBlockedUserIds) myBlockedUserIds = {};
  myBlockedUserIds[userId] = true;
}

function forgetBlockedUser(userId) {
  if (!userId || typeof myBlockedUserIds === "undefined" || !myBlockedUserIds) return;
  delete myBlockedUserIds[userId];
}

function setBlockedUserIds(ids) {
  myBlockedUserIds = {};
  (ids || []).forEach((id) => {
    if (id) myBlockedUserIds[id] = true;
  });
}

async function loadBlockedUserIds() {
  try {
    const response = await fetch(`https://${serverAddress}/messaging_settings`, { credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    setBlockedUserIds((data.blocked || []).map((row) => row.id));
  } catch (e) { /* keep whatever cache we have */ }
}

function purgeBlockedMessagesFromOpenViews(userId) {
  if (!userId) return;
  let changed = false;
  if (typeof currentMessages !== "undefined" && Array.isArray(currentMessages)) {
    const next = currentMessages.filter((m) => m.senderId !== userId);
    if (next.length !== currentMessages.length) {
      currentMessages = next;
      changed = true;
      if (typeof renderMessages === "function") renderMessages();
    }
  }
  if (typeof currentChannelMessages !== "undefined" && Array.isArray(currentChannelMessages)) {
    const next = currentChannelMessages.filter((m) => m.senderId !== userId);
    if (next.length !== currentChannelMessages.length) {
      currentChannelMessages = next;
      changed = true;
      if (typeof renderChannelMessages === "function") renderChannelMessages();
    }
  }
  return changed;
}

function setHeaderDescription(elementId, text) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const value = (text || "").trim();
  el.textContent = value;
  el.hidden = !value;
}
