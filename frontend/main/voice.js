let voiceRosterServerId = null;
let voiceRoster = {};
let voiceJoinedChannelId = null;
let voiceJoinedServerId = null;
let voiceJoinedChannelName = "";
let voiceJoinedServerName = "";
let voiceStageChannelId = null;
let voiceMuted = false;
let voiceDeafened = false;
let voiceCameraOn = false;
let voiceLocalStream = null;
let voiceMediaStarting = false;
let voiceIceServers = [{ urls: "stun:stun.cloudflare.com:3478" }];
let voiceAudioContext = null;
let voiceLevelTimer = 0;
let voiceStatsTimer = 0;
let voiceSpeaking = false;
let voiceSpeakUntil = 0;
let voiceGainNode = null;
let voiceSendStream = null;
let voiceMicTestAudio = null;
let voiceMicTestStream = null;
const voicePeers = new Map();
var voiceShareStream = null;
const voiceInputDevices = [];
const voiceOutputDevices = [];
const voiceBannerColors = new Map();

function voiceFaceUrl(media) {
  return (media && media.url) || "";
}

function voiceFaceMime(media) {
  return (media && media.mime) || "";
}

function applyVoiceRoster(data) {
  if (!data || data.server_id == null) return;
  if (String(voiceRosterServerId) !== String(data.server_id) && String(currentServerId) !== String(data.server_id)) {
    if (String(voiceJoinedServerId) === String(data.server_id)) syncVoiceSeat(data);
    return;
  }
  if (String(currentServerId) === String(data.server_id)) {
    voiceRosterServerId = data.server_id;
    voiceRoster = data.channels || {};
    syncVoiceSeat(data);
    paintVoiceRails();
    if (voiceStageChannelId) paintVoiceStage();
    if (voiceJoinedChannelId) ensureVoiceMedia();
  }
}

function syncVoiceSeat(data) {
  let found = null;
  Object.keys(data.channels || {}).forEach((channelId) => {
    if ((data.channels[channelId] || []).some((person) => Number(person.user_id) === Number(myUserId))) {
      found = Number(channelId);
    }
  });
  if (voiceJoinedServerId && String(data.server_id) !== String(voiceJoinedServerId)) return;
  if (found) {
    voiceJoinedChannelId = found;
    voiceJoinedServerId = data.server_id;
    paintVoiceDock();
    return;
  }
  if (!voiceJoinedChannelId || String(data.server_id) !== String(voiceJoinedServerId || currentServerId)) return;
  stopVoiceMedia();
  voiceJoinedChannelId = null;
  voiceJoinedServerId = null;
  voiceJoinedChannelName = "";
  voiceJoinedServerName = "";
  if (voiceStageChannelId) closeVoiceStage();
  paintVoiceDock();
}

async function loadVoiceRoster(serverId) {
  voiceRosterServerId = serverId;
  voiceRoster = {};
  paintVoiceRails();
  try {
    const response = await fetch(`https://${serverAddress}/voice_roster/${serverId}`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    if (String(currentServerId) !== String(serverId)) return;
    applyVoiceRoster(data);
  } catch (err) {
    return;
  }
}

async function joinVoiceChannel(channel) {
  const response = await fetch(`https://${serverAddress}/voice_join`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel_id: channel.id })
  });
  if (!response.ok) {
    let detail = "Could not join that voice channel.";
    try {
      const data = await response.json();
      if (typeof data.detail === "string" && data.detail) detail = data.detail;
    } catch (err) {
      detail = "Could not join that voice channel.";
    }
    window.alert(detail);
    return false;
  }
  const data = await response.json();
  voiceJoinedChannelId = channel.id;
  voiceJoinedServerId = data.server_id || currentServerId;
  voiceJoinedChannelName = channel.name || "Voice";
  voiceJoinedServerName = (currentServerData && currentServerData.name) || (document.getElementById("server-sidebar-name") || {}).textContent || "Server";
  voiceCameraOn = false;
  applyVoiceRoster(data);
  paintVoiceDock();
  paintVoiceInputs();
  ensureVoiceMedia();
  return true;
}

function dropVoiceOnDisconnect() {
  stopVoiceMedia();
  const stageWasOpen = voiceStageChannelId != null;
  const mine = Number(myUserId);
  Object.keys(voiceRoster).forEach((channelId) => {
    voiceRoster[channelId] = (voiceRoster[channelId] || []).filter((person) => Number(person.user_id) !== mine);
  });
  voiceJoinedChannelId = null;
  voiceJoinedServerId = null;
  voiceJoinedChannelName = "";
  voiceJoinedServerName = "";
  paintVoiceDock();
  paintVoiceRails();
  if (!stageWasOpen) return;
  closeVoiceStage();
  const body = document.getElementById("channel-body");
  const composer = document.getElementById("channel-composer");
  if (body) body.style.display = "flex";
  if (composer) composer.style.display = "block";
}

