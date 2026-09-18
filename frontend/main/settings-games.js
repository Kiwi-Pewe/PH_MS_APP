// ==================================================================
// settings-games.js - Registered Games. Not Connected Apps and not
// Oneira-as-a-game. Current Game is the title on your status. Added
// Games is what you've played or added. Detection waits on desktop.
// ==================================================================

const GAMES_DESKTOP = "This feature isn't built yet. It waits on a desktop app to see what you're playing.";

function gamesLaterNote(text) {
  return settingsNote(text || GAMES_DESKTOP, "later");
}

function settingsGameRow(opts) {
  const row = document.createElement("div");
  row.className = "settings-game-row" + (opts.current ? " is-current" : "") + (opts.empty ? " is-empty" : "");
  const copy = document.createElement("div");
  copy.className = "settings-game-copy";
  const nameRow = document.createElement("div");
  nameRow.className = "settings-game-name-row";
  const name = document.createElement("div");
  name.className = "settings-game-name";
  name.textContent = opts.name;
  nameRow.appendChild(name);
  if (opts.verified) {
    const badge = document.createElement("span");
    badge.className = "settings-game-verified";
    badge.title = "Verified game";
    badge.textContent = "\u2713";
    nameRow.appendChild(badge);
  }
  copy.appendChild(nameRow);
  if (opts.detail) {
    const detail = document.createElement("div");
    detail.className = "settings-game-detail";
    detail.textContent = opts.detail;
    copy.appendChild(detail);
  }
  row.appendChild(copy);
  row.appendChild(settingsToggle(!!opts.on, true));
  return row;
}

function paintCurrentGame(host) {
  host.appendChild(settingsGameRow({
    name: "Not playing",
    detail: "The game you're in would show here, and as just the game name on your status.",
    current: true,
    empty: true,
    on: false
  }));
  const addLine = document.createElement("div");
  addLine.className = "settings-opt-desc";
  addLine.style.marginTop = "10px";
  addLine.appendChild(document.createTextNode("Not seeing your game? "));
  const add = document.createElement("span");
  add.className = "settings-inline-link is-static";
  add.textContent = "Add it!";
  addLine.appendChild(add);
  host.appendChild(addLine);
  host.appendChild(gamesLaterNote("Seeing a running game, adding one by hand, and showing it on your status all wait on a desktop app."));
}

function paintAddedGames(host) {
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "Games you've played or added yourself. The toggle is whether that game can show on your status.";
  host.appendChild(blurb);
  const empty = document.createElement("div");
  empty.className = "settings-empty-card is-left";
  const title = document.createElement("div");
  title.className = "settings-opt-title";
  title.textContent = "No added games";
  const body = document.createElement("div");
  body.className = "settings-opt-desc";
  body.textContent = "Once Oneira can see games on your computer, they'll show up here. You can also add a game yourself.";
  empty.appendChild(title);
  empty.appendChild(body);
  host.appendChild(empty);
  host.appendChild(gamesLaterNote());
}

function renderRegisteredGamesSettings(pane, jumpChildId) {
  pane.innerHTML = "";
  const block = document.createElement("section");
  block.className = "settings-block has-sections";
  block.id = settingsTargetId("registered-games");
  const heading = document.createElement("h2");
  heading.className = "settings-block-title";
  heading.textContent = "Registered Games";
  block.appendChild(heading);

  const sections = [
    ["current-game", "Current Game", paintCurrentGame],
    ["added-games", "Added Games", paintAddedGames]
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
