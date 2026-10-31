let communityPhoneCall = null;
let communityPhoneMessages = [];
let communityPhoneWaiting = false;
let communityPhoneWarning = "";
let communityPhoneUnread = 0;
let communityPhoneFriendNote = "";
let communityPhoneBusy = false;
let communityPhoneTimer = 0;
let communityPhoneGen = 0;
let communityPhoneDismissing = false;
let communityPhoneWarningCleared = false;
let communityPhoneTopics = [];
let communityPhoneTopicStatus = "";
let communityPhoneWidenTimer = 0;
let communityPhoneSelfEnded = false;
let communityPhonePrefs = communityPhonePrefsDefault();

function communityPhonePrefsDefault() {
  return {
    words: [],
    show_profile: false,
    allow_friend: true,
    match_sound: true,
    message_sound: "all",
    unread_count: true,
    cover_media: false,
    confirm_end: false,
    auto_find: false
  };
}

function applyCommunityPhonePrefs(data) {
  if (!data || typeof data !== "object") return;
  const base = communityPhonePrefsDefault();
  const next = {};
  Object.keys(base).forEach((key) => {
    next[key] = data[key] === undefined ? base[key] : data[key];
  });
  next.words = Array.isArray(next.words) ? next.words : [];
  communityPhonePrefs = next;
}

function communityPhoneWordHit(text) {
  const body = String(text || "");
  if (!body || !communityPhonePrefs.words.length) return false;
  const escape = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return communityPhonePrefs.words.some((word) => new RegExp("(?<!\\w)" + escape(word) + "(?!\\w)", "i").test(body));
}

function communityPhonePartnerHidden() {
  const partner = communityPhoneCall && communityPhoneCall.partner;
  return !partner || !!partner.hidden || !(Number(partner.id) > 0);
}

function communityPhoneOnScreen() {
  if (typeof isCommunitiesOpen === "undefined" || !isCommunitiesOpen) return false;
  const landing = document.getElementById("community-pane-garterphone");
  const chat = document.getElementById("community-pane-phone-chat");
  return !!((landing && !landing.hidden) || (chat && !chat.hidden));
}

function communityPhoneComposerOpen() {
  const pane = document.getElementById("community-pane-phone-chat");
  const composer = document.getElementById("composer");
  return !!(pane && !pane.hidden && composer && pane.contains(composer) && communityPhoneCall);
}

function paintCommunityPhoneBadge() {
  const tab = document.getElementById("community-phone-tab-badge");
  const row = document.getElementById("community-phone-nav-badge");
  const n = communityPhoneUnread > 0 ? communityPhoneUnread : 0;
  const onPhone = communityPhoneOnScreen();
  const inCommunities = typeof isCommunitiesOpen !== "undefined" && isCommunitiesOpen;
  if (tab) {
    tab.hidden = !(n && !inCommunities && communityPhonePrefs.unread_count);
    tab.textContent = n ? String(n) : "";
  }
  if (row) {
    const show = !!(n && inCommunities && !onPhone && communityPhonePrefs.unread_count);
    row.style.display = show ? "flex" : "none";
    row.textContent = n ? String(n) : "";
  }
}

function paintCommunityPhoneLanding() {
  const warn = document.getElementById("community-phone-warn");
  const start = document.getElementById("community-garter-start");
  const cancel = document.getElementById("community-phone-cancel");
  const wait = document.getElementById("community-phone-wait");
  const searching = !!communityPhoneWaiting;
  if (warn) {
    warn.hidden = !communityPhoneWarning;
    warn.textContent = communityPhoneWarning || "";
  }
  if (start) {
    start.disabled = searching || communityPhoneBusy;
    start.textContent = searching ? "Finding someone" : "Find someone";
  }
  if (cancel) {
    cancel.hidden = !searching;
    cancel.disabled = communityPhoneBusy;
  }
  if (wait) wait.hidden = !searching;
  paintCommunityPhoneTopics();
}

