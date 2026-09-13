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

// "24 hours old" is relative to render time, not calendar date — a
// message from 11 PM last night is 2 hours old at 1 AM, not "yesterday."
function formatClusterTime(date) {
  const ageMs = Date.now() - date.getTime();
  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (ageMs < 24 * 60 * 60 * 1000) return timeStr;
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateStr} \u00b7 ${timeStr}`;
}

// Backend timestamps come back as str(datetime) with no timezone marker
// (naive UTC) — a bare space-separated string gets misread as LOCAL time
// by Date(). Client-generated ISO strings (trailing Z) don't need this.
// KNOWN BUG (Team Chat/SplitPlan.md, "Not in this pass"): the T-check
// below still misreads FastAPI's auto-serialized "2026-09-05T18:23:11.123456"
// (has a T, no Z) as local time. Fix is queued, not part of this move.
function parseUtcTimestamp(ts) {
  if (!ts) return new Date();
  if (ts.includes("T")) return new Date(ts);
  return new Date(ts.replace(" ", "T") + "Z");
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
