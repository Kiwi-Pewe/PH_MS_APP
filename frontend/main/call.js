const voiceCalls = new Map();

function myVoiceCall() {
  let found = null;
  voiceCalls.forEach((call) => {
    if (call.here) found = call;
  });
  return found;
}

function ringingVoiceCall() {
  let found = null;
  voiceCalls.forEach((call) => {
    if (call.ringingMe && !call.here) found = call;
  });
  return found;
}

function openChatCall() {
  let found = null;
  voiceCalls.forEach((call) => {
    if (call.kind === openChatType && Number(call.chat_id) === Number(openChatId)) found = call;
  });
  return found;
}

function leaveCallMedia() {
  if (typeof stopVoiceMedia === "function") stopVoiceMedia();
  voiceJoinedChannelId = null;
  voiceJoinedServerId = null;
  voiceJoinedChannelName = "";
  voiceJoinedServerName = "";
  if (typeof paintVoiceDock === "function") paintVoiceDock();
}

function dropCallsForChat(kind, chatId) {
  const doomed = [];
  voiceCalls.forEach((call, key) => {
    if (call.kind === kind && Number(call.chat_id) === Number(chatId)) doomed.push(key);
  });
  doomed.forEach((key) => {
    const call = voiceCalls.get(key);
    voiceCalls.delete(key);
    if (call && call.here && String(voiceJoinedServerId) === String(key)) leaveCallMedia();
  });
}

function applyVoiceCall(data) {
  if (!data) return;
  if (data.active === false) {
    dropCallsForChat(data.kind, data.chat_id);
    paintCallChrome();
    return;
  }
  if (data.ended) {
    const previous = voiceCalls.get(data.key);
    voiceCalls.delete(data.key);
    if (previous && previous.here && String(voiceJoinedServerId) === String(data.key)) leaveCallMedia();
    paintCallChrome();
    return;
  }
  const joined = data.joined || [];
  const ringing = data.ringing || [];
  const here = joined.some((person) => Number(person.user_id) === Number(myUserId));
  const ringingMe = !here && ringing.some((person) => Number(person.user_id) === Number(myUserId));
  const previous = voiceCalls.get(data.key);
  voiceCalls.set(data.key, Object.assign({}, data, { joined: joined, ringing: ringing, here: here, ringingMe: ringingMe }));
  if (here) {
    voiceJoinedChannelId = "call";
    voiceJoinedServerId = data.key;
    voiceJoinedChannelName = data.label || "Call";
    voiceJoinedServerName = "";
    if (typeof paintVoiceDock === "function") paintVoiceDock();
    syncCallShare();
    if (typeof ensureVoiceMedia === "function") ensureVoiceMedia();
  } else if (previous && previous.here && String(voiceJoinedServerId) === String(data.key)) {
    leaveCallMedia();
  }
  paintCallChrome();
}

function syncCallShare() {
  const mine = myVoiceCall();
  if (!mine || typeof voiceShareStream === "undefined" || !voiceShareStream || typeof voiceSyncShareViewers !== "function") return;
  const ids = (mine.joined || []).map((person) => person.user_id).filter((id) => Number(id) !== Number(myUserId));
  voiceSyncShareViewers(ids);
}

function callFace(person, ringing) {
  const face = document.createElement("button");
  face.type = "button";
  face.className = "call-face" + (ringing ? " is-ringing" : "") + (!ringing && person.speaking ? " is-speaking" : "");
  face.dataset.userId = String(person.user_id);
  face.title = person.username || "Someone";
  if (typeof mountVoiceFace === "function") mountVoiceFace(face, person, !!person.speaking && !ringing, 80);
  face.addEventListener("click", (event) => {
    event.stopPropagation();
    if (typeof openMiniProfile === "function") openMiniProfile(person.user_id, face);
  });
  return face;
}

function callPreviewStream() {
  if (typeof voiceShareStream !== "undefined" && voiceShareStream) return voiceShareStream;
  let found = null;
  if (typeof voicePeers !== "undefined" && voicePeers) {
    voicePeers.forEach((peer) => {
      if (peer.videoStream) found = peer.videoStream;
    });
  }
  return found;
}

function paintCallChrome() {
  const banner = document.getElementById("chat-call-banner");
  const call = openChatCall();
  const faces = document.getElementById("chat-call-faces");
  const video = document.getElementById("chat-call-video");
  const join = document.getElementById("chat-call-join");
  if (banner) {
    const show = !!(call && (openChatType === "dm" || openChatType === "party"));
    banner.hidden = !show;
    if (show && faces) {
      faces.replaceChildren();
      (call.joined || []).forEach((person) => faces.appendChild(callFace(person, false)));
      (call.ringing || []).forEach((person) => faces.appendChild(callFace(person, true)));
    }
    const inCall = !!(show && call.here);
    ["chat-call-camera", "chat-call-share", "chat-call-activity", "chat-call-sound", "chat-call-more", "chat-call-hangup"].forEach((id) => {
      const button = document.getElementById(id);
      if (button) button.hidden = !inCall;
    });
    if (join) join.hidden = !show || inCall;
    if (video) {
      const stream = inCall ? callPreviewStream() : null;
      if (stream) {
        if (video.srcObject !== stream) video.srcObject = stream;
        video.hidden = false;
        video.play().catch(() => {});
      } else {
        video.srcObject = null;
        video.hidden = true;
      }
    }
  }
  paintCallButton();
  paintCallIncoming();
}

