// ==================================================================
// settings-messaging.js - Messaging Permissions. Friend requests,
// server-member DMs, and the block list save and enforce. Content
// filters, spam, message requests, connected games, and Ignore wait.
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

function filterScopeRow(label, selected) {
  const row = document.createElement("div");
  row.className = "settings-filter-row";
  const name = document.createElement("div");
  name.className = "settings-opt-title";
  name.textContent = label;
  row.appendChild(name);
  row.appendChild(settingsSelect(
    [{ value: "show", label: "Show" }, { value: "blur", label: "Blur" }, { value: "block", label: "Block" }],
    selected,
    true
  ));
  return row;
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

  const block = document.createElement("section");
  block.className = "settings-block";
  block.id = settingsTargetId("messaging-permissions");
  const title = document.createElement("h2");
  title.className = "settings-block-title";
  title.textContent = "Messaging Permissions";
  block.appendChild(title);

  const filters = document.createElement("div");
  filters.className = "settings-subblock";
  filters.id = settingsTargetId("content-filters");
  const filtersTitle = document.createElement("h3");
  filtersTitle.className = "settings-subblock-title";
  filtersTitle.textContent = "Content Filters";
  filters.appendChild(filtersTitle);
  const filtersBlurb = document.createElement("p");
  filtersBlurb.className = "settings-blurb";
  filtersBlurb.textContent = "Choose how you want to see image-based media. Oneira does not scan images yet. Later, a poster can censor their own media, and a server can auto-censor every image that enters a channel.";
  filters.appendChild(filtersBlurb);
  filters.appendChild(settingsNote("This feature isn't built yet.", "later"));
  const filterGrid = document.createElement("div");
  filterGrid.className = "settings-filter-grid";
  const catRail = document.createElement("div");
  catRail.className = "settings-filter-cats";
  const matureBtn = document.createElement("button");
  matureBtn.type = "button";
  matureBtn.className = "settings-filter-cat is-on";
  matureBtn.textContent = "Mature Sexual Media";
  const graphicBtn = document.createElement("button");
  graphicBtn.type = "button";
  graphicBtn.className = "settings-filter-cat";
  graphicBtn.textContent = "Graphic Media";
  catRail.appendChild(matureBtn);
  catRail.appendChild(graphicBtn);
  const filterMain = document.createElement("div");
  filterMain.className = "settings-filter-main";
  const help = document.createElement("div");
  help.className = "settings-opt-desc";
  help.textContent = "Helps detect image-based media that may contain sexually explicit or suggestive material.";
  function showFilterCat(kind) {
    matureBtn.classList.toggle("is-on", kind === "mature");
    graphicBtn.classList.toggle("is-on", kind === "graphic");
    help.textContent = kind === "graphic"
      ? "Helps detect image-based media that may contain violence or gore."
      : "Helps detect image-based media that may contain sexually explicit or suggestive material.";
  }
  matureBtn.addEventListener("click", () => showFilterCat("mature"));
  graphicBtn.addEventListener("click", () => showFilterCat("graphic"));
  filterMain.appendChild(filterScopeRow("Direct messages from friends", "show"));
  filterMain.appendChild(filterScopeRow("Direct messages from others", "block"));
  filterMain.appendChild(filterScopeRow("Messages in server channels", "show"));
  filterMain.appendChild(help);
  filterGrid.appendChild(catRail);
  filterGrid.appendChild(filterMain);
  filters.appendChild(filterGrid);
  filters.appendChild(settingsOpt(
    "Allow access to age-restricted commands from apps in DMs",
    "Allows people 18+ to access commands marked as age-restricted in DMs. Applies to all apps.",
    settingsToggle(true, true),
    settingsNote("This feature isn't built yet.", "later")
  ));
  filters.appendChild(settingsOpt(
    "Allow access to age-restricted servers on iOS",
    "Access age-restricted servers (18+) on iOS devices, after joining them on desktop.",
    settingsToggle(true, true),
    settingsNote("This feature isn't built yet. Oneira does not have an iOS app yet.", "later")
  ));
  const relatedFilters = document.createElement("div");
  relatedFilters.className = "settings-related-wrap";
  const relatedFiltersLabel = document.createElement("h3");
  relatedFiltersLabel.className = "settings-subblock-title";
  relatedFiltersLabel.textContent = "Related Settings";
  relatedFilters.appendChild(relatedFiltersLabel);
  relatedFilters.appendChild(settingsRelatedCard("Appearance", "Show/hide media in chat, spoiler content", "appearance"));
  filters.appendChild(relatedFilters);
  block.appendChild(filters);

  const spam = document.createElement("div");
  spam.className = "settings-subblock";
  spam.id = settingsTargetId("spam-filters");
  const spamTitle = document.createElement("h3");
  spamTitle.className = "settings-subblock-title";
  spamTitle.textContent = "Spam Filters";
  spam.appendChild(spamTitle);
  const spamBlurb = document.createElement("p");
  spamBlurb.className = "settings-blurb";
  spamBlurb.textContent = "Automatically filter suspected spam messages. Filtered messages would go to a Spam inbox.";
  spam.appendChild(spamBlurb);
  const spamList = document.createElement("div");
  spamList.className = "settings-radio-list is-disabled";
  [
    ["all", "Filter all spam"],
    ["nonfriends", "Filter messages from non-friends (Recommended)"],
    ["off", "Don't filter spam"]
  ].forEach(row => {
    const radio = privacyRadio(row[0], "nonfriends", row[1], "", () => {});
    radio.disabled = true;
    spamList.appendChild(radio);
  });
  spam.appendChild(spamList);
  spam.appendChild(settingsNote("This feature isn't built yet.", "later"));
  block.appendChild(spam);

  const dms = document.createElement("div");
  dms.className = "settings-subblock";
  dms.id = settingsTargetId("direct-messages");
  const dmsTitle = document.createElement("h3");
  dmsTitle.className = "settings-subblock-title";
  dmsTitle.textContent = "Direct Message (DM) Permissions";
  dms.appendChild(dmsTitle);
  const dmsBlurb = document.createElement("p");
  dmsBlurb.className = "settings-blurb";
  dmsBlurb.textContent = "Friends can always DM you. This toggle allows people who share a server with you to DM you even if you are not friends. All servers sets your default; pick a server to override it.";
  dms.appendChild(dmsBlurb);
  const serverSelect = settingsSelect(
    [{ value: "all", label: "All servers" }].concat((info.servers || []).map(server => ({ value: server.id, label: server.name }))),
    "all",
    false
  );
  dms.appendChild(serverSelect);
  let dmServerId = "all";
  function currentAllow() {
    if (dmServerId === "all") return !!info.allow_server_dms;
    const server = (info.servers || []).find(row => row.id === dmServerId);
    return server ? !!server.allow_dms : !!info.allow_server_dms;
  }
  const dmToggleHost = document.createElement("div");
  function paintDmToggle() {
    dmToggleHost.innerHTML = "";
    dmToggleHost.appendChild(settingsOpt(
      "Direct Messages",
      "Allow DMs from other server members",
      settingsToggle(currentAllow(), false, async (on) => {
        try {
          await postMessaging("/messaging_server_dms", { server_id: dmServerId === "all" ? null : dmServerId, allow: on });
          if (dmServerId === "all") info.allow_server_dms = on;
          else {
            const server = (info.servers || []).find(row => row.id === dmServerId);
            if (server) {
              server.allow_dms = on;
              server.overridden = true;
            }
          }
        } catch (e) {
          paintDmToggle();
        }
      })
    ));
  }
  serverSelect.addEventListener("change", () => {
    dmServerId = serverSelect.value;
    paintDmToggle();
  });
  paintDmToggle();
  dms.appendChild(dmToggleHost);
  dms.appendChild(settingsOpt(
    "Message requests",
    "Filter messages from server members you may not know.",
    settingsToggle(true, true),
    settingsNote("This feature isn't built yet.", "later")
  ));
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
  friends.appendChild(settingsOpt(
    "Show personalized messages",
    "Show personalized messages on incoming friend requests. If you accept, the message will still appear in your DMs.",
    settingsToggle(true, true),
    settingsNote("This feature isn't built yet.", "later")
  ));
  block.appendChild(friends);

  const games = document.createElement("div");
  games.className = "settings-subblock";
  games.id = settingsTargetId("connected-games");
  const gamesTitle = document.createElement("h3");
  gamesTitle.className = "settings-subblock-title";
  gamesTitle.textContent = "Messaging in Connected Games";
  games.appendChild(gamesTitle);
  const gamesBlurb = document.createElement("p");
  gamesBlurb.className = "settings-blurb";
  gamesBlurb.textContent = "These are settings for games that use Oneira to power their social features — including titles you link later, not only a game Oneira makes.";
  games.appendChild(gamesBlurb);
  const empty = document.createElement("div");
  empty.className = "settings-empty-card";
  const emptyTitle = document.createElement("div");
  emptyTitle.className = "settings-opt-title";
  emptyTitle.textContent = "No games connected";
  const emptyBody = document.createElement("div");
  emptyBody.className = "settings-opt-desc";
  emptyBody.textContent = "Want to connect a game to your account?";
  empty.appendChild(emptyTitle);
  empty.appendChild(emptyBody);
  games.appendChild(empty);
  games.appendChild(settingsNote("This feature isn't built yet.", "later"));
  const relatedGames = document.createElement("div");
  relatedGames.className = "settings-related-wrap";
  const relatedGamesLabel = document.createElement("h3");
  relatedGamesLabel.className = "settings-subblock-title";
  relatedGamesLabel.textContent = "Related Settings";
  relatedGames.appendChild(relatedGamesLabel);
  relatedGames.appendChild(settingsRelatedCard("Connected Apps", "Manage your games in Connected Apps", "connected-apps"));
  games.appendChild(relatedGames);
  block.appendChild(games);

  const blocks = document.createElement("div");
  blocks.className = "settings-subblock";
  blocks.id = settingsTargetId("ignore-block");
  const blocksTitle = document.createElement("h3");
  blocksTitle.className = "settings-subblock-title";
  blocksTitle.textContent = "Ignore & Block";
  blocks.appendChild(blocksTitle);
  const blocksBlurb = document.createElement("p");
  blocksBlurb.className = "settings-blurb";
  blocksBlurb.textContent = "Blocked accounts cannot DM you, friend you, or see you as a friend. Ignore (hide messages without blocking) isn't built yet.";
  blocks.appendChild(blocksBlurb);
  const count = document.createElement("div");
  count.className = "settings-empty-card is-left";
  const blocked = info.blocked || [];
  const countTitle = document.createElement("div");
  countTitle.className = "settings-opt-title";
  countTitle.textContent = "Blocked accounts";
  const countBody = document.createElement("div");
  countBody.className = "settings-opt-desc";
  countBody.textContent = blocked.length === 1 ? "1 account" : blocked.length + " accounts";
  count.appendChild(countTitle);
  count.appendChild(countBody);
  blocks.appendChild(count);
  if (!blocked.length) {
    blocks.appendChild(settingsNote("You haven't blocked anyone."));
  }
  blocked.forEach(person => {
    const row = document.createElement("div");
    row.className = "settings-block-row";
    const who = document.createElement("div");
    who.className = "settings-block-who";
    const letter = document.createElement("div");
    letter.className = "avatar-dot";
    letter.textContent = typeof avatarLetter === "function" ? avatarLetter(person.display_name || person.username) : (person.username || "?").slice(0, 1);
    const names = document.createElement("div");
    const display = document.createElement("div");
    display.className = "settings-opt-title";
    display.textContent = person.display_name || person.username;
    const handle = document.createElement("div");
    handle.className = "settings-opt-desc";
    handle.textContent = person.username;
    names.appendChild(display);
    if (person.display_name && person.display_name !== person.username) names.appendChild(handle);
    who.appendChild(letter);
    who.appendChild(names);
    const unblock = document.createElement("button");
    unblock.type = "button";
    unblock.className = "settings-row-btn";
    unblock.textContent = "Unblock";
    unblock.addEventListener("click", async () => {
      unblock.disabled = true;
      try {
        const response = await fetch(messagingSettingsUrl("/unblock"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ blocked_user: person.id })
        });
        if (!response.ok) throw new Error("Could not unblock.");
        row.remove();
        info.blocked = (info.blocked || []).filter(entry => entry.id !== person.id);
        const left = info.blocked.length;
        countBody.textContent = left === 1 ? "1 account" : left + " accounts";
        if (!left && !blocks.querySelector(".settings-note")) {
          blocks.appendChild(settingsNote("You haven't blocked anyone."));
        }
      } catch (e) {
        unblock.disabled = false;
        window.alert(e.message || "Could not unblock.");
      }
    });
    row.appendChild(who);
    row.appendChild(unblock);
    blocks.appendChild(row);
  });
  block.appendChild(blocks);

  pane.appendChild(block);
  if (jumpChildId) {
    const target = document.getElementById(settingsTargetId(jumpChildId));
    if (target) pane.scrollTop = Math.max(0, target.offsetTop - 24);
    else pane.scrollTop = 0;
  } else {
    pane.scrollTop = 0;
  }
}