async function leaveVoiceChannel() {
  const stageWasOpen = voiceStageChannelId != null;
  stopVoiceMedia();
  voiceJoinedChannelId = null;
  voiceJoinedServerId = null;
  voiceJoinedChannelName = "";
  voiceJoinedServerName = "";
  paintVoiceDock();
  try {
    await fetch(`https://${serverAddress}/voice_leave`, { method: "POST", credentials: "include" });
  } catch (err) {
    return;
  }
  if (stageWasOpen) {
    closeVoiceStage();
    const next = typeof firstVisibleSidebarChannel === "function" ? firstVisibleSidebarChannel() : null;
    if (next && typeof selectChannel === "function") await selectChannel(next);
    else if (typeof showNoChannelSelected === "function") showNoChannelSelected();
  }
}

function fitVoiceLine(node, startPx, floorPx) {
  if (!node) return;
  let size = startPx;
  node.style.fontSize = size + "px";
  const box = node.clientWidth;
  if (!box) return;
  while (size > floorPx && node.scrollWidth > box + 1) {
    size -= 0.5;
    node.style.fontSize = size + "px";
  }
}

function paintVoiceDock() {
  const card = document.getElementById("voice-user-card");
  if (!card) return;
  if (!voiceJoinedChannelId) {
    card.hidden = true;
    const share = document.getElementById("voice-share-overlay");
    if (share) share.hidden = true;
    return;
  }
  card.hidden = false;
  const where = document.getElementById("voice-user-where");
  const place = voiceJoinedChannelName + " / " + voiceJoinedServerName;
  if (where) {
    where.textContent = place;
    where.title = place;
  }
  paintVoiceInputs();
  requestAnimationFrame(() => {
    fitVoiceLine(card.querySelector(".voice-user-status"), 12, 9);
    fitVoiceLine(where, 11, 8);
  });
}

function paintVoiceInputs() {
  const muteOn = voiceMuted || voiceDeafened;
  document.querySelectorAll("#footer-mute, #voice-ctrl-mute").forEach((button) => {
    button.classList.toggle("is-off", muteOn);
  });
  const deafen = document.getElementById("footer-deafen");
  if (deafen) deafen.classList.toggle("is-off", voiceDeafened);
  document.querySelectorAll("#voice-user-camera, #voice-ctrl-camera").forEach((button) => {
    button.classList.toggle("is-off", !voiceCameraOn);
  });
  document.querySelectorAll("#voice-user-screen, #voice-ctrl-screen").forEach((button) => {
    button.classList.toggle("is-live", !!voiceShareStream);
    button.title = voiceShareStream ? "Stop sharing" : "Share screen";
  });
  applyVoiceSendState();
  applyVoicePlayback();
}

function openVoiceShare() {
  if (voiceShareStream) {
    if (typeof stopVoiceShare === "function") stopVoiceShare();
    return;
  }
  const share = document.getElementById("voice-share-overlay");
  if (share) share.hidden = false;
  if (typeof showVoiceShare === "function") showVoiceShare();
}

function closeVoiceStage() {
  const grid = document.getElementById("main-grid");
  const wasOpen = !!(grid && grid.classList.contains("voice-stage-open"));
  voiceStageChannelId = null;
  if (grid) grid.classList.remove("voice-stage-open");
  if (wasOpen) {
    const users = document.getElementById("user-list");
    if (users && grid.classList.contains("has-member-list")) users.style.display = "flex";
  }
  const view = document.getElementById("voice-view");
  if (view) view.style.display = "none";
  const menu = document.getElementById("voice-more");
  if (menu) menu.hidden = true;
}

function peopleInVoice(channelId) {
  return voiceRoster[String(channelId)] || voiceRoster[channelId] || [];
}

