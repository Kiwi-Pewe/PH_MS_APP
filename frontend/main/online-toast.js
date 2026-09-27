// ==================================================================
// online-toast.js - Steam-style "friend is online" toasts. Ephemeral
// only (no Feed / mail / DB). Pref lives in localStorage until a
// models column is approved.
// ==================================================================

const ONLINE_TOAST_PREF_KEY = "oneira_notify_friends_online";
const ONLINE_TOAST_MS = 3000;
const friendOnlineById = {};

function friendsOnlineToastsEnabled() {
  const raw = localStorage.getItem(ONLINE_TOAST_PREF_KEY);
  if (raw === null) return true;
  return raw !== "0" && raw !== "false";
}

function setFriendsOnlineToastsEnabled(on) {
  localStorage.setItem(ONLINE_TOAST_PREF_KEY, on ? "1" : "0");
}

function rememberFriendsForOnlineToasts(onlineList, offlineList) {
  const seen = {};
  (onlineList || []).forEach(friend => {
    if (!friend || friend.id == null) return;
    const id = String(friend.id);
    seen[id] = true;
    const prev = friendOnlineById[id];
    friendOnlineById[id] = {
      id: friend.id,
      username: friend.username || (prev && prev.username) || "Friend",
      display_name: friend.display_name || friend.username || (prev && prev.display_name) || "Friend",
      avatar: friend.avatar || (prev && prev.avatar) || null,
      status: "online"
    };
  });
  (offlineList || []).forEach(friend => {
    if (!friend || friend.id == null) return;
    const id = String(friend.id);
    seen[id] = true;
    const prev = friendOnlineById[id];
    friendOnlineById[id] = {
      id: friend.id,
      username: friend.username || (prev && prev.username) || "Friend",
      display_name: friend.display_name || friend.username || (prev && prev.display_name) || "Friend",
      avatar: friend.avatar || (prev && prev.avatar) || null,
      status: "offline"
    };
  });
  Object.keys(friendOnlineById).forEach(id => {
    if (!seen[id]) delete friendOnlineById[id];
  });
}

function onlineToastStack() {
  let stack = document.getElementById("online-toast-stack");
  if (stack) return stack;
  stack = document.createElement("div");
  stack.id = "online-toast-stack";
  stack.className = "online-toast-stack";
  stack.setAttribute("aria-live", "polite");
  document.body.appendChild(stack);
  return stack;
}

function showFriendOnlineToast(friend) {
  if (!friend) return;
  const name = friend.display_name || friend.username || "Friend";
  const toast = document.createElement("div");
  toast.className = "online-toast";
  const face = document.createElement("div");
  face.className = "online-toast-avatar avatar-dot";
  if (typeof paintUserFace === "function") {
    paintUserFace(face, friend, { name: name, userId: friend.id });
  } else {
    face.textContent = typeof avatarLetter === "function" ? avatarLetter(name) : (name[0] || "?").toUpperCase();
  }
  const copy = document.createElement("div");
  copy.className = "online-toast-copy";
  const title = document.createElement("div");
  title.className = "online-toast-title";
  title.textContent = name;
  const line = document.createElement("div");
  line.className = "online-toast-line";
  line.textContent = "is now online";
  copy.appendChild(title);
  copy.appendChild(line);
  toast.appendChild(face);
  toast.appendChild(copy);
  onlineToastStack().appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("is-in"));
  window.setTimeout(() => {
    toast.classList.remove("is-in");
    toast.classList.add("is-out");
    window.setTimeout(() => toast.remove(), 280);
  }, ONLINE_TOAST_MS);
}

function noteFriendPresenceForToast(data) {
  if (!data || data.user_id == null) return;
  if (typeof myUserId !== "undefined" && Number(data.user_id) === Number(myUserId)) return;
  const id = String(data.user_id);
  const status = (data.status || "").toLowerCase();
  const cached = friendOnlineById[id];
  if (!cached && !(data.username || data.display_name)) return;

  const next = {
    id: data.user_id,
    username: data.username || (cached && cached.username) || "Friend",
    display_name: data.display_name || data.username || (cached && cached.display_name) || "Friend",
    avatar: data.avatar || (cached && cached.avatar) || null,
    status: status === "online" ? "online" : "offline"
  };

  // Only toast friends we already know about (seeded from get_friends).
  if (!cached) {
    return;
  }

  const wasOnline = cached.status === "online";
  friendOnlineById[id] = next;
  if (status === "online" && !wasOnline && friendsOnlineToastsEnabled()) {
    showFriendOnlineToast(next);
  }
}