function paintCommunityPhoneTopics() {
  const pills = document.getElementById("community-phone-topic-pills");
  const input = document.getElementById("community-phone-topic-input");
  const status = document.getElementById("community-phone-topic-status");
  const locked = !!(communityPhoneWaiting || communityPhoneCall || communityPhoneBusy);
  const full = communityPhoneTopics.length >= 5;
  if (input) {
    input.disabled = locked || full;
    input.placeholder = full ? "5 of 5 topics chosen" : "Add a topic";
  }
  if (status) {
    status.hidden = !communityPhoneTopicStatus;
    status.textContent = communityPhoneTopicStatus;
  }
  if (!pills) return;
  pills.replaceChildren();
  pills.hidden = !communityPhoneTopics.length;
  communityPhoneTopics.forEach((topic) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "community-tag is-on community-filter-pill";
    pill.title = "Remove";
    pill.disabled = locked;
    pill.textContent = topic + " ×";
    pill.addEventListener("click", () => saveCommunityPhoneTopic("DELETE", topic));
    pills.appendChild(pill);
  });
}

async function saveCommunityPhoneTopic(method, label) {
  const text = String(label || "").trim();
  if (!text || communityPhoneWaiting || communityPhoneCall) return;
  communityPhoneTopicStatus = "";
  try {
    const response = await fetch(`https://${serverAddress}/community_phone/topics`, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: text })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof communityErrorText === "function" ? communityErrorText(data, "Could not save that topic.") : "Could not save that topic.");
    applyCommunityPhoneState(data);
    const input = document.getElementById("community-phone-topic-input");
    if (input && method === "POST") input.value = "";
  } catch (e) {
    communityPhoneTopicStatus = e.message || "Could not save that topic.";
  }
  paintCommunityPhoneTopics();
}

function armCommunityPhoneWiden(data) {
  if (communityPhoneWidenTimer) clearTimeout(communityPhoneWidenTimer);
  communityPhoneWidenTimer = 0;
  if (!data || !data.waiting || !data.started_at) return;
  const at = Date.parse(String(data.started_at).replace(" ", "T").replace(/\.\d+/, ""));
  if (Number.isNaN(at)) return;
  const delay = Math.max(500, at + 60 * 1000 - Date.now() + 500);
  communityPhoneWidenTimer = setTimeout(async () => {
    communityPhoneWidenTimer = 0;
    if (!communityPhoneWaiting || communityPhoneCall) return;
    try {
      const response = await fetch(`https://${serverAddress}/community_phone/widen`, { method: "POST", credentials: "include" });
      if (!response.ok) return;
      applyCommunityPhoneState(await response.json());
    } catch (e) {
      return;
    }
  }, delay);
}

function dismissCommunityPhoneWarning() {
  const landing = document.getElementById("community-pane-garterphone");
  const looking = typeof isCommunitiesOpen !== "undefined" && isCommunitiesOpen && landing && !landing.hidden;
  if (!looking || !communityPhoneWarning || communityPhoneDismissing) return;
  communityPhoneDismissing = true;
  communityPhoneWarningCleared = true;
  communityPhoneWarning = "";
  paintCommunityPhoneLanding();
  fetch(`https://${serverAddress}/community_phone/dismiss`, { method: "POST", credentials: "include" })
    .then((response) => response.ok ? response.json() : null)
    .then((data) => {
      if (data) applyCommunityPhoneState(data);
    })
    .catch(() => {})
    .finally(() => { communityPhoneDismissing = false; });
}

