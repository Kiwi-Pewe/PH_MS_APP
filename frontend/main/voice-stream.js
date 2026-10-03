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
      params.encodings[0].maxFramerate = 30;
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

function voicePictureConstraints(deviceId) {
  const video = {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 30, max: 30 },
  };
  if (deviceId) video.deviceId = { exact: deviceId };
  return video;
}

async function fitVoicePicture(stream) {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  track.contentHint = "detail";
  try {
    await track.applyConstraints({
      width: { max: 1280 },
      height: { max: 720 },
      frameRate: { max: 30 },
    });
  } catch (err) {
    return;
  }
}

async function captureVoiceDisplay(surface) {
  const video = voicePictureConstraints();
  video.displaySurface = surface;
  const attempts = [
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

async function beginVoiceShare(kind, deviceId) {
  if (voiceShareStarting || voiceShareStream || !voiceJoinedChannelId) return;
  if (!navigator.mediaDevices) return;
  if (voiceShareTaken()) {
    window.alert("Someone is already sharing.");
    return;
  }
  const overlay = document.getElementById("voice-share-overlay");
  if (overlay) overlay.hidden = true;
  voiceShareStarting = true;
  try {
    let stream = null;
    if (kind === "device") {
      stream = await navigator.mediaDevices.getUserMedia({ video: voicePictureConstraints(deviceId), audio: false });
    } else {
      stream = await captureVoiceDisplay(kind === "monitor" ? "monitor" : "window");
    }
    await fitVoicePicture(stream);
    adoptVoiceShare(stream);
  } catch (err) {
    if (err && err.name !== "NotAllowedError") window.alert("Oneira can't share that.");
  } finally {
    voiceShareStarting = false;
  }
}

async function listVoiceCameras() {
  const host = document.getElementById("voice-share-devices");
  if (!host || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    beginVoiceShare("device");
    return;
  }
  let cameras = [];
  try {
    const found = await navigator.mediaDevices.enumerateDevices();
    cameras = found.filter((device) => device.kind === "videoinput" && device.label);
  } catch (err) {
    cameras = [];
  }
  if (cameras.length < 2) {
    beginVoiceShare("device", cameras[0] ? cameras[0].deviceId : "");
    return;
  }
  host.replaceChildren();
  cameras.forEach((device) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "voice-share-option";
    const title = document.createElement("span");
    title.textContent = device.label;
    button.appendChild(title);
    button.addEventListener("click", () => beginVoiceShare("device", device.deviceId));
    host.appendChild(button);
  });
  host.hidden = false;
}

function bindVoiceShare() {
  const windowShare = document.getElementById("voice-share-window");
  const screenShare = document.getElementById("voice-share-screen");
  const deviceShare = document.getElementById("voice-share-device");
  if (windowShare) windowShare.addEventListener("click", () => beginVoiceShare("window"));
  if (screenShare) screenShare.addEventListener("click", () => beginVoiceShare("monitor"));
  if (deviceShare) deviceShare.addEventListener("click", () => listVoiceCameras());
}

bindVoiceShare();
