// ==================================================================
// settings-activity.js - Activity Privacy. Hide what you're playing
// and who can join. Sharing, per-server overrides, and join-in-progress
// wait on game activity / presence / Voice. The server list is real.
// ==================================================================

function activityLaterNote(subject) {
  return settingsLaterNote(subject || "activity sharing");
}

function paintWhatActivity(host) {
  host.appendChild(settingsOpt(
    "Share my activity",
    "Share Activity from Games and connected apps you use.",
    settingsToggle(false, true),
    activityLaterNote("Registered Games")
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

function paintJoinGames(host) {
  const blurb = document.createElement("p");
  blurb.className = "settings-blurb";
  blurb.textContent = "Some games allow users to join the game you're playing when viewing your activity.";
  host.appendChild(blurb);
  host.appendChild(settingsOpt(
    "Allow friends to join my game",
    "Allow friends to join my game without sending a request.",
    settingsToggle(false, true),
    activityLaterNote("game joining")
  ));
  host.appendChild(settingsOpt(
    "Allow voice channel participants to join my game",
    "Allow anyone in a shared voice channel to join my game without sending a request.",
    settingsToggle(false, true),
    activityLaterNote("Voice")
  ));
}

function renderActivityPrivacySettings(pane, jumpChildId) {
  pane.innerHTML = "";

  const block = document.createElement("section");
  block.className = "settings-block has-sections";
  block.id = settingsTargetId("activity-privacy");
  const heading = document.createElement("h2");
  heading.className = "settings-block-title";
  heading.textContent = "Activity Privacy";
  block.appendChild(heading);

  const sections = [
    ["what-activity", "What Activity I Share", paintWhatActivity],
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