function mapCommunityPhoneMessage(msg) {
  const mapped = {
    id: msg.id,
    tempId: msg.temp_id || msg.tempId,
    chatKind: "phone",
    isMine: typeof msg.mine === "boolean" ? msg.mine : (msg.sender_id === myUserId || (!!msg.username && msg.username === myUsername)),
    senderId: msg.sender_id,
    username: msg.username || (Number(msg.sender_id) < 0 ? (msg.display_name || "Caller") : ""),
    nickname: msg.display_name || msg.nickname || msg.username || "",
    content: msg.content || "",
    attachment: typeof parseAttachment === "function" ? parseAttachment(msg.attachment) : (msg.attachment || null),
    time: typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(msg.timestamp) : new Date(msg.timestamp),
    edited: false,
    reactions: [],
    avatar: msg.avatar || null,
    replyTo: msg.reply_to || msg.replyTo || null
  };
  if (!mapped.isMine) {
    if (mapped.content && communityPhoneWordHit(mapped.content) && mapped.content.indexOf("||") < 0) {
      mapped.content = "||" + mapped.content + "||";
    }
    if (communityPhonePrefs.cover_media && mapped.attachment && typeof mapped.attachment === "object") {
      mapped.attachment = Object.assign({}, mapped.attachment, { explicit: true });
    }
  }
  return mapped;
}

function paintCommunityPhoneFriend() {
  const el = document.getElementById("community-phone-friend");
  if (!el) return;
  el.replaceChildren();
  el.hidden = !communityPhoneFriendNote;
  if (!communityPhoneFriendNote) return;
  const text = document.createElement("span");
  text.textContent = communityPhoneFriendNote;
  el.appendChild(text);
  if (!communityPhoneCall || communityPhoneCall.friend_state !== "in") return;
  const accept = document.createElement("button");
  accept.type = "button";
  accept.className = "pill-btn";
  accept.textContent = "Accept";
  accept.addEventListener("click", () => saveCommunityPhoneFriend("/friend/accept"));
  const decline = document.createElement("button");
  decline.type = "button";
  decline.className = "ghost-btn";
  decline.textContent = "Decline";
  decline.addEventListener("click", () => saveCommunityPhoneFriend("/friend/decline"));
  el.appendChild(decline);
  el.appendChild(accept);
}

