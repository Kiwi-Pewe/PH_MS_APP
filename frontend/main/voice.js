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
let voiceNoiseOn = true;
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
  return true;
}

async function leaveVoiceChannel() {
  const stageWasOpen = voiceStageChannelId != null;
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

function paintVoiceDock() {
  const card = document.getElementById("voice-user-card");
  if (!card) return;
  if (!voiceJoinedChannelId) {
    card.hidden = true;
    const noise = document.getElementById("voice-noise-menu");
    if (noise) noise.hidden = true;
    const share = document.getElementById("voice-share-overlay");
    if (share) share.hidden = true;
    return;
  }
  card.hidden = false;
  const where = document.getElementById("voice-user-where");
  if (where) where.textContent = voiceJoinedChannelName + " / " + voiceJoinedServerName;
  paintVoiceInputs();
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
  const noiseInput = document.getElementById("voice-noise-input");
  if (noiseInput) noiseInput.checked = voiceNoiseOn;
}

function openVoiceShare() {
  const share = document.getElementById("voice-share-overlay");
  if (share) share.hidden = false;
  const noise = document.getElementById("voice-noise-menu");
  if (noise) noise.hidden = true;
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
  board.replaceChildren();
  peopleInVoice(voiceStageChannelId).forEach((person) => {
    board.appendChild(paintVoiceTile(person));
  });
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
  const shareClose = document.getElementById("voice-share-close");
  const shareOverlay = document.getElementById("voice-share-overlay");
  if (shareClose && shareOverlay) shareClose.addEventListener("click", () => { shareOverlay.hidden = true; });
  if (shareOverlay) {
    shareOverlay.addEventListener("click", (event) => {
      if (event.target === shareOverlay) shareOverlay.hidden = true;
    });
  }
  const noiseBtn = document.getElementById("voice-user-noise");
  const noiseMenu = document.getElementById("voice-noise-menu");
  if (noiseBtn && noiseMenu) {
    noiseBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      noiseMenu.hidden = !noiseMenu.hidden;
    });
  }
  const noiseInput = document.getElementById("voice-noise-input");
  if (noiseInput) {
    noiseInput.addEventListener("change", () => {
      voiceNoiseOn = noiseInput.checked;
    });
  }
  document.addEventListener("click", (event) => {
    if (menu && !menu.hidden && !event.target.closest("#voice-more") && !event.target.closest("#voice-ctrl-more")) menu.hidden = true;
    if (noiseMenu && !noiseMenu.hidden && !event.target.closest("#voice-noise-menu") && !event.target.closest("#voice-user-noise")) noiseMenu.hidden = true;
  });
  paintVoiceInputs();
}

bindVoiceControls();
