const COMMUNITY_ROOM_JOIN_MAX = 5;
const COMMUNITY_ROOM_SORTS = [
  { value: "newest", label: "Newest" },
  { value: "active", label: "Recently active" },
  { value: "most", label: "Most people" },
  { value: "fewest", label: "Fewest people" }
];
const COMMUNITY_ROOM_SOUNDS = [
  { value: "all", label: "All messages" },
  { value: "mentions", label: "Only mentions" },
  { value: "off", label: "Off" }
];

let communityRoomPrefs = communityRoomPrefsDefault();
let communityRoomPrefsLoaded = false;
let communityRoomPrefsLoading = null;
let communityRoomPrefsStatus = "";
let communityRoomUnread = {};
let communityRoomRevealed = new Set();
let communityRoomMembersShown = true;

function communityRoomPrefsDefault() {
  return {
    words: [],
    topics: [],
    blacklist_hide: false,
    sort: "newest",
    hide_full: false,
    hide_joined: false,
    sound: "mentions",
    unread_counts: false,
    cover_media: false,
    allow_mentions: true,
    show_members: true,
    confirm_leave: false,
    hidden: [],
    muted: {}
  };
}

function applyCommunityRoomPrefs(data) {
  if (!data || typeof data !== "object") return;
  const base = communityRoomPrefsDefault();
  const next = {};
  Object.keys(base).forEach((key) => {
    next[key] = data[key] === undefined ? base[key] : data[key];
  });
  next.words = Array.isArray(next.words) ? next.words : [];
  next.topics = Array.isArray(next.topics) ? next.topics : [];
  next.hidden = Array.isArray(next.hidden) ? next.hidden : [];
  next.muted = next.muted && typeof next.muted === "object" ? next.muted : {};
  communityRoomPrefs = next;
  communityRoomPrefsLoaded = true;
  syncCommunityRoomHidden();
}

