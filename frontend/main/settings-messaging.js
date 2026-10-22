// ==================================================================
// settings-messaging.js - Messaging Permissions. Friend requests,
// Open / Request / Closed DMs, and the block list save and enforce.
// Hide blocked history is live on chat APIs. Content filters / spam /
// games stay parked.
// ==================================================================

function messagingSettingsUrl(path) {
  return `https://${serverAddress}${path}`;
}

async function loadMessagingSettings() {
  const response = await fetch(messagingSettingsUrl("/messaging_settings"), { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not load messaging settings.");
  return data;
}

async function postMessaging(path, body) {
  const response = await fetch(messagingSettingsUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((typeof data.detail === "string" && data.detail) || "Could not save.");
  return data;
}

function settingsSelect(options, selected, disabled) {
  const select = document.createElement("select");
  select.className = "settings-select";
  select.disabled = !!disabled;
  options.forEach(opt => {
    const row = document.createElement("option");
    row.value = opt.value;
    row.textContent = opt.label;
    if (opt.value === selected) row.selected = true;
    select.appendChild(row);
  });
  return select;
}

async function renderMessagingSettings(pane, jumpChildId) {
  pane.innerHTML = "";
  let info;
  try {
    info = await loadMessagingSettings();
  } catch (e) {
    const note = document.createElement("div");
    note.className = "placeholder-panel";
    note.textContent = e.message || "Could not load messaging settings.";
    pane.appendChild(note);
    return;
  }
  if (typeof setBlockedUserIds === "function") {
    setBlockedUserIds((info.blocked || []).map((row) => row.id));
  }

  const block = document.createElement("section");
  block.className = "settings-block has-sections";
  block.id = settingsTargetId("messaging-permissions");
  const title = document.createElement("h2");
  title.className = "settings-block-title";
  title.textContent = "Messaging Permissions";
  block.appendChild(title);

  const dms = document.createElement("div");
  dms.className = "settings-subblock";
  dms.id = settingsTargetId("direct-messages");
  const dmsTitle = document.createElement("h3");
  dmsTitle.className = "settings-subblock-title";
  dmsTitle.textContent = "Direct Message Permissions";
  dms.appendChild(dmsTitle);
  const dmsBlurb = document.createElement("p");
  dmsBlurb.className = "settings-blurb";
  dmsBlurb.textContent = "Friends can always DM you. These options only apply to people who are not on your friends list.";
  dms.appendChild(dmsBlurb);
  const accessList = document.createElement("div");
  accessList.className = "settings-radio-list";
  let dmAccess = info.dm_access === "open" || info.dm_access === "closed" ? info.dm_access : "request";
  function paintDmAccess() {
    accessList.replaceChildren();
    [
      ["open", "Open", "Allow anyone to send a DM directly to you."],
      ["request", "Request", "Anyone can send a message request to you."],
      ["closed", "Closed", "No one can send a message request to you."]
    ].forEach((row) => {
      accessList.appendChild(privacyRadio(row[0], dmAccess, row[1], row[2], async (value) => {
        const previous = dmAccess;
        dmAccess = value;
        paintDmAccess();
        try {
          await postMessaging("/messaging_dm_access", { value });
          info.dm_access = value;
        } catch (e) {
          dmAccess = previous;
          paintDmAccess();
        }
      }));
    });
  }
  paintDmAccess();
  dms.appendChild(accessList);
  block.appendChild(dms);

  const friends = document.createElement("div");
  friends.className = "settings-subblock";
  friends.id = settingsTargetId("friend-requests");
  const friendsTitle = document.createElement("h3");
  friendsTitle.className = "settings-subblock-title";
  friendsTitle.textContent = "Friend Request Permissions";
  friends.appendChild(friendsTitle);
  const friendsBlurb = document.createElement("p");
  friendsBlurb.className = "settings-blurb";
  friendsBlurb.textContent = "Control who can send you friend requests.";
  friends.appendChild(friendsBlurb);
  const friendPrefs = {
    everyone: !!info.friend_req_everyone,
    friends_of_friends: !!info.friend_req_friends_of_friends,
    server_members: !!info.friend_req_server_members
  };
  async function saveFriendPrefs() {
    await postMessaging("/messaging_friend_requests", friendPrefs);
  }
  const everyoneToggle = settingsToggle(friendPrefs.everyone, false, async (on) => {
    const previous = friendPrefs.everyone;
    friendPrefs.everyone = on;
    try { await saveFriendPrefs(); } catch (e) {
      friendPrefs.everyone = previous;
      everyoneToggle.querySelector("input").checked = previous;
    }
  });
  friends.appendChild(settingsOpt("Everyone", "", everyoneToggle));
  const fofToggle = settingsToggle(friendPrefs.friends_of_friends, false, async (on) => {
    const previous = friendPrefs.friends_of_friends;
    friendPrefs.friends_of_friends = on;
    try { await saveFriendPrefs(); } catch (e) {
      friendPrefs.friends_of_friends = previous;
      fofToggle.querySelector("input").checked = previous;
    }
  });
  friends.appendChild(settingsOpt("Friend of friends", "", fofToggle));
  const serverToggle = settingsToggle(friendPrefs.server_members, false, async (on) => {
    const previous = friendPrefs.server_members;
    friendPrefs.server_members = on;
    try { await saveFriendPrefs(); } catch (e) {
      friendPrefs.server_members = previous;
      serverToggle.querySelector("input").checked = previous;
    }
  });
  friends.appendChild(settingsOpt(
    "Server members",
    "Server members can only send you friend requests from servers where you also allow Direct Messages.",
    serverToggle
  ));
  block.appendChild(friends);

  pane.appendChild(block);
  if (jumpChildId) {
    const target = document.getElementById(settingsTargetId(jumpChildId));
    if (target) pane.scrollTop = Math.max(0, target.offsetTop - 24);
    else pane.scrollTop = 0;
  } else {
    pane.scrollTop = 0;
  }
}
