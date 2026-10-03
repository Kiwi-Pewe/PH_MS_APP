let voiceShareStarting = false;

function voiceAttachShare(pc) {
  if (!voiceShareStream) return;
  voiceShareStream.getTracks().forEach((track) => {
    if (pc.getSenders().some((sender) => sender.track === track)) return;
    pc.addTrack(track, voiceShareStream);
  });
}

function voiceCapVideo(pc) {
  pc.getSenders().forEach((sender) => {
    if (!sender.track || sender.track.kind !== "video") return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = 1500000;
      params.encodings[0].maxFramerate = voiceShareFps();
      sender.setParameters(params).catch(() => {});
    } catch (err) {
      return;
    }
  });
}

function voicePushShare() {
  voiceEachPeer((peer, userId) => {
    voiceAttachShare(peer.pc);
    voiceCapVideo(peer.pc);
    if (peer.pc.signalingState === "stable") makeVoiceOffer(userId);
    else peer.shareOffer = true;
  });
}

function voicePullShare(stream) {
  const tracks = stream ? stream.getTracks() : [];
  voiceEachPeer((peer, userId) => {
    peer.pc.getSenders().forEach((sender) => {
      if (sender.track && tracks.indexOf(sender.track) !== -1) peer.pc.removeTrack(sender);
    });
    peer.videoStream = null;
    if (peer.shareAudio) peer.shareAudio.srcObject = null;
    if (peer.pc.signalingState === "stable") makeVoiceOffer(userId);
    else peer.shareOffer = true;
  });
}

function paintVoiceStream(person) {
  const frame = document.createElement("div");
  frame.className = "voice-stream";
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  let stream = null;
  if (Number(person.user_id) === Number(myUserId)) stream = voiceShareStream;
  else {
    const peer = voicePeer(person.user_id);
    stream = peer && peer.videoStream;
  }
  if (stream) {
    video.srcObject = stream;
    video.play().catch(() => {});
  }
  frame.appendChild(video);
  const label = document.createElement("div");
  label.className = "voice-stream-label";
  label.textContent = (person.username || "Someone") + " is sharing";
  frame.appendChild(label);
  return frame;
}

let voiceShareTab = "window";
let voiceSharePaint = 0;
const voiceSharePreviews = [];

function voiceShareMode() {
  return localStorage.getItem("oneira-voice-stream-mode") === "text" ? "text" : "gaming";
}

function voiceShareFps() {
  return voiceShareMode() === "text" ? 5 : 30;
}

function voiceShareMuted() {
  return localStorage.getItem("oneira-voice-stream-mute") === "1";
}

function voiceShareHidden() {
  return localStorage.getItem("oneira-voice-stream-hide") === "1";
}

function voicePictureConstraints(deviceId) {
  const fps = voiceShareFps();
  const video = {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: fps, max: fps },
  };
  if (deviceId) video.deviceId = { exact: deviceId };
  return video;
}

async function fitVoicePicture(stream) {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  track.contentHint = voiceShareMode() === "text" ? "detail" : "motion";
  try {
    await track.applyConstraints({
      width: { max: 1280 },
      height: { max: 720 },
      frameRate: { max: voiceShareFps() },
    });
  } catch (err) {
    return;
  }
}

async function captureVoiceDisplay(surface) {
  const video = voicePictureConstraints();
  video.displaySurface = surface;
  const attempts = voiceShareMuted()
    ? [{ video: video }]
    : [
      { video: video, audio: true, systemAudio: "include" },
      { video: video, audio: true },
      { video: video },
    ];
  let last = null;
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      return await navigator.mediaDevices.getDisplayMedia(attempts[i]);
    } catch (err) {
      last = err;
      if (err && err.name === "NotAllowedError") throw err;
    }
  }
  throw last;
}

function voiceShareTaken() {
  return peopleInVoice(voiceJoinedChannelId).some((person) => person.sharing && Number(person.user_id) !== Number(myUserId));
}

function sendVoiceShare(sharing) {
  if (!ws || ws.readyState !== 1 || !voiceJoinedChannelId) return;
  ws.send(JSON.stringify({ type: "voice_stream", sharing: !!sharing }));
}

function stopVoiceShare(leaving) {
  const stream = voiceShareStream;
  if (!stream) return;
  voiceShareStream = null;
  if (!leaving) voicePullShare(stream);
  stream.getTracks().forEach((track) => {
    track.onended = null;
    track.stop();
  });
  sendVoiceShare(false);
  paintVoiceInputs();
  if (voiceStageChannelId) paintVoiceStage();
  paintVoiceRails();
}