function paintVoiceRails() {
  document.querySelectorAll(".voice-rail").forEach((node) => node.remove());
  document.querySelectorAll("#category-list .channel-row").forEach((row) => {
    if (row.classList.contains("event-rail-row")) return;
    const people = peopleInVoice(row.dataset.channelId);
    if (!people.length) return;
    const rail = document.createElement("div");
    rail.className = "voice-rail";
    people.forEach((person) => {
      const line = document.createElement("button");
      line.type = "button";
      line.className = "voice-rail-user";
      const face = document.createElement("span");
      face.className = "voice-rail-face";
      mountVoiceFace(face, person, false, 24);
      const dot = document.createElement("span");
      dot.className = "voice-rail-status";
      face.appendChild(dot);
      const name = document.createElement("span");
      name.className = "voice-rail-name";
      name.textContent = person.username || "Someone";
      line.appendChild(face);
      line.appendChild(name);
      if (person.sharing) {
        const live = document.createElement("span");
        live.className = "voice-rail-live";
        live.textContent = "Live";
        line.appendChild(live);
      }
      line.addEventListener("click", (event) => {
        event.stopPropagation();
        if (typeof openMiniProfile === "function") openMiniProfile(person.user_id, line);
      });
      rail.appendChild(line);
    });
    row.after(rail);
  });
}

function mountVoiceFace(host, person, speaking, size) {
  const url = voiceFaceUrl(person.avatar);
  const mime = voiceFaceMime(person.avatar);
  if (!url) {
    const letter = document.createElement("span");
    letter.className = "voice-face-letter";
    letter.textContent = (person.username || "?").slice(0, 1).toUpperCase();
    host.appendChild(letter);
    return;
  }
  if (mime === "image/gif" && !speaking) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const still = new Image();
    still.onload = () => {
      canvas.getContext("2d").drawImage(still, 0, 0, size, size);
    };
    still.onerror = () => {
      canvas.remove();
      const img = document.createElement("img");
      img.alt = "";
      img.src = url;
      host.appendChild(img);
    };
    still.src = url;
    host.appendChild(canvas);
    return;
  }
  const img = document.createElement("img");
  img.alt = "";
  img.src = url;
  host.appendChild(img);
}

function dominantBannerColor(url) {
  if (voiceBannerColors.has(url)) return Promise.resolve(voiceBannerColors.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 24;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, size, size);
      let pixels;
      try {
        pixels = ctx.getImageData(0, 0, size, size).data;
      } catch (err) {
        resolve("");
        return;
      }
      const buckets = new Map();
      for (let i = 0; i < pixels.length; i += 16) {
        if (pixels[i + 3] < 128) continue;
        const key = ((pixels[i] >> 4) << 8) | ((pixels[i + 1] >> 4) << 4) | (pixels[i + 2] >> 4);
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
      let best = 0;
      let color = "";
      buckets.forEach((count, key) => {
        if (count <= best) return;
        best = count;
        const red = ((key >> 8) & 15) * 17;
        const green = ((key >> 4) & 15) * 17;
        const blue = (key & 15) * 17;
        color = "rgb(" + red + ", " + green + ", " + blue + ")";
      });
      if (color) voiceBannerColors.set(url, color);
      resolve(color);
    };
    img.onerror = () => resolve("");
    img.src = url;
  });
}

function paintVoiceTile(person) {
  const tile = document.createElement("div");
  tile.className = "voice-tile" + (person.speaking ? " is-speaking" : "");
  tile.dataset.userId = String(person.user_id);
  tile.style.background = person.banner_color || "var(--panel)";
  if (person.banner_url) {
    dominantBannerColor(person.banner_url).then((color) => {
      if (color && tile.isConnected) tile.style.background = color;
    });
  }
  const face = document.createElement("div");
  face.className = "voice-tile-face";
  mountVoiceFace(face, person, !!person.speaking, 96);
  tile.appendChild(face);
  return tile;
}

function paintVoiceStage() {
  const board = document.getElementById("voice-stage");
  if (!board || !voiceStageChannelId) return;
  const people = peopleInVoice(voiceStageChannelId);
  const sharer = people.find((person) => person.sharing) || null;
  board.replaceChildren();
  board.classList.toggle("is-streaming", !!sharer || !!voiceShareStream);
  const showing = sharer || (voiceShareStream ? people.find((person) => Number(person.user_id) === Number(myUserId)) : null);
  if (showing && typeof paintVoiceStream === "function") board.appendChild(paintVoiceStream(showing));
  const row = document.createElement("div");
  if (showing) row.className = "voice-stream-row";
  people.forEach((person) => {
    const tile = paintVoiceTile(person);
    if (showing) row.appendChild(tile);
    else board.appendChild(tile);
  });
  if (showing) board.appendChild(row);
}

function openVoiceStage(channel) {
  voiceStageChannelId = channel.id;
  const grid = document.getElementById("main-grid");
  if (grid) grid.classList.add("voice-stage-open");
  const users = document.getElementById("user-list");
  if (users) users.style.display = "none";
  const body = document.getElementById("channel-body");
  const composer = document.getElementById("channel-composer");
  const view = document.getElementById("voice-view");
  if (body) body.style.display = "none";
  if (composer) composer.style.display = "none";
  if (view) view.style.display = "flex";
  const pins = document.getElementById("channel-pins-btn");
  if (pins) pins.style.display = "none";
  paintVoiceStage();
}

