// ==================================================================
// settings-activity.js - Activity Privacy. Hide what you're playing
// and who can join. Sharing, per-server overrides, and join-in-progress
// wait on game activity / presence / Voice. The server list is real.
// ==================================================================

const ACTIVITY_LATER = "This feature isn't built yet.";

function activityLaterNote(text) {
  return settingsNote(text || ACTIVITY_LATER, "later");
}

function paintWhatActivity(host) {
  host.appendChild(settingsOpt(
    "Share my activity",
    "Share activity information from games and connected apps I use, including when and how I engage.",
    settingsToggle(false, true),
    activityLaterNote("Hiding or showing what you're playing waits on Registered Games and connected apps.")
  ));
  host.appendChild(settingsOpt(
    "Share when I come online",
    "Allow friends to receive a push notification when you come online.",
    settingsToggle(true, true),
    activityLaterNote("Online pings aren't built yet.")
  ));
  const related = document.createElement("div");
  related.className = "settings-related-wrap";
  const relatedTitle = document.createElement("h3");
  relatedTitle.className = "settings-subblock-title";
  relatedTitle.textContent = "Related Settings";
  related.appendChild(relatedTitle);
  related.appendChild(settingsRelatedCard(
    "Registered Games",
    "Restrict sharing on a game-by-game basis.",
    "registered-games"
  ));
  host.appendChild(related);
}

function paintActivityServerRow(server) {
  const row = document.createElement("div");
  row.className = "settings-activity-server";
  row.dataset.name = (server.name || "").toLowerCase();
  const avatar = document.createElement("div");
  avatar.className = "avatar-dot";
  avatar.textContent = typeof serverAvatarLetters === "function" ? serverAvatarLetters(server.name) : (server.name || "?").slice(0, 1);
  const copy = document.createElement("div");
  copy.className = "settings-activity-server-copy";
  const name = document.createElement("div");
  name.className = "settings-opt-title";
  name.textContent = server.name;
  copy.appendChild(name);
  row.appendChild(avatar);
  row.appendChild(copy);
  row.appendChild(settingsToggle(true, true));
  return row;
}

function paintWhereActivity(host, servers) {
  const title = document.createElement("div");
  title.className = "settings-opt-title";
  title.textContent = "Automatically share my activity when joining a server";
  host.appendChild(title);
  const always = document.createElement("div");
  always.className = "settings-opt-desc";
  always.textContent = "Your activity is always shared with your friends.";
  always.style.marginBottom = "8px";
  host.appendChild(always);
  const radios = document.createElement("div");
  radios.className = "settings-radio-list is-disabled";
  [
    ["all", "Share in all servers"],
    ["small", "Share in servers with 200 or fewer members"],
    ["none", "Do not share in any servers"]
  ].forEach(row => {
    const radio = privacyRadio(row[0], "all", row[1], "", () => {});
    radio.disabled = true;
    radios.appendChild(radio);
  });
  host.appendChild(radios);
  host.appendChild(systemCallout(
    "warn",
    "Server settings ignored when not sharing",
    ""
  ));
  host.appendChild(activityLaterNote("Per-server activity sharing waits on the same activity status as Current Game."));

  const search = document.createElement("input");
  search.type = "search";
  search.className = "settings-activity-search";
  search.placeholder = "Search my servers";
  search.autocomplete = "off";
  host.appendChild(search);

  const tools = document.createElement("div");
  tools.className = "settings-activity-tools";
  const order = settingsSelect(
    [{ value: "custom", label: "Server Order" }],
    "custom",
    true
  );
  const allOn = document.createElement("span");
  allOn.className = "settings-inline-link is-static";
  allOn.textContent = "Toggle All On";
  tools.appendChild(order);
  tools.appendChild(allOn);
  host.appendChild(tools);

  const list = document.createElement("div");
  list.className = "settings-activity-servers";
  if (!servers.length) {
    const empty = document.createElement("div");
    empty.className = "settings-empty-card is-left";
    empty.textContent = "You're not in any servers yet.";
    list.appendChild(empty);
  } else {
    servers.forEach(server => list.appendChild(paintActivityServerRow(server)));
  }
  host.appendChild(list);
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    list.querySelectorAll(".settings-activity-server").forEach(row => {
      row.hidden = !!(q && (row.dataset.name || "").indexOf(q) === -1);
    });
  });
}

function paintJoinGames(host) {
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "Some games allow users to join the game you're playing when viewing your activity.";
  host.appendChild(blurb);
  host.appendChild(settingsOpt(
    "Allow friends to join my game",
    "Allow friends to join my game without sending a request.",
    settingsToggle(false, true),
    activityLaterNote("Game joining isn't built yet.")
  ));
  host.appendChild(settingsOpt(
    "Allow voice channel participants to join my game",
    "Allow anyone in a shared voice channel to join my game without sending a request.",
    settingsToggle(false, true),
    activityLaterNote("This waits on Voice, and on game joining.")
  ));
  const perServer = document.createElement("p");
  perServer.className = "settings-blurb";
  perServer.textContent = "Looking for per-server controls? Navigate to the server, select the dropdown menu next to the server name, then select Privacy Settings. From there, you can toggle on or off Activity Joining for just that server.";
  host.appendChild(perServer);
  host.appendChild(activityLaterNote("Server Privacy Settings aren't built yet."));
}

async function renderActivityPrivacySettings(pane, jumpChildId) {
  pane.innerHTML = "";
  if ((!serverList || !serverList.length) && typeof loadServers === "function") {
    try { await loadServers(); } catch (e) { /* list stays empty */ }
  }
  const servers = (serverList || []).slice();

  const block = document.createElement("section");
  block.className = "settings-block has-sections";
  block.id = settingsTargetId("activity-privacy");
  const heading = document.createElement("h2");
  heading.className = "settings-block-title";
  heading.textContent = "Activity Privacy";
  block.appendChild(heading);

  const sections = [
    ["what-activity", "What Activity I Share", paintWhatActivity],
    ["where-activity", "Where I Share Activity", (host) => paintWhereActivity(host, servers)],
    ["join-games", "Who Can Join My Games", paintJoinGames]
  ];
  sections.forEach(row => {
    const sub = document.createElement("div");
    sub.className = "settings-subblock";
    sub.id = settingsTargetId(row[0]);
    const subTitle = document.createElement("h3");
    subTitle.className = "settings-subblock-title";
    subTitle.textContent = row[1];
    sub.appendChild(subTitle);
    row[2](sub);
    block.appendChild(sub);
  });

  pane.appendChild(block);
  if (jumpChildId) {
    const target = document.getElementById(settingsTargetId(jumpChildId));
    if (target) pane.scrollTop = Math.max(0, target.offsetTop - 24);
    else pane.scrollTop = 0;
  } else {
    pane.scrollTop = 0;
  }
}