function adoptVoiceShare(stream) {
  if (!voiceJoinedChannelId) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  voiceShareStream = stream;
  stream.getTracks().forEach((track) => {
    track.onended = () => {
      if (voiceShareStream === stream) stopVoiceShare();
    };
  });
  sendVoiceShare(true);
  voicePushShare();
  paintVoiceInputs();
  if (voiceStageChannelId) paintVoiceStage();
  paintVoiceRails();
}

function applyVoiceStream(data) {
  if (!data || data.ok !== false) return;
  stopVoiceShare();
  window.alert(data.detail || "Someone is already sharing.");
}

function stopSharePreviews(keep) {
  voiceSharePreviews.forEach((stream) => {
    if (stream === keep) return;
    stream.getTracks().forEach((track) => track.stop());
  });
  voiceSharePreviews.length = 0;
  if (keep) voiceSharePreviews.push(keep);
}

function shareGlyph(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  if (kind === "monitor") {
    svg.innerHTML = '<rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  } else if (kind === "device") {
    svg.innerHTML = '<rect x="2" y="7" width="13" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 10.5l6-3v9l-6-3z" fill="currentColor"/>';
  } else {
    svg.innerHTML = '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9h18" stroke="currentColor" stroke-width="2"/>';
  }
  return svg;
}

function shareSourceTile(name, kind, deviceId, stream) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "voice-share-tile";
  const frame = document.createElement("span");
  frame.className = "voice-share-preview";
  if (stream && !voiceShareHidden()) {
    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.play().catch(() => {});
    frame.appendChild(video);
  }
  const caption = document.createElement("span");
  caption.className = "voice-share-caption";
  caption.appendChild(shareGlyph(kind));
  const label = document.createElement("span");
  label.textContent = name;
  caption.appendChild(label);
  button.appendChild(frame);
  button.appendChild(caption);
  button.addEventListener("click", () => beginVoiceShare(kind, deviceId, stream));
  return button;
}

async function beginVoiceShare(kind, deviceId, existing) {
  if (voiceShareStarting || voiceShareStream || !voiceJoinedChannelId) return;
  if (!navigator.mediaDevices) return;
  if (voiceShareTaken()) {
    window.alert("Someone is already sharing.");
    return;
  }
  const overlay = document.getElementById("voice-share-overlay");
  const menu = document.getElementById("voice-share-menu");
  if (menu) menu.hidden = true;
  if (overlay) overlay.hidden = true;
  voiceSharePaint += 1;
  stopSharePreviews(existing || null);
  voiceShareStarting = true;
  try {
    let stream = existing || null;
    if (stream) {
      const kept = voiceSharePreviews.indexOf(stream);
      if (kept !== -1) voiceSharePreviews.splice(kept, 1);
    } else if (kind === "device") {
      stream = await navigator.mediaDevices.getUserMedia({ video: voicePictureConstraints(deviceId), audio: false });
    } else {
      stream = await captureVoiceDisplay(kind === "monitor" ? "monitor" : "window");
    }
    if (voiceShareMuted()) {
      stream.getAudioTracks().forEach((track) => {
        track.stop();
        stream.removeTrack(track);
      });
    }
    await fitVoicePicture(stream);
    adoptVoiceShare(stream);
  } catch (err) {
    if (existing) existing.getTracks().forEach((track) => track.stop());
    if (err && err.name !== "NotAllowedError") window.alert("Oneira can't share that.");
  } finally {
    voiceShareStarting = false;
  }
}

function paintShareReadout() {
  const mode = document.getElementById("voice-share-mode");
  const hint = document.getElementById("voice-share-hint");
  const res = document.getElementById("voice-share-res");
  const fps = document.getElementById("voice-share-fps");
  const text = voiceShareMode() === "text";
  if (mode) mode.textContent = text ? "Screen Share" : "Gaming";
  if (hint) hint.textContent = text ? "Clearer text" : "Smoother video";
  if (res) res.textContent = text ? "Source" : "720p";
  if (fps) fps.textContent = text ? "5fps" : "30fps";
  document.querySelectorAll("#voice-share-menu [data-share-mode]").forEach((button) => {
    button.classList.toggle("is-on", button.dataset.shareMode === (text ? "text" : "gaming"));
  });
  const mute = document.querySelector("#voice-share-menu [data-share-flag='mute']");
  const hide = document.querySelector("#voice-share-menu [data-share-flag='hide']");
  if (mute) mute.classList.toggle("is-on", voiceShareMuted());
  if (hide) hide.classList.toggle("is-on", voiceShareHidden());
}