function voiceMicId() {
  return localStorage.getItem("oneira-voice-mic") || "";
}

function voiceSpeakerId() {
  return localStorage.getItem("oneira-voice-speaker") || "";
}

function voicePercent(key, fallback) {
  const raw = localStorage.getItem(key);
  const n = Number(raw);
  if (raw == null || raw === "" || Number.isNaN(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function voiceMicVolume() {
  return voicePercent("oneira-voice-mic-volume", 100) / 100;
}

function voiceSpeakerVolume() {
  return voicePercent("oneira-voice-speaker-volume", 100) / 100;
}

function voiceProfile() {
  const value = localStorage.getItem("oneira-voice-profile") || "isolation";
  if (value === "studio" || value === "custom") return value;
  return "isolation";
}

function voiceProcess(key) {
  const profile = voiceProfile();
  if (profile === "isolation") return true;
  if (profile === "studio") return false;
  return localStorage.getItem(key) !== "0";
}

function voiceSensitivityAuto() {
  return (localStorage.getItem("oneira-voice-sensitivity-auto") || "1") !== "0";
}

function voiceSpeakThreshold() {
  if (voiceSensitivityAuto()) return 0.04;
  const slider = voicePercent("oneira-voice-sensitivity", 73);
  return 0.12 - (slider / 100) * 0.11;
}

function applyVoiceMicGain() {
  if (voiceGainNode) voiceGainNode.gain.value = voiceMicVolume();
  applyVoiceTestVolume();
}

function voiceOutgoingTrack() {
  if (voiceSendStream && voiceSendStream.getAudioTracks()[0]) return voiceSendStream.getAudioTracks()[0];
  return voiceLocalStream && voiceLocalStream.getAudioTracks()[0];
}

function fillVoiceDeviceSelect(select, devices, kind) {
  if (!select) return;
  const stored = kind === "audioinput" ? voiceMicId() : voiceSpeakerId();
  const current = select.value || stored;
  const fallback = kind === "audioinput" ? "Microphone" : "Speaker";
  select.replaceChildren();
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Default";
  select.appendChild(blank);
  devices.forEach((device, index) => {
    const row = document.createElement("option");
    row.value = device.deviceId;
    row.textContent = device.label || (fallback + " " + (index + 1));
    select.appendChild(row);
  });
  const values = Array.from(select.options).map((option) => option.value);
  select.value = values.includes(current) ? current : "";
}

async function refreshVoiceDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  const list = await navigator.mediaDevices.enumerateDevices();
  voiceInputDevices.splice(0, voiceInputDevices.length, ...list.filter((device) => device.kind === "audioinput"));
  voiceOutputDevices.splice(0, voiceOutputDevices.length, ...list.filter((device) => device.kind === "audiooutput"));
  fillVoiceDeviceSelect(document.getElementById("voice-mic-select"), voiceInputDevices, "audioinput");
  fillVoiceDeviceSelect(document.getElementById("voice-speaker-select"), voiceOutputDevices, "audiooutput");
}

function voiceCaptureConstraints(withDevice) {
  const audio = {
    echoCancellation: voiceProcess("oneira-voice-echo"),
    noiseSuppression: voiceProcess("oneira-voice-noise"),
    autoGainControl: voiceProcess("oneira-voice-auto-gain")
  };
  if (withDevice && voiceMicId()) audio.deviceId = { exact: voiceMicId() };
  return { audio: audio, video: false };
}

async function captureVoiceMic() {
  try {
    return await navigator.mediaDevices.getUserMedia(voiceCaptureConstraints(true));
  } catch (err) {
    if (!voiceMicId()) throw err;
    return navigator.mediaDevices.getUserMedia(voiceCaptureConstraints(false));
  }
}

function applyVoiceSendState() {
  const open = !voiceMuted && !voiceDeafened;
  [voiceLocalStream, voiceSendStream].forEach((stream) => {
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = open;
    });
  });
  if (!open && voiceSpeaking) {
    voiceSpeaking = false;
    sendVoiceSpeaking(false);
  }
}

function applyVoiceSink(audio) {
  const sink = voiceSpeakerId();
  if (!sink || typeof audio.setSinkId !== "function") return;
  audio.setSinkId(sink).catch(() => {});
}

function applyVoiceTestVolume() {
  if (!voiceMicTestAudio) return;
  const level = voiceMicTestStream ? voiceMicVolume() * voiceSpeakerVolume() : voiceSpeakerVolume();
  voiceMicTestAudio.volume = level;
  applyVoiceSink(voiceMicTestAudio);
}