async function saveCommunityPhoneFriend(path) {
  if (communityPhoneBusy) return false;
  communityPhoneBusy = true;
  try {
    const response = await fetch(`https://${serverAddress}/community_phone${path}`, { method: "POST", credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      window.alert(typeof communityErrorText === "function" ? communityErrorText(data, "Could not do that.") : "Could not do that.");
      return false;
    }
    applyCommunityPhoneState(data);
    return true;
  } catch (e) {
    return false;
  } finally {
    communityPhoneBusy = false;
  }
}

function applyCommunityPhoneFriend(data) {
  loadCommunityPhone();
  if (data && data.incoming) playCommunityPhoneAlert("friend");
}

function playCommunityPhoneAlert(kind) {
  if (kind === "match" && !communityPhonePrefs.match_sound) return;
  if (kind === "message" && communityPhonePrefs.message_sound === "off") return;
  const partner = communityPhoneCall && communityPhoneCall.partner;
  if (partner && Number(partner.id) > 0 && typeof isConversationMuted === "function" && isConversationMuted("dm", partner.id)) return;
  if (typeof playOneiraAlert === "function") playOneiraAlert();
}

function paintCommunityPhoneChat() {
  const title = document.getElementById("community-phone-title");
  const partner = communityPhoneCall && communityPhoneCall.partner;
  if (title) {
    title.textContent = partner ? (partner.display_name || partner.username || "Caller") : "Phone a User";
    title.classList.toggle("is-hidden-caller", communityPhonePartnerHidden());
  }
  const starter = document.getElementById("community-phone-starter");
  const shared = (communityPhoneCall && communityPhoneCall.shared_topics) || [];
  if (starter) {
    starter.hidden = !shared.length;
    starter.textContent = shared.length ? "You both like: " + shared.join(", ") : "";
  }
  paintCommunityPhoneFriend();
  const log = document.getElementById("community-phone-log");
  const body = log && log.parentElement;
  if (log && typeof renderClusteredMessages === "function") {
    log.replaceChildren();
    renderClusteredMessages(log, communityPhoneMessages);
  }
  if (body) body.scrollTop = body.scrollHeight;
}

function mountCommunityPhoneComposer() {
  const composer = document.getElementById("composer");
  const slot = document.getElementById("community-phone-compose");
  const home = document.getElementById("view-chat");
  if (!composer || !slot || !home) return;
  if (slot.contains(composer)) return;
  const input = document.getElementById("composer-input");
  if (home.contains(composer)) {
    communityComposerHold = {
      disabled: !!(input && input.disabled),
      placeholder: input ? input.placeholder : "Type a message"
    };
  }
  if (!slot.contains(composer)) slot.appendChild(composer);
  if (typeof clearPendingAttach === "function") clearPendingAttach();
  if (typeof clearPendingReply === "function") clearPendingReply();
  if (typeof resetTypingOnLeave === "function") resetTypingOnLeave();
  if (input) input.value = "";
  if (typeof enableComposer === "function") enableComposer();
  if (typeof autoGrowComposer === "function") autoGrowComposer();
}

function showCommunityPhone() {
  const landing = document.getElementById("community-pane-garterphone");
  const chat = document.getElementById("community-pane-phone-chat");
  const room = document.getElementById("community-pane-room-chat");
  if (room) room.hidden = true;
  if (communityPhoneCall) {
    if (landing) landing.hidden = true;
    if (chat) chat.hidden = false;
    mountCommunityPhoneComposer();
    paintCommunityPhoneChat();
    seeCommunityPhone();
  } else {
    if (chat) chat.hidden = true;
    if (landing) landing.hidden = false;
    if (typeof restoreCommunityRoomComposer === "function") restoreCommunityRoomComposer();
    paintCommunityPhoneLanding();
  }
  paintCommunityPhoneBadge();
}

function armCommunityPhoneTimer(data) {
  if (communityPhoneTimer) clearTimeout(communityPhoneTimer);
  communityPhoneTimer = 0;
  const stamp = (value) => {
    const at = Date.parse(String(value || "").replace(" ", "T").replace(/\.\d+/, ""));
    return Number.isNaN(at) ? 0 : at;
  };
  let at = 0;
  if (data && data.waiting && data.started_at) at = stamp(data.started_at) + (5 * 60 * 1000);
  else if (data && data.call && data.call.active_at) at = stamp(data.call.active_at) + (15 * 60 * 1000);
  const delay = at && !Number.isNaN(at) ? Math.max(1000, at - Date.now() + 750) : ((data && (data.waiting || data.call)) ? 30000 : 0);
  if (!delay) return;
  communityPhoneTimer = setTimeout(() => {
    communityPhoneTimer = 0;
    loadCommunityPhone();
  }, delay);
}

function applyCommunityPhoneState(data, opts) {
  const hadCall = !!communityPhoneCall;
  const body = data || {};
  if (Array.isArray(body.topics)) communityPhoneTopics = body.topics;
  if (body.prefs) applyCommunityPhonePrefs(body.prefs);
  communityPhoneWaiting = !!body.waiting;
  communityPhoneWarning = body.call ? "" : (body.warning || "");
  if (communityPhoneWarningCleared && !body.call) communityPhoneWarning = "";
  communityPhoneUnread = Number(body.unread) || 0;
  communityPhoneCall = body.call || null;
  communityPhoneFriendNote = (body.call && body.call.friend_note) || "";
  communityPhoneMessages = communityPhoneCall && Array.isArray(communityPhoneCall.messages)
    ? communityPhoneCall.messages.map(mapCommunityPhoneMessage)
    : [];
  armCommunityPhoneTimer(body);
  armCommunityPhoneWiden(body);
  if (communityPhoneOnScreen() || (typeof communityRow !== "undefined" && communityRow === "garterphone" && typeof isCommunitiesOpen !== "undefined" && isCommunitiesOpen)) {
    showCommunityPhone();
  } else {
    paintCommunityPhoneBadge();
    paintCommunityPhoneLanding();
    paintCommunityPhoneFriend();
  }
  if (opts && opts.alert && communityPhoneCall && !hadCall) playCommunityPhoneAlert("match");
}

async function loadCommunityPhone(opts) {
  const token = ++communityPhoneGen;
  try {
    const response = await fetch(`https://${serverAddress}/community_phone`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    if (token !== communityPhoneGen) return;
    applyCommunityPhoneState(data, opts);
  } catch (e) {
    return;
  }
}

async function seeCommunityPhone() {
  if (!communityPhoneCall) return;
  communityPhoneUnread = 0;
  paintCommunityPhoneBadge();
  try {
    await fetch(`https://${serverAddress}/community_phone/seen`, { method: "POST", credentials: "include" });
  } catch (e) {
    return;
  }
}

async function startCommunityPhone() {
  if (communityPhoneBusy || communityPhoneWaiting || communityPhoneCall) return;
  communityPhoneWarningCleared = false;
  communityPhoneBusy = true;
  paintCommunityPhoneLanding();
  try {
    const response = await fetch(`https://${serverAddress}/community_phone/find`, {
      method: "POST",
      credentials: "include"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    applyCommunityPhoneState(data);
  } catch (e) {
    return;
  } finally {
    communityPhoneBusy = false;
    paintCommunityPhoneLanding();
  }
}

async function cancelCommunityPhone() {
  if (communityPhoneBusy || !communityPhoneWaiting || communityPhoneCall) return;
  communityPhoneBusy = true;
  paintCommunityPhoneLanding();
  try {
    const response = await fetch(`https://${serverAddress}/community_phone/cancel`, {
      method: "POST",
      credentials: "include"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    applyCommunityPhoneState(data);
  } catch (e) {
    return;
  } finally {
    communityPhoneBusy = false;
    paintCommunityPhoneLanding();
  }
}
function endCommunityPhone() {
  if (communityPhoneBusy || !communityPhoneCall) return;
  if (communityPhonePrefs.confirm_end && typeof showPartyConfirmCard === "function") {
    pendingLeaveParty = { kind: "room", run: () => runEndCommunityPhone() };
    showPartyConfirmCard("End Chat", "Are you sure you want to end this chat?", "End Chat");
    return;
  }
  runEndCommunityPhone();
}

async function runEndCommunityPhone() {
  if (communityPhoneBusy || !communityPhoneCall) return;
  communityPhoneSelfEnded = true;
  communityPhoneBusy = true;
  try {
    const response = await fetch(`https://${serverAddress}/community_phone/end`, {
      method: "POST",
      credentials: "include"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    applyCommunityPhoneState(data);
  } catch (e) {
    return;
  } finally {
    communityPhoneBusy = false;
    paintCommunityPhoneLanding();
  }
}

function applyCommunityPhoneEnded(data) {
  const hadCall = !!communityPhoneCall;
  const selfEnded = communityPhoneSelfEnded;
  communityPhoneSelfEnded = false;
  communityPhoneWarningCleared = false;
  communityPhoneCall = null;
  communityPhoneMessages = [];
  communityPhoneWaiting = false;
  communityPhoneUnread = 0;
  communityPhoneFriendNote = "";
  communityPhoneWarning = (data && data.warning) || communityPhoneWarning;
  if (communityPhoneOnScreen() || (typeof communityRow !== "undefined" && communityRow === "garterphone")) showCommunityPhone();
  else {
    paintCommunityPhoneBadge();
    paintCommunityPhoneLanding();
  }
  if (hadCall && !selfEnded && communityPhonePrefs.auto_find) {
    startCommunityPhone();
    return;
  }
  loadCommunityPhone();
}

function applyCommunityPhoneMessage(data) {
  if (!data) return;
  if (!communityPhoneOnScreen()) {
    if (data.unread != null) communityPhoneUnread = Number(data.unread) || communityPhoneUnread;
    paintCommunityPhoneBadge();
    if (data.mine !== true && Number(data.sender_id) !== Number(myUserId)) playCommunityPhoneAlert("message");
    return;
  }
  if (data.id && communityPhoneMessages.some((row) => row.id === data.id)) return;
  communityPhoneMessages.push(mapCommunityPhoneMessage(data));
  paintCommunityPhoneChat();
  seeCommunityPhone();
  if (communityPhoneCall) communityPhoneCall.active_at = new Date().toISOString();
  armCommunityPhoneTimer({ call: communityPhoneCall });
  if (typeof clearRemoteTyper === "function") clearRemoteTyper(data.sender_id);
}

function ackCommunityPhoneMessage(tempId, id) {
  const row = communityPhoneMessages.find((item) => item.tempId === tempId);
  if (!row) return false;
  row.id = id;
  return true;
}

function dropCommunityPhoneTemp(tempId) {
  const before = communityPhoneMessages.length;
  communityPhoneMessages = communityPhoneMessages.filter((row) => row.tempId !== tempId);
  if (communityPhoneMessages.length === before) return false;
  paintCommunityPhoneChat();
  return true;
}

function takeCommunityPhoneDm(partner, ping) {
  if (!partner || !partner.id) return;
  const looking = communityPhoneOnScreen();
  communityPhoneCall = null;
  communityPhoneMessages = [];
  communityPhoneWaiting = false;
  communityPhoneUnread = 0;
  communityPhoneWarning = "";
  communityPhoneFriendNote = "";
  if (looking && typeof openDirectMessage === "function") {
    if (typeof selectRailIcon === "function") selectRailIcon("home");
    currentServerId = null;
    currentServerOwnerId = null;
    currentServerPerms = {};
    currentServerHighestRole = null;
    currentServerTimeoutUntil = null;
    currentChannelId = null;
    currentChannelType = null;
    currentChannelName = null;
    if (typeof showPlaceSidebar === "function") showPlaceSidebar("home");
    if (typeof setTopbarTab === "function") setTopbarTab("messages");
    openDirectMessage(partner.id, partner.username);
    if (typeof syncAppAddress === "function") syncAppAddress();
    return;
  }
  if (ping && typeof bumpConversation === "function") {
    bumpConversation("dm", partner.id, partner.username, true, { displayName: partner.display_name || partner.username });
  }
}

function communityPhoneReportContext(partner) {
  const hidden = communityPhonePartnerHidden();
  return {
    context_view: "phone",
    server_id: "",
    server_name: partner ? (partner.display_name || partner.username || "") : "",
    channel_id: !hidden && partner && partner.id ? Number(partner.id) : null,
    channel_name: !hidden && partner && partner.username ? ("@" + partner.username) : "",
    channel_type: ""
  };
}

function communityPhoneFriendRow() {
  const state = communityPhoneCall && communityPhoneCall.friend_state;
  if (state === "in") return { label: "Accept Friend Request", onSelect: () => saveCommunityPhoneFriend("/friend/accept") };
  if (state === "out") return { label: "Friend Request Sent", disabled: true };
  return { label: "Add Friend", onSelect: () => saveCommunityPhoneFriend("/friend") };
}

function blockCommunityPhonePartner() {
  const run = async () => {
    if (communityPhoneBusy || !communityPhoneCall) return;
    communityPhoneSelfEnded = true;
    communityPhoneBusy = true;
    try {
      const response = await fetch(`https://${serverAddress}/community_phone/block`, { method: "POST", credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (response.ok) applyCommunityPhoneState(data);
    } catch (e) {
      return;
    } finally {
      communityPhoneBusy = false;
      paintCommunityPhoneLanding();
    }
  };
  if (typeof showPartyConfirmCard !== "function") {
    run();
    return;
  }
  pendingLeaveParty = { kind: "room", run };
  showPartyConfirmCard("Block", "Blocking ends this chat, and the two of you will never be paired again.", "Block");
}

function openCommunityPhoneMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  const partner = communityPhoneCall && communityPhoneCall.partner;
  if (!partner || typeof openContextMenu !== "function") return;
  const hidden = communityPhonePartnerHidden();
  const rows = [];
  if (!hidden) rows.push({ label: "Profile", onSelect: () => { if (typeof openUserProfile === "function") openUserProfile(partner.id); } });
  rows.push(communityPhoneFriendRow());
  rows.push({ separator: true });
  rows.push({ label: "Block", danger: true, onSelect: () => blockCommunityPhonePartner() });
  rows.push({
    label: "Report",
    danger: true,
    onSelect: () => { if (typeof openCommunityReport === "function") openCommunityReport(communityPhoneReportContext(partner)); }
  });
  openContextMenu(e.clientX, e.clientY, {
    avatarText: typeof communityLetter === "function" ? communityLetter(partner.display_name || partner.username) : "?",
    title: partner.display_name || partner.username || "Caller",
    subtitle: hidden ? "" : "@" + (partner.username || ""),
    userId: hidden ? null : partner.id
  }, rows);
}

async function sendCommunityPhoneMessage() {
  const input = document.getElementById("composer-input");
  const content = input ? input.value.trim() : "";
  if ((!content && !pendingAttach) || !communityPhoneCall || !ws || ws.readyState !== 1) return;
  if (pendingAttach && pendingAttach.busy) return;
  let attachment = null;
  if (pendingAttach) {
    try {
      attachment = await uploadPendingIfNeeded();
    } catch (err) {
      return;
    }
  }
  const tempId = nextMessageTempId();
  const replyId = typeof currentPendingReplyId === "function" ? currentPendingReplyId("phone") : null;
  ws.send(JSON.stringify({
    type: "phone_message",
    content: content,
    attachment: attachment,
    temp_id: tempId,
    reply_to_id: replyId
  }));
  communityPhoneMessages.push(mapCommunityPhoneMessage({
    temp_id: tempId,
    sender_id: myUserId,
    username: myUsername || "",
    display_name: typeof myDisplayName !== "undefined" ? myDisplayName : "",
    content: content,
    attachment: attachment,
    timestamp: new Date().toISOString(),
    reply_to: pendingReply && pendingReply.chatKind === "phone" ? {
      id: pendingReply.id,
      sender_id: pendingReply.senderId,
      username: pendingReply.username,
      content: pendingReply.content
    } : null,
    avatar: typeof faceForUser === "function" ? faceForUser(myUserId) : null
  }));
  paintCommunityPhoneChat();
  if (communityPhoneCall) {
    communityPhoneCall.active_at = new Date().toISOString();
    armCommunityPhoneTimer({ call: communityPhoneCall });
  }
  if (input) input.value = "";
  if (typeof clearPendingAttach === "function") clearPendingAttach();
  if (typeof clearPendingReply === "function") clearPendingReply();
  if (typeof stopOutgoingTyping === "function") stopOutgoingTyping();
  if (typeof autoGrowComposer === "function") autoGrowComposer();
}

const communityPhoneStart = document.getElementById("community-garter-start");
if (communityPhoneStart) communityPhoneStart.addEventListener("click", () => startCommunityPhone());
const communityPhoneCancel = document.getElementById("community-phone-cancel");
if (communityPhoneCancel) communityPhoneCancel.addEventListener("click", () => cancelCommunityPhone());
const communityPhoneEnd = document.getElementById("community-phone-end");
if (communityPhoneEnd) communityPhoneEnd.addEventListener("click", () => endCommunityPhone());
const communityPhoneTitle = document.getElementById("community-phone-title");
if (communityPhoneTitle) {
  communityPhoneTitle.addEventListener("click", () => {
    const partner = communityPhoneCall && communityPhoneCall.partner;
    if (partner && !communityPhonePartnerHidden() && typeof openMiniProfile === "function") openMiniProfile(partner.id, communityPhoneTitle);
  });
  communityPhoneTitle.addEventListener("contextmenu", (e) => openCommunityPhoneMenu(e));
}
const communityPhoneTopicInput = document.getElementById("community-phone-topic-input");
if (communityPhoneTopicInput) {
  communityPhoneTopicInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    saveCommunityPhoneTopic("POST", communityPhoneTopicInput.value);
  });
}