async function paintShareGrid() {
  const grid = document.getElementById("voice-share-grid");
  if (!grid) return;
  const ticket = ++voiceSharePaint;
  stopSharePreviews();
  grid.replaceChildren();
  if (voiceShareTab !== "device") {
    const card = document.getElementById("voice-share-card");
    if (card) card.classList.add("is-sources");
    return;
  }
  const card = document.getElementById("voice-share-card");
  if (card) card.classList.remove("is-sources");
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    grid.appendChild(shareSourceTile("Camera", "device", "", null));
    return;
  }
  let cameras = [];
  try {
    if (!voiceShareHidden()) {
      const warm = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (ticket !== voiceSharePaint) {
        warm.getTracks().forEach((track) => track.stop());
        return;
      }
      warm.getTracks().forEach((track) => track.stop());
    }
    const found = await navigator.mediaDevices.enumerateDevices();
    cameras = found.filter((device) => device.kind === "videoinput");
  } catch (err) {
    cameras = [];
  }
  if (ticket !== voiceSharePaint) return;
  if (!cameras.length) {
    grid.appendChild(shareSourceTile("Camera", "device", "", null));
    return;
  }
  for (let i = 0; i < cameras.length; i += 1) {
    const device = cameras[i];
    let preview = null;
    if (!voiceShareHidden() && device.deviceId) {
      try {
        preview = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: device.deviceId } },
          audio: false,
        });
      } catch (err) {
        preview = null;
      }
    }
    if (ticket !== voiceSharePaint) {
      if (preview) preview.getTracks().forEach((track) => track.stop());
      return;
    }
    if (preview) voiceSharePreviews.push(preview);
    grid.appendChild(shareSourceTile(device.label || "Camera", "device", device.deviceId, preview));
  }
}

function showVoiceShare() {
  voiceShareTab = "window";
  document.querySelectorAll(".voice-share-tab").forEach((tab) => {
    tab.classList.toggle("is-on", tab.dataset.shareTab === "window");
  });
  const menu = document.getElementById("voice-share-menu");
  if (menu) menu.hidden = true;
  paintShareReadout();
  paintShareGrid();
}

function hideVoiceShare() {
  voiceSharePaint += 1;
  stopSharePreviews();
  const menu = document.getElementById("voice-share-menu");
  if (menu) menu.hidden = true;
}

function bindVoiceShare() {
  document.querySelectorAll(".voice-share-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      voiceShareTab = tab.dataset.shareTab || "window";
      document.querySelectorAll(".voice-share-tab").forEach((button) => {
        button.classList.toggle("is-on", button === tab);
      });
      if (voiceShareTab === "device") paintShareGrid();
      else beginVoiceShare(voiceShareTab === "monitor" ? "monitor" : "window");
    });
  });
  const cog = document.getElementById("voice-share-cog");
  const menu = document.getElementById("voice-share-menu");
  if (cog && menu) {
    cog.addEventListener("click", (event) => {
      event.stopPropagation();
      menu.hidden = !menu.hidden;
    });
  }
  document.querySelectorAll("#voice-share-menu [data-share-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.setItem("oneira-voice-stream-mode", button.dataset.shareMode === "text" ? "text" : "gaming");
      paintShareReadout();
      if (menu) menu.hidden = true;
    });
  });
  document.querySelectorAll("#voice-share-menu [data-share-flag]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.shareFlag === "hide" ? "oneira-voice-stream-hide" : "oneira-voice-stream-mute";
      localStorage.setItem(key, localStorage.getItem(key) === "1" ? "0" : "1");
      paintShareReadout();
      if (button.dataset.shareFlag === "hide") paintShareGrid();
    });
  });
  document.addEventListener("keydown", (event) => {
    const overlay = document.getElementById("voice-share-overlay");
    if (!overlay || overlay.hidden || event.key !== "Escape") return;
    overlay.hidden = true;
    hideVoiceShare();
  });
  document.addEventListener("click", (event) => {
    if (!menu || menu.hidden) return;
    if (event.target.closest("#voice-share-menu") || event.target.closest("#voice-share-cog")) return;
    menu.hidden = true;
  });
}

bindVoiceShare();