function applyVoicePlayback() {
  voicePeers.forEach((peer) => {
    peer.audio.muted = voiceDeafened;
    peer.audio.volume = voiceSpeakerVolume();
    applyVoiceSink(peer.audio);
    if (!peer.shareAudio) return;
    peer.shareAudio.muted = voiceDeafened;
    peer.shareAudio.volume = voiceSpeakerVolume();
    applyVoiceSink(peer.shareAudio);
  });
  applyVoiceTestVolume();
}

function paintVoiceSignal(ms) {
  const node = document.getElementById("voice-user-signal");
  if (!node) return;
  node.classList.remove("is-good", "is-fair", "is-poor");
  if (ms == null || !voiceJoinedChannelId || !voicePeers.size) {
    node.title = "Connection strength";
    return;
  }
  const rounded = Math.max(1, Math.round(ms));
  node.title = rounded + " ms";
  if (rounded <= 150) node.classList.add("is-good");
  else if (rounded <= 300) node.classList.add("is-fair");
  else node.classList.add("is-poor");
}

function sendVoiceSignal(targetId, payload) {
  if (!ws || ws.readyState !== 1 || !voiceJoinedChannelId) return;
  ws.send(JSON.stringify({
    type: "voice_signal",
    target_user_id: targetId,
    channel_id: voiceJoinedChannelId,
    payload: payload
  }));
}

function sendVoiceSpeaking(speaking) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: "voice_speaking", speaking: !!speaking }));
}

function markVoiceSpeaking(userId, speaking) {
  const people = peopleInVoice(voiceJoinedChannelId);
  const person = people.find((row) => Number(row.user_id) === Number(userId));
  if (person) person.speaking = !!speaking;
  document.querySelectorAll(".voice-tile").forEach((tile) => {
    if (Number(tile.dataset.userId) !== Number(userId)) return;
    tile.classList.toggle("is-speaking", !!speaking);
    const face = tile.querySelector(".voice-tile-face");
    if (!face || !person || voiceFaceMime(person.avatar) !== "image/gif") return;
    face.replaceChildren();
    mountVoiceFace(face, person, !!speaking, 96);
  });
}

function applyVoiceSpeaking(data) {
  if (!data) return;
  markVoiceSpeaking(data.user_id, data.speaking);
}

