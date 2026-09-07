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
