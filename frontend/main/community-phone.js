let communityPhoneCall = null;
let communityPhoneMessages = [];
let communityPhoneWaiting = false;
let communityPhoneWarning = "";
let communityPhoneUnread = 0;
let communityPhoneFriendNote = "";
let communityPhoneBusy = false;
let communityPhoneTimer = 0;
let communityPhoneGen = 0;

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
    tab.hidden = !(n && !inCommunities);
    tab.textContent = n ? String(n) : "";
  }
  if (row) {
    const show = !!(n && inCommunities && !onPhone);
    row.style.display = show ? "flex" : "none";
    row.textContent = n ? String(n) : "";
  }
}

function paintCommunityPhoneLanding() {
  const warn = document.getElementById("community-phone-warn");
  const start = document.getElementById("community-garter-start");
  if (warn) {
    warn.hidden = !communityPhoneWarning;
    warn.textContent = communityPhoneWarning || "";
  }
  if (start) {
    start.disabled = communityPhoneWaiting || communityPhoneBusy;
    start.textContent = communityPhoneWaiting ? "Finding someone" : "Find someone";
  }
}

function mapCommunityPhoneMessage(msg) {
  return {
    id: msg.id,
    tempId: msg.temp_id || msg.tempId,
    chatKind: "phone",
    isMine: msg.sender_id === myUserId || msg.username === myUsername,
    senderId: msg.sender_id,
    username: msg.username || "",
    nickname: msg.display_name || msg.nickname || msg.username || "",
    content: msg.content || "",
    attachment: typeof parseAttachment === "function" ? parseAttachment(msg.attachment) : (msg.attachment || null),
    time: typeof parseUtcTimestamp === "function" ? parseUtcTimestamp(msg.timestamp) : new Date(msg.timestamp),
    edited: false,
    reactions: [],
    avatar: msg.avatar || null,
    replyTo: msg.reply_to || msg.replyTo || null
  };
}

function paintCommunityPhoneFriend() {
  const el = document.getElementById("community-phone-friend");
  if (!el) return;
  el.textContent = communityPhoneFriendNote || "";
  el.hidden = !communityPhoneFriendNote;
}

function setCommunityPhoneFriendNote(text) {
  communityPhoneFriendNote = text || "";
  paintCommunityPhoneFriend();
}

function playCommunityPhoneAlert() {
  const partner = communityPhoneCall && communityPhoneCall.partner;
  if (partner && typeof isConversationMuted === "function" && isConversationMuted("dm", partner.id)) return;
  if (typeof playOneiraAlert === "function") playOneiraAlert();
}

function noteCommunityPhoneFriendRequest(data) {
  const partner = communityPhoneCall && communityPhoneCall.partner;
  if (!partner || !data || Number(data.sender_id) !== Number(partner.id)) return;
  const name = data.display_name || data.username || partner.display_name || partner.username || "Someone";
  setCommunityPhoneFriendNote(name + " has sent a friend request.");
  playCommunityPhoneAlert();
}

function paintCommunityPhoneChat() {
  const title = document.getElementById("community-phone-title");
  const partner = communityPhoneCall && communityPhoneCall.partner;
  if (title) title.textContent = partner ? (partner.display_name || partner.username || "Phone a User") : "Phone a User";
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
  const wasOnScreen = communityPhoneOnScreen();
  const previousUnread = communityPhoneUnread;
  const body = data || {};
  communityPhoneWaiting = !!body.waiting;
  communityPhoneWarning = body.call ? "" : (body.warning || "");
  communityPhoneUnread = Number(body.unread) || 0;
  communityPhoneCall = body.call || null;
  communityPhoneFriendNote = (body.call && body.call.friend_note) || "";
  communityPhoneMessages = communityPhoneCall && Array.isArray(communityPhoneCall.messages)
    ? communityPhoneCall.messages.map(mapCommunityPhoneMessage)
    : [];
  armCommunityPhoneTimer(body);
  if (communityPhoneOnScreen() || (typeof communityRow !== "undefined" && communityRow === "garterphone" && typeof isCommunitiesOpen !== "undefined" && isCommunitiesOpen)) {
    showCommunityPhone();
  } else {
    paintCommunityPhoneBadge();
    paintCommunityPhoneLanding();
    paintCommunityPhoneFriend();
  }
  if (opts && opts.alert && communityPhoneUnread > previousUnread && !wasOnScreen) playCommunityPhoneAlert();
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

async function endCommunityPhone() {
  if (communityPhoneBusy || !communityPhoneCall) return;
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
  loadCommunityPhone();
}

function applyCommunityPhoneMessage(data) {
  if (!data) return;
  if (!communityPhoneOnScreen()) {
    if (data.unread != null) communityPhoneUnread = Number(data.unread) || communityPhoneUnread;
    paintCommunityPhoneBadge();
    if (Number(data.sender_id) !== Number(myUserId)) playCommunityPhoneAlert();
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
  return {
    context_view: "phone",
    server_id: "",
    server_name: partner ? (partner.display_name || partner.username || "") : "",
    channel_id: partner && partner.id ? Number(partner.id) : null,
    channel_name: partner && partner.username ? ("@" + partner.username) : "",
    channel_type: ""
  };
}

async function openCommunityPhoneMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  const partner = communityPhoneCall && communityPhoneCall.partner;
  if (!partner || typeof openContextMenu !== "function") return;
  const relation = typeof fetchRelationship === "function" ? await fetchRelationship(partner.id) : {};
  const rows = [
    { label: "Profile", onSelect: () => { if (typeof openUserProfile === "function") openUserProfile(partner.id); } }
  ];
  if (typeof friendMenuOption === "function") {
    const friend = friendMenuOption(partner.id, partner.username, relation);
    if (friend && friend.label === "Add Friend" && !relation.pending_in && !friend.disabled && friend.onSelect) {
      const send = friend.onSelect;
      friend.onSelect = async () => {
        const ok = await send();
        if (ok) setCommunityPhoneFriendNote("Friend request sent.");
      };
    }
    if (friend) rows.push(friend);
  }
  rows.push({
    label: "Report",
    danger: true,
    onSelect: () => { if (typeof openCommunityReport === "function") openCommunityReport(communityPhoneReportContext(partner)); }
  });
  openContextMenu(e.clientX, e.clientY, {
    avatarText: typeof communityLetter === "function" ? communityLetter(partner.display_name || partner.username) : "?",
    title: partner.display_name || partner.username,
    subtitle: "@" + (partner.username || ""),
    userId: partner.id
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
const communityPhoneEnd = document.getElementById("community-phone-end");
if (communityPhoneEnd) communityPhoneEnd.addEventListener("click", () => endCommunityPhone());
const communityPhoneTitle = document.getElementById("community-phone-title");
if (communityPhoneTitle) {
  communityPhoneTitle.addEventListener("click", () => {
    const partner = communityPhoneCall && communityPhoneCall.partner;
    if (partner && typeof openMiniProfile === "function") openMiniProfile(partner.id, communityPhoneTitle);
  });
  communityPhoneTitle.addEventListener("contextmenu", (e) => openCommunityPhoneMenu(e));
}