async function loadVoiceIce() {
  try {
    const response = await fetch(`https://${serverAddress}/voice_ice`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    if (Array.isArray(data.iceServers) && data.iceServers.length) voiceIceServers = data.iceServers;
  } catch (err) {
    return;
  }
}

function closeVoicePeer(userId) {
  const peer = voicePeers.get(userId);
  if (!peer) return;
  peer.pc.onicecandidate = null;
  peer.pc.ontrack = null;
  peer.pc.onsignalingstatechange = null;
  peer.pc.close();
  peer.audio.srcObject = null;
  peer.audio.remove();
  if (peer.shareAudio) {
    peer.shareAudio.srcObject = null;
    peer.shareAudio.remove();
  }
  voicePeers.delete(userId);
  if (!voicePeers.size) paintVoiceSignal(null);
}

function stopVoiceLevel() {
  if (voiceLevelTimer) cancelAnimationFrame(voiceLevelTimer);
  voiceLevelTimer = 0;
  voiceGainNode = null;
  voiceSendStream = null;
  if (voiceAudioContext) {
    voiceAudioContext.close().catch(() => {});
    voiceAudioContext = null;
  }
}

function stopVoiceMicTest() {
  if (voiceMicTestAudio) {
    voiceMicTestAudio.pause();
    voiceMicTestAudio.srcObject = null;
    voiceMicTestAudio.remove();
    voiceMicTestAudio = null;
  }
  if (voiceMicTestStream) {
    voiceMicTestStream.getTracks().forEach((track) => track.stop());
    voiceMicTestStream = null;
  }
  const button = document.getElementById("voice-mic-test");
  if (button) button.textContent = "Mic Test";
}

async function toggleVoiceMicTest() {
  if (voiceMicTestAudio) {
    stopVoiceMicTest();
    return;
  }
  let stream = null;
  if (voiceSendStream && voiceSendStream.getAudioTracks().length) stream = voiceSendStream;
  else if (voiceLocalStream && voiceLocalStream.getAudioTracks().length) stream = voiceLocalStream;
  else {
    try {
      stream = await captureVoiceMic();
    } catch (err) {
      window.alert("Oneira can't use the microphone.");
      return;
    }
    voiceMicTestStream = stream;
  }
  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.srcObject = stream;
  document.body.appendChild(audio);
  voiceMicTestAudio = audio;
  applyVoiceTestVolume();
  audio.play().catch(() => {});
  const button = document.getElementById("voice-mic-test");
  if (button) button.textContent = "Stop Test";
}

function resetVoiceSettings() {
  [
    "oneira-voice-mic",
    "oneira-voice-speaker",
    "oneira-voice-mic-volume",
    "oneira-voice-speaker-volume",
    "oneira-voice-profile",
    "oneira-voice-echo",
    "oneira-voice-noise",
    "oneira-voice-auto-gain",
    "oneira-voice-sensitivity-auto",
    "oneira-voice-sensitivity"
  ].forEach((key) => localStorage.removeItem(key));
  stopVoiceMicTest();
  applyVoicePlayback();
  applyVoiceMicGain();
  if (voiceLocalStream && voiceLocalStream.getAudioTracks().length) retargetVoiceMic();
}

function stopVoiceMedia() {
  if (typeof stopVoiceShare === "function") stopVoiceShare(true);
  if (voiceStatsTimer) clearInterval(voiceStatsTimer);
  voiceStatsTimer = 0;
  Array.from(voicePeers.keys()).forEach((userId) => closeVoicePeer(userId));
  stopVoiceLevel();
  if (voiceSpeaking) sendVoiceSpeaking(false);
  voiceSpeaking = false;
  stopVoiceMicTest();
  if (voiceLocalStream) {
    voiceLocalStream.getTracks().forEach((track) => track.stop());
    voiceLocalStream = null;
  }
  paintVoiceSignal(null);
}

function watchVoiceLevel() {
  stopVoiceLevel();
  if (!voiceLocalStream) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  voiceAudioContext = new AudioCtx();
  voiceAudioContext.resume().catch(() => {});
  const source = voiceAudioContext.createMediaStreamSource(voiceLocalStream);
  voiceGainNode = voiceAudioContext.createGain();
  voiceGainNode.gain.value = voiceMicVolume();
  const dest = voiceAudioContext.createMediaStreamDestination();
  source.connect(voiceGainNode);
  voiceGainNode.connect(dest);
  voiceSendStream = dest.stream;
  const analyser = voiceAudioContext.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  const tick = () => {
    voiceLevelTimer = requestAnimationFrame(tick);
    if (!voiceLocalStream) return;
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const sample = (samples[i] - 128) / 128;
      sum += sample * sample;
    }
    const level = Math.sqrt(sum / samples.length);
    const open = !voiceMuted && !voiceDeafened;
    if (open && level > voiceSpeakThreshold()) voiceSpeakUntil = performance.now() + 450;
    if (!open) voiceSpeakUntil = 0;
    const audible = open && performance.now() < voiceSpeakUntil;
    if (audible === voiceSpeaking) return;
    voiceSpeaking = audible;
    markVoiceSpeaking(myUserId, audible);
    sendVoiceSpeaking(audible);
  };
  tick();
}

async function sampleVoiceStats() {
  let worst = null;
  const peers = Array.from(voicePeers.values());
  for (let i = 0; i < peers.length; i += 1) {
    try {
      const stats = await peers[i].pc.getStats();
      stats.forEach((report) => {
        if (report.type !== "candidate-pair" || report.state !== "succeeded" || report.currentRoundTripTime == null) return;
        const ms = report.currentRoundTripTime * 1000;
        if (worst == null || ms > worst) worst = ms;
      });
    } catch (err) {
      continue;
    }
  }
  paintVoiceSignal(worst);
}

function queueVoiceIce(peer, candidate) {
  if (!peer.pc.remoteDescription) {
    peer.iceQueue.push(candidate);
    return;
  }
  peer.pc.addIceCandidate(candidate).catch(() => {});
}

async function flushVoiceIce(peer) {
  const queued = peer.iceQueue.splice(0);
  for (let i = 0; i < queued.length; i += 1) {
    try {
      await peer.pc.addIceCandidate(queued[i]);
    } catch (err) {
      continue;
    }
  }
}

async function makeVoiceOffer(userId) {
  const peer = voicePeers.get(userId);
  if (!peer || peer.makingOffer) return;
  peer.makingOffer = true;
  try {
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    if (typeof voiceCapVideo === "function") voiceCapVideo(peer.pc);
    sendVoiceSignal(userId, { kind: "offer", sdp: peer.pc.localDescription });
  } catch (err) {
    return;
  } finally {
    peer.makingOffer = false;
  }
}

