function communityRoomReady(row) {
  const room = Object.assign({}, row || {});
  room.lines = room.lines || [];
  room.topics = room.topics || [];
  return room;
}

function communityRoomErrorText(data, fallback) {
  if (typeof communityErrorText === "function") return communityErrorText(data, fallback);
  const detail = data && data.detail;
  if (typeof detail === "string" && detail) return detail;
  return fallback;
}

async function loadCommunityRooms() {
  let response;
  try {
    response = await fetch(`https://${serverAddress}/community_rooms`, { credentials: "include" });
  } catch (e) {
    return;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return;
  communityRooms = (data.rooms || []).map(communityRoomReady);
  if (typeof paintCommunityRooms === "function") paintCommunityRooms();
  if (typeof paintCommunityRoomNav === "function") paintCommunityRoomNav();
}

async function saveCommunityRoom() {
  const input = document.getElementById("community-room-name");
  const submit = document.getElementById("community-room-submit");
  const status = document.getElementById("community-room-status");
  const name = input ? String(input.value || "").trim() : "";
  if (!name) return;
  if (submit) submit.disabled = true;
  if (status) status.hidden = true;
  try {
    const response = await fetch(`https://${serverAddress}/community_rooms`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.slice(0, 80),
        topics: (typeof communityRoomTopics !== "undefined" ? communityRoomTopics : []).slice(0, 3)
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(communityRoomErrorText(data, "Could not create that room."));
    const room = communityRoomReady(data);
    room.joined = true;
    room.owned = true;
    const index = communityRooms.findIndex((row) => String(row.id) === String(room.id));
    if (index >= 0) communityRooms[index] = room;
    else communityRooms.unshift(room);
    if (typeof openCommunityRoomChat === "function") openCommunityRoomChat(room.id);
    else {
      if (typeof closeCommunityRoomCompose === "function") closeCommunityRoomCompose();
      if (typeof paintCommunityRooms === "function") paintCommunityRooms();
      if (typeof paintCommunityRoomNav === "function") paintCommunityRoomNav();
    }
  } catch (e) {
    if (status) {
      status.hidden = false;
      status.textContent = e.message || "Could not create that room.";
    }
    if (typeof syncCommunityRoomCompose === "function") syncCommunityRoomCompose();
  }
}