async function communityRoomPrefsRequest(method, path, payload) {
  const options = { method, credentials: "include" };
  if (payload) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(payload);
  }
  const response = await fetch(`https://${serverAddress}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof communityErrorText === "function" ? communityErrorText(data, "Could not save.") : "Could not save.");
  return data;
}

function loadCommunityRoomPrefs() {
  if (communityRoomPrefsLoading) return communityRoomPrefsLoading;
  communityRoomPrefsLoading = (async () => {
    try {
      applyCommunityRoomPrefs(await communityRoomPrefsRequest("GET", "/community_room_settings"));
    } catch (e) {
      return;
    } finally {
      communityRoomPrefsLoading = null;
    }
    repaintCommunityRoomsAfterPrefs(false);
  })();
  return communityRoomPrefsLoading;
}

async function ensureCommunityRoomPrefs() {
  if (!communityRoomPrefsLoaded) await loadCommunityRoomPrefs();
}

function repaintCommunityRoomsAfterPrefs(reloadChat) {
  if (communitySettingsSection === "rooms" && communitySettingsOpen()) paintCommunityRoomSettings();
  if (typeof paintCommunityRooms === "function") paintCommunityRooms();
  if (typeof paintCommunityRoomNav === "function") paintCommunityRoomNav();
  if (reloadChat && communityOpenRoom && typeof loadCommunityRoomChat === "function") loadCommunityRoomChat(communityOpenRoom);
}

async function saveCommunityRoomPrefs(method, path, payload) {
  communityRoomPrefsStatus = "";
  try {
    applyCommunityRoomPrefs(await communityRoomPrefsRequest(method, path, payload));
  } catch (e) {
    communityRoomPrefsStatus = e.message || "Could not save.";
  }
  repaintCommunityRoomsAfterPrefs(true);
}

function syncCommunityRoomHidden() {
  if (typeof communityRooms === "undefined" || !Array.isArray(communityRooms)) return;
  const ids = new Set(communityRoomPrefs.hidden.map((item) => String(item.id)));
  communityRooms.forEach((row) => {
    if (row) row.hidden = ids.has(String(row.id));
  });
}

function hideCommunityRoomRow(row, hidden) {
  if (!row || !row.id) return;
  row.hidden = !!hidden;
  if (typeof paintCommunityRooms === "function") paintCommunityRooms();
  saveCommunityRoomPrefs("POST", `/community_rooms/${row.id}/hide`, { hidden: !!hidden });
}

function communityRoomMuted(id) {
  const key = String(id);
  if (!Object.prototype.hasOwnProperty.call(communityRoomPrefs.muted, key)) return false;
  const until = communityRoomPrefs.muted[key];
  if (until == null) return true;
  if (Number(until) > Date.now()) return true;
  delete communityRoomPrefs.muted[key];
  return false;
}

async function muteCommunityRoom(id, duration) {
  if (typeof closeContextMenu === "function") closeContextMenu();
  const key = String(id);
  const guess = typeof localMuteState === "function" ? localMuteState(duration) : { muted: duration !== "off", muted_until: null };
  if (guess.muted) communityRoomPrefs.muted[key] = guess.muted_until;
  else delete communityRoomPrefs.muted[key];
  if (guess.muted) delete communityRoomUnread[key];
  if (typeof paintCommunityRoomNav === "function") paintCommunityRoomNav();
  try {
    const data = await communityRoomPrefsRequest("POST", `/community_rooms/${encodeURIComponent(id)}/mute`, { duration });
    if (data.muted) communityRoomPrefs.muted[key] = data.muted_until;
    else delete communityRoomPrefs.muted[key];
  } catch (e) {
    await loadCommunityRoomPrefs();
  }
  if (typeof paintCommunityRoomNav === "function") paintCommunityRoomNav();
}

function communityRoomMuteOption(row) {
  if (communityRoomMuted(row.id)) {
    return { label: "Unmute Room", onSelect: () => muteCommunityRoom(row.id, "off") };
  }
  const rows = typeof muteDurationRows === "function" ? muteDurationRows("room", row.id) : [];
  return { label: "Mute Room", submenu: rows };
}

function communityRoomEscape(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function communityRoomWordHit(text) {
  const body = String(text || "");
  if (!body || !communityRoomPrefs.words.length) return false;
  return communityRoomPrefs.words.some((word) => new RegExp("(?<!\\w)" + communityRoomEscape(word) + "(?!\\w)", "i").test(body));
}

function communityRoomBlacklisted(row) {
  if (!row || (typeof communityRoomMine === "function" && communityRoomMine(row))) return false;
  if (communityRoomWordHit(row.name) || communityRoomWordHit(row.about)) return true;
  if (!communityRoomPrefs.topics.length) return false;
  const wanted = new Set(communityRoomPrefs.topics);
  return (row.topics || []).some((topic) => wanted.has(String(topic || "").split(/\s+/).filter(Boolean).join(" ").toLowerCase()));
}

function communityRoomCovered(row) {
  return communityRoomBlacklisted(row) && !communityRoomRevealed.has(String(row.id));
}

function revealCommunityRoom(row) {
  if (!row) return;
  communityRoomRevealed.add(String(row.id));
  if (typeof paintCommunityRooms === "function") paintCommunityRooms();
}

function communityRoomTime(value) {
  if (!value) return 0;
  const time = typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(value) : new Date(value);
  const ms = time instanceof Date ? time.getTime() : Number(time);
  return Number.isFinite(ms) ? ms : 0;
}

function communityRoomJoinedCount() {
  return communityRooms.filter((row) => row && row.joined).length;
}

function communityRoomJoinCapped(row) {
  return !!(row && !row.joined && communityRoomJoinedCount() >= COMMUNITY_ROOM_JOIN_MAX);
}

function communityRoomVisibleRows() {
  const prefs = communityRoomPrefs;
  const rows = communityRooms.filter((row) => {
    if (!row || row.hidden) return false;
    if (prefs.hide_joined && row.joined) return false;
    if (prefs.hide_full && !row.joined && Number(row.n) >= 15) return false;
    if (prefs.blacklist_hide && communityRoomBlacklisted(row)) return false;
    return true;
  });
  if (prefs.sort === "active") rows.sort((a, b) => communityRoomTime(b.active_at || b.created_at) - communityRoomTime(a.active_at || a.created_at));
  else if (prefs.sort === "most") rows.sort((a, b) => (Number(b.n) || 0) - (Number(a.n) || 0));
  else if (prefs.sort === "fewest") rows.sort((a, b) => (Number(a.n) || 0) - (Number(b.n) || 0));
  return rows;
}

function communityRoomMessageView(mapped) {
  if (!mapped || mapped.isMine) return mapped;
  if (mapped.content && communityRoomWordHit(mapped.content) && mapped.content.indexOf("||") < 0) {
    mapped.content = "||" + mapped.content + "||";
  }
  if (communityRoomPrefs.cover_media && mapped.attachment && typeof mapped.attachment === "object") {
    mapped.attachment = Object.assign({}, mapped.attachment, { explicit: true });
  }
  return mapped;
}

function clearCommunityRoomUnread(id) {
  delete communityRoomUnread[String(id)];
}

async function noteCommunityRoomUnread(data) {
  if (!data || data.room_id == null) return;
  await ensureCommunityRoomPrefs();
  if (String(communityOpenRoom) === String(data.room_id)) return;
  if (communityRoomMuted(data.room_id)) return;
  const key = String(data.room_id);
  communityRoomUnread[key] = (communityRoomUnread[key] || 0) + 1;
  if (typeof paintCommunityRoomNav === "function") paintCommunityRoomNav();
  const sound = communityRoomPrefs.sound;
  if (sound === "all" || (sound === "mentions" && data.mentioned)) {
    if (typeof playOneiraAlert === "function") playOneiraAlert();
  }
}

function confirmCommunityRoomLeave(row, run) {
  if (!communityRoomPrefs.confirm_leave || typeof showPartyConfirmCard !== "function") {
    run();
    return;
  }
  pendingLeaveParty = { kind: "room", run };
  showPartyConfirmCard("Leave Room", "Are you sure you want to leave " + ((row && row.name) || "this room") + "?", "Leave Room");
}

function paintCommunityHiddenRooms() {
  const wrap = document.createElement("div");
  wrap.className = "settings-opt community-filter-list";
  const text = document.createElement("div");
  text.className = "settings-opt-text";
  const heading = document.createElement("div");
  heading.className = "settings-opt-title";
  heading.textContent = "Hidden rooms";
  const body = document.createElement("div");
  body.className = "settings-opt-desc";
  body.textContent = "Rooms you hid stay out of your room list. Click one to show it again.";
  text.appendChild(heading);
  text.appendChild(body);
  const pills = document.createElement("div");
  pills.className = "community-filter-pills";
  if (!communityRoomPrefs.hidden.length) {
    const empty = document.createElement("div");
    empty.className = "settings-opt-desc";
    empty.textContent = "No hidden rooms.";
    pills.appendChild(empty);
  }
  communityRoomPrefs.hidden.forEach((item) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "community-tag is-on community-filter-pill";
    pill.title = "Unhide";
    pill.textContent = (item.name || "Room") + " ×";
    pill.addEventListener("click", () => {
      const row = typeof communityRoomById === "function" ? communityRoomById(item.id) : null;
      if (row) hideCommunityRoomRow(row, false);
      else saveCommunityRoomPrefs("POST", `/community_rooms/${item.id}/hide`, { hidden: false });
    });
    pills.appendChild(pill);
  });
  text.appendChild(pills);
  wrap.appendChild(text);
  return wrap;
}

function communityRoomSubblock(title) {
  const block = document.createElement("div");
  block.className = "settings-subblock";
  const head = document.createElement("div");
  head.className = "settings-subblock-title";
  head.textContent = title;
  block.appendChild(head);
  return block;
}

function communityRoomPrefToggle(key, title, desc) {
  return settingsOpt(title, desc, settingsToggle(communityRoomPrefs[key], false, (on) => {
    const payload = {};
    payload[key] = on;
    saveCommunityRoomPrefs("PATCH", "/community_room_settings", payload);
  }));
}

function communityRoomPrefSelect(key, options, title, desc) {
  const select = settingsSelect(options, communityRoomPrefs[key], false);
  select.addEventListener("change", () => {
    const payload = {};
    payload[key] = select.value;
    saveCommunityRoomPrefs("PATCH", "/community_room_settings", payload);
  });
  return settingsOpt(title, desc, select);
}

function paintCommunityRoomSettings() {
  const page = document.getElementById("community-settings-page");
  if (!page || communitySettingsSection !== "rooms") return;
  page.replaceChildren();
  const section = document.createElement("section");
  section.className = "settings-block has-sections";
  const save = (method, path, payload) => saveCommunityRoomPrefs(method, "/community_room_settings" + path, payload);
  const black = communityRoomSubblock("Blacklist");
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "Rooms from other people that match your blacklist are covered on your screen until you click them.";
  black.appendChild(blurb);
  black.appendChild(paintCommunityFilterList("word", "Words", "Covers any room whose name or description contains one of these words, and any room message that contains one.", "Add a word", communityRoomPrefs.words, save));
  black.appendChild(paintCommunityFilterList("topic", "Topics", "Covers any room that has one of these topics.", "Add a topic", communityRoomPrefs.topics, save));
  black.appendChild(communityRoomPrefToggle("blacklist_hide", "Hide blacklisted rooms", "Rooms that match your blacklist are removed from your room list instead of being covered."));
  if (communityRoomPrefsStatus) {
    const status = document.createElement("div");
    status.className = "settings-form-status";
    status.textContent = communityRoomPrefsStatus;
    black.appendChild(status);
  }
  section.appendChild(black);
  const list = communityRoomSubblock("Room list");
  list.appendChild(communityRoomPrefSelect("sort", COMMUNITY_ROOM_SORTS, "Sort rooms", "The order rooms appear in on the Rooms page."));
  list.appendChild(communityRoomPrefToggle("hide_full", "Hide full rooms", "Rooms that have no open spots are removed from your room list."));
  list.appendChild(communityRoomPrefToggle("hide_joined", "Hide rooms you've joined", "Rooms you are in are removed from your room list. They stay in your community rail."));
  list.appendChild(paintCommunityHiddenRooms());
  section.appendChild(list);
  const chat = communityRoomSubblock("Chat");
  chat.appendChild(communityRoomPrefSelect("sound", COMMUNITY_ROOM_SOUNDS, "Message sound", "Which new room messages play a sound. Muted rooms never play one."));
  chat.appendChild(communityRoomPrefToggle("unread_counts", "Show unread counts", "Shows a red count next to rooms in your community rail that have new messages."));
  chat.appendChild(communityRoomPrefToggle("cover_media", "Cover media in rooms", "Covers images and videos other people send in rooms until you click them."));
  chat.appendChild(communityRoomPrefToggle("allow_mentions", "Allow mentions in rooms", "Lets people in your rooms mention you."));
  chat.appendChild(communityRoomPrefToggle("show_members", "Show member list when opening a room", "Opens the member list beside the chat when you open a room."));
  chat.appendChild(communityRoomPrefToggle("confirm_leave", "Confirm before leaving a room", "Asks you to confirm before you leave a room."));
  chat.appendChild(settingsOpt(
    "Leave rooms automatically",
    "Leaves rooms you have not opened in 48 hours.",
    settingsToggle(false, true, null),
    settingsLaterNote("the room activity sweeper")
  ));
  section.appendChild(chat);
  page.appendChild(section);
}
