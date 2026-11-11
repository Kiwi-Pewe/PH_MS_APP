function profileChatRoomMode(props) {
  return props && props.mode === "profile" ? "profile" : "rooms";
}

function profileChatRoomTitle(props) {
  const title = String((props && props.title) || "").trim();
  if (title) return title;
  return profileChatRoomMode(props) === "profile" ? "Profile chat" : "Chat rooms";
}

function paintProfileChatRoomCard(row) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "community-room profile-chat-room-card";
  const head = document.createElement("div");
  head.className = "community-room-head";
  const titleWrap = document.createElement("div");
  titleWrap.className = "community-room-title";
  const name = document.createElement("div");
  name.className = "community-room-name";
  name.textContent = row.name;
  const by = document.createElement("div");
  by.className = "community-room-by";
  by.textContent = "By: " + row.owner;
  titleWrap.appendChild(name);
  titleWrap.appendChild(by);
  head.appendChild(titleWrap);
  const mid = document.createElement("div");
  mid.className = "community-room-mid";
  const about = document.createElement("div");
  about.className = "community-room-about" + (row.about ? "" : " is-empty");
  about.textContent = row.about || "no description given...";
  mid.appendChild(about);
  const foot = document.createElement("div");
  foot.className = "community-room-foot";
  const pills = document.createElement("div");
  pills.className = "community-post-pills";
  (row.topics || []).forEach((topic) => {
    const pill = document.createElement("span");
    pill.className = "community-post-pill";
    pill.textContent = topic;
    pills.appendChild(pill);
  });
  const meta = document.createElement("div");
  meta.className = "community-room-meta";
  meta.textContent = String(row.count || 0) + " / 15";
  foot.appendChild(pills);
  foot.appendChild(meta);
  card.appendChild(head);
  card.appendChild(mid);
  card.appendChild(foot);
  return card;
}

function paintProfileChatRoomComposer(placeholder) {
  const row = document.createElement("div");
  row.className = "profile-chat-room-compose";
  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "icon-btn";
  plus.textContent = "+";
  plus.disabled = true;
  const input = document.createElement("textarea");
  input.className = "profile-chat-room-input";
  input.rows = 1;
  input.placeholder = placeholder;
  input.disabled = true;
  const emoji = document.createElement("button");
  emoji.type = "button";
  emoji.className = "icon-btn";
  emoji.textContent = "\u{1F600}";
  emoji.disabled = true;
  const send = document.createElement("button");
  send.type = "button";
  send.className = "pill-btn";
  send.textContent = "Send";
  send.disabled = true;
  row.appendChild(plus);
  row.appendChild(input);
  row.appendChild(emoji);
  row.appendChild(send);
  return row;
}

function paintProfileChatRoomThread(host, title, showBack, onBack) {
  host.replaceChildren();
  const head = document.createElement("div");
  head.className = "profile-chat-room-chat-head";
  if (showBack) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "ghost-btn";
    back.textContent = "Rooms";
    back.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof onBack === "function") onBack();
    });
    head.appendChild(back);
  }
  const name = document.createElement("div");
  name.className = "profile-chat-room-chat-title";
  name.textContent = title;
  head.appendChild(name);
  const log = document.createElement("div");
  log.className = "profile-chat-room-log";
  const empty = document.createElement("div");
  empty.className = "profile-chat-room-empty";
  empty.textContent = "There's no messages yet.";
  log.appendChild(empty);
  host.appendChild(head);
  host.appendChild(log);
  host.appendChild(paintProfileChatRoomComposer("Message " + title));
}

function paintProfileChatRoomPicker(host, onPick) {
  host.replaceChildren();
  const list = document.createElement("div");
  list.className = "profile-chat-room-list";
  [
    { name: "Room name", owner: "username", about: "", topics: ["topic"], count: 1 },
    { name: "Room name", owner: "username", about: "", topics: ["topic"], count: 3 }
  ].forEach((row) => {
    const card = paintProfileChatRoomCard(row);
    card.classList.add("is-later");
    card.addEventListener("click", (e) => {
      e.stopPropagation();
      if (host.closest(".is-editing") || host.closest(".is-opt-preview")) return;
      if (typeof onPick === "function") onPick(row);
    });
    list.appendChild(card);
  });
  host.appendChild(list);
}

function paintProfileChatRoom(tile, el) {
  const props = typeof defaultProfileTileProps === "function"
    ? defaultProfileTileProps("chat_room", tile && tile.props)
    : (tile && tile.props) || {};
  const chrome = typeof profileTextChrome === "function" ? profileTextChrome(props, "chat_room") : null;
  if (chrome && typeof applyProfileTextPaint === "function") applyProfileTextPaint(el, chrome);
  if (typeof applyProfileWidgetSurface === "function") applyProfileWidgetSurface(el, tile);
  const root = document.createElement("div");
  root.className = "profile-chat-room";
  const head = document.createElement("div");
  head.className = "oneira-wall-head";
  const title = document.createElement("div");
  title.className = "oneira-wall-title";
  title.textContent = profileChatRoomTitle(props);
  head.appendChild(title);
  const rule = document.createElement("div");
  rule.className = "oneira-wall-rule";
  const body = document.createElement("div");
  body.className = "profile-chat-room-body";
  root.appendChild(head);
  root.appendChild(rule);
  root.appendChild(body);
  el.appendChild(root);
  if (profileChatRoomMode(props) === "profile") {
    paintProfileChatRoomThread(body, profileChatRoomTitle(props), false);
    return;
  }
  function showPicker() {
    paintProfileChatRoomPicker(body, (row) => {
      paintProfileChatRoomThread(body, row.name, true, showPicker);
    });
  }
  showPicker();
}