function openVoicePeer(userId, fromOffer) {
  const pc = new RTCPeerConnection({ iceServers: voiceIceServers });
  const localTrack = voiceOutgoingTrack();
  if (localTrack) pc.addTrack(localTrack, voiceSendStream || voiceLocalStream);
  else pc.addTransceiver("audio", { direction: "recvonly" });
  if (typeof voiceAttachShare === "function") voiceAttachShare(pc);
  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.dataset.voiceUser = String(userId);
  document.body.appendChild(audio);
  const shareAudio = document.createElement("audio");
  shareAudio.autoplay = true;
  shareAudio.dataset.voiceShare = String(userId);
  document.body.appendChild(shareAudio);
  const peer = { pc: pc, audio: audio, shareAudio: shareAudio, videoStream: null, makingOffer: false, iceQueue: [], shareOffer: false };
  pc.ontrack = (event) => {
    const track = event.track;
    if (track.kind === "video") {
      peer.videoStream = event.streams[0] || new MediaStream([track]);
      track.onended = () => {
        if (peer.videoStream) peer.videoStream = null;
        if (voiceStageChannelId) paintVoiceStage();
      };
      if (voiceStageChannelId) paintVoiceStage();
      return;
    }
    const element = peer.audio.srcObject ? peer.shareAudio : peer.audio;
    element.srcObject = event.streams[0] || new MediaStream([track]);
    element.muted = voiceDeafened;
    element.volume = voiceSpeakerVolume();
    applyVoiceSink(element);
    element.play().catch(() => {});
  };
  pc.onsignalingstatechange = () => {
    if (pc.signalingState !== "stable" || !peer.shareOffer) return;
    peer.shareOffer = false;
    makeVoiceOffer(userId);
  };
  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    sendVoiceSignal(userId, { kind: "ice", candidate: event.candidate.toJSON() });
  };
  voicePeers.set(userId, peer);
  if (!fromOffer && Number(myUserId) < Number(userId)) makeVoiceOffer(userId);
  else if (fromOffer && voiceShareStream) peer.shareOffer = true;
  return peer;
}

function voiceEachPeer(fn) {
  voicePeers.forEach(fn);
}

function voicePeer(userId) {
  return voicePeers.get(Number(userId));
}

async function receiveVoiceSignal(data) {
  if (!data || !voiceJoinedChannelId || Number(data.channel_id) !== Number(voiceJoinedChannelId)) return;
  const userId = Number(data.from_user_id);
  if (!userId || userId === Number(myUserId)) return;
  const payload = data.payload || {};
  if (!voiceLocalStream) await ensureVoiceMedia();
  const existing = voicePeers.get(userId);
  const peer = existing || openVoicePeer(userId, payload.kind === "offer");
  if (payload.kind === "offer" && payload.sdp) {
    const collision = peer.makingOffer || peer.pc.signalingState !== "stable";
    if (collision && Number(myUserId) < userId) return;
    try {
      await peer.pc.setRemoteDescription(payload.sdp);
      await flushVoiceIce(peer);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      sendVoiceSignal(userId, { kind: "answer", sdp: peer.pc.localDescription });
    } catch (err) {
      return;
    }
    return;
  }
  if (payload.kind === "answer" && payload.sdp) {
    try {
      await peer.pc.setRemoteDescription(payload.sdp);
      await flushVoiceIce(peer);
    } catch (err) {
      return;
    }
    return;
  }
  if (payload.kind === "ice" && payload.candidate) queueVoiceIce(peer, payload.candidate);
}

function connectVoicePeers() {
  if (!voiceJoinedChannelId || !voiceLocalStream) return;
  const ids = new Set();
  peopleInVoice(voiceJoinedChannelId).forEach((person) => {
    const userId = Number(person.user_id);
    if (!userId || userId === Number(myUserId)) return;
    ids.add(userId);
    if (!voicePeers.has(userId)) openVoicePeer(userId, false);
  });
  Array.from(voicePeers.keys()).forEach((userId) => {
    if (!ids.has(userId)) closeVoicePeer(userId);
  });
}