function paintCallButton() {
  const button = document.getElementById("chat-call-btn");
  if (!button) return;
  const chat = openChatType === "dm" || openChatType === "party";
  const call = openChatCall();
  if (!chat || (call && call.here)) {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  button.textContent = call ? "Join" : "Call";
  button.title = call ? "Join Call" : "Call";
}

function paintCallIncoming() {
  const overlay = document.getElementById("call-incoming");
  const call = ringingVoiceCall();
  if (!overlay) return;
  if (!call) {
    overlay.hidden = true;
    return;
  }
  overlay.hidden = false;
  const name = document.getElementById("call-incoming-name");
  if (name) name.textContent = call.starter_name || call.label || "Someone";
  const face = document.getElementById("call-incoming-face");
  if (!face) return;
  face.replaceChildren();
  const starter = (call.joined || []).find((person) => Number(person.user_id) === Number(call.starter_id))
    || (call.joined || [])[0]
    || { user_id: call.starter_id, username: call.starter_name || "Someone", avatar: {} };
  if (typeof mountVoiceFace === "function") mountVoiceFace(face, starter, false, 80);
}

function callStamp(raw) {
  if (typeof parseUtcTimestamp === "function") return parseUtcTimestamp(raw);
  return raw ? new Date(raw) : new Date();
}

function applyCallLine(data) {
  if (!data) return;
  const open = openChatType === data.kind && Number(openChatId) === Number(data.chat_id);
  if (typeof bumpConversation === "function") bumpConversation(data.kind, data.chat_id, data.label || data.username, !open);
  if (!open || typeof currentMessages === "undefined") return;
  currentMessages.push({
    id: data.id,
    chatKind: data.kind,
    isMine: Number(data.sender_id) === Number(myUserId),
    senderId: data.sender_id,
    username: data.username,
    content: data.content,
    time: callStamp(data.timestamp),
    reactions: [],
    attachment: null
  });
  if (typeof renderMessages === "function") renderMessages();
}

function applyCallLineUpdate(data) {
  if (!data || typeof currentMessages === "undefined") return;
  const row = currentMessages.find((msg) => msg.id === data.id && msg.chatKind === data.kind);
  if (!row) return;
  row.content = data.content;
  if (openChatType === data.kind && Number(openChatId) === Number(data.chat_id) && typeof renderMessages === "function") {
    renderMessages({ preserveScroll: true });
  }
}

function refreshOpenCall() {
  paintCallChrome();
  if ((openChatType !== "dm" && openChatType !== "party") || !openChatId) return;
  const kind = openChatType;
  const chatId = openChatId;
  fetch("https://" + serverAddress + "/voice_call/" + kind + "/" + chatId, { credentials: "include" })
    .then((response) => response.ok ? response.json() : null)
    .then((data) => {
      if (!data || openChatType !== kind || Number(openChatId) !== Number(chatId)) return;
      applyVoiceCall(data);
    })
    .catch(() => {});
}

async function postVoiceCall(path, kind, chatId) {
  const response = await fetch("https://" + serverAddress + path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: kind, chat_id: chatId })
  });
  let data = {};
  try {
    data = await response.json();
  } catch (err) {
    data = {};
  }
  if (!response.ok) {
    window.alert(data && typeof data.detail === "string" ? data.detail : "Could not start that call.");
    return null;
  }
  if (data && data.key) applyVoiceCall(data);
  return data;
}

function bindCallControls() {
  const start = document.getElementById("chat-call-btn");
  if (start) {
    start.addEventListener("click", () => {
      if ((openChatType !== "dm" && openChatType !== "party") || !openChatId) return;
      const call = openChatCall();
      if (call && call.here) return;
      postVoiceCall(call ? "/voice_call/answer" : "/voice_call", openChatType, openChatId);
    });
  }
  const join = document.getElementById("chat-call-join");
  if (join) {
    join.addEventListener("click", () => {
      const call = openChatCall();
      if (!call) return;
      postVoiceCall("/voice_call/answer", call.kind, call.chat_id);
    });
  }
  const hangup = document.getElementById("chat-call-hangup");
  if (hangup) {
    hangup.addEventListener("click", () => {
      if (typeof leaveVoiceChannel === "function") leaveVoiceChannel();
    });
  }
  const share = document.getElementById("chat-call-share");
  if (share) {
    share.addEventListener("click", () => {
      if (typeof openVoiceShare === "function") openVoiceShare();
    });
  }
  const answer = document.getElementById("call-incoming-answer");
  if (answer) {
    answer.addEventListener("click", () => {
      const call = ringingVoiceCall();
      if (!call) return;
      postVoiceCall("/voice_call/answer", call.kind, call.chat_id);
    });
  }
  const decline = document.getElementById("call-incoming-decline");
  if (decline) {
    decline.addEventListener("click", () => {
      const call = ringingVoiceCall();
      if (!call) return;
      postVoiceCall("/voice_call/decline", call.kind, call.chat_id);
    });
  }
}

bindCallControls();