function ensureVoiceMedia() {
  if (!voiceJoinedChannelId) return Promise.resolve();
  if (voiceLocalStream) {
    connectVoicePeers();
    return Promise.resolve();
  }
  if (voiceMediaStarting) return voiceMediaStarting;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve();
  voiceMediaStarting = (async () => {
    try {
      await loadVoiceIce();
      if (!voiceJoinedChannelId) return;
      let stream = null;
      try {
        stream = await captureVoiceMic();
      } catch (err) {
        stream = new MediaStream();
        window.alert("Oneira can't use the microphone. You can still hear the channel.");
      }
      if (!voiceJoinedChannelId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      voiceLocalStream = stream;
      applyVoiceSendState();
      if (voiceLocalStream.getAudioTracks().length) watchVoiceLevel();
      if (voiceStatsTimer) clearInterval(voiceStatsTimer);
      voiceStatsTimer = setInterval(sampleVoiceStats, 2000);
      refreshVoiceDevices();
      connectVoicePeers();
    } finally {
      voiceMediaStarting = null;
    }
  })();
  return voiceMediaStarting;
}

async function retargetVoiceMic() {
  if (!voiceLocalStream) return;
  let next = null;
  try {
    next = await captureVoiceMic();
  } catch (err) {
    return;
  }
  const track = next.getAudioTracks()[0];
  if (!track) {
    next.getTracks().forEach((item) => item.stop());
    return;
  }
  voiceLocalStream.getTracks().forEach((item) => item.stop());
  voiceLocalStream = next;
  applyVoiceSendState();
  watchVoiceLevel();
  const outgoing = voiceOutgoingTrack();
  let missingSender = !outgoing;
  voicePeers.forEach((peer) => {
    const sender = peer.pc.getSenders().find((row) => row.track && row.track.kind === "audio");
    if (sender && outgoing) sender.replaceTrack(outgoing);
    else missingSender = true;
  });
  if (!missingSender) return;
  Array.from(voicePeers.keys()).forEach((userId) => closeVoicePeer(userId));
  connectVoicePeers();
}

function retargetVoiceSpeaker() {
  applyVoicePlayback();
}

function bindVoiceControls() {
  const leave = document.getElementById("voice-ctrl-leave");
  if (leave) leave.addEventListener("click", () => leaveVoiceChannel());
  const cardLeave = document.getElementById("voice-user-leave");
  if (cardLeave) cardLeave.addEventListener("click", () => leaveVoiceChannel());
  const more = document.getElementById("voice-ctrl-more");
  const menu = document.getElementById("voice-more");
  if (more && menu) {
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      menu.hidden = !menu.hidden;
    });
  }
  const settings = document.getElementById("voice-more-settings");
  if (settings) {
    settings.addEventListener("click", async () => {
      if (menu) menu.hidden = true;
      if (typeof openSettings === "function") await openSettings();
      if (typeof jumpToSettings === "function") jumpToSettings("voice-video");
    });
  }
  const footerSettings = document.getElementById("footer-settings");
  if (footerSettings) {
    footerSettings.addEventListener("click", () => {
      if (typeof openSettings === "function") openSettings();
    });
  }
  const footerMute = document.getElementById("footer-mute");
  const stageMute = document.getElementById("voice-ctrl-mute");
  const toggleMute = () => {
    voiceMuted = !voiceMuted;
    if (!voiceMuted) voiceDeafened = false;
    paintVoiceInputs();
  };
  if (footerMute) {
    footerMute.disabled = false;
    footerMute.addEventListener("click", toggleMute);
  }
  if (stageMute) {
    stageMute.disabled = false;
    stageMute.addEventListener("click", toggleMute);
  }
  const footerDeafen = document.getElementById("footer-deafen");
  if (footerDeafen) {
    footerDeafen.addEventListener("click", () => {
      voiceDeafened = !voiceDeafened;
      if (voiceDeafened) voiceMuted = true;
      paintVoiceInputs();
    });
  }
  const toggleCamera = () => {
    voiceCameraOn = !voiceCameraOn;
    paintVoiceInputs();
  };
  const cardCamera = document.getElementById("voice-user-camera");
  const stageCamera = document.getElementById("voice-ctrl-camera");
  if (cardCamera) cardCamera.addEventListener("click", toggleCamera);
  if (stageCamera) {
    stageCamera.disabled = false;
    stageCamera.addEventListener("click", toggleCamera);
  }
  const cardScreen = document.getElementById("voice-user-screen");
  const stageScreen = document.getElementById("voice-ctrl-screen");
  if (cardScreen) cardScreen.addEventListener("click", () => openVoiceShare());
  if (stageScreen) {
    stageScreen.disabled = false;
    stageScreen.addEventListener("click", () => openVoiceShare());
  }
  const shareOverlay = document.getElementById("voice-share-overlay");
  if (shareOverlay) {
    shareOverlay.addEventListener("click", (event) => {
      if (event.target !== shareOverlay) return;
      shareOverlay.hidden = true;
      if (typeof hideVoiceShare === "function") hideVoiceShare();
    });
  }
  document.addEventListener("click", (event) => {
    if (menu && !menu.hidden && !event.target.closest("#voice-more") && !event.target.closest("#voice-ctrl-more")) menu.hidden = true;
  });
  paintVoiceInputs();
}

bindVoiceControls();
